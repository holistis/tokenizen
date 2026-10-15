// receipt-check.test.ts — the two halves either tell the same story or they do not.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  receiptDigest,
  checkReceiptBinding,
  compareClaimToReceipt,
  type ClaimSide,
  type ReceiptFields,
} from "./receipt-check.js";

const ARTIFACT = '{"format":"jws","payload":"eyJhIjoxfQ","signature":"zzz"}';
const DIGEST = createHash("sha256").update(ARTIFACT).digest("hex");

function claim(overrides: Partial<ClaimSide> = {}): ClaimSide {
  return {
    buyerAddress: "0x00000000000000000000000000000000000000bb",
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-08-30T12:00:00.000Z",
    offerReceiptHash: DIGEST,
    ...overrides,
  };
}

describe("receiptDigest", () => {
  it("is the sha256 of the exact bytes, lower-case hex, no prefix", () => {
    expect(receiptDigest(ARTIFACT)).toBe(DIGEST);
    expect(receiptDigest(ARTIFACT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not normalise: a reordered but equivalent JSON artifact gets a different digest", () => {
    const reordered = '{"signature":"zzz","payload":"eyJhIjoxfQ","format":"jws"}';
    expect(receiptDigest(reordered)).not.toBe(DIGEST);
  });

  it("treats a string and its utf-8 bytes identically", () => {
    expect(receiptDigest(new TextEncoder().encode(ARTIFACT))).toBe(DIGEST);
  });
});

describe("checkReceiptBinding", () => {
  it("binds when the claim names this exact artifact", () => {
    expect(checkReceiptBinding(claim(), ARTIFACT)).toEqual({ bound: true, digest: DIGEST });
  });

  it("recomputes rather than trusting the field: a claim naming something else does not bind", () => {
    const r = checkReceiptBinding(claim({ offerReceiptHash: "c".repeat(64) }), ARTIFACT);
    expect(r).toEqual({ bound: false, reason: "digest_mismatch", digest: DIGEST, named: "c".repeat(64) });
  });

  it("says so plainly when the claim names no receipt at all", () => {
    const r = checkReceiptBinding(claim({ offerReceiptHash: undefined }), ARTIFACT);
    expect(r).toEqual({ bound: false, reason: "claim_names_no_receipt", digest: DIGEST });
  });

  it("a single flipped byte in the artifact breaks the binding", () => {
    const tampered = ARTIFACT.replace('"zzz"', '"zzy"');
    expect(checkReceiptBinding(claim(), tampered).bound).toBe(false);
  });
});

describe("compareClaimToReceipt", () => {
  const agreeing: ReceiptFields = {
    payer: "0x00000000000000000000000000000000000000BB",
    transaction: "0x" + "11".repeat(32),
    issuedAt: "2026-08-30T11:59:00.000Z",
  };

  it("agrees when every comparable field matches, case-insensitively", () => {
    const r = compareClaimToReceipt(claim(), agreeing);
    expect(r.agrees).toBe(true);
    expect(r.disagreements).toEqual([]);
    expect(r.notCompared).toEqual([]);
  });

  it("catches a receipt that names a different payer", () => {
    const r = compareClaimToReceipt(claim(), { ...agreeing, payer: "0x" + "cc".repeat(20) });
    expect(r.agrees).toBe(false);
    expect(r.disagreements.map((d) => d.field)).toEqual(["payer"]);
  });

  it("catches two halves that are about different settlements", () => {
    const r = compareClaimToReceipt(claim(), { ...agreeing, transaction: "0x" + "22".repeat(32) });
    expect(r.agrees).toBe(false);
    expect(r.disagreements.map((d) => d.field)).toEqual(["transaction"]);
  });

  it("catches a receipt issued after the claim that refers to it", () => {
    const r = compareClaimToReceipt(claim(), { ...agreeing, issuedAt: "2026-08-30T12:00:01.000Z" });
    expect(r.agrees).toBe(false);
    expect(r.disagreements.map((d) => d.field)).toEqual(["issuedAt"]);
  });

  it("accepts a receipt issued at exactly the claim timestamp", () => {
    const r = compareClaimToReceipt(claim(), { ...agreeing, issuedAt: "2026-08-30T12:00:00.000Z" });
    expect(r.agrees).toBe(true);
  });

  it("reports several disagreements at once rather than stopping at the first", () => {
    const r = compareClaimToReceipt(claim(), {
      payer: "0x" + "cc".repeat(20),
      transaction: "0x" + "22".repeat(32),
      issuedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(r.disagreements.map((d) => d.field).sort()).toEqual(["issuedAt", "payer", "transaction"]);
  });

  it("an absent receipt field is not compared, and silence is never agreement", () => {
    const r = compareClaimToReceipt(claim(), {});
    expect(r.agrees).toBe(false);
    expect(r.disagreements).toEqual([]);
    expect(r.notCompared.sort()).toEqual(["issuedAt", "payer", "transaction"]);
  });

  it("an unparseable date is not compared rather than guessed", () => {
    const r = compareClaimToReceipt(claim(), { ...agreeing, issuedAt: "whenever" });
    expect(r.notCompared).toEqual(["issuedAt"]);
    expect(r.disagreements).toEqual([]);
    expect(r.agrees).toBe(true);
  });

  it("one comparable agreeing field is enough to agree, with the rest reported as not compared", () => {
    const r = compareClaimToReceipt(claim(), { payer: agreeing.payer });
    expect(r.agrees).toBe(true);
    expect(r.notCompared.sort()).toEqual(["issuedAt", "transaction"]);
  });
});
