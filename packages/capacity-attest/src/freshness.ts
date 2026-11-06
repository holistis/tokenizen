// freshness.ts — a verifier-side staleness check over the claim's own, already-signed
// `timestamp` field. Additive, same discipline as the rest of this package: no new schema
// field, no issuer-maintained registry, nothing a verifier has to trust beyond the signature
// itself. See README.md "Independently verifying a claim" for why `verifyClaim()` alone does
// NOT check this: a cryptographically valid signature says nothing about how old the claim is.
//
// Background: x402-foundation/x402 issue #2833 (imokokok, 6 Nov 2026) describes the same gap
// in a different design (a signed oracle verdict that stays byte-valid after the underlying
// venue went stale) and proposes an issuer-maintained STALE registry. This module is the
// alternative that needs no registry: every claim here already carries a mandatory timestamp
// as part of what got signed (schema.ts), so the verifier can apply its own policy without
// trusting anyone's ongoing diligence.

/** The minimal shape this check needs — any object with the claim's `timestamp` field. */
export interface TimestampedClaim {
  timestamp: string;
}

export type FreshnessResult =
  | { fresh: true }
  | { fresh: false; reason: "stale"; ageMs: number }
  | { fresh: false; reason: "timestamp_in_future"; ageMs: number }
  | { fresh: false; reason: "invalid_timestamp" };

/**
 * Checks a claim's own `timestamp` against `maxAgeMs`, as of `now`.
 *
 * Boundary is inclusive: a claim exactly `maxAgeMs` old is still fresh (`ageMs <= maxAgeMs`).
 * A timestamp strictly in the future (ageMs < 0) is never "fresh" — that is not a freshness
 * problem, it is a malformed-or-backdated claim, reported as its own distinct reason so a
 * caller does not silently treat it as simply recent.
 *
 * Pure and synchronous: no network call, no state, nothing to feed with data. A timestamp
 * comparison does not get "smarter" over time — it is a fixed rule, and that is deliberate:
 * the whole point is that the verifier does not have to trust anything that changes.
 */
export function checkClaimFreshness(claim: TimestampedClaim, maxAgeMs: number, now: Date = new Date()): FreshnessResult {
  const claimedAt = Date.parse(claim.timestamp);
  if (Number.isNaN(claimedAt)) {
    return { fresh: false, reason: "invalid_timestamp" };
  }

  const ageMs = now.getTime() - claimedAt;

  if (ageMs < 0) {
    return { fresh: false, reason: "timestamp_in_future", ageMs };
  }

  if (ageMs > maxAgeMs) {
    return { fresh: false, reason: "stale", ageMs };
  }

  return { fresh: true };
}
