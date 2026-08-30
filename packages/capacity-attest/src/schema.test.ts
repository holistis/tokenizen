import { describe, it, expect } from "vitest";
import { ClaimContentSchema, canonicalize, computeClaimId, type ClaimContent } from "./schema.js";
import { evidenceHash } from "./test-helpers.js";

function validContent(overrides: Partial<ClaimContent> = {}): ClaimContent {
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
  };
}

describe("ClaimContentSchema", () => {
  it("accepteert een geldige claim", () => {
    const result = ClaimContentSchema.safeParse(validContent());
    expect(result.success).toBe(true);
  });

  it("weigert een sellerAddress die geen 0x-adres is", () => {
    const result = ClaimContentSchema.safeParse(validContent({ sellerAddress: "not-an-address" }));
    expect(result.success).toBe(false);
  });

  it("weigert een assetType buiten de vaste enum (geen financiële instrumenten toegestaan)", () => {
    const result = ClaimContentSchema.safeParse(validContent({ assetType: "loan" as never }));
    expect(result.success).toBe(false);
  });

  it("weigert een evidenceHash die geen sha256-hex is", () => {
    const result = ClaimContentSchema.safeParse(validContent({ evidenceHash: "0xdeadbeef" }));
    expect(result.success).toBe(false);
  });

  it("accepteert promisedSpec als structured object", () => {
    const result = ClaimContentSchema.safeParse(
      validContent({ promisedSpec: { gpuModel: "A100", hours: 4, region: "us-east" } }),
    );
    expect(result.success).toBe(true);
  });
});

describe("canonicalize", () => {
  it("is onafhankelijk van de volgorde van object-keys", () => {
    const a = canonicalize({ x: 1, y: 2, z: { b: 1, a: 2 } });
    const b = canonicalize({ z: { a: 2, b: 1 }, y: 2, x: 1 });
    expect(a).toBe(b);
  });

  it("behoudt de volgorde van array-elementen", () => {
    const a = canonicalize([3, 1, 2]);
    const b = canonicalize([1, 2, 3]);
    expect(a).not.toBe(b);
  });
});

describe("computeClaimId", () => {
  it("is deterministisch voor dezelfde inhoud", () => {
    const content = validContent();
    expect(computeClaimId(content)).toBe(computeClaimId({ ...content }));
  });

  it("verandert zodra een inhoudsveld verandert", () => {
    const content = validContent();
    const id1 = computeClaimId(content);
    const id2 = computeClaimId({ ...content, delivered: "no" });
    expect(id1).not.toBe(id2);
  });

  it("geeft een 0x-prefixed sha256-hex terug", () => {
    const id = computeClaimId(validContent());
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
