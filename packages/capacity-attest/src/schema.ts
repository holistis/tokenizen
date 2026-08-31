// schema.ts — the DeliveryClaim shape.
//
// A DeliveryClaim is a factual, signed receipt: "buyer X paid seller Y for
// asset Z under x402 settlement R, and here is whether what was promised
// actually arrived." It is deliberately NOT a score, rating, or judgment —
// see README.md "Wat dit NIET is".
//
// GUARDRAIL (design boundary): assetType is a closed enum of physical/compute
// capacity kinds. Do not add anything that looks like a financial instrument
// (credit, loan, yield, interest-bearing balance, invoice-financing) to this
// file — see the "DESIGN GUARDRAILS" section of the project brief. If a field
// or enum value even smells like that, leave it out.

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
// Guardrails against two verified bugs (2026-08-31 adversarial audit):
// - MAX_PROMISED_SPEC_STRING_LENGTH / MAX_SETTLEMENT_REF_LENGTH: without a
//   bound, a multi-megabyte string was accepted in ~6ms, letting any caller
//   grow the append-only ledger and every future read's memory footprint
//   without limit.
// - MAX_PROMISED_SPEC_JSON_BYTES: the object branch of promisedSpec has no
//   own length check, so it needs an explicit serialized-size cap instead.
const MAX_PROMISED_SPEC_STRING_LENGTH = 4_000;
const MAX_SETTLEMENT_REF_LENGTH = 512;
const MAX_PROMISED_SPEC_JSON_BYTES = 8_000;
// Shared with sortKeysDeep() below: how deep promisedSpec may nest.
const MAX_DEPTH = 32;

// Iterative (non-recursive) depth check for the object branch of
// promisedSpec, used at schema-parse time. This deliberately does NOT use
// recursion, and deliberately runs BEFORE any JSON.stringify of the raw
// input: an earlier version of this guard called JSON.stringify(v) directly
// inside the refine below to enforce MAX_PROMISED_SPEC_JSON_BYTES, and that
// call is itself a recursive walk that blew the call stack on the exact
// pathologically-deep input it was meant to reject (caught by this
// package's own fuzz tests). Checking depth first, with an explicit stack
// instead of language-level recursion, closes that gap for good.
function exceedsMaxDepth(value: unknown, maxDepth: number): boolean {
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (d > maxDepth) return true;
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
    } else if (v !== null && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        stack.push({ v: (v as Record<string, unknown>)[key], d: d + 1 });
      }
    }
  }
  return false;
}

export const ClaimContentSchema = z.object({
  // .transform(toLowerCase): a fuzz-and-benchmark audit found that
  // computeClaimId() hashed addresses exactly as submitted while every other
  // address comparison in this codebase (signature recovery, seller
  // filtering) was already case-insensitive. That let the same real claim be
  // resubmitted under a different claimId by only re-casing a hex letter,
  // defeating appendClaim()'s claimId-based duplicate rejection. Normalizing
  // here, once, before anything is hashed or compared, closes that gap for
  // every consumer of this schema.
  sellerAddress: z
    .string()
    .regex(ETH_ADDRESS_RE, "sellerAddress must be a 0x-prefixed 20-byte address")
    .transform((v) => v.toLowerCase())
    .describe("0x address of the agent/service that was paid and was supposed to deliver"),
  buyerAddress: z
    .string()
    .regex(ETH_ADDRESS_RE, "buyerAddress must be a 0x-prefixed 20-byte address")
    .transform((v) => v.toLowerCase())
    .describe("0x address of the paying agent — must match the address recovered from `signature`"),
  assetType: z.enum(ASSET_TYPES).describe("What kind of capacity this claim is about"),
  promisedSpec: z
    .union([
      z.string().min(1).max(MAX_PROMISED_SPEC_STRING_LENGTH),
      z.record(z.string(), z.unknown()).refine((v) => {
        if (exceedsMaxDepth(v, MAX_DEPTH)) return false;
        // Only safe to JSON.stringify for the size check once depth is
        // bounded — see exceedsMaxDepth's comment above.
        return Buffer.byteLength(JSON.stringify(v), "utf8") <= MAX_PROMISED_SPEC_JSON_BYTES;
      }, `promisedSpec object exceeds the allowed nesting depth (${MAX_DEPTH}) or size (${MAX_PROMISED_SPEC_JSON_BYTES} bytes)`),
    ])
    .describe("What the seller promised to deliver — free text or a structured object"),
  delivered: z.enum(DELIVERED_VALUES).describe("Whether what was promised actually arrived"),
  evidenceHash: z
    .string()
    .regex(SHA256_HEX_RE, "evidenceHash must be a sha256 hex digest (64 hex chars, no 0x prefix)")
    .describe("sha256 hex digest of evidence for this claim (logs, response payload, etc.) — the evidence itself is not stored here"),
  settlementRef: z
    .string()
    .min(1, "settlementRef is required (x402 payment reference or on-chain tx hash)")
    .max(MAX_SETTLEMENT_REF_LENGTH)
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
  return JSON.stringify(sortKeysDeep(value, 0));
}

// A fuzz audit found that a promisedSpec nested a few thousand levels deep
// (no valid signature required — this runs before signature verification)
// crashes the process with an uncaught RangeError instead of the normal
// {ok:false, reason} response every other invalid claim gets. MAX_DEPTH
// (declared above, shared with the schema-level guard on promisedSpec)
// turns that crash into a clean, catchable Error well before the engine's
// own call-stack limit, however it's shaped (objects or arrays) — kept here
// too as defense-in-depth in case computeClaimId is ever called on content
// that bypassed schema validation.
function sortKeysDeep(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error(`promisedSpec nesting exceeds max depth of ${MAX_DEPTH}`);
  }
  if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    // Object.create(null) has no inherited `__proto__` accessor, so a key
    // literally named "__proto__" becomes a normal own property instead of
    // silently reassigning out's prototype (and vanishing from the hashed
    // output) the way `out["__proto__"] = ...` would on a plain {} object.
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(input).sort()) {
      out[key] = sortKeysDeep(input[key], depth + 1);
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
