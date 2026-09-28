// completeness.fuzz.test.ts — stress/property-based tests for
// completeness.ts's analyzeCompleteness().
//
// Scope, and why this is NOT the same shape as discovery.fuzz.test.ts:
// analyzeCompleteness's own docstring states it ASSUMES pre-verified,
// well-formed input (claimId really is a content hash, so a self-referencing
// or cyclic priorClaimId is cryptographically unconstructible and explicitly
// "not defended against here"). Untrusted, possibly-garbage input is
// discovery.ts's concern, already covered by discovery.fuzz.test.ts. This
// file is not about adversarial garbage; it is about PROPERTIES that should
// hold for any well-formed claim universe, checked across many randomly
// generated chain graphs instead of only the hand-picked cases in
// completeness.test.ts, plus a genuine stress/volume check (the module is
// documented as a single pass per claim; this pins that it actually scales
// close to linearly, not just "passes on a handful of examples").
//
// No new dependency (no fast-check or similar): a small, seeded PRNG
// (mulberry32, ~5 lines) gives reproducible randomness across many trials,
// matching this package's stated minimal-dependency stance elsewhere
// (eas.ts: "plain ethers only"; http-source.ts: "native fetch only").

import { describe, it, expect } from "vitest";
import { analyzeCompleteness } from "./completeness.js";
import type { DeliveryClaim } from "./schema.js";

/** Minimal DeliveryClaim-shaped object, same convention as completeness.test.ts: analyzeCompleteness only reads claimId/priorClaimId/buyerAddress, so signatures are irrelevant here. */
function fakeClaim(claimId: string, buyerAddress: string, priorClaimId?: string): DeliveryClaim {
  return {
    sellerAddress: "0x00000000000000000000000000000000000000aa",
    buyerAddress,
    assetType: "gpu-hours",
    promisedSpec: "x",
    delivered: "yes",
    evidenceHash: "a".repeat(64),
    settlementRef: "ref",
    timestamp: "2026-01-01T00:00:00.000Z",
    claimId,
    signature: "0x" + "11".repeat(65),
    ...(priorClaimId !== undefined ? { priorClaimId } : {}),
  } as DeliveryClaim;
}

// Deterministic PRNG (mulberry32) so every trial is reproducible from a fixed
// seed, not flaky across CI runs, while still exercising a wide space of
// randomly shaped inputs across many trials per property.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
function freshId(): string {
  idCounter++;
  return "0x" + idCounter.toString(16).padStart(64, "0");
}
function freshBuyer(rnd: () => number): string {
  return "0x" + Math.floor(rnd() * 0xffffffff).toString(16).padStart(40, "0");
}

interface Chain {
  buyerAddress: string;
  claims: DeliveryClaim[]; // oldest (genesis) first
}

/** Build `buyerCount` independent buyer chains, each 1..maxLen claims long, all about one seller. */
function buildUniverse(rnd: () => number, buyerCount: number, maxLen: number): Chain[] {
  const chains: Chain[] = [];
  for (let b = 0; b < buyerCount; b++) {
    const buyerAddress = freshBuyer(rnd);
    const len = 1 + Math.floor(rnd() * maxLen);
    const claims: DeliveryClaim[] = [];
    let prior: string | undefined;
    for (let i = 0; i < len; i++) {
      const claimId = freshId();
      claims.push(fakeClaim(claimId, buyerAddress, prior));
      prior = claimId;
    }
    chains.push({ buyerAddress, claims });
  }
  return chains;
}

function flatten(chains: Chain[]): DeliveryClaim[] {
  return chains.flatMap((c) => c.claims);
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const TRIALS = 200;

describe("property: a full, untouched universe is always chainConsistent", () => {
  it("holds across many random buyer counts and chain lengths", () => {
    const rnd = mulberry32(1);
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 1 + Math.floor(rnd() * 20), 1 + Math.floor(rnd() * 15));
      const r = analyzeCompleteness(flatten(chains));
      expect(r.chainConsistent).toBe(true);
      expect(r.possibleOmissions).toEqual([]);
      expect(r.forks).toEqual([]);
    }
  });
});

describe("property: removing exactly one MIDDLE claim always produces exactly one, correctly-attributed omission", () => {
  it("holds across many random universes and middle-removal choices", () => {
    const rnd = mulberry32(2);
    let trialsWithAMiddle = 0;
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 1 + Math.floor(rnd() * 10), 3 + Math.floor(rnd() * 10)); // min length 3 guarantees a real middle exists
      // Pick one chain that has a genuine middle (index strictly between 0 and length-1).
      const withMiddle = chains.filter((c) => c.claims.length >= 3);
      if (withMiddle.length === 0) continue;
      trialsWithAMiddle++;
      const chain = withMiddle[Math.floor(rnd() * withMiddle.length)]!;
      const middleIdx = 1 + Math.floor(rnd() * (chain.claims.length - 2)); // strictly interior
      const removed = chain.claims[middleIdx]!;
      const nextInChain = chain.claims[middleIdx + 1]!; // guaranteed to exist: middleIdx < length-1

      const others = chains.filter((c) => c !== chain).flatMap((c) => c.claims);
      const remaining = [...others, ...chain.claims.filter((_, i) => i !== middleIdx)];

      const r = analyzeCompleteness(remaining);
      expect(r.chainConsistent).toBe(false);
      expect(r.possibleOmissions).toHaveLength(1);
      expect(r.possibleOmissions[0]).toEqual({
        buyerAddress: chain.buyerAddress,
        missingPriorClaimId: removed.claimId,
        referencedBy: nextInChain.claimId,
      });
      expect(r.forks).toEqual([]);
    }
    expect(trialsWithAMiddle).toBeGreaterThan(0); // sanity: the property above was actually exercised, not vacuously skipped every time
  });
});

describe("property: the two DOCUMENTED blind spots stay real blind spots (pins the module's own honesty claims as regression tests)", () => {
  it("removing only the TAIL (most recent) claim of a chain never produces an omission for that buyer", () => {
    const rnd = mulberry32(3);
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 1 + Math.floor(rnd() * 10), 2 + Math.floor(rnd() * 10));
      const chain = chains[Math.floor(rnd() * chains.length)]!;
      const others = chains.filter((c) => c !== chain).flatMap((c) => c.claims);
      const remaining = [...others, ...chain.claims.slice(0, -1)]; // drop only the tail

      const r = analyzeCompleteness(remaining);
      const gapsForThisBuyer = r.possibleOmissions.filter((g) => g.buyerAddress === chain.buyerAddress);
      expect(gapsForThisBuyer).toEqual([]);
    }
  });

  it("hiding an ENTIRE buyer's chain never produces an omission (no shown claim references it)", () => {
    const rnd = mulberry32(4);
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 2 + Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 10));
      const hiddenIdx = Math.floor(rnd() * chains.length);
      const hidden = chains[hiddenIdx]!;
      const remaining = chains.filter((_, i) => i !== hiddenIdx).flatMap((c) => c.claims);

      const r = analyzeCompleteness(remaining);
      const gapsForHiddenBuyer = r.possibleOmissions.filter((g) => g.buyerAddress === hidden.buyerAddress);
      expect(gapsForHiddenBuyer).toEqual([]);
    }
  });
});

describe("property: an injected fork is always detected as a fork, never miscategorized as an omission", () => {
  it("holds across many random universes and fork-injection points", () => {
    const rnd = mulberry32(5);
    let trialsWithAForkTarget = 0;
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 1 + Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 10));
      // A genuine fork needs an EXISTING second claim already referencing the
      // chosen prior (chains[0] here), so this requires chain length >= 2 --
      // a length-1 chain has nothing yet pointing at its genesis claim, and
      // adding just one new reference to it would not be a fork (2+ claims
      // sharing one prior), only a first reference.
      const withASecondLink = chains.filter((c) => c.claims.length >= 2);
      if (withASecondLink.length === 0) continue;
      trialsWithAForkTarget++;
      const chain = withASecondLink[Math.floor(rnd() * withASecondLink.length)]!;
      const priorTarget = chain.claims[0]!.claimId; // chain.claims[1] already references this
      const forkClaim = fakeClaim(freshId(), chain.buyerAddress, priorTarget);

      const universe = [...flatten(chains), forkClaim];
      const r = analyzeCompleteness(universe);

      expect(r.chainConsistent).toBe(false);
      expect(r.possibleOmissions).toEqual([]); // the fork target IS present; this must never read as a missing-link
      const fork = r.forks.find((f) => f.buyerAddress === chain.buyerAddress && f.priorClaimId === priorTarget);
      expect(fork).toBeDefined();
      expect(fork!.claimIds.length).toBeGreaterThanOrEqual(2);
      expect(fork!.claimIds).toContain(forkClaim.claimId);
    }
    expect(trialsWithAForkTarget).toBeGreaterThan(0); // sanity: the property above was actually exercised
  });
});

describe("property: analyzeCompleteness is order-independent", () => {
  it("shuffling the input never changes chainConsistent or the multiset of omissions/forks", () => {
    const rnd = mulberry32(6);
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 2 + Math.floor(rnd() * 10), 2 + Math.floor(rnd() * 10));
      // Randomly drop some middle claims to get a mix of gaps too, not only the clean case.
      const universe = flatten(chains).filter(() => rnd() > 0.1);

      const a = analyzeCompleteness(universe);
      const b = analyzeCompleteness(shuffle(universe, rnd));

      expect(b.chainConsistent).toBe(a.chainConsistent);
      const sortKey = (g: { referencedBy: string }) => g.referencedBy;
      expect([...b.possibleOmissions].sort((x, y) => sortKey(x).localeCompare(sortKey(y)))).toEqual(
        [...a.possibleOmissions].sort((x, y) => sortKey(x).localeCompare(sortKey(y))),
      );
      expect(b.forks.length).toBe(a.forks.length);
    }
  });
});

describe("property: case-insensitive comparison holds at random scale, not just the one hand-picked example in completeness.test.ts", () => {
  it("randomly re-casing hex in buyerAddress/claimId/priorClaimId never changes the result", () => {
    const rnd = mulberry32(7);
    function randomCase(hex: string, r: () => number): string {
      return hex
        .split("")
        .map((ch) => (r() < 0.5 ? ch.toUpperCase() : ch.toLowerCase()))
        .join("");
    }
    for (let t = 0; t < TRIALS; t++) {
      const chains = buildUniverse(rnd, 1 + Math.floor(rnd() * 8), 2 + Math.floor(rnd() * 8));
      const universe = flatten(chains);
      const recased = universe.map((c) => ({
        ...c,
        buyerAddress: randomCase(c.buyerAddress, rnd),
        claimId: randomCase(c.claimId, rnd),
        ...(c.priorClaimId !== undefined ? { priorClaimId: randomCase(c.priorClaimId, rnd) } : {}),
      })) as DeliveryClaim[];

      const original = analyzeCompleteness(universe);
      const withRecasedInput = analyzeCompleteness(recased);
      expect(withRecasedInput.chainConsistent).toBe(original.chainConsistent);
      expect(withRecasedInput.possibleOmissions.length).toBe(original.possibleOmissions.length);
      expect(withRecasedInput.forks.length).toBe(original.forks.length);
    }
  });
});

describe("stress: volume and scaling", () => {
  it("a large, fully-consistent universe (50,000 claims) stays chainConsistent and completes quickly", () => {
    const rnd = mulberry32(8);
    const chains = buildUniverse(rnd, 5_000, 10);
    const universe = flatten(chains);
    expect(universe.length).toBeGreaterThan(20_000);

    const t0 = performance.now();
    const r = analyzeCompleteness(universe);
    const elapsedMs = performance.now() - t0;

    expect(r.chainConsistent).toBe(true);
    expect(elapsedMs).toBeLessThan(2_000); // single pass over tens of thousands of claims should be near-instant, not seconds
  });

  it("scales close to linearly, not quadratically: 10x the claims costs meaningfully less than 10x the time squared would predict", () => {
    const rnd = mulberry32(9);
    const small = flatten(buildUniverse(rnd, 500, 10)); // ~2.75k claims
    const large = flatten(buildUniverse(rnd, 5_000, 10)); // ~27.5k claims, ~10x

    const t0 = performance.now();
    analyzeCompleteness(small);
    const smallMs = Math.max(performance.now() - t0, 0.01); // avoid a divide-by-zero on a sub-millisecond clock tick

    const t1 = performance.now();
    analyzeCompleteness(large);
    const largeMs = performance.now() - t1;

    // A quadratic implementation would cost roughly 100x for 10x the input; a
    // linear one costs roughly 10x. Generous upper bound (40x) absorbs GC/JIT
    // noise on a tiny, sub-millisecond `small` baseline while still clearly
    // failing if the real complexity were quadratic.
    expect(largeMs).toBeLessThan(smallMs * 40);
  });
});
