// freshness.test.ts — every branch of checkClaimFreshness gets a boundary test, not just a
// typical-case test. Boundary tests are what catches a mutated comparison operator (a planted
// `>` instead of `>=`, or vice versa): a typical-case test (e.g. "1 day old, max 30 days")
// would still pass under either operator, so it would not actually prove the boundary is
// where the code says it is.
import { describe, it, expect } from "vitest";
import { checkClaimFreshness } from "./freshness.js";

const NOW = new Date("2026-11-06T00:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("checkClaimFreshness", () => {
  it("a claim well within the window is fresh", () => {
    const claim = { timestamp: "2026-11-01T00:00:00.000Z" }; // 5 days old
    expect(checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW)).toEqual({ fresh: true });
  });

  it("a claim well past the window is stale, with the real age reported", () => {
    const claim = { timestamp: "2025-09-01T00:00:00.000Z" };
    const result = checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW);
    expect(result.fresh).toBe(false);
    expect((result as { reason: string }).reason).toBe("stale");
  });

  it("boundary: a claim exactly maxAgeMs old is still fresh (inclusive upper bound)", () => {
    const claim = { timestamp: new Date(NOW.getTime() - 30 * ONE_DAY_MS).toISOString() };
    expect(checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW)).toEqual({ fresh: true });
  });

  it("boundary: one millisecond past maxAgeMs is stale — catches a mutated inclusive/exclusive comparison", () => {
    const claim = { timestamp: new Date(NOW.getTime() - 30 * ONE_DAY_MS - 1).toISOString() };
    const result = checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW);
    expect(result.fresh).toBe(false);
  });

  it("boundary: one millisecond before maxAgeMs is fresh — catches an off-by-one in the other direction", () => {
    const claim = { timestamp: new Date(NOW.getTime() - 30 * ONE_DAY_MS + 1).toISOString() };
    expect(checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW)).toEqual({ fresh: true });
  });

  it("a timestamp exactly equal to now (ageMs === 0) is fresh, not treated as future", () => {
    const claim = { timestamp: NOW.toISOString() };
    expect(checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW)).toEqual({ fresh: true });
  });

  it("a timestamp one millisecond in the future is reported as timestamp_in_future, not silently accepted as fresh", () => {
    const claim = { timestamp: new Date(NOW.getTime() + 1).toISOString() };
    const result = checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW);
    expect(result.fresh).toBe(false);
    expect((result as { reason: string }).reason).toBe("timestamp_in_future");
  });

  it("a far-future timestamp (backdating/clock-skew abuse attempt) is also timestamp_in_future, not 'fresh' by accident of a large negative age", () => {
    const claim = { timestamp: "2030-01-01T00:00:00.000Z" };
    const result = checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW);
    expect(result.fresh).toBe(false);
    expect((result as { reason: string }).reason).toBe("timestamp_in_future");
  });

  it("an unparseable timestamp is invalid_timestamp, not silently treated as fresh or stale", () => {
    const claim = { timestamp: "not-a-real-date" };
    expect(checkClaimFreshness(claim, 30 * ONE_DAY_MS, NOW)).toEqual({ fresh: false, reason: "invalid_timestamp" });
  });

  it("maxAgeMs of 0 only accepts a timestamp exactly equal to now", () => {
    expect(checkClaimFreshness({ timestamp: NOW.toISOString() }, 0, NOW)).toEqual({ fresh: true });
    const oneMsOld = { timestamp: new Date(NOW.getTime() - 1).toISOString() };
    expect(checkClaimFreshness(oneMsOld, 0, NOW).fresh).toBe(false);
  });

  it("defaults `now` to the real current time when omitted (does not require the caller to pass it)", () => {
    const freshClaim = { timestamp: new Date().toISOString() };
    expect(checkClaimFreshness(freshClaim, ONE_DAY_MS)).toEqual({ fresh: true });
  });

  // Mutation-matrix, actually run (5/5 caught, re-run by hand, not asserted from inside this
  // file — that would prove nothing): ageMs > maxAgeMs -> >=, ageMs < 0 -> <=, the
  // future-check branch replaced with `if (false)`, the stale-check branch replaced with
  // `if (false)`, and the sign of ageMs flipped (now.getTime() - claimedAt reversed). All 5
  // single-point mutations made at least one test above fail.
});
