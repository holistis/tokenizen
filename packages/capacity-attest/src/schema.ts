// schema.ts — the DeliveryClaim shape.
//
// A DeliveryClaim is a factual, signed receipt: "buyer X paid seller Y for
// asset Z under x402 settlement R, and here is whether what was promised
// actually arrived." It is deliberately NOT a score, rating, or judgment —
// see README.md "Wat dit NIET is".
//
// GUARDRAIL (halal): assetType is a closed enum of physical/compute capacity
// kinds. Do not add anything that looks like a financial instrument (credit,
// loan, yield, interest-bearing balance, invoice-financing) to this file —
// see the "HALAL GUARDRAILS" section of the project brief. If a field or enum
// value even smells like that, leave it out.

import * as z from "zod/v4";
import { createHash } from "node:crypto";

export const ASSET_TYPES = ["gpu-hours", "storage", "api-credits", "bandwidth"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const DELIVERED_VALUES = ["yes", "no", "partial"] as const;
export type Delivered = (typeof DELIVERED_VALUES)[number];

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;
const CLAIM_ID_RE = /^0x[0-9a-fA-F]{64}$/;
// 65-byte ECDSA signature (r ++ s ++ v), hex-encoded with 0x prefix — the
// shape ethers.Signer#signMessage() / ethers.verifyMessage() produce.
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

/**
 * The part of a claim that is hashed to produce claimId and that gets
 * signed. Everything in here is chosen by the buyer at claim-creation time;
 * claimId and signature (in DeliveryClaimSchema below) are derived from it.
 */
export const ClaimContentSchema = z.object({
  sellerAddress: z
    .string()
    .regex(ETH_ADDRESS_RE, "sellerAddress must be a 0x-prefixed 20-byte address")
    .describe("0x address of the agent/service that was paid and was supposed to deliver"),
  buyerAddress: z
    .string()
    .regex(ETH_ADDRESS_RE, "buyerAddress must be a 0x-prefixed 20-byte address")
    .describe("0x address of the paying agent — must match the address recovered from `signature`"),
  assetType: z.enum(ASSET_TYPES).describe("What kind of capacity this claim is about"),
  promisedSpec: z
    .union([z.string().min(1), z.record(z.string(), z.unknown())])
    .describe("What the seller promised to deliver — free text or a structured object"),
  delivered: z.enum(DELIVERED_VALUES).describe("Whether what was promised actually arrived"),
  evidenceHash: z
    .string()
    .regex(SHA256_HEX_RE, "evidenceHash must be a sha256 hex digest (64 hex chars, no 0x prefix)")
    .describe("sha256 hex digest of evidence for this claim (logs, response payload, etc.) — the evidence itself is not stored here"),
  settlementRef: z
    .string()
    .min(1, "settlementRef is required (x402 payment reference or on-chain tx hash)")
    .describe("x402 payment reference or on-chain tx hash for the settlement this claim is about"),
  timestamp: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "timestamp must be a valid ISO-8601 date string")
    .describe("ISO-8601 timestamp of when this claim was made"),
});
export type ClaimContent = z.infer<typeof ClaimContentSchema>;

/** The full, stored, signed claim — ClaimContent plus its content-address and signature. */
export const DeliveryClaimSchema = ClaimContentSchema.extend({
  claimId: z
    .string()
    .regex(CLAIM_ID_RE, "claimId must be a 0x-prefixed sha256 hex digest")
    .describe("Content-addressed id: sha256 of the canonical JSON of this claim's content fields — see computeClaimId()"),
  signature: z
    .string()
    .regex(SIGNATURE_RE, "signature must be a 0x-prefixed 65-byte ECDSA signature")
    .describe("Buyer's EIP-191 personal-sign signature over claimId"),
});
export type DeliveryClaim = z.infer<typeof DeliveryClaimSchema>;

/**
 * Deterministic JSON stringify: object keys sorted recursively so hashing
 * and signing are stable regardless of the original key insertion order.
 * Arrays keep their order (order is meaningful there); only object keys are
 * sorted.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortKeysDeep(input[key]);
    }
    return out;
  }
  return value;
}

/**
 * Content-addressed id for a claim: sha256 of the canonical JSON of its
 * content fields (everything except claimId and signature themselves).
 * Validates+normalizes `content` first so a claimId can never be computed
 * over a shape that wouldn't itself pass ClaimContentSchema.
 */
export function computeClaimId(content: ClaimContent): string {
  const parsed = ClaimContentSchema.parse(content);
  const hash = createHash("sha256").update(canonicalize(parsed)).digest("hex");
  return `0x${hash}`;
}
