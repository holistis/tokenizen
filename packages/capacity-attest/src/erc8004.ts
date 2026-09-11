// erc8004.ts — read-only resolution against an ERC-8004 Identity Registry.
//
// ERC-8004 ("Trustless Agents") defines its Identity Registry as a standard
// ERC-721 contract: an agent's on-chain identity IS an NFT, `agentId` IS the
// tokenId. There is no bespoke `getAgent()` function in the spec — lookup is
// exactly `ownerOf(agentId)` (who controls this identity) and
// `tokenURI(agentId)` (a pointer to the agent's registration file: an IPFS/
// HTTPS/data URI, per eips.ethereum.org/EIPS/eip-8004, confirmed 2026-09-06
// against the spec text directly). This module calls only those two
// standard, universal ERC-721 read functions — nothing ERC-8004-specific.
//
// Deliberately NOT done here: fetching or parsing what `tokenURI` points to.
// That string is caller-controlled data embedded in on-chain state by
// whoever registered the agent, and auto-fetching it (an ipfs:// gateway
// call, or a fetch to an arbitrary https:// URL surfaced from someone
// else's on-chain write) is a real SSRF-shaped risk this project does not
// need to take on for a read-only identity check. Callers get the raw
// tokenUri string back and decide for themselves whether and how to fetch
// it — same "cite, never resolve further" posture as externalRefs
// (DECISIONS.md D-007).
//
// Deliberately NOT hardcoded here: any specific registry contract address
// or chain RPC endpoint. ERC-8004 is deployed independently on multiple
// chains (mainnet, Base, and others per the EIP's own multi-chain design),
// and the EIP text itself lists no canonical deployment address anywhere.
// Guessing one would risk querying the wrong contract and returning
// misleading data. Both the registry reference and the RPC endpoint are
// therefore required, caller-supplied inputs — this module is a thin,
// chain-agnostic resolver, never an authority on which deployment is "the"
// one, and never a source of its own RPC credentials for a published
// open-source package to leak or rate-limit on other people's behalf.

import { ethers } from "ethers";
import * as z from "zod/v4";

// The EIP's own compound reference format: "{namespace}:{chainId}:
// {registryAddress}", namespace fixed to "eip155" for EVM chains
// (CAIP-2/CAIP-10-style). Captures chainId and the registry contract
// address separately; the address half accepts either case, normalized to
// lower case in the result, same convention as sellerAddress/buyerAddress
// in schema.ts. Exported: erc8004-reputation.ts reuses this exact format
// for the Reputation Registry reference (a different contract/address than
// the Identity Registry this file resolves, same reference shape).
export const AGENT_REGISTRY_REF_RE = /^eip155:(\d+):(0x[0-9a-fA-F]{40})$/;

// ERC-721's two standard read functions. This is the ENTIRE interface this
// module depends on — see the file header for why nothing ERC-8004-specific
// is needed.
const ERC721_READ_ABI = ["function ownerOf(uint256 tokenId) view returns (address)", "function tokenURI(uint256 tokenId) view returns (string)"];

// uint256's maximum value (2^256 - 1) has exactly 78 decimal digits. A
// longer digit string can never be a valid ERC-721 tokenId; bounding the
// length before BigInt() parses it avoids handing an unboundedly large
// digit string to the runtime's bignum parser.
const MAX_AGENT_ID_DIGITS = 78;
const CALL_TIMEOUT_MS = 8_000;

// Mirrors the plain-TS validation below in isValidAgentId/isHttpUrl at the
// MCP tool-input boundary (index.ts's inputSchema), so a caller gets a
// schema-shaped rejection before resolveAgentIdentity() is even called.
// The runtime function still re-checks everything itself, since it is
// also callable directly (tests, examples), not only through the MCP tool.
export const ResolveAgentIdentityInputSchema = z.object({
  agentRegistryRef: z
    .string()
    .describe('Compound ERC-8004 registry reference: "eip155:<chainId>:<registryAddress>", e.g. "eip155:1:0x1234567890123456789012345678901234567890"'),
  agentId: z.string().describe("The ERC-721 tokenId / ERC-8004 agentId, as a decimal string"),
  rpcUrl: z.string().describe("JSON-RPC endpoint (http:// or https://) for the chain named in agentRegistryRef — never assumed or defaulted"),
});
export type ResolveAgentIdentityInput = z.infer<typeof ResolveAgentIdentityInputSchema>;

export type ResolveAgentIdentityResult =
  | { ok: true; chainId: string; registryAddress: string; agentId: string; owner: string; tokenUri: string }
  | { ok: false; reason: string };

function isValidAgentId(v: string): boolean {
  return v.length <= MAX_AGENT_ID_DIGITS && /^(0|[1-9][0-9]*)$/.test(v);
}

function isHttpUrl(v: string): boolean {
  try {
    const protocol = new URL(v).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/** The minimal read surface this module needs — real ethers.Contract satisfies this shape structurally. */
export interface Erc721ReadContract {
  ownerOf(agentId: bigint): Promise<string>;
  tokenURI(agentId: bigint): Promise<string>;
}

/**
 * Dependency-injection seam so tests can supply a fake contract instead of
 * making a real network call, without needing to fake ethers' own ABI
 * encoding/decoding. Defaults to a real ethers Contract over a real
 * JsonRpcProvider.
 */
export type ContractFactory = (registryAddress: string, rpcUrl: string) => Erc721ReadContract;

const defaultContractFactory: ContractFactory = (registryAddress, rpcUrl) => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(registryAddress, ERC721_READ_ABI, provider) as unknown as Erc721ReadContract;
};

// Adversarial review (2026-09-11): chainId in the returned result came straight from the
// CALLER-SUPPLIED agentRegistryRef string, never checked against what rpcUrl actually points to.
// A caller (or a mismatched config) could pass agentRegistryRef "eip155:8453:0x..." (Base) with an
// rpcUrl that actually points at a different chain entirely, and this function would happily
// return chainId:"8453" paired with owner/tokenURI data that really came from querying that other
// chain — the same contract address can exist independently on multiple chains with completely
// different owners. Same DI-seam pattern as ContractFactory so tests can inject a fake without a
// real network call.
export type ChainIdFactory = (rpcUrl: string) => Promise<bigint>;

const defaultChainIdFactory: ChainIdFactory = async (rpcUrl) => {
  const network = await new ethers.JsonRpcProvider(rpcUrl).getNetwork();
  return network.chainId;
};

/**
 * Read-only lookup against an ERC-8004 Identity Registry: who owns
 * `agentId` (`ownerOf`) and where its registration file lives (`tokenURI`).
 * Never resolves, verifies, or trusts the content the returned `tokenUri`
 * points to — see file header. This is the logic behind the
 * `resolve_agent_identity` MCP tool.
 */
export async function resolveAgentIdentity(
  input: ResolveAgentIdentityInput,
  contractFactory: ContractFactory = defaultContractFactory,
  chainIdFactory: ChainIdFactory = defaultChainIdFactory,
): Promise<ResolveAgentIdentityResult> {
  const match = AGENT_REGISTRY_REF_RE.exec(input.agentRegistryRef);
  if (!match) {
    return {
      ok: false,
      reason: 'agentRegistryRef must match "eip155:<chainId>:<registryAddress>", e.g. "eip155:1:0x1234567890123456789012345678901234567890"',
    };
  }
  const chainId = match[1]!;
  const registryAddress = match[2]!;

  if (!isValidAgentId(input.agentId)) {
    return { ok: false, reason: "agentId must be a non-negative decimal integer string (no leading zeros, no sign, at most 78 digits)" };
  }

  if (!isHttpUrl(input.rpcUrl)) {
    return { ok: false, reason: "rpcUrl must be an http:// or https:// URL" };
  }

  let owner: string;
  let tokenUri: string;
  try {
    // Verify rpcUrl actually points at the chain agentRegistryRef claims, before trusting
    // anything it returns: the same contract address can exist independently on multiple
    // chains with completely different owners.
    const actualChainId = await withTimeout(chainIdFactory(input.rpcUrl), CALL_TIMEOUT_MS);
    if (actualChainId !== BigInt(chainId)) {
      return {
        ok: false,
        reason: `rpcUrl is on chain ${actualChainId.toString()}, but agentRegistryRef names chain ${chainId} — refusing to mix results across chains`,
      };
    }
    const contract = contractFactory(registryAddress, input.rpcUrl);
    const agentIdBig = BigInt(input.agentId);
    [owner, tokenUri] = await withTimeout(Promise.all([contract.ownerOf(agentIdBig), contract.tokenURI(agentIdBig)]), CALL_TIMEOUT_MS);
  } catch (e) {
    return { ok: false, reason: `on-chain lookup failed: ${(e as Error).message}` };
  }

  return { ok: true, chainId, registryAddress: registryAddress.toLowerCase(), agentId: input.agentId, owner, tokenUri };
}
