// discovery.fuzz.test.ts — adversarial-source tests for discoverDeliveryHistory
// and the aggregation layer (src/discovery.ts).
//
// Scope, and why it is separate from schema.fuzz.test.ts: that file fuzzes a
// single claim's SHAPE against ClaimContentSchema/DeliveryClaimSchema. This
// file fuzzes the AGGREGATION layer itself: what a hostile or merely broken
// SOURCE can do to discoverDeliveryHistory across many claims, many sources,
// and time. It is the file the NLnet proposal's WP1 (cross-installation
// discovery hardening) describes as missing. This is a NEW test file — it
// does not modify discovery.test.ts or any existing src file.
//
// Four adversarial-source scenarios, matching docs/NLNET-SELFBUILD-PLAN-2026-09-28.md's
// WP1 plan directly:
//   1. a source that injects forged-but-well-shaped or outright garbage claims
//   2. a source that floods volume
//   3. a source that is slow/flaky (including one that never resolves)
//   4. (silent omission is covered separately: that is completeness.ts's own,
//      already-fuzzable D-006 concern, not something the aggregation layer
//      itself can detect or defend against — see completeness.ts's header)

import { describe, it, expect } from "vitest";
import { discoverDeliveryHistory, staticSource, type ClaimSource } from "./discovery.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";
import type { DeliveryClaim } from "./schema.js";

const SELLER = "0x00000000000000000000000000000000000000aa";

function rawSource(name: string, fetchForSeller: ClaimSource["fetchForSeller"]): ClaimSource {
  return { name, fetchForSeller };
}

describe("adversarial source: forged / garbage claim injection", () => {
  it("survives a source returning a mix of garbage shapes without crashing, and accepts only the genuine claim", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "f1".repeat(32) });

    const garbage: unknown[] = [
      genuine,
      null,
      undefined,
      42,
      "just a string",
      [],
      {},
      { claimId: "not-even-hex" },
      { ...genuine, signature: "0xdeadbeef" }, // right shape, garbage signature
      { ...genuine, claimId: "0x" + "00".repeat(32) }, // claimId that does not match content
      Symbol("hostile"),
      () => {},
      { ...genuine, buyerAddress: "not-an-address" },
      { proto: { __proto__: { polluted: true } } },
    ];

    const source = rawSource("hostile-mixed", async () => garbage as DeliveryClaim[]);
    const r = await discoverDeliveryHistory(SELLER, [source]);

    expect(r.count).toBe(1);
    expect(r.claims[0]?.claimId).toBe(genuine.claimId);
    // Every non-genuine entry failed SOME check (rejected, wrongSeller never
    // fires here since sellerAddress was untouched on most, or was skipped
    // entirely as not-array-shaped) — the important assertion is nothing
    // crashed and exactly one genuine claim survived.
    expect(r.sources[0]?.accepted).toBe(1);
    expect(r.completeness.chainConsistent).toBe(true);
  });

  it("a source returning a non-array does not abort the whole aggregation (other sources still run)", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "f2".repeat(32) });
    const hostile = rawSource("hostile-nonarray", async () => ({ not: "an array" }) as unknown as DeliveryClaim[]);
    const good = staticSource("good", [genuine]);

    const r = await discoverDeliveryHistory(SELLER, [hostile, good]);
    expect(r.count).toBe(1);
    expect(r.sources[0]?.error).toBeDefined();
    expect(r.sources[1]?.accepted).toBe(1);
  });
});

describe("adversarial source: volume flooding", () => {
  it("truncates a single source at maxClaimsPerSource instead of examining everything it sends", async () => {
    const buyer = testWallet();
    const claims = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + i.toString(16).padStart(64, "0") }),
      ),
    );
    const flood = staticSource("flood", claims);
    const r = await discoverDeliveryHistory(SELLER, [flood], { maxClaimsPerSource: 10 });

    expect(r.sources[0]?.truncated).toBe(true);
    expect(r.sources[0]?.accepted).toBe(10);
    expect(r.count).toBe(10);
  });

  it("stops growing the aggregate at maxTotalClaims across multiple sources, mid-source", async () => {
    const buyer = testWallet();
    const claimsA = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + ("a" + i).padStart(64, "0") }),
      ),
    );
    const claimsB = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + ("b" + i).padStart(64, "0") }),
      ),
    );
    const r = await discoverDeliveryHistory(SELLER, [staticSource("a", claimsA), staticSource("b", claimsB)], { maxTotalClaims: 15 });

    expect(r.count).toBe(15);
    // Source a filled first (10), source b contributed only the remaining 5
    // before the total cap stopped the loop mid-source.
    expect(r.sources[0]?.accepted).toBe(10);
    expect(r.sources[1]?.accepted).toBe(5);
  });

  it("a source that returns literally millions-shaped length does not hang or crash (bounded by maxClaimsPerSource before any per-entry work happens)", async () => {
    // A hostile source claiming an enormous array. We do not actually
    // allocate millions of real signed claims (that would make THIS test the
    // slow thing); the point is that discoverDeliveryHistory's own `limit =
    // Math.min(fetched.length, maxPerSource)` bounds the per-entry loop
    // BEFORE it examines any entry, so a huge `fetched.length` alone cannot
    // force more than maxClaimsPerSource iterations regardless of what the
    // array actually contains.
    const hugeSparse: DeliveryClaim[] = [];
    // A real array with a huge .length but only a few actual entries
    // (JS arrays permit this) — worst case for naive `for...in`/spread
    // patterns, harmless for the index-bounded for-loop this module uses.
    hugeSparse.length = 5_000_000;
    const source = rawSource("sparse-huge", async () => hugeSparse);
    const t0 = performance.now();
    const r = await discoverDeliveryHistory(SELLER, [source], { maxClaimsPerSource: 100 });
    const elapsedMs = performance.now() - t0;

    expect(r.sources[0]?.truncated).toBe(true);
    expect(r.sources[0]?.accepted).toBe(0); // every examined entry is `undefined` (sparse hole), rejected
    expect(elapsedMs).toBeLessThan(5_000); // bounded work, not proportional to the claimed length
  });
});

describe("adversarial source: slow / flaky / never resolves", () => {
  it("a source slower than sourceTimeoutMs is recorded as a per-source error, not left to hang the whole call", async () => {
    const neverResolves = rawSource(
      "hung",
      () => new Promise<DeliveryClaim[]>(() => {}), // deliberately never settles
    );
    const t0 = performance.now();
    const r = await discoverDeliveryHistory(SELLER, [neverResolves], { sourceTimeoutMs: 50 });
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(2_000); // bounded by the timeout, not by the hung promise
    expect(r.sources[0]?.error).toMatch(/did not respond within/);
    expect(r.count).toBe(0);
  });

  it("a slow source does not block a faster source listed after it (per-source isolation)", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "f3".repeat(32) });
    const slow = rawSource("slow", () => new Promise<DeliveryClaim[]>(() => {}));
    const fast = staticSource("fast", [genuine]);

    const r = await discoverDeliveryHistory(SELLER, [slow, fast], { sourceTimeoutMs: 50 });
    expect(r.sources[0]?.error).toBeDefined();
    expect(r.sources[1]?.accepted).toBe(1);
    expect(r.count).toBe(1);
  });

  it("a source that eventually resolves AFTER its timeout does not cause an unhandled rejection or corrupt a later result", async () => {
    let resolveLate: (v: DeliveryClaim[]) => void = () => {};
    const latePromise = new Promise<DeliveryClaim[]>((resolve) => {
      resolveLate = resolve;
    });
    const lateSource = rawSource("late", () => latePromise);

    const r = await discoverDeliveryHistory(SELLER, [lateSource], { sourceTimeoutMs: 30 });
    expect(r.sources[0]?.error).toMatch(/did not respond within/);

    // Resolve it after the fact; this should be a harmless no-op (the
    // withTimeout race already settled on the timeout side), not throw or
    // produce an unhandled rejection that would fail the test run.
    resolveLate([]);
    await new Promise((r2) => setTimeout(r2, 10));
  });
});
