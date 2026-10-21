// receipt-issue.test.ts — can we emit a receipt a stranger can verify?

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  RECEIPT_EIP712_DOMAIN,
  RECEIPT_EIP712_TYPES,
  buildReceiptPayload,
  issueReceipt,
  recoverReceiptSigner,
} from "./receipt-issue.js";
import { receiptDigest, checkReceiptBinding, compareClaimToReceipt } from "./receipt-check.js";

const seller = new ethers.Wallet("0x" + "11".repeat(32));
const buyer = new ethers.Wallet("0x" + "22".repeat(32));
const ISSUED_AT = 1_767_225_600;

function input(overrides: Record<string, unknown> = {}) {
  return {
    network: "eip155:84532",
    resourceUrl: "https://api.tokenizen.nl/api/verify-ownership",
    payer: buyer.address,
    issuedAt: ISSUED_AT,
    ...overrides,
  } as Parameters<typeof buildReceiptPayload>[0];
}

describe("buildReceiptPayload", () => {
  it("fills version and turns an omitted transaction into the empty string", () => {
    const p = buildReceiptPayload(input());
    expect(p.version).toBe(1);
    expect(p.transaction).toBe("");
  });

  it("keeps a transaction when one is given", () => {
    const p = buildReceiptPayload(input({ transaction: "0x" + "ab".repeat(32) }));
    expect(p.transaction).toBe("0x" + "ab".repeat(32));
  });

  it("rejects a v1 network name instead of silently signing it", () => {
    expect(() => buildReceiptPayload(input({ network: "base-sepolia" }))).toThrow(/CAIP-2/);
  });

  it("rejects a resourceUrl that is not absolute, since authorization is checked against its host", () => {
    expect(() => buildReceiptPayload(input({ resourceUrl: "/api/thing" }))).toThrow(/absolute/);
  });

  it("rejects milliseconds, which would date the receipt tens of thousands of years out", () => {
    expect(() => buildReceiptPayload(input({ issuedAt: Date.UTC(2026, 0, 1) }))).toThrow(/milliseconds/);
  });

  it("rejects a non-integer or non-positive issuedAt", () => {
    expect(() => buildReceiptPayload(input({ issuedAt: 0 }))).toThrow(/unix SECONDS/);
    expect(() => buildReceiptPayload(input({ issuedAt: 1.5 }))).toThrow(/unix SECONDS/);
  });

  it("rejects an empty payer", () => {
    expect(() => buildReceiptPayload(input({ payer: "" }))).toThrow(/payer is required/);
  });
});

describe("issueReceipt", () => {
  it("produces an artifact whose signature recovers to the seller", async () => {
    const p = buildReceiptPayload(input());
    const artifact = await issueReceipt(p, seller);
    const r = recoverReceiptSigner(artifact);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.signer).toBe(seller.address);
  });

  it("is verifiable by a stranger holding only the artifact and the exported types", async () => {
    const p = buildReceiptPayload(input());
    const artifact = await issueReceipt(p, seller);
    const { payload, signature } = JSON.parse(artifact);
    // No access to our code paths: just the spec's types, the domain, and ethers.
    const recovered = ethers.verifyTypedData(
      RECEIPT_EIP712_DOMAIN,
      RECEIPT_EIP712_TYPES as never,
      payload,
      signature,
    );
    expect(recovered).toBe(seller.address);
  });

  it("returns the artifact already serialised, so the digest is over what is transmitted", async () => {
    const p = buildReceiptPayload(input());
    const artifact = await issueReceipt(p, seller);
    expect(typeof artifact).toBe("string");
    expect(artifact.startsWith('{"format":"eip712"')).toBe(true);
    expect(receiptDigest(artifact)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a changed payload field invalidates the signature", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(input()), seller);
    const tampered = JSON.parse(artifact);
    tampered.payload.payer = "0x" + "cc".repeat(20);
    const r = recoverReceiptSigner(JSON.stringify(tampered));
    // The signature still recovers, but to somebody else: that is the tell.
    expect(r.ok && r.signer !== seller.address).toBe(true);
  });
});

describe("recoverReceiptSigner refuses rather than guesses", () => {
  it("unparseable input", () => {
    expect(recoverReceiptSigner("not json")).toEqual({ ok: false, reason: "unparseable" });
  });

  it("a format it does not implement", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(input()), seller);
    const j = JSON.parse(artifact);
    j.format = "jws";
    expect(recoverReceiptSigner(JSON.stringify(j))).toEqual({ ok: false, reason: "unsupported_format" });
  });

  it("a payload missing a required field", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(input()), seller);
    const j = JSON.parse(artifact);
    delete j.payload.payer;
    expect(recoverReceiptSigner(JSON.stringify(j))).toEqual({ ok: false, reason: "malformed" });
  });

  it("a payload whose issuedAt arrived as a string", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(input()), seller);
    const j = JSON.parse(artifact);
    j.payload.issuedAt = String(ISSUED_AT);
    expect(recoverReceiptSigner(JSON.stringify(j))).toEqual({ ok: false, reason: "malformed" });
  });

  it("a signature that is not a signature", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(input()), seller);
    const j = JSON.parse(artifact);
    j.signature = "0x" + "00".repeat(65);
    expect(recoverReceiptSigner(JSON.stringify(j)).ok).toBe(false);
  });
});

describe("the two halves, issued and then checked", () => {
  it("a receipt we issue binds to a claim that names it, and the accounts agree", async () => {
    const settlement = "0x" + "ab".repeat(32);
    const p = buildReceiptPayload(input({ transaction: settlement }));
    const artifact = await issueReceipt(p, seller);

    const claim = {
      buyerAddress: buyer.address.toLowerCase(),
      settlementRef: settlement,
      timestamp: new Date((ISSUED_AT + 45) * 1000).toISOString(),
      offerReceiptHash: receiptDigest(artifact),
    };

    expect(checkReceiptBinding(claim, artifact).bound).toBe(true);

    const r = recoverReceiptSigner(artifact);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const comparison = compareClaimToReceipt(claim, {
      payer: r.payload.payer,
      transaction: r.payload.transaction,
      issuedAt: r.payload.issuedAt,
    });
    expect(comparison.disagreements).toEqual([]);
    expect(comparison.agrees).toBe(true);
  });

  it("a privacy-minimal receipt leaves the settlement half uncomparable, and says so", async () => {
    const p = buildReceiptPayload(input());
    const artifact = await issueReceipt(p, seller);
    const r = recoverReceiptSigner(artifact);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const comparison = compareClaimToReceipt(
      {
        buyerAddress: buyer.address.toLowerCase(),
        settlementRef: "0x" + "ab".repeat(32),
        timestamp: new Date((ISSUED_AT + 45) * 1000).toISOString(),
        offerReceiptHash: receiptDigest(artifact),
      },
      // transaction is "" in the payload, which §5.3 defines as absence.
      { payer: r.payload.payer, issuedAt: r.payload.issuedAt },
    );
    expect(comparison.notCompared).toEqual(["transaction"]);
    expect(comparison.agrees).toBe(true);
  });
});
