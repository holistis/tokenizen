// eas.ts — publish a delivery claim to, and discover it from, the Ethereum
// Attestation Service (EAS) on Base. This is the concrete, host-independent
// substrate D-005/D-012 pointed at: a public chain anyone can read, so a buyer
// on one installation can find a claim another buyer published, and verify it
// locally (discovery.ts re-verifies every claim, so EAS is just an untrusted
// ClaimSource like any other).
//
// Plain ethers only, no eas-sdk dependency. EAS is an OP-Stack predeploy, so
// the contract addresses are identical on Base mainnet (8453) and Base Sepolia
// (84532). Everything here is caller-parameterised (rpcUrl, signer): this
// package never bundles an RPC, a key, or gas, and never becomes the index.
//
// Verified against the EAS contract sources (IEAS.sol, Common.sol,
// SchemaRegistry.sol) and the base / base-sepolia deployment artifacts, 2026-09-06.

import { ethers } from "ethers";
import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";
import type { ClaimSource } from "./discovery.js";

// OP-Stack predeploys: same on every Base network.
export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";

export const EAS_EXPLORER = {
  8453: "https://base.easscan.org",
  84532: "https://base-sepolia.easscan.org",
} as const;

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
 * Register our schema if it does not already exist on this chain. The schema
 * UID is deterministic, so a duplicate register() reverts with AlreadyExists;
 * we check first via getSchema and only register when absent. Requires a
 * funded signer. Returns the schema UID.
 */
export async function ensureSchema(signer: ethers.Signer): Promise<string> {
  const registry = new ethers.Contract(SCHEMA_REGISTRY_ADDRESS, SCHEMA_REGISTRY_ABI, signer) as unknown as SchemaRegistryContract;
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

/**
 * Publish one claim to EAS as an attestation with recipient = sellerAddress, so
 * it is discoverable by that seller. `signer` only pays gas and writes the
 * transaction; it does not need to be, and normally is not, the buyer. The
 * buyer identity lives entirely inside `claim` (buyerAddress, checked by
 * verifyClaim against the signature over claimId): nothing on the read path
 * (easSource, discoverDeliveryHistory) ever looks at who published the
 * attestation, only at what the claim itself proves. Requires a funded signer.
 * Returns the new attestation UID and tx hash.
 */
export async function publishClaim(signer: ethers.Signer, claim: DeliveryClaim): Promise<PublishResult> {
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer) as unknown as EasWriteContract;
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

/** Build a real AttestationReader over a JSON-RPC endpoint (getLogs + getAttestation). */
export function rpcAttestationReader(
  rpcUrl: string,
  opts: { fromBlock?: number; schemaUID?: string; blockRange?: number; concurrency?: number } = {},
): AttestationReader {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, provider) as unknown as EasReadContract;
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
          address: EAS_ADDRESS,
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
  opts: { fromBlock?: number; schemaUID?: string; name?: string; blockRange?: number; concurrency?: number } = {},
): ClaimSource {
  return easSource(rpcAttestationReader(rpcUrl, opts), opts.name ?? "eas");
}

// Re-export so callers see verifyClaim is what makes an EAS-sourced claim
// trustworthy, not EAS itself.
export { verifyClaim };
