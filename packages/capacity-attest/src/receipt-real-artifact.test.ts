// receipt-real-artifact.test.ts — the whole chain against a receipt that was
// actually signed, not a placeholder.
//
// Every other test here names a receipt with a stand-in digest. That proves the
// field survives the schema and the ledger, and proves nothing about whether the
// design survives a real artifact. This test builds one the way the x402
// offer-and-receipt extension says to build it: the canonical receipt payload
// from §5.2, the normative EIP-712 types from §5.3, the domain from §5.5, and
// the wire artifact as { format, payload, signature }. Then it hashes those
// exact bytes, names them from a buyer's claim, and runs the comparison.
//
// The field that made this worth writing: §5.2 defines issuedAt as a unix
// timestamp in seconds, while a claim carries an ISO-8601 string. A comparison
// that assumed both were strings skipped the ordering check in silence.

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  receiptDigest,
  checkReceiptBinding,
  compareClaimToReceipt,
  type ClaimSide,
  type ReceiptFields,
} from "./receipt-check.js";

// §5.3, normative. EIP712Domain is omitted: ethers derives it from the domain object.
const RECEIPT_TYPES = {
  Receipt: [
    { name: "version", type: "uint256" },
    { name: "network", type: "string" },
    { name: "resourceUrl", type: "string" },
    { name: "payer", type: "string" },
    { name: "issuedAt", type: "uint256" },
    { name: "transaction", type: "string" },
  ],
} as const;

// §5.5 step 3.
const RECEIPT_DOMAIN = { name: "x402 receipt", version: "1", chainId: 1 } as const;

const seller = new ethers.Wallet("0x" + "11".repeat(32));
const buyer = new ethers.Wallet("0x" + "22".repeat(32));

const SETTLEMENT = "0x" + "ab".repeat(32);
const ISSUED_AT = 1_767_225_600; // unix seconds, a number per §5.2
const CLAIM_TIMESTAMP = new Date((ISSUED_AT + 30) * 1000).toISOString();

interface ReceiptPayload {
  version: number;
  network: string;
  resourceUrl: string;
  payer: string;
  issuedAt: number;
  transaction: string;
}

function payload(overrides: Partial<ReceiptPayload> = {}): ReceiptPayload {
  return {
    version: 1,
    network: "eip155:84532", // Base Sepolia in CAIP-2, per the §5.2 note
    resourceUrl: "https://tokenizen.nl/self-check",
    payer: buyer.address,
    issuedAt: ISSUED_AT,
    transaction: SETTLEMENT,
    ...overrides,
  };
}

async function signedArtifact(p: ReceiptPayload): Promise<string> {
  const signature = await seller.signTypedData(RECEIPT_DOMAIN, RECEIPT_TYPES as never, p);
  // The wire artifact. Field order here is the transmitted order, which is
  // exactly why the digest is taken over it rather than over a re-serialization.
  return JSON.stringify({ format: "eip712", payload: p, signature });
}

function claimFor(artifact: string, overrides: Partial<ClaimSide> = {}): ClaimSide {
  return {
    buyerAddress: buyer.address.toLowerCase(),
    settlementRef: SETTLEMENT,
    timestamp: CLAIM_TIMESTAMP,
    offerReceiptHash: receiptDigest(artifact),
    ...overrides,
  };
}

function fieldsFrom(p: ReceiptPayload): ReceiptFields {
  return { payer: p.payer, transaction: p.transaction, issuedAt: p.issuedAt };
}

describe("a really signed receipt, end to end", () => {
  it("the signature recovers to the seller, so the artifact is the seller's own account", async () => {
    const p = payload();
    const artifact = await signedArtifact(p);
    const { signature } = JSON.parse(artifact);
    const recovered = ethers.verifyTypedData(RECEIPT_DOMAIN, RECEIPT_TYPES as never, p, signature);
    expect(recovered).toBe(seller.address);
  });

  it("binds, and the digest is over the transmitted bytes rather than a reparse", async () => {
    const artifact = await signedArtifact(payload());
    const r = checkReceiptBinding(claimFor(artifact), artifact);
    expect(r.bound).toBe(true);
    if (r.bound) expect(r.digest).toBe(receiptDigest(artifact));
  });

  it("re-serializing the same artifact with reordered keys breaks the binding", async () => {
    const artifact = await signedArtifact(payload());
    const parsed = JSON.parse(artifact);
    const resorted = JSON.stringify({ payload: parsed.payload, signature: parsed.signature, format: parsed.format });
    expect(checkReceiptBinding(claimFor(artifact), resorted).bound).toBe(false);
  });

  it("the two accounts agree on payer, settlement and ordering", async () => {
    const p = payload();
    const artifact = await signedArtifact(p);
    const r = compareClaimToReceipt(claimFor(artifact), fieldsFrom(p));
    expect(r.disagreements).toEqual([]);
    expect(r.notCompared).toEqual([]);
    expect(r.agrees).toBe(true);
  });

  it("a unix issuedAt after the claim timestamp is caught, which a string comparison missed", async () => {
    const p = payload({ issuedAt: ISSUED_AT + 600 });
    const artifact = await signedArtifact(p);
    const r = compareClaimToReceipt(claimFor(artifact), fieldsFrom(p));
    expect(r.notCompared).not.toContain("issuedAt");
    expect(r.disagreements.map((d) => d.field)).toEqual(["issuedAt"]);
    expect(r.disagreements[0]!.receipt).toBe(String(ISSUED_AT + 600));
  });

  it("a receipt signed for a different payer contradicts the claim it is named by", async () => {
    const stranger = new ethers.Wallet("0x" + "33".repeat(32));
    const p = payload({ payer: stranger.address });
    const artifact = await signedArtifact(p);
    const r = compareClaimToReceipt(claimFor(artifact), fieldsFrom(p));
    expect(r.agrees).toBe(false);
    expect(r.disagreements.map((d) => d.field)).toEqual(["payer"]);
  });

  it("a privacy-minimal receipt omits transaction, so that half is reported as not compared", async () => {
    // §5.4: receipts intentionally omit transaction by default, and §5.3 requires
    // the empty string for EIP-712 signing. An empty string is an absent field.
    const p = payload({ transaction: "" });
    const artifact = await signedArtifact(p);
    const fields = { payer: p.payer, issuedAt: p.issuedAt };
    const r = compareClaimToReceipt(claimFor(artifact), fields);
    expect(r.notCompared).toEqual(["transaction"]);
    expect(r.agrees).toBe(true);
  });
});
