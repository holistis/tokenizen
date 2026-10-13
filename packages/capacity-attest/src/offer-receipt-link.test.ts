// offer-receipt-link.test.ts — the buyer's claim can name the seller's receipt.
//
// x402 ships an official offer-receipt extension whose receipt is signed by the
// RESOURCE SERVER and, in its own words, "proves service was delivered". That is
// the seller's account of the seller's own performance. Their README lists
// dispute resolution as a use case, and a dispute cannot be settled on the word
// of the interested party alone.
//
// This claim is the other half: signed by the BUYER, the only party who knows
// whether what arrived matched what was promised. offerReceiptHash is what joins
// the two halves into one file instead of two unrelated pieces of paper.
//
// Their receipt carries no identifier of its own, so it is named by the sha256
// of its exact signed bytes, the way everything else here is named.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import { ClaimContentSchema, claimPreimage, computeClaimId, type ClaimContent } from "./schema.js";
import { signClaim, verifyClaim } from "./signing.js";
import { recordDelivery, getDeliveryHistory } from "./tools.js";

const RECEIPT_HASH = "c".repeat(64);
const OTHER_RECEIPT_HASH = "d".repeat(64);

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

function withReceipt(hash: string | undefined, overrides: Partial<ClaimContent> = {}): ClaimContent {
  return base({ ...overrides, offerReceiptHash: hash } as Partial<ClaimContent>);
}

describe("offerReceiptHash: naming the seller's receipt from the buyer's claim", () => {
  it("is optional, so every claim written before this field existed is still valid", () => {
    expect(ClaimContentSchema.safeParse(base()).success).toBe(true);
  });

  it("accepts a sha256 digest of the seller's signed receipt", () => {
    const parsed = ClaimContentSchema.safeParse(withReceipt(RECEIPT_HASH));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.offerReceiptHash).toBe(RECEIPT_HASH);
  });

  it("rejects anything that is not a bare lower-case sha256 hex digest", () => {
    const bad = [
      "0x" + "c".repeat(64), // a 0x prefix is how settlementRef is written, not a digest
      "c".repeat(63),
      "c".repeat(65),
      "C".repeat(64), // same lower-case-only rule the other digests follow (S-3)
      "not-a-hash",
      "",
    ];
    for (const value of bad) {
      const result = ClaimContentSchema.safeParse(withReceipt(value));
      expect(result.success, `should have rejected ${JSON.stringify(value.slice(0, 12))}`).toBe(false);
    }
  });

  // The whole point of putting it in the content rather than beside it. If the
  // reference sat outside the signed bytes, anyone could staple someone else's
  // receipt onto a claim afterwards and the signature would still check out.
  it("sits inside the signed content: adding it moves the claimId", () => {
    expect(computeClaimId(withReceipt(RECEIPT_HASH))).not.toBe(computeClaimId(base()));
  });

  it("names one specific receipt: a different digest gives a different claimId", () => {
    expect(computeClaimId(withReceipt(RECEIPT_HASH))).not.toBe(computeClaimId(withReceipt(OTHER_RECEIPT_HASH)));
  });

  it("appears in the canonical preimage in sorted key order, not appended at the end", () => {
    const preimage = claimPreimage(withReceipt(RECEIPT_HASH));
    expect(preimage).toContain(`"offerReceiptHash":"${RECEIPT_HASH}"`);
    // Keys are sorted recursively, so its position is fixed by the alphabet, not
    // by the order the caller happened to build the object in.
    expect(preimage.indexOf('"evidenceHash"')).toBeLessThan(preimage.indexOf('"offerReceiptHash"'));
    expect(preimage.indexOf('"offerReceiptHash"')).toBeLessThan(preimage.indexOf('"promisedSpec"'));
  });

  it("leaving it out is byte-identical to not having the field at all", () => {
    expect(claimPreimage(withReceipt(undefined))).toBe(claimPreimage(base()));
    expect(computeClaimId(withReceipt(undefined))).toBe(computeClaimId(base()));
  });

  it("key insertion order does not change the claimId, with or without the new field", () => {
    const a = { ...base(), offerReceiptHash: RECEIPT_HASH } as ClaimContent;
    const b = { offerReceiptHash: RECEIPT_HASH, ...base() } as ClaimContent;
    expect(computeClaimId(a)).toBe(computeClaimId(b));
  });

  it("a linked claim signs and verifies end to end", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = withReceipt(RECEIPT_HASH, { buyerAddress: buyer.address });
    const { claimId, signature } = await signClaim(buyer, content);
    expect(verifyClaim({ ...content, claimId, signature })).toEqual({ ok: true });
  });

  it("swapping in another receipt after signing breaks verification", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = withReceipt(RECEIPT_HASH, { buyerAddress: buyer.address });
    const { claimId, signature } = await signClaim(buyer, content);
    const tampered = { ...content, offerReceiptHash: OTHER_RECEIPT_HASH, claimId, signature };
    expect(verifyClaim(tampered)).toEqual({ ok: false, reason: "claimId_mismatch" });
  });

  it("stripping the receipt reference after signing also breaks verification", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = withReceipt(RECEIPT_HASH, { buyerAddress: buyer.address });
    const { claimId, signature } = await signClaim(buyer, content);
    const { offerReceiptHash: _dropped, ...stripped } = content;
    expect(verifyClaim({ ...(stripped as ClaimContent), claimId, signature })).toEqual({
      ok: false,
      reason: "claimId_mismatch",
    });
  });
});

// A field that signs and verifies correctly but gets dropped on the way into or
// out of the ledger would be useless in the one place it is meant to be read:
// the seller's delivery history. Signing is not storage, so prove storage too.
describe("offerReceiptHash survives the ledger round trip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-offer-receipt-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  });

  afterEach(() => {
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is recorded and read back intact, so the receipt link is visible in history", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = withReceipt(RECEIPT_HASH, { buyerAddress: buyer.address });
    const { claimId, signature } = await signClaim(buyer, content);

    expect(await recordDelivery({ ...content, claimId, signature })).toEqual({ ok: true, claimId });

    const history = await getDeliveryHistory(content.sellerAddress);
    expect(history.count).toBe(1);
    expect(history.claims[0]!.offerReceiptHash).toBe(RECEIPT_HASH);
  });

  it("a claim without a receipt reads back without the field, not as null or an empty string", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = base({ buyerAddress: buyer.address });
    const { claimId, signature } = await signClaim(buyer, content);

    expect(await recordDelivery({ ...content, claimId, signature })).toEqual({ ok: true, claimId });

    const history = await getDeliveryHistory(content.sellerAddress);
    expect(history.claims[0]!.offerReceiptHash).toBeUndefined();
  });

  // Ingest runs StrictDeliveryClaimSchema, so the lower-case rule has to hold at
  // the door as well, not only in the bare content schema.
  it("refuses an upper-case digest at ingest, with the normal error contract", async () => {
    const buyer = ethers.Wallet.createRandom();
    const content = withReceipt("C".repeat(64), { buyerAddress: buyer.address });
    // computeClaimId is happy to hash it; the schema is what must refuse it, so
    // build the wire claim by hand rather than relying on signing to fail.
    const claim = { ...content, claimId: "0x" + "aa".repeat(32), signature: "0x" + "bb".repeat(65) };
    const result = await recordDelivery(claim);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/invalid_claim/);
  });
});
