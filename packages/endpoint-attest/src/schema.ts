// schema.ts — the EndpointAttestation content type, its content-addressed id,
// and the honesty constraints that are enforced by the schema itself rather
// than left to a caller's good intentions.
//
// WHY THIS IS A SEPARATE PACKAGE AND NOT A NEW CLAIM TYPE INSIDE
// capacity-attest: capacity-attest's ClaimContent has a deliberately CLOSED
// assetType enum (gpu-hours, storage, api-credits, bandwidth) and its README
// states plainly that the enum is closed on purpose. An endpoint security
// attestation is none of those four. Widening that enum to fit this would
// break a documented design boundary of an already-published package, and
// reusing one of the four would put untrue data in the field. So this package
// follows the pattern a third party (EmbryoSpace) already proved works in
// this ecosystem: reuse the CONTENT-ADDRESSING primitives, bring your own
// content shape, leave capacity-attest untouched. See
// capacity-attest/docs/INTEGRATION-GUIDE.md.
//
// WHAT IS REUSED, DELIBERATELY: canonicalize() from capacity-attest. That
// function carries the hard-won parts (recursive key sorting, a depth cap
// that turns a pathological nesting crash into a catchable error, and
// Object.create(null) so a key literally named "__proto__" is hashed as a
// normal key instead of vanishing). Reimplementing that here would mean
// reimplementing its bugs. What is NOT reused: the claim-specific preimage
// and verify functions, which are typed to ClaimContent.
//
// THE THREE HONESTY CONSTRAINTS, enforced here in the schema:
//   1. `expiresAt` is REQUIRED and must be after `checkedAt`. An attestation
//      with no hard end date still looks valid months later, which is selling
//      confidence that was never checked. There is no "never expires" option.
//   2. `checksPerformed` must be non-empty. `outcome: "passed"` may therefore
//      never be read as "this endpoint is secure", only as "these named
//      checks passed at that moment". A blanket safety claim is not
//      expressible in this format, by construction.
//   3. `ownershipProof` is REQUIRED. This format cannot express an
//      attestation about a party that did not prove control of the endpoint,
//      which is what keeps it a voluntary certificate rather than an
//      unsolicited exposure report about a bystander.

import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalize } from "capacity-attest/dist/schema.js";

export const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** How the endpoint operator proved they control the endpoint. Mirrors ACME's two proven challenge types rather than inventing a third. */
export const OWNERSHIP_METHODS = ["dns-txt", "well-known-file"] as const;
export type OwnershipMethod = (typeof OWNERSHIP_METHODS)[number];

/**
 * The outcome of the checks that were actually run. Deliberately NOT called
 * "delivered" (that is capacity-attest's word for a different question) and
 * deliberately not a score or a grade.
 *
 * - `passed`: every check in `checksPerformed` passed.
 * - `failed`: at least one check in `checksPerformed` did not pass.
 * - `inconclusive`: the checks could not be completed (endpoint unreachable,
 *   rate-limited, ambiguous response). Fail-closed: this is NOT `passed`.
 */
export const OUTCOMES = ["passed", "failed", "inconclusive"] as const;
export type Outcome = (typeof OUTCOMES)[number];

const IsoTimestamp = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "must be a parseable ISO-8601 timestamp" });

export const OwnershipProofSchema = z.strictObject({
  method: z.enum(OWNERSHIP_METHODS),
  /** The exact challenge token the operator published. Not a secret: it only proves control at verification time. */
  token: z.string().min(16).max(512),
  /** Where the token was found: the DNS name queried, or the full URL fetched. Recorded so a reader can re-check it themselves. */
  location: z.string().min(1).max(2048),
  /** When control was verified. May be earlier than checkedAt (control is proven once, checks can run after). */
  verifiedAt: IsoTimestamp,
});
export type OwnershipProof = z.infer<typeof OwnershipProofSchema>;

export const AttestationContentObject = z.object({
  /** The endpoint this attestation is about. Normalised to its origin plus path, no credentials, no fragment. */
  endpoint: z.string().min(1).max(2048),
  /** The operator who requested this attestation and proved control of `endpoint`. */
  ownerAddress: z.string().regex(ETH_ADDRESS_RE, "ownerAddress must be a 0x-prefixed 20-byte address"),
  /** Whoever ran the checks and signs this attestation. The party that carries the responsibility for what it asserts. */
  attesterAddress: z.string().regex(ETH_ADDRESS_RE, "attesterAddress must be a 0x-prefixed 20-byte address"),
  ownershipProof: OwnershipProofSchema,
  /** The named checks that were actually run. Non-empty by design: see constraint 2 in this file's header. */
  checksPerformed: z.array(z.string().min(1).max(200)).min(1).max(100),
  outcome: z.enum(OUTCOMES),
  /** sha256 of the full findings report. The report itself is never stored here, only its hash, same posture as capacity-attest's evidenceHash. */
  findingsHash: z.string().regex(SHA256_HEX_RE, "findingsHash must be lower-case sha256 hex"),
  checkedAt: IsoTimestamp,
  /** REQUIRED. There is deliberately no way to express an attestation that never expires. */
  expiresAt: IsoTimestamp,
});

export const AttestationContentSchema = AttestationContentObject.superRefine((content, ctx) => {
  if (Date.parse(content.expiresAt) <= Date.parse(content.checkedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "expiresAt must be strictly after checkedAt: an attestation that expires at or before the moment it was made asserts nothing",
    });
  }
  if (Date.parse(content.ownershipProof.verifiedAt) > Date.parse(content.checkedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["ownershipProof", "verifiedAt"],
      message: "ownershipProof.verifiedAt must not be after checkedAt: control has to be proven before or when the checks run, not afterwards",
    });
  }
});
export type AttestationContent = z.infer<typeof AttestationContentSchema>;

export const EndpointAttestationObject = AttestationContentObject.extend({
  attestationId: z.string().regex(/^0x[0-9a-f]{64}$/, "attestationId must be 0x + lower-case sha256 hex"),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "signature must be a 0x-prefixed 65-byte hex signature"),
});
export const EndpointAttestationSchema = EndpointAttestationObject.superRefine((content, ctx) => {
  if (Date.parse(content.expiresAt) <= Date.parse(content.checkedAt)) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be strictly after checkedAt" });
  }
});
export type EndpointAttestation = z.infer<typeof EndpointAttestationSchema>;

/**
 * The EXACT bytes that get hashed, as a string.
 *
 * Exported for the same reason capacity-attest exports claimPreimage: the
 * preimage is `canonicalize(AttestationContentSchema.parse(content))`, NOT
 * `canonicalize(content)`. The parse step normalises (lower-cases the two
 * address fields, strips unknown top-level keys). Port only canonicalize()
 * into another language and you will silently produce wrong ids for any
 * attestation submitted with mixed-case addresses.
 */
export function attestationPreimage(content: AttestationContent): string {
  return canonicalize(normalise(AttestationContentSchema.parse(content)));
}

/** Content-addressed id: sha256 over the canonical JSON of the content fields (everything except attestationId and signature). */
export function computeAttestationId(content: AttestationContent): string {
  return "0x" + createHash("sha256").update(attestationPreimage(content), "utf-8").digest("hex");
}

/** Lower-case the address fields so the same attestation submitted with mixed-case addresses hashes identically. */
function normalise(content: AttestationContent): AttestationContent {
  return {
    ...content,
    ownerAddress: content.ownerAddress.toLowerCase(),
    attesterAddress: content.attesterAddress.toLowerCase(),
  };
}

/** True when `at` (default: now) is at or after expiresAt. An expired attestation is not a weaker attestation, it is not an attestation. */
export function isExpired(content: Pick<AttestationContent, "expiresAt">, at: Date = new Date()): boolean {
  return at.getTime() >= Date.parse(content.expiresAt);
}
