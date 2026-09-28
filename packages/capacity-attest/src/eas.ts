// eas.ts — publish a delivery claim to, and discover it from, the Ethereum
// Attestation Service (EAS). This is the concrete, host-independent
// substrate D-005/D-012 pointed at: a public chain anyone can read, so a buyer
// on one installation can find a claim another buyer published, and verify it
// locally (discovery.ts re-verifies every claim, so EAS is just an untrusted
// ClaimSource like any other).
//
// Originally wired to Base only. Generalized here (WP2, see
// docs/NLNET-SELFBUILD-PLAN-2026-09-28.md) to support any EAS deployment:
// discovery.ts's own header comment always described the substrate as "EAS
// on Base", not "EAS, forever only Base". Optimism and Ethereum mainnet are
// equally real EAS deployments, just with different contract addresses:
// Optimism, being an OP-Stack chain like Base, happens to share Base's exact
// predeploy addresses; Ethereum mainnet does not, since it is the underlying
// L1, not an OP-Stack chain. That distinction was verified, not assumed --
// see EAS_DEPLOYMENTS below.
//
// Plain ethers only, no eas-sdk dependency. Everything here is
// caller-parameterised (rpcUrl, signer, and now chain addresses too): this
// package never bundles an RPC, a key, or gas, and never becomes the index.
//
// Base's addresses verified against the EAS contract sources (IEAS.sol,
// Common.sol, SchemaRegistry.sol) and the base / base-sepolia deployment
// artifacts, 2026-09-06. Optimism and Ethereum mainnet addresses verified
// 2026-09-28 against EAS's own official deployment records
// (github.com/ethereum-attestation-service/eas-contracts, the
// deployments/optimism and deployments/mainnet JSON files, cross-checked
// against docs.attest.org's own contracts table) AND independently
// re-confirmed with a direct eth_getCode call against each chain's real,
// live RPC: real bytecode present at every address below, not just "found
// in a document".

import { ethers } from "ethers";
import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";
import type { ClaimSource } from "./discovery.js";

// OP-Stack predeploys: identical on every OP-Stack chain (Base, Optimism).
// Kept as the module-level default for every function below, so a caller who
// passes nothing still gets exactly today's, unchanged, Base behavior.
export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";

/** One chain's EAS deployment: both contract addresses, plus a human-facing explorer base URL. */
export interface EasDeployment {
  chainId: number;
  name: string;
  easAddress: string;
  schemaRegistryAddress: string;
  explorer: string;
}

/**
 * Known EAS deployments, keyed by chainId. Every address was independently
 * verified (EAS's own deployment records AND a live eth_getCode call)
 * before being added here -- the OP-Stack-predeploy pattern is CONFIRMED
 * true for Optimism specifically below, never applied to a new chain just
 * because it sounds plausible.
 */
export const EAS_DEPLOYMENTS: Record<number, EasDeployment> = {
  8453: { chainId: 8453, name: "Base", easAddress: EAS_ADDRESS, schemaRegistryAddress: SCHEMA_REGISTRY_ADDRESS, explorer: "https://base.easscan.org" },
  84532: { chainId: 84532, name: "Base Sepolia", easAddress: EAS_ADDRESS, schemaRegistryAddress: SCHEMA_REGISTRY_ADDRESS, explorer: "https://base-sepolia.easscan.org" },
  10: { chainId: 10, name: "Optimism", easAddress: EAS_ADDRESS, schemaRegistryAddress: SCHEMA_REGISTRY_ADDRESS, explorer: "https://optimism.easscan.org" },
  1: { chainId: 1, name: "Ethereum", easAddress: "0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587", schemaRegistryAddress: "0xA7b39296258348C78294F95B872b282326A97BDF", explorer: "https://easscan.org" },
};

/** Backward-compatible: existing callers (examples/eas-live-demo.ts) look up an explorer URL by chainId this way. Derived FROM EAS_DEPLOYMENTS so there is exactly one source of truth, not two tables that could quietly drift apart. */
export const EAS_EXPLORER: Record<number, string> = Object.fromEntries(
  Object.entries(EAS_DEPLOYMENTS).map(([chainId, d]) => [chainId, d.explorer]),
);

const EAS_ABI = [
  "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
];

const SCHEMA_REGISTRY_ABI = [
  "function register(string schema, address resolver, bool revocable) returns (bytes32)",
  "function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))",
];

// Typed views over the dynamic ethers.Contract methods we use, so strict TS
// does not see them as possibly-undefined index accesses (same pattern as
// erc8004.ts's Erc721ReadContract). Real ethers.Contract satisfies these
// structurally after an `as unknown as` cast.
interface AttestRequest {
  schema: string;
  data: { recipient: string; expirationTime: bigint; revocable: boolean; refUID: string; data: string; value: bigint };
}
interface EasWriteContract {
  attest(request: AttestRequest): Promise<ethers.ContractTransactionResponse>;
}
interface EasReadContract {
  getAttestation(uid: string): Promise<{ data: string }>;
}
interface SchemaRegistryContract {
  getSchema(uid: string): Promise<{ uid: string }>;
  register(schema: string, resolver: string, revocable: boolean): Promise<ethers.ContractTransactionResponse>;
}

// Our schema. We carry the WHOLE signed claim as JSON in one field, so a
// discovered attestation is fully self-verifying offline (decode -> parse ->
// verifyClaim), with no second lookup anywhere. claimId is also stored as a
// bytes32 for a cheap on-chain cross-reference. Types + order are what matter
// for ABI-encoding; the names are metadata.
export const SCHEMA_STRING = "bytes32 claimId,string claim";
const SCHEMA_REVOCABLE = true;

/** Deterministic schema UID: keccak256(abi.encodePacked(schema, resolver, revocable)). */
export function computeSchemaUID(schema = SCHEMA_STRING, resolver = ethers.ZeroAddress, revocable = SCHEMA_REVOCABLE): string {
  return ethers.keccak256(ethers.solidityPacked(["string", "address", "bool"], [schema, resolver, revocable]));
}

export const SCHEMA_UID = computeSchemaUID();

const coder = ethers.AbiCoder.defaultAbiCoder();

/** ABI-encode a claim into EAS attestation data for SCHEMA_STRING. */
export function encodeClaimData(claim: DeliveryClaim): string {
  return coder.encode(["bytes32", "string"], [claim.claimId, JSON.stringify(claim)]);
}

/**
 * Decode EAS attestation data back into a claim. Returns null if the data does
 * not decode or the JSON does not parse into our claim shape. NEVER trusts the
 * result: the caller (easSource / discoverDeliveryHistory) re-verifies with
 * verifyClaim. The on-chain bytes32 claimId is cross-checked against the JSON's
 * own claimId, so a mismatch is dropped here as malformed.
 */
export function decodeClaimData(data: string): DeliveryClaim | null {
  let claimId: string;
  let json: string;
  try {
    [claimId, json] = coder.decode(["bytes32", "string"], data) as unknown as [string, string];
  } catch {
    return null;
  }
  let parsed: DeliveryClaim;
  try {
    parsed = DeliveryClaimSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
  if (parsed.claimId.toLowerCase() !== claimId.toLowerCase()) return null;
  return parsed;
}

/**
 * Builds the SchemaRegistry write contract. Split out as an injection seam
 * (same DI pattern as erc8004.ts's ContractFactory and this file's own
 * AttestationReader below) so ensureSchema's CHAIN-TARGETING logic --
 * "does it use the address I told it to, for a chain that is not Base" --
 * is unit-testable without a live signer or network, not just assumed.
 */
export type SchemaRegistryContractFactory = (schemaRegistryAddress: string, signer: ethers.Signer) => SchemaRegistryContract;
const defaultSchemaRegistryContractFactory: SchemaRegistryContractFactory = (schemaRegistryAddress, signer) =>
  new ethers.Contract(schemaRegistryAddress, SCHEMA_REGISTRY_ABI, signer) as unknown as SchemaRegistryContract;

/**
 * Register our schema if it does not already exist on this chain. The schema
 * UID is deterministic, so a duplicate register() reverts with AlreadyExists;
 * we check first via getSchema and only register when absent. Requires a
 * funded signer. Returns the schema UID.
 *
 * `opts.schemaRegistryAddress` defaults to SCHEMA_REGISTRY_ADDRESS (Base's,
 * unchanged from before this function took an opts argument at all): pass
 * `EAS_DEPLOYMENTS[1].schemaRegistryAddress` for Ethereum mainnet, or any
 * other chain's own address, to target that chain instead.
 */
export async function ensureSchema(
  signer: ethers.Signer,
  opts: { schemaRegistryAddress?: string; contractFactory?: SchemaRegistryContractFactory } = {},
): Promise<string> {
  const schemaRegistryAddress = opts.schemaRegistryAddress ?? SCHEMA_REGISTRY_ADDRESS;
  const contractFactory = opts.contractFactory ?? defaultSchemaRegistryContractFactory;
  const registry = contractFactory(schemaRegistryAddress, signer);
  const existing = await registry.getSchema(SCHEMA_UID);
  // getSchema returns a zero-uid struct when the schema is not registered.
  if (existing && existing.uid && existing.uid.toLowerCase() === SCHEMA_UID.toLowerCase()) {
    return SCHEMA_UID;
  }
  const tx = await registry.register(SCHEMA_STRING, ethers.ZeroAddress, SCHEMA_REVOCABLE);
  await tx.wait();
  return SCHEMA_UID;
}

export interface PublishResult {
  uid: string;
  txHash: string;
  recipient: string;
}

/** Same injection-seam purpose as SchemaRegistryContractFactory above, for the EAS write contract itself. */
export type EasWriteContractFactory = (easAddress: string, signer: ethers.Signer) => EasWriteContract;
const defaultEasWriteContractFactory: EasWriteContractFactory = (easAddress, signer) =>
  new ethers.Contract(easAddress, EAS_ABI, signer) as unknown as EasWriteContract;

/**
 * Publish one claim to EAS as an attestation with recipient = sellerAddress, so
 * it is discoverable by that seller. `signer` only pays gas and writes the
 * transaction; it does not need to be, and normally is not, the buyer. The
 * buyer identity lives entirely inside `claim` (buyerAddress, checked by
 * verifyClaim against the signature over claimId): nothing on the read path
 * (easSource, discoverDeliveryHistory) ever looks at who published the
 * attestation, only at what the claim itself proves. Requires a funded signer.
 * Returns the new attestation UID and tx hash.
 *
 * `opts.easAddress` defaults to EAS_ADDRESS (Base's, unchanged from before
 * this function took an opts argument at all): pass
 * `EAS_DEPLOYMENTS[1].easAddress` for Ethereum mainnet, or any other
 * chain's own address, to target that chain instead.
 */
export async function publishClaim(
  signer: ethers.Signer,
  claim: DeliveryClaim,
  opts: { easAddress?: string; contractFactory?: EasWriteContractFactory } = {},
): Promise<PublishResult> {
  const easAddress = opts.easAddress ?? EAS_ADDRESS;
  const contractFactory = opts.contractFactory ?? defaultEasWriteContractFactory;
  const eas = contractFactory(easAddress, signer);
  const tx = await eas.attest({
    schema: SCHEMA_UID,
    data: {
      recipient: claim.sellerAddress,
      expirationTime: 0n,
      revocable: SCHEMA_REVOCABLE,
      refUID: ethers.ZeroHash,
      data: encodeClaimData(claim),
      value: 0n,
    },
  });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("attest transaction had no receipt (dropped or replaced)");
  const iface = new ethers.Interface(EAS_ABI);
  let uid = "";
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "Attested") {
        uid = parsed.args.uid as string;
        break;
      }
    } catch {
      // not an EAS log, skip
    }
  }
  return { uid, txHash: receipt.hash, recipient: claim.sellerAddress };
}

// ---------------------------------------------------------------------------
// Discovery source over EAS.
// ---------------------------------------------------------------------------

/**
 * The minimal on-chain read surface easSource needs. Split out as an injection
 * seam so the decode/aggregation path is unit-testable without a live chain
 * (same pattern as erc8004.ts's ContractFactory). Real implementation reads
 * Attested logs filtered by recipient + schema, then getAttestation per uid.
 */
export interface AttestationReader {
  /** UIDs of attestations of our schema whose recipient == seller. */
  uidsForSeller(sellerAddress: string): Promise<string[]>;
  /** The raw ABI-encoded `data` field of one attestation. */
  dataForUid(uid: string): Promise<string>;
  /** Max concurrent dataForUid calls easSource should keep in flight. Readers that do not set this get DEFAULT_CONCURRENCY. */
  concurrency?: number;
}

// Most public RPC providers cap a single eth_getLogs call to a bounded block
// range (2,000-10,000 blocks is typical; some reject an unbounded fromBlock=0
// outright). A single call from genesis to "latest" therefore either errors
// out or silently degrades depending on the provider, and degrades further as
// the chain ages and the range grows. Default window chosen conservatively
// below the tightest commonly-seen provider limit; callers on a more
// permissive RPC can raise it via opts.blockRange.
const DEFAULT_BLOCK_RANGE = 2_000;

// Bound how many attestation bodies rpcAttestationReader fetches CONCURRENTLY
// per uidsForSeller/dataForUid fan-out. discoverDeliveryHistory's own
// MAX_CLAIMS_PER_SOURCE bounds how many claims are ultimately ACCEPTED from a
// source; this bounds how many in-flight RPC requests a single source's read
// can open at once, so a seller with many attestations does not open
// thousands of simultaneous connections against the RPC endpoint.
const DEFAULT_CONCURRENCY = 10;

/**
 * Pure block-range windowing, split out so the chunking math is unit-testable
 * without a real or mocked RPC provider. [fromBlock, latest] inclusive,
 * chunked into <= blockRange-wide, non-overlapping, gap-free windows in
 * ascending order. Returns [] when fromBlock > latest (nothing to scan).
 */
export function blockWindows(fromBlock: number, latest: number, blockRange: number): Array<[number, number]> {
  if (blockRange < 1) throw new Error(`blockRange must be >= 1, got ${blockRange}`);
  const windows: Array<[number, number]> = [];
  for (let from = fromBlock; from <= latest; from += blockRange) {
    windows.push([from, Math.min(from + blockRange - 1, latest)]);
  }
  return windows;
}

/**
 * Build a real AttestationReader over a JSON-RPC endpoint (getLogs +
 * getAttestation). `opts.easAddress` defaults to EAS_ADDRESS (Base's,
 * unchanged from before WP2): pass `EAS_DEPLOYMENTS[1].easAddress` for
 * Ethereum mainnet, or any other chain's own address, to read that chain
 * instead. rpcUrl itself already told this function which CHAIN to talk to;
 * easAddress tells it WHERE on that chain the EAS contract lives.
 */
export function rpcAttestationReader(
  rpcUrl: string,
  opts: { fromBlock?: number; schemaUID?: string; blockRange?: number; concurrency?: number; easAddress?: string } = {},
): AttestationReader {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const easAddress = opts.easAddress ?? EAS_ADDRESS;
  const eas = new ethers.Contract(easAddress, EAS_ABI, provider) as unknown as EasReadContract;
  const schemaUID = opts.schemaUID ?? SCHEMA_UID;
  const attestedTopic0 = ethers.id("Attested(address,address,bytes32,bytes32)");
  const blockRange = opts.blockRange ?? DEFAULT_BLOCK_RANGE;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  return {
    uidsForSeller: async (sellerAddress) => {
      const latest = await provider.getBlockNumber();
      const windows = blockWindows(opts.fromBlock ?? 0, latest, blockRange);
      const uids: string[] = [];
      // Walk the chain in bounded windows instead of one fromBlock=0..latest
      // call. A window that itself errors (provider-side limit stricter than
      // blockRange) is not swallowed here: it propagates, same as today's
      // single-call behaviour, so a caller who needs resilience against a
      // flaky/stricter provider passes a smaller blockRange, not a silent
      // partial result.
      for (const [from, to] of windows) {
        const logs = await provider.getLogs({
          address: easAddress,
          topics: [attestedTopic0, ethers.zeroPadValue(sellerAddress, 32), null, schemaUID],
          fromBlock: from,
          toBlock: to,
        });
        // uid is the only non-indexed value: it sits in log.data.
        for (const l of logs) uids.push(l.data);
      }
      return uids;
    },
    dataForUid: async (uid) => {
      const att = await eas.getAttestation(uid);
      return att.data as string;
    },
    // Exposed so easSource's fan-out can bound concurrency without
    // hardcoding a number that belongs to the reader's own configuration.
    concurrency,
  };
}

/**
 * An untrusted ClaimSource backed by EAS. fetchForSeller reads the seller's
 * attestation UIDs, decodes each back into a claim, and returns them. It does
 * NOT verify (discoverDeliveryHistory does that for every source uniformly); it
 * only drops entries that fail to decode into our claim shape. A malformed or
 * hostile attestation therefore either fails to decode here or fails
 * verifyClaim in discovery, never reaching the result as genuine.
 */
export function easSource(reader: AttestationReader, name = "eas"): ClaimSource {
  return {
    name,
    fetchForSeller: async (sellerAddress) => {
      const uids = await reader.uidsForSeller(sellerAddress);
      const concurrency = Math.max(1, reader.concurrency ?? DEFAULT_CONCURRENCY);
      const claims: DeliveryClaim[] = [];
      // Bounded-concurrency fan-out: at most `concurrency` dataForUid calls
      // in flight at once, instead of either one-at-a-time (slow for a
      // seller with many attestations) or fully unbounded (many simultaneous
      // requests against one RPC endpoint). Order of `claims` does not need
      // to match `uids`; discoverDeliveryHistory sorts the final aggregate by
      // timestamp regardless of source order.
      let next = 0;
      async function worker(): Promise<void> {
        for (;;) {
          const i = next++;
          if (i >= uids.length) return;
          const uid = uids[i]!;
          let data: string;
          try {
            data = await reader.dataForUid(uid);
          } catch {
            continue; // unreadable attestation, skip
          }
          const claim = decodeClaimData(data);
          if (claim) claims.push(claim);
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, uids.length) }, worker));
      return claims;
    },
  };
}

/** Convenience: an EAS-backed source directly from an RPC URL. */
export function easSourceFromRpc(
  rpcUrl: string,
  opts: { fromBlock?: number; schemaUID?: string; name?: string; blockRange?: number; concurrency?: number; easAddress?: string } = {},
): ClaimSource {
  return easSource(rpcAttestationReader(rpcUrl, opts), opts.name ?? "eas");
}

// Re-export so callers see verifyClaim is what makes an EAS-sourced claim
// trustworthy, not EAS itself.
export { verifyClaim };
