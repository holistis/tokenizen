import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverDeliveryHistory, localLedgerSource, staticSource, type ClaimSource } from "./discovery.js";
import { recordDelivery } from "./tools.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";
import { buildDiscoveryFixture, runControls } from "./discovery-fixture.js";
import { verifyClaim } from "./signing.js";
import type { DeliveryClaim } from "./schema.js";

const SELLER = "0x00000000000000000000000000000000000000aa";

// ---------------------------------------------------------------------------
// Pure aggregation behavior (staticSource, no ledger).
// ---------------------------------------------------------------------------
describe("discoverDeliveryHistory (pure)", () => {
  it("empty source list -> empty, consistent", async () => {
    const r = await discoverDeliveryHistory(SELLER, []);
    expect(r.count).toBe(0);
    expect(r.completeness.chainConsistent).toBe(true);
  });

  it("re-verifies every claim: a forged (wrong-signer) claim from a source is rejected", async () => {
    const buyer = testWallet();
    const impostor = testWallet();
    const good = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "01".repeat(32) });
    // Same content shape, signed by impostor while claiming buyer's address.
    const forgedContent = { ...good };
    delete (forgedContent as { claimId?: string }).claimId;
    delete (forgedContent as { signature?: string }).signature;
    const badSigner = await buildSignedClaim(impostor, { sellerAddress: SELLER, buyerAddress: buyer.address, settlementRef: "0x" + "02".repeat(32) });

    const r = await discoverDeliveryHistory(SELLER, [staticSource("s", [good, badSigner])]);
    expect(r.count).toBe(1);
    expect(r.claims[0]?.claimId).toBe(good.claimId);
    expect(r.sources[0]?.accepted).toBe(1);
    expect(r.sources[0]?.rejected).toBe(1);
  });

  it("de-duplicates the same claim across sources (first source gets the credit)", async () => {
    const buyer = testWallet();
    const c = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "03".repeat(32) });
    const r = await discoverDeliveryHistory(SELLER, [staticSource("a", [c]), staticSource("b", [c])]);
    expect(r.count).toBe(1);
    expect(r.sources[0]?.accepted).toBe(1);
    expect(r.sources[1]?.accepted).toBe(0);
    expect(r.sources[1]?.duplicates).toBe(1);
  });

  it("filters out a valid claim about a different seller (discovery's own filter, not the source's)", async () => {
    const buyer = testWallet();
    const forX = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "04".repeat(32) });
    const forY = await buildSignedClaim(buyer, { sellerAddress: "0x00000000000000000000000000000000000000bb", settlementRef: "0x" + "05".repeat(32) });
    // A raw source that does NOT pre-filter by seller (unlike staticSource), so
    // discovery's own seller filter is what has to drop forY.
    const rawSource: ClaimSource = { name: "raw", fetchForSeller: async () => [forX, forY] };
    const r = await discoverDeliveryHistory(SELLER, [rawSource]);
    expect(r.count).toBe(1);
    expect(r.claims[0]?.claimId).toBe(forX.claimId);
    // Valid-but-other-seller is tracked separately from cryptographic rejects.
    expect(r.sources[0]?.wrongSeller).toBe(1);
    expect(r.sources[0]?.rejected).toBe(0);
  });

  it("a source that resolves to a NON-array is recorded as an error and skipped, others still run", async () => {
    const buyer = testWallet();
    const c = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "07".repeat(32) });
    const nullSource: ClaimSource = { name: "null", fetchForSeller: async () => null as unknown as DeliveryClaim[] };
    const objSource: ClaimSource = { name: "obj", fetchForSeller: async () => ({}) as unknown as DeliveryClaim[] };
    const undefSource: ClaimSource = { name: "undef", fetchForSeller: async () => undefined as unknown as DeliveryClaim[] };
    const r = await discoverDeliveryHistory(SELLER, [nullSource, objSource, undefSource, staticSource("ok", [c])]);
    expect(r.count).toBe(1); // the ok source still contributed
    expect(r.sources[0]?.error).toMatch(/array/);
    expect(r.sources[1]?.error).toMatch(/array/);
    expect(r.sources[2]?.error).toMatch(/array/);
    expect(r.sources[3]?.accepted).toBe(1);
  });

  it("caps the number of claims examined per source and flags truncated", async () => {
    const buyer = testWallet();
    const c1 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "08".repeat(32) });
    const c2 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "09".repeat(32) });
    const c3 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "0a".repeat(32) });
    const r = await discoverDeliveryHistory(SELLER, [staticSource("big", [c1, c2, c3])], { maxClaimsPerSource: 2 });
    expect(r.count).toBe(2);
    expect(r.sources[0]?.truncated).toBe(true);
  });

  it("a source that throws is recorded as an error and skipped, others still contribute", async () => {
    const buyer = testWallet();
    const c = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "06".repeat(32) });
    const throwing: ClaimSource = { name: "boom", fetchForSeller: async () => { throw new Error("network down"); } };
    const r = await discoverDeliveryHistory(SELLER, [throwing, staticSource("ok", [c])]);
    expect(r.count).toBe(1);
    expect(r.sources[0]?.error).toMatch(/network down/);
    expect(r.sources[1]?.accepted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Public fixture controls.
// ---------------------------------------------------------------------------
describe("public discovery fixture", () => {
  it("is deterministic across builds", async () => {
    const a = await buildDiscoveryFixture();
    const b = await buildDiscoveryFixture();
    expect([a.a1.claimId, a.a2.claimId, a.b1.claimId]).toEqual([b.a1.claimId, b.a2.claimId, b.b1.claimId]);
  });

  it("every control passes (findability, dedup, filtering, forgery rejection, D-006 composition)", async () => {
    const controls = await runControls();
    const failed = controls.filter((c) => !c.pass);
    expect(failed.map((c) => `${c.id}: expected ${c.expected}, got ${c.actual}`)).toEqual([]);
    expect(controls.length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// Real two-installation end-to-end through actual ledgers in temp dirs.
// ---------------------------------------------------------------------------
describe("cross-installation discovery, real ledgers", () => {
  let dirA: string;
  let dirB: string;
  beforeEach(() => {
    dirA = mkdtempSync(join(tmpdir(), "ca-inst-A-"));
    dirB = mkdtempSync(join(tmpdir(), "ca-inst-B-"));
  });
  afterEach(() => {
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it("B's local ledger misses A's claim, and discovery over a source carrying A's ledger surfaces it", async () => {
    const buyerA = testWallet();
    const buyerB = testWallet();

    // Installation A records a claim (including a negative one) about the seller.
    process.env["CAPACITY_ATTEST_DATA_DIR"] = dirA;
    const aClaim = await buildSignedClaim(buyerA, { buyerAddress: buyerA.address, sellerAddress: SELLER, delivered: "no", settlementRef: "0x" + "a1".repeat(32) });
    expect((await recordDelivery(aClaim)).ok).toBe(true);
    // Capture A's ledger view (what A would publish to a shared substrate).
    const { allClaims } = await import("./ledger.js");
    const aPublished = await allClaims();

    // Installation B records its own claim about the same seller.
    process.env["CAPACITY_ATTEST_DATA_DIR"] = dirB;
    const bClaim = await buildSignedClaim(buyerB, { buyerAddress: buyerB.address, sellerAddress: SELLER, delivered: "yes", settlementRef: "0x" + "b1".repeat(32) });
    expect((await recordDelivery(bClaim)).ok).toBe(true);

    // B, local only: does NOT see A's claim.
    const localOnly = await discoverDeliveryHistory(SELLER, [localLedgerSource()]);
    expect(localOnly.count).toBe(1);
    expect(localOnly.claims[0]?.claimId).toBe(bClaim.claimId);

    // B, with the shared substrate carrying A's published ledger: sees both.
    const discovered = await discoverDeliveryHistory(SELLER, [localLedgerSource(), staticSource("shared-substrate", aPublished)]);
    expect(discovered.count).toBe(2);
    expect(discovered.claims.map((c) => c.claimId).sort()).toEqual([aClaim.claimId, bClaim.claimId].sort());
    // Both re-verify.
    expect(discovered.claims.every((c) => verifyClaim(c).ok)).toBe(true);
  });
});
