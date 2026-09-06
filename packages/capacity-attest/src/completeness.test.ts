import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeCompleteness } from "./completeness.js";
import { ClaimContentSchema, computeClaimId, canonicalize, type ClaimContent, type DeliveryClaim } from "./schema.js";
import { recordDelivery, getDeliveryHistory } from "./tools.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Pure unit tests on analyzeCompleteness — no ledger, no network.
// ---------------------------------------------------------------------------

/** Minimal DeliveryClaim-shaped object for pure-function tests (signatures irrelevant here). */
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

const B = "0x00000000000000000000000000000000000000b1";
const C = "0x00000000000000000000000000000000000000c2";
const id = (n: number) => "0x" + n.toString(16).padStart(64, "0");

describe("analyzeCompleteness (pure)", () => {
  it("lege set is consistent, geen omissies, geen forks", () => {
    const r = analyzeCompleteness([]);
    expect(r.chainConsistent).toBe(true);
    expect(r.possibleOmissions).toEqual([]);
    expect(r.forks).toEqual([]);
  });

  it("een enkele genesis-claim (geen priorClaimId) is consistent", () => {
    const r = analyzeCompleteness([fakeClaim(id(1), B)]);
    expect(r.chainConsistent).toBe(true);
  });

  it("een volledige keten waarin elke schakel aanwezig is, is consistent", () => {
    const claims = [fakeClaim(id(1), B), fakeClaim(id(2), B, id(1)), fakeClaim(id(3), B, id(2))];
    const r = analyzeCompleteness(claims);
    expect(r.chainConsistent).toBe(true);
    expect(r.possibleOmissions).toEqual([]);
  });

  it("verborgen middelste claim: de volgende schakel wijst naar een claim die niet in de set zit", () => {
    // Chain c1 <- c2 <- c3, maar c2 is verwijderd uit de getoonde set.
    const claims = [fakeClaim(id(1), B), fakeClaim(id(3), B, id(2))];
    const r = analyzeCompleteness(claims);
    expect(r.chainConsistent).toBe(false);
    expect(r.possibleOmissions).toHaveLength(1);
    expect(r.possibleOmissions[0]).toEqual({ buyerAddress: B, missingPriorClaimId: id(2), referencedBy: id(3) });
  });

  it("fork: twee claims van dezelfde koper wijzen naar dezelfde prior", () => {
    const claims = [fakeClaim(id(1), B), fakeClaim(id(2), B, id(1)), fakeClaim(id(3), B, id(1))];
    const r = analyzeCompleteness(claims);
    expect(r.chainConsistent).toBe(false);
    expect(r.forks).toHaveLength(1);
    expect(r.forks[0]?.priorClaimId).toBe(id(1));
    expect(r.forks[0]?.claimIds.sort()).toEqual([id(2), id(3)].sort());
  });

  it("kopers met eigen ketens bemoeien zich niet met elkaar", () => {
    // B: volledig. C: mist de prior. Alleen C's keten mag flaggen.
    const claims = [fakeClaim(id(1), B), fakeClaim(id(2), B, id(1)), fakeClaim(id(9), C, id(8))];
    const r = analyzeCompleteness(claims);
    expect(r.possibleOmissions).toHaveLength(1);
    expect(r.possibleOmissions[0]?.buyerAddress).toBe(C);
  });

  it("priorClaimId-vergelijking is hoofdletterongevoelig", () => {
    const upper = "0x" + "AB".repeat(32);
    const lower = "0x" + "ab".repeat(32);
    // c2 verwijst met upper-case naar c1's lower-case id: moet als aanwezig gelden.
    const claims = [fakeClaim(lower, B), fakeClaim(id(2), B, upper)];
    const r = analyzeCompleteness(claims);
    expect(r.chainConsistent).toBe(true);
    expect(r.possibleOmissions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// priorClaimId schema behavior + frozen-preimage discipline.
// ---------------------------------------------------------------------------

function baseContent(overrides: Partial<ClaimContent> = {}): ClaimContent {
  return {
    sellerAddress: "0x00000000000000000000000000000000000000aa",
    buyerAddress: "0x00000000000000000000000000000000000000b1",
    assetType: "gpu-hours",
    promisedSpec: "1x A100, 4 hours",
    delivered: "yes",
    evidenceHash: "b".repeat(64),
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ClaimContent;
}

describe("priorClaimId schema + frozen preimage", () => {
  it("een claim zonder priorClaimId bevat het veld niet in de canonieke vorm (bestaande claims blijven bit-voor-bit gelijk)", () => {
    const parsed = ClaimContentSchema.parse(baseContent());
    expect(Object.prototype.hasOwnProperty.call(parsed, "priorClaimId")).toBe(false);
    expect(canonicalize(parsed)).not.toContain("priorClaimId");
  });

  it("een expliciet priorClaimId: undefined hasht identiek aan een afwezige", () => {
    const withUndefined = { ...baseContent(), priorClaimId: undefined } as ClaimContent;
    expect(computeClaimId(withUndefined)).toBe(computeClaimId(baseContent()));
  });

  it("een claim MET priorClaimId heeft een ander claimId dan zijn tweeling zonder", () => {
    const withPrior = baseContent({ priorClaimId: "0x" + "cd".repeat(32) });
    expect(computeClaimId(withPrior)).not.toBe(computeClaimId(baseContent()));
  });

  it("priorClaimId van het verkeerde formaat wordt geweigerd", () => {
    expect(ClaimContentSchema.safeParse(baseContent({ priorClaimId: "niet-een-hash" })).success).toBe(false);
    expect(ClaimContentSchema.safeParse(baseContent({ priorClaimId: "0x" + "zz".repeat(32) })).success).toBe(false);
  });

  it("een geldig priorClaimId (0x + 64 hex) wordt geaccepteerd", () => {
    expect(ClaimContentSchema.safeParse(baseContent({ priorClaimId: "0x" + "ab".repeat(32) })).success).toBe(true);
  });

  it("priorClaimId: null wordt geweigerd (optional accepteert geen null)", () => {
    const content = { ...baseContent(), priorClaimId: null } as unknown as ClaimContent;
    expect(ClaimContentSchema.safeParse(content).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end via get_delivery_history: a host that never recorded the middle
// claim (or hid it) is caught by the dangling back-reference.
// ---------------------------------------------------------------------------

describe("get_delivery_history completeness (end-to-end)", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-completeness-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  });
  afterEach(() => {
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("een echte, volledig vastgelegde keten meldt chainConsistent=true", async () => {
    const buyer = testWallet();
    const seller = "0x00000000000000000000000000000000000000aa";
    const c1 = await buildSignedClaim(buyer, { sellerAddress: seller, settlementRef: "0x" + "a1".repeat(32), timestamp: "2026-01-01T00:00:00.000Z" });
    const c2 = await buildSignedClaim(buyer, { sellerAddress: seller, settlementRef: "0x" + "a2".repeat(32), timestamp: "2026-02-01T00:00:00.000Z", priorClaimId: c1.claimId });
    const c3 = await buildSignedClaim(buyer, { sellerAddress: seller, settlementRef: "0x" + "a3".repeat(32), timestamp: "2026-03-01T00:00:00.000Z", priorClaimId: c2.claimId });
    for (const c of [c1, c2, c3]) expect((await recordDelivery(c)).ok).toBe(true);

    const history = await getDeliveryHistory(seller);
    expect(history.count).toBe(3);
    expect(history.completeness.chainConsistent).toBe(true);
    expect(history.completeness.possibleOmissions).toEqual([]);
  });

  it("een host die de middelste claim nooit vastlegde wordt betrapt: c3 verwijst naar de ontbrekende c2", async () => {
    const buyer = testWallet();
    const seller = "0x00000000000000000000000000000000000000aa";
    const c1 = await buildSignedClaim(buyer, { sellerAddress: seller, settlementRef: "0x" + "b1".repeat(32), timestamp: "2026-01-01T00:00:00.000Z" });
    // c2 wordt WEL gebouwd (zodat c3 ernaar kan verwijzen) maar NOOIT vastgelegd:
    // dit is exact het "host toont c1 en c3, verbergt de negatieve c2"-scenario.
    const c2 = await buildSignedClaim(buyer, { sellerAddress: seller, delivered: "no", settlementRef: "0x" + "b2".repeat(32), timestamp: "2026-02-01T00:00:00.000Z", priorClaimId: c1.claimId });
    const c3 = await buildSignedClaim(buyer, { sellerAddress: seller, settlementRef: "0x" + "b3".repeat(32), timestamp: "2026-03-01T00:00:00.000Z", priorClaimId: c2.claimId });
    expect((await recordDelivery(c1)).ok).toBe(true);
    expect((await recordDelivery(c3)).ok).toBe(true); // c2 bewust overgeslagen

    const history = await getDeliveryHistory(seller);
    expect(history.count).toBe(2);
    expect(history.completeness.chainConsistent).toBe(false);
    expect(history.completeness.possibleOmissions).toHaveLength(1);
    expect(history.completeness.possibleOmissions[0]?.missingPriorClaimId).toBe(c2.claimId);
    expect(history.completeness.possibleOmissions[0]?.referencedBy).toBe(c3.claimId);
  });

  it("een lege geschiedenis is consistent (geen valse alarmen)", async () => {
    const history = await getDeliveryHistory("0x00000000000000000000000000000000000000ff");
    expect(history.count).toBe(0);
    expect(history.completeness.chainConsistent).toBe(true);
  });
});
