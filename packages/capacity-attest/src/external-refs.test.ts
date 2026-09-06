// external-refs.test.ts — tests for the `externalRefs` extension (0.3.0) and,
// more importantly, the FROZEN REGRESSION ANCHOR that proves adding it
// changed nothing about how an already-recorded claim hashes.
//
// The claimId hard-coded in the "frozen regression anchor" block below must
// NEVER change. If it ever moves, the preimage function moved with it, and
// every claim ever signed became unverifiable. In that case the
// implementation is wrong, not the test. Same discipline as measured.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ClaimContentSchema,
  ExternalRefsSchema,
  canonicalize,
  claimPreimage,
  computeClaimId,
  type ClaimContent,
  type ExternalRefs,
} from "./schema.js";
import { recoverClaimSigner, verifyClaim } from "./signing.js";
import { evidenceHash } from "./test-helpers.js";

function base(overrides: Partial<ClaimContent> = {}): ClaimContent {
  return {
    sellerAddress: "0x00000000000000000000000000000000000000aa",
    buyerAddress: "0x00000000000000000000000000000000000000bb",
    assetType: "gpu-hours",
    promisedSpec: "1x A100, 4 hours",
    delivered: "yes",
    evidenceHash: evidenceHash("evidence"),
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-08-30T12:00:00.000Z",
    ...overrides,
  } as ClaimContent;
}

/** A valid `externalRefs` block, with per-test overrides. */
function externalRefs(overrides: Partial<ExternalRefs> = {}): ExternalRefs {
  return {
    sellerAgentRef: "eip155:8453/erc8004:1234",
    ...overrides,
  } as ExternalRefs;
}

// ---------------------------------------------------------------------------
// 1. FROZEN REGRESSION ANCHOR — do not ever change this expected value.
// ---------------------------------------------------------------------------

describe("frozen regression anchor: adding externalRefs did not move the preimage function", () => {
  it("the REAL production claim in data-selftest/claims.jsonl still hashes to its stored claimId", () => {
    const line = readFileSync(new URL("../data-selftest/claims.jsonl", import.meta.url), "utf8").trim().split("\n")[0]!;
    const stored = JSON.parse(line) as Record<string, unknown>;
    const { claimId, signature, ...content } = stored;

    expect(claimId).toBe("0xc008b7b38e8a80061d525ac1cfe08c4f48244612dcf7f2a1b61b82c16fccac29");
    // The whole point: recompute through the 0.3.0 schema (which now has an
    // `externalRefs` key this claim does not use) and land on the exact same id.
    expect(computeClaimId(content as unknown as ClaimContent)).toBe(claimId);
    expect(recoverClaimSigner(claimId as string, signature as string)).toBe("0xF11ce7141dAeCEC9624Ec3Ccf49b437d40A0Ad20");
    expect(verifyClaim(stored as never)).toEqual({ ok: true });
  });

  it("the real production claim's parse result has no `externalRefs` own property", () => {
    const line = readFileSync(new URL("../data-selftest/claims.jsonl", import.meta.url), "utf8").trim().split("\n")[0]!;
    const stored = JSON.parse(line) as Record<string, unknown>;
    const { claimId: _id, signature: _sig, ...content } = stored;

    const parsed = ClaimContentSchema.parse(content) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "externalRefs")).toBe(false);
    expect(claimPreimage(content as unknown as ClaimContent)).not.toContain("externalRefs");
  });
});

// ---------------------------------------------------------------------------
// 2. Backward compatibility of the schema change itself.
// ---------------------------------------------------------------------------

describe("backward compatibility of the `externalRefs` addition", () => {
  it("an absent `externalRefs` is absent from the parse result AND from the canonical form", () => {
    const parsed = ClaimContentSchema.parse(base()) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "externalRefs")).toBe(false);
    expect(canonicalize(parsed)).not.toContain("externalRefs");
  });

  it("an explicit `externalRefs: undefined` hashes identically to an absent one", () => {
    const withUndefined = { ...base(), externalRefs: undefined } as ClaimContent;
    expect(computeClaimId(withUndefined)).toBe(computeClaimId(base()));
  });

  it("`externalRefs: null` is refused (zod .optional() does not accept null)", () => {
    const content = { ...base(), externalRefs: null } as unknown as ClaimContent;
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });

  it("a claim with externalRefs has a different claimId than its twin without it", () => {
    const withRefs = base({ externalRefs: externalRefs() });
    const { externalRefs: _drop, ...withoutRefs } = withRefs;
    expect(computeClaimId(withRefs)).not.toBe(computeClaimId(withoutRefs as ClaimContent));
  });

  it("externalRefs' own key insertion order does not affect the id", () => {
    const full: ExternalRefs = {
      sellerAgentRef: "eip155:8453/erc8004:1",
      buyerAgentRef: "eip155:8453/erc8004:2",
      mandateRef: "urn:ap2:mandate:abc",
      mandateIssuerDid: "did:web:example.com",
      intentRef: "urn:ap2:intent:xyz",
      disputeContext: { protocol: "LCP", termsHash: "a".repeat(64) },
    };
    const a = base({ externalRefs: full });
    const reversed = {
      ...base(),
      externalRefs: {
        disputeContext: { termsHash: "a".repeat(64), protocol: "LCP" },
        intentRef: full.intentRef,
        mandateIssuerDid: full.mandateIssuerDid,
        mandateRef: full.mandateRef,
        buyerAgentRef: full.buyerAgentRef,
        sellerAgentRef: full.sellerAgentRef,
      },
    } as ClaimContent;
    expect(computeClaimId(reversed)).toBe(computeClaimId(a));
  });
});

// ---------------------------------------------------------------------------
// 3. Field-level validation.
// ---------------------------------------------------------------------------

describe("ExternalRefsSchema", () => {
  it("accepteert een claim met slechts één van de zes velden ingevuld", () => {
    expect(ClaimContentSchema.safeParse(base({ externalRefs: { intentRef: "urn:ap2:intent:xyz" } })).success).toBe(true);
  });

  it("weigert een leeg externalRefs-object — dat is nutteloos, laat het veld gewoon weg", () => {
    expect(ExternalRefsSchema.safeParse({}).success).toBe(false);
  });

  it("weigert een onbekende sleutel binnen externalRefs (strictObject)", () => {
    expect(ExternalRefsSchema.safeParse({ trustScore: 99 }).success).toBe(false);
  });

  it("weigert een referentie-string boven de lengtegrens", () => {
    expect(ExternalRefsSchema.safeParse({ sellerAgentRef: "x".repeat(513) }).success).toBe(false);
    expect(ExternalRefsSchema.safeParse({ sellerAgentRef: "x".repeat(512) }).success).toBe(true);
  });

  it("weigert een referentie-string met een stuurteken (log-injectie-hygiëne, zelfde regel als settlementRef)", () => {
    expect(ExternalRefsSchema.safeParse({ mandateRef: "abc\ndef" }).success).toBe(false);
  });

  it("accepteert een syntactisch geldige DID voor mandateIssuerDid", () => {
    expect(ExternalRefsSchema.safeParse({ mandateIssuerDid: "did:web:example.com" }).success).toBe(true);
    expect(ExternalRefsSchema.safeParse({ mandateIssuerDid: "did:key:z6Mkf5rGMoat" }).success).toBe(true);
  });

  it("weigert mandateIssuerDid zonder geldige did:<method>:<id>-vorm", () => {
    expect(ExternalRefsSchema.safeParse({ mandateIssuerDid: "not-a-did" }).success).toBe(false);
    expect(ExternalRefsSchema.safeParse({ mandateIssuerDid: "did:web" }).success).toBe(false);
  });

  it("disputeContext vereist protocol + termsHash, resolutionRef is optioneel", () => {
    expect(ExternalRefsSchema.safeParse({ disputeContext: { protocol: "LCP", termsHash: "a".repeat(64) } }).success).toBe(true);
    expect(
      ExternalRefsSchema.safeParse({
        disputeContext: { protocol: "LCP", termsHash: "a".repeat(64), resolutionRef: "case:123" },
      }).success,
    ).toBe(true);
    expect(ExternalRefsSchema.safeParse({ disputeContext: { protocol: "LCP" } }).success).toBe(false);
  });

  it("weigert een termsHash die geen lower-case sha256-hex is (strict from day one, zelfde reden als readingsHash)", () => {
    expect(ExternalRefsSchema.safeParse({ disputeContext: { protocol: "LCP", termsHash: "A".repeat(64) } }).success).toBe(false);
    expect(ExternalRefsSchema.safeParse({ disputeContext: { protocol: "LCP", termsHash: "not-hex" } }).success).toBe(false);
  });
});
