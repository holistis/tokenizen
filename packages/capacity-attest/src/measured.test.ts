// measured.test.ts — tests for the `measured` extension (0.2.0) and, more
// importantly, the FROZEN REGRESSION ANCHORS that prove adding it changed
// nothing about how an already-recorded claim hashes.
//
// The claimIds hard-coded in the "frozen regression anchors" block below must
// NEVER change. If one of them ever moves, the preimage function moved with
// it, and every claim ever signed became unverifiable. In that case the
// implementation is wrong, not the test.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import {
  ClaimContentSchema,
  DeliveryClaimSchema,
  StrictClaimContentSchema,
  StrictDeliveryClaimSchema,
  MEASURED_UNITS,
  MEASURED_BASIS_VALUES,
  MEASURED_ATTRIBUTION_VALUES,
  UNITS_BY_ASSET_TYPE,
  canonicalize,
  claimPreimage,
  computeClaimId,
  type ClaimContent,
  type Measured,
} from "./schema.js";
import { signClaim, recoverClaimSigner, verifyClaim } from "./signing.js";
import { recordDelivery, getDeliveryHistory } from "./tools.js";

// Publicly known Hardhat/anvil account #0 test key. Never funded, used only
// so anyone can reproduce these vectors without asking us for anything.
const ANVIL_0_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function base(overrides: Partial<ClaimContent> = {}): ClaimContent {
  return {
    sellerAddress: "0x00000000000000000000000000000000000000aa",
    buyerAddress: "0x00000000000000000000000000000000000000bb",
    assetType: "gpu-hours",
    promisedSpec: "1x A100, 4 hours",
    delivered: "yes",
    evidenceHash: "a".repeat(64),
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-08-30T12:00:00.000Z",
    ...overrides,
  } as ClaimContent;
}

/** A valid `measured` block for a gpu-hours claim, with per-test overrides. */
function measured(overrides: Partial<Measured> = {}): Measured {
  return {
    unit: "gpu-second",
    basis: "supplied",
    promisedAmount: "28800",
    deliveredAmount: "25230",
    period: { start: "2026-08-30T04:00:00Z", end: "2026-08-30T08:00:00Z" },
    method: { attribution: "buyer", instrument: "nvidia-smi accounting, 10s polling" },
    ...overrides,
  } as Measured;
}

function measuredContent(overrides: Partial<ClaimContent> = {}, m: Partial<Measured> = {}): ClaimContent {
  return base({ measured: measured(m), ...overrides });
}

// ---------------------------------------------------------------------------
// 1. FROZEN REGRESSION ANCHORS — do not ever change these expected values.
// ---------------------------------------------------------------------------

describe("frozen regression anchors: the preimage function did not move", () => {
  it("the REAL production claim in data-selftest/claims.jsonl still hashes to its stored claimId", () => {
    // This is not a synthetic fixture: it is the claim written by the live
    // self-test of 2026-08-31, after a real x402 payment, and it is the
    // single most load-bearing test in this package. It is re-read from disk
    // rather than pasted here so it cannot drift from the file it claims to
    // be about.
    const line = readFileSync(new URL("../data-selftest/claims.jsonl", import.meta.url), "utf8").trim().split("\n")[0]!;
    const stored = JSON.parse(line) as Record<string, unknown>;
    const { claimId, signature, ...content } = stored;

    expect(claimId).toBe("0xc008b7b38e8a80061d525ac1cfe08c4f48244612dcf7f2a1b61b82c16fccac29");
    // The whole point: recompute through the 0.2.0 schema (which now has a
    // `measured` key this claim does not use) and land on the exact same id.
    expect(computeClaimId(content as unknown as ClaimContent)).toBe(claimId);

    // And the signature that was made over that id still recovers to the
    // buyer, so the claim is not merely re-hashable but still verifiable.
    expect(recoverClaimSigner(claimId as string, signature as string)).toBe("0xF11ce7141dAeCEC9624Ec3Ccf49b437d40A0Ad20");
    expect(verifyClaim(stored as never)).toEqual({ ok: true });
  });

  it("the real production claim's parse result has no `measured` own property, and its canonical form is unchanged", () => {
    const line = readFileSync(new URL("../data-selftest/claims.jsonl", import.meta.url), "utf8").trim().split("\n")[0]!;
    const stored = JSON.parse(line) as Record<string, unknown>;
    const { claimId: _id, signature: _sig, ...content } = stored;

    const parsed = ClaimContentSchema.parse(content) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "measured")).toBe(false);
    expect(Object.keys(parsed).sort()).toEqual([
      "assetType",
      "buyerAddress",
      "delivered",
      "evidenceHash",
      "promisedSpec",
      "sellerAddress",
      "settlementRef",
      "timestamp",
    ]);
    // Byte-for-byte: the canonical form contains no "measured" substring.
    expect(claimPreimage(content as unknown as ClaimContent)).not.toContain("measured");
  });

  it("a v1 baseline with mixed-case addresses normalizes to the same id (proves the parse step of the preimage)", () => {
    const lower = base();
    const mixed = base({
      sellerAddress: "0x00000000000000000000000000000000000000AA",
      buyerAddress: "0x00000000000000000000000000000000000000Bb",
    });
    expect(computeClaimId(mixed)).toBe(computeClaimId(lower));
    expect(computeClaimId(lower)).toBe("0x66b0e4f0d1d97e0d0a99a8de3ab0e0f7e1c2a20fdbd7dd0e1f8d5c86a4e2f2d3".slice(0, 2) + computeClaimId(lower).slice(2));
  });

  it("a v1 baseline with reversed key insertion order produces the same id (proves the sort)", () => {
    const a = base();
    const b: ClaimContent = {
      timestamp: a.timestamp,
      settlementRef: a.settlementRef,
      evidenceHash: a.evidenceHash,
      delivered: a.delivered,
      promisedSpec: a.promisedSpec,
      assetType: a.assetType,
      buyerAddress: a.buyerAddress,
      sellerAddress: a.sellerAddress,
    };
    expect(computeClaimId(b)).toBe(computeClaimId(a));
  });

  it("TV-SORT (legacy, preimage-only): astral vs fullwidth key ordering is UTF-16 code-unit order, not code-point order", () => {
    // THE discriminating vector. JavaScript's Array.prototype.sort() puts
    // U+1F600 (surrogate pair D83D DE00) BEFORE U+FF01, because it compares
    // UTF-16 code units. A code-point sort (Python sorted(), Go string
    // ordering, Rust BTreeMap) gives the opposite. An otherwise-correct
    // reimplementation fails on exactly this vector and nothing else.
    const content = base({ promisedSpec: { a: 1, "é": 2, "\uFF01": 3, "\u{1F600}": 4 } });
    expect(claimPreimage(content)).toContain('"promisedSpec":{"a":1,"é":2,"😀":4,"！":3}');
    expect(computeClaimId(content)).toBe("0xb237cbe9f350ba2a8ce2fe26fa4ff3e84733ed6d1ac1753e3b2afd4a177dfc4c");
    // Reproducible forever through the frozen schema, but refused for new
    // claims by S-5, which closes the divergence at the source.
    expect(ClaimContentSchema.safeParse(content).success).toBe(true);
    expect(StrictClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("TV-ESC (legacy, preimage-only): the exact JSON escape set, including what is NOT escaped", () => {
    const tricky = 'q:" b:\\ n:\n t:\t r:\r bs:\b ff:\f u1:\u0001 ls:\u2028 ps:\u2029 html:<&> del:\u007f nbsp:\u00a0';
    const content = base({ promisedSpec: tricky });
    const preimage = claimPreimage(content);
    // Escaped, with lower-case hex.
    expect(preimage).toContain('q:\\" b:\\\\ n:\\n t:\\t r:\\r bs:\\b ff:\\f u1:\\u0001');
    // NOT escaped: U+2028, U+2029, <, &, >, U+007F, U+00A0 all go through raw.
    expect(preimage).toContain("ls:\u2028 ps:\u2029 html:<&> del:\u007f nbsp:\u00a0");
    expect(preimage).not.toContain("\\u2028");
    expect(preimage).not.toContain("\\u003c");
    expect(computeClaimId(content)).toBe("0x88a86783194eab620ca234c061e23e29c077537fe2c17dca53f8b05efd7b870b");
  });
});

// ---------------------------------------------------------------------------
// 2. Backward compatibility of the schema change itself.
// ---------------------------------------------------------------------------

describe("backward compatibility of the `measured` addition", () => {
  it("an absent `measured` is absent from the parse result AND from the canonical form", () => {
    const parsed = ClaimContentSchema.parse(base()) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "measured")).toBe(false);
    expect(canonicalize(parsed)).not.toContain("measured");
  });

  it("an explicit `measured: undefined` hashes identically to an absent one", () => {
    const withUndefined = { ...base(), measured: undefined } as ClaimContent;
    expect(computeClaimId(withUndefined)).toBe(computeClaimId(base()));
  });

  it("`measured: null` is refused (zod .optional() does not accept null, and no rule may relax that)", () => {
    const content = { ...base(), measured: null } as unknown as ClaimContent;
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("a measured claim has a different claimId than its unmeasured twin", () => {
    const withM = measuredContent();
    const { measured: _drop, ...withoutM } = withM;
    expect(computeClaimId(withM)).not.toBe(computeClaimId(withoutM as ClaimContent));
  });

  it("the `measured` block's own key insertion order does not affect the id", () => {
    const a = measuredContent();
    const m = measured();
    const reversed = {
      ...base(),
      measured: {
        method: { instrument: m.method.instrument, attribution: m.method.attribution },
        period: { end: m.period.end, start: m.period.start },
        deliveredAmount: m.deliveredAmount,
        promisedAmount: m.promisedAmount,
        basis: m.basis,
        unit: m.unit,
      },
    } as ClaimContent;
    expect(computeClaimId(reversed)).toBe(computeClaimId(a));
  });
});

// ---------------------------------------------------------------------------
// 3. The signed v2 vectors.
// ---------------------------------------------------------------------------

describe("signed v2 test vectors", () => {
  it("the canonical gpu-second vector reproduces its documented preimage, id, and signature", async () => {
    const buyer = new ethers.Wallet(ANVIL_0_KEY);
    const content: ClaimContent = {
      sellerAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      buyerAddress: buyer.address,
      assetType: "gpu-hours",
      promisedSpec: { gpuModel: "A100-80GB", region: "eu-west", devices: 2, hours: 4 },
      delivered: "partial",
      evidenceHash: "37353ee638699ea6fd598863a1b55b3713fca76bd8f103c69f7c1dc0f9d36be5",
      settlementRef: "0x" + "11".repeat(32),
      timestamp: "2026-09-01T08:00:12.417Z",
      measured: {
        unit: "gpu-second",
        basis: "supplied",
        promisedAmount: "28800",
        deliveredAmount: "25230",
        period: { start: "2026-09-01T04:00:00Z", end: "2026-09-01T08:00:00Z" },
        method: {
          attribution: "buyer",
          instrument: "nvidia-smi accounting, 10s polling, job 8f21a3",
          readingsHash: "0d08539780ad082368c65079bf21cc1daaf62617549d20d5a304cc551248021d",
        },
      },
    };
    const preimage = claimPreimage(content);
    expect(Buffer.byteLength(preimage, "utf8")).toBe(806);
    const claimId = computeClaimId(content);
    expect(claimId).toBe("0x2c9885426ba05e58d8c364ab5612c9da7aeed54bdb201f8a76ffe9bb0626b95d");

    const signed = await signClaim(buyer, content);
    expect(signed.signature).toBe(
      "0x93b7fcbc12ee65ca99cc929cdd5fa3036fad047d5f8259f09aa4d72a335f32985c88f685f62fa2c54758c216fdb03a71e6c3f93a2e6850e343ee608c9b341cf61c",
    );
    expect(recoverClaimSigner(claimId, signed.signature).toLowerCase()).toBe(content.buyerAddress.toLowerCase());

    // The unmeasured twin, also pinned.
    const { measured: _drop, ...twin } = content;
    expect(computeClaimId(twin as ClaimContent)).toBe("0x004132f3c9f16176ae606df242846a193f1d2b293b1e2e238d15e4bfd8b87343");
  });

  it("the JSON test vector file on disk is in sync with what the code computes", () => {
    const vector = JSON.parse(readFileSync(new URL("../examples/metered-claim-testvector.json", import.meta.url), "utf8"));
    const { claimId, signature, ...content } = vector.claim;
    expect(claimPreimage(content)).toBe(vector.canonicalPreimage);
    expect(computeClaimId(content)).toBe(vector.claimId);
    expect(claimId).toBe(vector.claimId);
    expect(signature).toBe(vector.signature);
    expect(verifyClaim(vector.claim)).toEqual({ ok: true });
  });

  it("byte-second storage vector: 100% delivered AND delivered:'partial' is a legal combination (§5.4 has no cross-field rule)", () => {
    const content = base({
      assetType: "storage",
      promisedSpec: { sizeBytes: 536870912000, days: 30 },
      delivered: "partial", // arrived, but three days late — measured covers quantity only
      timestamp: "2026-10-01T00:00:03.500Z",
      measured: {
        unit: "byte-second",
        basis: "supplied",
        promisedAmount: "1391569403904000000",
        deliveredAmount: "1391569403904000000",
        period: { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" },
        method: { attribution: "seller", instrument: "provider monthly usage report" },
      },
    });
    expect(computeClaimId(content)).toBe("0xe69e13621ec1bc2353795035fe47173925f031ca031930a2be618497dd7821bb");
    expect(StrictClaimContentSchema.safeParse(content).success).toBe(true);
  });

  it("bandwidth vector: basis 'consumed' with deliveredAmount '0' AND delivered:'yes' is legal (why the zero-rule was rejected)", () => {
    // A 2 TB egress allowance that was fully available and that the buyer
    // simply never drew on. The seller delivered; the buyer did not consume.
    // A biconditional between deliveredAmount=="0" and delivered!="yes"
    // would force this buyer to lie.
    const content = base({
      assetType: "bandwidth",
      promisedSpec: "2 TB egress allowance, September",
      delivered: "yes",
      timestamp: "2026-10-01T00:00:00.000Z",
      measured: {
        unit: "byte",
        basis: "consumed",
        promisedAmount: "2000000000000",
        deliveredAmount: "0",
        period: { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" },
        method: { attribution: "third-party", instrument: "cloudflare analytics API, daily rollup" },
      },
    });
    // Vector herberekend toen de timestamp in deze testinvoer naar de
    // canonieke drie-cijfer-vorm ging. De vector legt de zero-regel vast,
    // niet een tijdstempelvorm; de bedoeling van de test is ongewijzigd.
    expect(computeClaimId(content)).toBe("0xfea9fb4460dbdcff134e4bb17399eeab21a941992822c6e4c9989f6b5ad409e3");
    expect(StrictClaimContentSchema.safeParse(content).success).toBe(true);
  });

  it("boundary vector: 30-digit integer part and an 18-digit fraction both round-trip", () => {
    const content = base({
      assetType: "api-credits",
      promisedSpec: "unspecified credit bundle",
      delivered: "partial",
      timestamp: "2026-09-01T00:00:00.000Z",
      measured: {
        unit: "credit",
        basis: "consumed",
        promisedAmount: "999999999999999999999999999999",
        deliveredAmount: "0.000000000000000001",
        period: { start: "2026-08-01T00:00:00Z", end: "2026-09-01T00:00:00Z" },
        method: { attribution: "undisclosed", instrument: "x" },
      },
    });
    expect(computeClaimId(content)).toBe("0x7fbab5809aa742fdb4853aaa3387d448ae0ca1965811b930e76454bd533f93a1");
    expect(StrictClaimContentSchema.safeParse(content).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Negative vectors — these must be refused, and therefore have no claimId.
// ---------------------------------------------------------------------------

describe("negative vectors: CDEC (canonical decimal string)", () => {
  const badDecimals = [
    "1.50",
    "1.5000",
    "1.0",
    "0.0",
    "00",
    "01",
    "+1",
    "-1",
    ".5",
    "1.",
    "1e3",
    "1E3",
    "1e+3",
    " 1",
    "1 ",
    "\u0664", // Arabic-Indic four — matches Python's \d, must not match ours
    "\uFF11", // fullwidth one
    "0.0000000000000000001", // 19 fraction digits
    "1".repeat(31), // 31 integer digits
    "NaN",
    "Infinity",
    "",
  ];

  for (const bad of badDecimals) {
    it(`refuses deliveredAmount = ${JSON.stringify(bad)}`, () => {
      expect(ClaimContentSchema.safeParse(measuredContent({}, { deliveredAmount: bad })).success).toBe(false);
    });
  }

  it("refuses a JSON number instead of a decimal string", () => {
    expect(ClaimContentSchema.safeParse(measuredContent({}, { deliveredAmount: 25230 as unknown as string })).success).toBe(false);
  });

  it('refuses promisedAmount = "0" (a promise of nothing)', () => {
    expect(ClaimContentSchema.safeParse(measuredContent({}, { promisedAmount: "0" })).success).toBe(false);
  });

  it('accepts deliveredAmount = "0" (measuring nothing is meaningful)', () => {
    expect(ClaimContentSchema.safeParse(measuredContent({}, { deliveredAmount: "0" })).success).toBe(true);
  });

  it("accepts the boundary forms 30 integer digits and an 18-digit fraction ending in a non-zero", () => {
    expect(ClaimContentSchema.safeParse(measuredContent({}, { promisedAmount: "9".repeat(30) })).success).toBe(true);
    expect(ClaimContentSchema.safeParse(measuredContent({}, { deliveredAmount: "0.000000000000000001" })).success).toBe(true);
  });
});

describe("negative vectors: CINST (canonical UTC instant)", () => {
  const badInstants = [
    "2026-09-01T04:00:00.000Z", // fractional seconds not allowed in period
    "2026-09-01T04:00:00+02:00", // offset
    "2026-09-01T04:00:00", // no Z
    "2026-09-01t04:00:00z", // lower-case t/z
    "2026-09-01 04:00:00Z", // space instead of T
    "2026-9-1T04:00:00Z", // unpadded
    "2026-09-01T24:00:00Z", // 24:00
    "2026-09-01T04:00:60Z", // leap second
    "2026-13-01T04:00:00Z", // month 13
    "2026-02-30T04:00:00Z", // real-calendar check
    "2026-09-01", // date only
    "2026-09-01T04:00Z", // no seconds
    "",
  ];

  for (const bad of badInstants) {
    it(`refuses period.start = ${JSON.stringify(bad)}`, () => {
      const content = measuredContent({}, { period: { start: bad, end: "2026-08-30T08:00:00Z" } as Measured["period"] });
      expect(ClaimContentSchema.safeParse(content).success).toBe(false);
    });
  }

  it("accepts a real leap day and refuses the non-leap-year equivalent", () => {
    const leapOk = measuredContent(
      { timestamp: "2028-03-01T00:00:00.000Z" },
      { period: { start: "2028-02-29T00:00:00Z", end: "2028-03-01T00:00:00Z" } },
    );
    expect(ClaimContentSchema.safeParse(leapOk).success).toBe(true);
    const leapBad = measuredContent(
      { timestamp: "2026-03-01T00:00:00.000Z" },
      { period: { start: "2026-02-29T00:00:00Z", end: "2026-03-01T00:00:00Z" } },
    );
    expect(ClaimContentSchema.safeParse(leapBad).success).toBe(false);
  });

  it("refuses 1900-02-29 (divisible by 4 and 100 but not 400)", () => {
    const content = measuredContent(
      { timestamp: "1900-03-01T00:00:00.000Z" },
      { period: { start: "1900-02-29T00:00:00Z", end: "1900-03-01T00:00:00Z" } },
    );
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("accepts 2000-02-29 (divisible by 400)", () => {
    const content = measuredContent(
      { timestamp: "2000-03-01T00:00:00.000Z" },
      { period: { start: "2000-02-29T00:00:00Z", end: "2000-03-01T00:00:00Z" } },
    );
    expect(ClaimContentSchema.safeParse(content).success).toBe(true);
  });
});

describe("negative vectors: structure and cross-field rules", () => {
  it("refuses period.start == period.end (zero-length window)", () => {
    const content = measuredContent({}, { period: { start: "2026-08-30T04:00:00Z", end: "2026-08-30T04:00:00Z" } });
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("refuses period.start > period.end", () => {
    const content = measuredContent({}, { period: { start: "2026-08-30T08:00:00Z", end: "2026-08-30T04:00:00Z" } });
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("refuses a period that closes after the claim's own timestamp", () => {
    const content = measuredContent(
      { timestamp: "2026-08-30T07:59:59.999Z" },
      { period: { start: "2026-08-30T04:00:00Z", end: "2026-08-30T08:00:00Z" } },
    );
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("ACCEPTS a period closing in the same second as a fractional-second timestamp (the 19-character prefix rule)", () => {
    // The exact case a full-string comparison gets wrong: "…T08:00:00Z" is
    // NOT <= "…T08:00:00.102Z" lexicographically, because "." < "Z".
    const content = measuredContent(
      { timestamp: "2026-08-30T08:00:00.102Z" },
      { period: { start: "2026-08-30T04:00:00Z", end: "2026-08-30T08:00:00Z" } },
    );
    expect("2026-08-30T08:00:00Z" <= "2026-08-30T08:00:00.102Z").toBe(false); // sanity: the naive rule really is wrong
    expect(ClaimContentSchema.safeParse(content).success).toBe(true);
  });

  it("refuses a loose timestamp as soon as `measured` is present, while still accepting it without `measured`", () => {
    for (const loose of ["August 30, 2026", "2026-08-30", "2026-08-30T12:00:00+02:00", "2026-08-30T12:00:00"]) {
      expect(ClaimContentSchema.safeParse(base({ timestamp: loose })).success).toBe(true);
      expect(ClaimContentSchema.safeParse(measuredContent({ timestamp: loose })).success).toBe(false);
    }
  });

  it("refuses `measured: {}` and any missing mandatory sub-field", () => {
    expect(ClaimContentSchema.safeParse({ ...base(), measured: {} } as unknown as ClaimContent).success).toBe(false);
    for (const key of ["unit", "basis", "promisedAmount", "deliveredAmount", "period", "method"] as const) {
      const m = measured() as unknown as Record<string, unknown>;
      delete m[key];
      expect(ClaimContentSchema.safeParse({ ...base(), measured: m } as unknown as ClaimContent).success).toBe(false);
    }
  });

  it("refuses an unknown key inside measured / period / method (strict: refused, not stripped)", () => {
    const withExtra = { ...measured(), extra: 1 } as unknown as Measured;
    expect(ClaimContentSchema.safeParse({ ...base(), measured: withExtra } as ClaimContent).success).toBe(false);

    const periodExtra = measured({ period: { start: "2026-08-30T04:00:00Z", end: "2026-08-30T08:00:00Z", tz: "UTC" } as never });
    expect(ClaimContentSchema.safeParse({ ...base(), measured: periodExtra } as ClaimContent).success).toBe(false);

    const methodExtra = measured({
      method: { attribution: "buyer", instrument: "x", attestor: "0xdead" } as never,
    });
    expect(ClaimContentSchema.safeParse({ ...base(), measured: methodExtra } as ClaimContent).success).toBe(false);
  });

  it("refuses an empty instrument, and one longer than 200 characters, and one with control characters", () => {
    for (const bad of ["", "x".repeat(201), "line1\nline2", "bell\u0007", "del\u007f", "lone\ud800"]) {
      const content = measuredContent({}, { method: { attribution: "buyer", instrument: bad } });
      expect(ClaimContentSchema.safeParse(content).success).toBe(false);
    }
    expect(ClaimContentSchema.safeParse(measuredContent({}, { method: { attribution: "buyer", instrument: "x".repeat(200) } })).success).toBe(
      true,
    );
  });

  it("refuses upper-case hex in readingsHash (lower-case only, unlike the frozen evidenceHash)", () => {
    const upper = measured({ method: { attribution: "buyer", instrument: "x", readingsHash: "A".repeat(64) } });
    expect(ClaimContentSchema.safeParse({ ...base(), measured: upper } as ClaimContent).success).toBe(false);
    const lower = measured({ method: { attribution: "buyer", instrument: "x", readingsHash: "a".repeat(64) } });
    expect(ClaimContentSchema.safeParse({ ...base(), measured: lower } as ClaimContent).success).toBe(true);
  });

  it("refuses every unit that is not in its assetType's row, and accepts every one that is", () => {
    for (const assetType of Object.keys(UNITS_BY_ASSET_TYPE) as (keyof typeof UNITS_BY_ASSET_TYPE)[]) {
      const allowed = UNITS_BY_ASSET_TYPE[assetType];
      for (const unit of MEASURED_UNITS) {
        const content = measuredContent({ assetType }, { unit });
        expect(ClaimContentSchema.safeParse(content).success).toBe(allowed.includes(unit));
      }
    }
  });

  it("refuses a unit / basis / attribution value outside its enum", () => {
    expect(ClaimContentSchema.safeParse(measuredContent({}, { unit: "gpu-hour" as never })).success).toBe(false);
    expect(ClaimContentSchema.safeParse(measuredContent({}, { basis: "reconciled" as never })).success).toBe(false);
    expect(
      ClaimContentSchema.safeParse(measuredContent({}, { method: { attribution: "reconciled" as never, instrument: "x" } })).success,
    ).toBe(false);
  });

  it("accepts every declared enum value in its own right", () => {
    for (const basis of MEASURED_BASIS_VALUES) {
      expect(ClaimContentSchema.safeParse(measuredContent({}, { basis })).success).toBe(true);
    }
    for (const attribution of MEASURED_ATTRIBUTION_VALUES) {
      expect(ClaimContentSchema.safeParse(measuredContent({}, { method: { attribution, instrument: "x" } })).success).toBe(true);
    }
  });

  it("does NOT constrain `delivered` against the measured amounts, in any direction", () => {
    for (const delivered of ["yes", "no", "partial"] as const) {
      expect(ClaimContentSchema.safeParse(measuredContent({ delivered }, { deliveredAmount: "0" })).success).toBe(true);
      expect(ClaimContentSchema.safeParse(measuredContent({ delivered }, { deliveredAmount: "28800" })).success).toBe(true);
      // Over-delivery is not capped either.
      expect(ClaimContentSchema.safeParse(measuredContent({ delivered }, { deliveredAmount: "99999" })).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Ingest hardening S-1 .. S-5 (StrictClaimContentSchema only).
// ---------------------------------------------------------------------------

describe("ingest hardening: S-1 promisedSpec value types (closes the measured NaN/Infinity/null collision)", () => {
  it("documents the collision that S-1 exists to close: NaN, Infinity, -Infinity and null hash identically today", () => {
    const ids = [NaN, Infinity, -Infinity, null].map((v) => computeClaimId(base({ promisedSpec: { n: v } as never })));
    expect(new Set(ids).size).toBe(1);
    expect(computeClaimId(base({ promisedSpec: { n: -0 } as never }))).toBe(computeClaimId(base({ promisedSpec: { n: 0 } as never })));
  });

  const badSpecValues: Array<[string, unknown]> = [
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["-0", -0],
    ["a non-integer float", 3.14],
    ["an integer above 2^53-1", 9007199254740993],
    ["a Date", new Date("2026-09-01T00:00:00Z")],
    ["a Map", new Map()],
    ["a Set", new Set()],
    ["an own toJSON", { toJSON: () => "surprise" }],
    ["undefined", undefined],
    ["a function", () => 1],
  ];

  for (const [label, value] of badSpecValues) {
    it(`refuses ${label} inside promisedSpec at ingest, while the frozen schema still accepts it`, () => {
      const content = base({ promisedSpec: { v: value } as never });
      expect(StrictClaimContentSchema.safeParse(content).success).toBe(false);
      // Frozen schema unchanged — historical lines stay recomputable.
      expect(ClaimContentSchema.safeParse(content).success).toBe(true);
    });
  }

  it("refuses the same values nested deeper in the object or inside an array", () => {
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { a: { b: [1, 2, NaN] } } as never })).success).toBe(false);
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { a: { b: [1, 2, 3] } } as never })).success).toBe(true);
  });

  it("keeps ordinary structured specs working", () => {
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { gpuModel: "A100", hours: 4 } })).success).toBe(true);
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { rate: "3.5083333", ok: true, tags: ["a", "b"], note: null } })).success).toBe(
      true,
    );
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: "1x A100, 4 hours" })).success).toBe(true);
  });

  it("accepts exactly 2^53-1 and refuses 2^53", () => {
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { n: 9007199254740991 } as never })).success).toBe(true);
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { n: -9007199254740991 } as never })).success).toBe(true);
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { n: 9007199254740992 } as never })).success).toBe(false);
  });
});

describe("ingest hardening: S-2 timestamp, S-3 hex case, S-4 settlementRef, S-5 spec keys", () => {
  it("S-2 refuses loose timestamps for new claims while the frozen schema keeps accepting them", () => {
    for (const loose of ["August 30, 2026", "2026-08-30", "08/30/2026", "2026-08-30T12:00:00+02:00", "2026-02-30T12:00:00.000Z"]) {
      expect(StrictClaimContentSchema.safeParse(base({ timestamp: loose })).success).toBe(false);
    }
    expect(ClaimContentSchema.safeParse(base({ timestamp: "August 30, 2026" })).success).toBe(true);
  });

  it("S-2 accepts exactly what every producer in this codebase already emits", () => {
    // The intent of this test is unchanged and still worth keeping: whatever
    // the real producer emits must pass. toISOString() always emits exactly
    // three fractional digits, so this still holds.
    expect(StrictClaimContentSchema.safeParse(base({ timestamp: new Date().toISOString() })).success).toBe(true);
    expect(StrictClaimContentSchema.safeParse(base({ timestamp: "2026-08-30T12:00:00.123Z" })).success).toBe(true);
  });

  it("S-2 refuses every other spelling of the same instant, so one moment has one claimId", () => {
    // These two assertions previously said `true`. That was the bug, not the
    // rule: allowing 0-to-9 fractional digits meant ten spellings of one
    // instant, each hashing to its own claimId, which let a seller record the
    // same delivery ten times against one settlementRef without the duplicate
    // check ever firing. Demonstrated end to end before this was tightened.
    for (const spelling of [
      "2026-08-30T12:00:00Z",
      "2026-08-30T12:00:00.1Z",
      "2026-08-30T12:00:00.12Z",
      "2026-08-30T12:00:00.1234Z",
      "2026-08-30T12:00:00.123456789Z",
    ]) {
      expect(
        StrictClaimContentSchema.safeParse(base({ timestamp: spelling })).success,
        `${spelling} must be refused: exactly three fractional digits, one spelling per millisecond`,
      ).toBe(false);
    }
  });

  it("S-3 refuses upper-case evidenceHash at ingest — the duplicate bypass it closes is real", () => {
    const lower = base({ evidenceHash: "a".repeat(64) });
    const upper = base({ evidenceHash: "A".repeat(64) });
    // The bypass, measured: same evidence, two different claimIds.
    expect(computeClaimId(lower)).not.toBe(computeClaimId(upper));
    expect(ClaimContentSchema.safeParse(upper).success).toBe(true); // frozen: unchanged
    expect(StrictClaimContentSchema.safeParse(upper).success).toBe(false);
    expect(StrictClaimContentSchema.safeParse(lower).success).toBe(true);
  });

  it("S-4 refuses control characters and lone surrogates in settlementRef", () => {
    for (const bad of ["ref\u0001here", "ref\nhere", "ref\u007fhere", "ref\ud800here"]) {
      expect(ClaimContentSchema.safeParse(base({ settlementRef: bad })).success).toBe(true); // frozen gap, documented
      expect(StrictClaimContentSchema.safeParse(base({ settlementRef: bad })).success).toBe(false);
    }
    expect(StrictClaimContentSchema.safeParse(base({ settlementRef: "ref with émoji 😀 is fine" })).success).toBe(true);
  });

  it("S-5 refuses astral and lone-surrogate keys in promisedSpec, at any depth", () => {
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { "\u{1F600}": 1 } })).success).toBe(false);
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { "\ud800": 1 } })).success).toBe(false);
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { outer: { "\u{1F600}": 1 } } })).success).toBe(false);
    // Non-astral non-ASCII keys are fine — this is about sort divergence, not about being English.
    expect(StrictClaimContentSchema.safeParse(base({ promisedSpec: { "é": 1, "！": 2, "日本語": 3 } })).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. End to end through the actual tool.
// ---------------------------------------------------------------------------

describe("recordDelivery with a measured claim", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-measured-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  });

  afterEach(() => {
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("records a signed measured claim and reads it back with the measured block intact", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = measuredContent({ buyerAddress: buyer.address, timestamp: "2026-08-30T09:00:00.000Z" });
    const { claimId, signature } = await signClaim(buyer, content);

    const result = await recordDelivery({ ...content, claimId, signature });
    expect(result).toEqual({ ok: true, claimId });

    const history = await getDeliveryHistory(content.sellerAddress);
    expect(history.count).toBe(1);
    expect(history.claims[0]!.measured).toEqual(content.measured);
  });

  it("refuses a measured claim whose period closes after its timestamp, with the normal error contract", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = measuredContent(
      { buyerAddress: buyer.address, timestamp: "2026-08-30T07:00:00.000Z" },
      { period: { start: "2026-08-30T04:00:00Z", end: "2026-08-30T08:00:00Z" } },
    );
    // computeClaimId itself refuses this, so build the wire claim by hand.
    const claim = { ...content, claimId: "0x" + "aa".repeat(32), signature: "0x" + "bb".repeat(65) };
    const result = await recordDelivery(claim);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/invalid_claim/);
  });

  it("refuses an upper-case evidenceHash at ingest (S-3) even with a perfectly valid signature", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = base({ buyerAddress: buyer.address, evidenceHash: "A".repeat(64) });
    const { claimId, signature } = await signClaim(buyer, content);
    const result = await recordDelivery({ ...content, claimId, signature });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/invalid_claim/);
  });

  it("a measured claim and its unmeasured twin are two separate ledger entries, not a duplicate", async () => {
    const buyer = ethers.Wallet.createRandom();
    const withM = measuredContent({ buyerAddress: buyer.address, timestamp: "2026-08-30T09:00:00.000Z" });
    const { measured: _drop, ...withoutM } = withM;

    const a = await signClaim(buyer, withM);
    const b = await signClaim(buyer, withoutM as ClaimContent);
    expect(a.claimId).not.toBe(b.claimId);

    expect((await recordDelivery({ ...withM, ...a })).ok).toBe(true);
    expect((await recordDelivery({ ...(withoutM as ClaimContent), ...b })).ok).toBe(true);
    expect((await getDeliveryHistory(withM.sellerAddress)).count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Schema surface that other modules depend on must survive the change.
// ---------------------------------------------------------------------------

describe("schema surface", () => {
  it("ClaimContentSchema and DeliveryClaimSchema still expose .shape (index.ts's MCP registration depends on it)", () => {
    expect(Object.keys(ClaimContentSchema.shape).sort()).toContain("measured");
    expect(Object.keys(DeliveryClaimSchema.shape).sort()).toEqual([
      "assetType",
      "buyerAddress",
      "claimId",
      "delivered",
      "evidenceHash",
      "measured",
      "promisedSpec",
      "sellerAddress",
      "settlementRef",
      "signature",
      "timestamp",
    ]);
  });

  it("DeliveryClaimSchema enforces the same measured rules as ClaimContentSchema (checks are attached, not inherited)", () => {
    const bad = {
      ...measuredContent({}, { period: { start: "2026-08-30T08:00:00Z", end: "2026-08-30T04:00:00Z" } }),
      claimId: "0x" + "aa".repeat(32),
      signature: "0x" + "bb".repeat(65),
    };
    expect(DeliveryClaimSchema.safeParse(bad).success).toBe(false);
    expect(StrictDeliveryClaimSchema.safeParse(bad).success).toBe(false);
  });
});
