// erc8004-reputation.ts — publish a delivery claim's own `delivered` fact to
// an ERC-8004 Reputation Registry's giveFeedback(), on explicit king-order
// (2026-09-10, same trigger category as D-007's Identity Registry piece —
// see DECISIONS.md D-014).
//
// What this is: a mechanical mirror of a fact the buyer already signed, put
// on the one shelf (~500k registered agents, mainnet since 2026-01-29,
// deployed at the same address across every chain) where the widest possible
// audience of agents already looks for exactly this kind of signal. Same
// "cite an external system, never become the authority" posture as
// resolveAgentIdentity() (erc8004.ts) and publishClaim() (eas.ts).
//
// What this is NOT: capacity-attest does not invent a judgment scale. Per
// the real, verified contract ABI (giveFeedback requires a numeric `value` +
// `valueDecimals`, no way around it — see the on-chain source read
// 2026-09-10, erc-8004/erc-8004-contracts, ReputationRegistryUpgradeable.sol)
// the only number this module ever writes is a direct, 1:1 transcription of
// the claim's own `delivered` field: yes=1.0, partial=0.5, no=0.0
// (valueDecimals=1). No aggregation, no averaging, no opinion — the
// Reputation Registry's own getSummary() is free to average many buyers'
// numbers together, but that averaging happens in THEIR contract, over
// OTHER buyers' claims too, never inside this package. get_delivery_history
// still returns the raw claims list, unchanged — see README.md "Wat dit
// NIET is".
//
// Real, verified deployment (2026-09-10, github.com/erc-8004/erc-8004-contracts
// README.md, same address on every chain the project deploys to, including
// Base mainnet where this package's EAS integration already lives):
//   ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
// Not hardcoded here regardless — same reasoning as erc8004.ts: a caller-
// supplied registry reference is the only way this module can never
// silently query the wrong chain's deployment.
//
// Known, stated limitation: per the ERC-8004 spec text itself (ERC8004SPEC.md
// "Giving Feedback"), `feedbackURI` and `feedbackHash` are EMITTED in the
// NewFeedback event but NOT stored in contract state — a reader using the
// registry's own readFeedback()/readAllFeedback() view functions gets back
// value/valueDecimals/tag1/tag2/isRevoked only. Recovering feedbackURI later
// requires indexing the event log (e.g. a subgraph), not a plain view call.
// This module does not work around that; it is the real, spec-defined shape
// of the registry it plugs into, and is documented here so it's never
// mistaken for full coverage.
//
// The agentId given to giveFeedback() must already be a validly registered
// ERC-8004 Identity Registry agent, and the feedback submitter (the signer
// passed to this function) must NOT be that agent's own owner or an approved
// operator — the contract itself reverts with "Self-feedback not allowed"
// otherwise. This module does not work around that either: it is the
// registry's own anti-self-dealing protection, not a bug in this code.

import { ethers } from "ethers";
import * as z from "zod/v4";
import { AGENT_REGISTRY_REF_RE } from "./erc8004.js";
import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";

const REPUTATION_REGISTRY_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
];

const MAX_AGENT_ID_DIGITS = 78; // uint256 max has exactly 78 decimal digits — same bound as erc8004.ts
const MAX_FEEDBACK_URI_LENGTH = 2048;
const CALL_TIMEOUT_MS = 15_000; // a write tx + one confirmation, longer than erc8004.ts's read-only 8s

// Direct, mechanical mirror of `delivered` — no invented judgment. See file
// header. valueDecimals=1 lets yes/partial/no round-trip to exactly 1.0/0.5/0.0.
const DELIVERED_VALUE: Record<DeliveryClaim["delivered"], number> = { yes: 10, partial: 5, no: 0 };
const VALUE_DECIMALS = 1;

// This package's own fixed tag for every feedback entry it ever writes, so a
// reader filtering the registry's own indexed `indexedTag1` topic can find
// exactly (and only) capacity-attest-sourced delivery feedback, never
// confuse it with an unrelated tag1 convention (e.g. `starred`/`uptime`)
// another tool might publish under the same agentId. tag2 carries the
// claim's own assetType for finer filtering, the same sub-dimension role
// ERC8004SPEC.md's own example table gives tag2 (e.g. tradingYield's
// day/week/month/year).
const TAG1 = "capacity-attest:delivered";

export const PublishReputationFeedbackInputSchema = z.object({
  reputationRegistryRef: z
    .string()
    .describe('Compound ERC-8004 Reputation Registry reference: "eip155:<chainId>:<registryAddress>" — the Reputation Registry address, NOT the Identity Registry address'),
  agentId: z.string().describe("The seller's ERC-721 tokenId / ERC-8004 agentId in the paired Identity Registry, as a decimal string"),
  rpcUrl: z.string().describe("JSON-RPC endpoint (http:// or https://) for the chain named in reputationRegistryRef — never assumed or defaulted"),
  claim: DeliveryClaimSchema.describe("The already-signed DeliveryClaim whose `delivered` field is mirrored on-chain"),
  feedbackURI: z.string().max(MAX_FEEDBACK_URI_LENGTH).optional().describe("Optional pointer to a fuller off-chain/on-chain record, e.g. this claim's EAS attestation view URL. Emitted in the event log only, not stored in contract state"),
  feedbackHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional()
    .describe("keccak256 of the content feedbackURI points to, per the ERC-8004 spec (not this claim's own sha256 claimId). Omit for a content-addressed URI (e.g. ipfs://)"),
});
export type PublishReputationFeedbackInput = z.infer<typeof PublishReputationFeedbackInputSchema>;

export type PublishReputationFeedbackResult =
  | { ok: true; chainId: string; registryAddress: string; agentId: string; txHash: string; value: number; valueDecimals: number }
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

/** The minimal write surface this module needs — real ethers.Contract (connected to a Signer) satisfies this shape structurally. */
export interface ReputationWriteContract {
  giveFeedback(
    agentId: bigint,
    value: bigint,
    valueDecimals: number,
    tag1: string,
    tag2: string,
    endpoint: string,
    feedbackURI: string,
    feedbackHash: string,
  ): Promise<ethers.ContractTransactionResponse>;
}

/** Dependency-injection seam, same pattern as erc8004.ts's ContractFactory — tests supply a fake contract instead of a real network call. */
export type ReputationContractFactory = (registryAddress: string, signer: ethers.Signer) => ReputationWriteContract;

const defaultReputationContractFactory: ReputationContractFactory = (registryAddress, signer) => {
  return new ethers.Contract(registryAddress, REPUTATION_REGISTRY_ABI, signer) as unknown as ReputationWriteContract;
};

/**
 * Publish the `delivered` fact of an already-signed DeliveryClaim to an
 * ERC-8004 Reputation Registry, as feedback about the claim's seller. The
 * caller-supplied `signer` pays gas and becomes the feedback's on-chain
 * `clientAddress` — it does not need to be, and normally is not, the same
 * key that signed the claim itself (same separation eas.ts's publishClaim
 * already makes). Re-verifies the claim's own signature before writing
 * anything on-chain, so a tampered or unsigned claim can never be mirrored
 * as if it were genuine. Requires a funded signer; this package never
 * bundles an RPC, a key, or gas.
 */
export async function publishReputationFeedback(
  signer: ethers.Signer,
  input: PublishReputationFeedbackInput,
  contractFactory: ReputationContractFactory = defaultReputationContractFactory,
): Promise<PublishReputationFeedbackResult> {
  const match = AGENT_REGISTRY_REF_RE.exec(input.reputationRegistryRef);
  if (!match) {
    return {
      ok: false,
      reason: 'reputationRegistryRef must match "eip155:<chainId>:<registryAddress>", e.g. "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"',
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

  let verdict: ReturnType<typeof verifyClaim>;
  try {
    verdict = verifyClaim(input.claim);
  } catch (e) {
    // Same reason every other real caller of verifyClaim() wraps it (tools.ts,
    // discovery.ts, ledger.ts): computeClaimId() can throw on pathological
    // content (e.g. promisedSpec nested past schema.ts's MAX_DEPTH). This
    // function's whole job is to safely reject an adversarial/tampered claim
    // before writing anything on-chain, so that must degrade to the normal
    // {ok:false, reason} contract, never an uncaught exception (adversarial
    // review 2026-09-11: this was the one caller missing the guard).
    return { ok: false, reason: `refusing to publish an unverifiable claim: invalid_claim: ${(e as Error).message}` };
  }
  if (!verdict.ok) {
    return { ok: false, reason: `refusing to publish an unverifiable claim: ${verdict.reason}` };
  }

  const value = DELIVERED_VALUE[input.claim.delivered];
  const tag2 = input.claim.assetType;
  const feedbackURI = input.feedbackURI ?? "";
  const feedbackHash = input.feedbackHash ?? ethers.ZeroHash;

  let tx: ethers.ContractTransactionResponse;
  try {
    const contract = contractFactory(registryAddress, signer);
    tx = await withTimeout(
      contract.giveFeedback(BigInt(input.agentId), BigInt(value), VALUE_DECIMALS, TAG1, tag2, "", feedbackURI, feedbackHash),
      CALL_TIMEOUT_MS,
    );
    await withTimeout(tx.wait(), CALL_TIMEOUT_MS);
  } catch (e) {
    return { ok: false, reason: `on-chain giveFeedback failed: ${(e as Error).message}` };
  }

  return {
    ok: true,
    chainId,
    registryAddress: registryAddress.toLowerCase(),
    agentId: input.agentId,
    txHash: tx.hash,
    value,
    valueDecimals: VALUE_DECIMALS,
  };
}
