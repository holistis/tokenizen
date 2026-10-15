// receipt-check.ts — compute whether a buyer's claim and the seller's receipt
// it names actually agree.
//
// The claim already carries `offerReceiptHash`, the sha256 of the seller's
// x402 offer-receipt artifact exactly as transmitted. That binds the two halves
// by name. It does not say whether they tell the same story: nothing here or
// anywhere else recomputed the digest against a real artifact, or compared the
// fields the two sides both describe. Until it does, a contradiction between a
// buyer's account and the seller's own receipt stays a matter of reading rather
// than of arithmetic.
//
// Deliberately NOT in here: any verdict about who is right. A disagreement is
// reported as a disagreement. Adjudication belongs to whatever protocol the
// claim's `externalRefs.disputeContext` names, exactly as that field already
// states.
//
// The receipt is never re-canonicalised, parsed, or re-serialised by us. The
// caller passes the raw artifact for the digest, and separately passes whatever
// fields it extracted with its own x402 tooling. That split is the point: this
// module cannot silently disagree with the spec about wire shape, because it
// never interprets the wire shape.

import { createHash } from "node:crypto";

/** Fields the caller extracted from a receipt payload. Every one is optional: a comparison is skipped rather than guessed. */
export interface ReceiptFields {
  /** The paying party, per the receipt. Compared case-insensitively against the claim's buyerAddress. */
  payer?: string;
  /** The settlement this receipt is about. Compared case-insensitively against the claim's settlementRef. */
  transaction?: string;
  /** When the seller issued the receipt. A receipt issued after the buyer's claim is a disagreement about ordering. */
  issuedAt?: string;
}

export interface ClaimSide {
  buyerAddress: string;
  settlementRef: string;
  timestamp: string;
  offerReceiptHash?: string | undefined;
}

export type BindingResult =
  | { bound: true; digest: string }
  | { bound: false; reason: "claim_names_no_receipt"; digest: string }
  | { bound: false; reason: "digest_mismatch"; digest: string; named: string };

/** sha256 of the artifact exactly as given, lower-case hex, no prefix. No normalisation of any kind. */
export function receiptDigest(artifact: string | Uint8Array): string {
  return createHash("sha256").update(artifact).digest("hex");
}

/** Does this claim actually name this artifact? Recomputes the digest rather than trusting the field. */
export function checkReceiptBinding(claim: ClaimSide, artifact: string | Uint8Array): BindingResult {
  const digest = receiptDigest(artifact);
  if (claim.offerReceiptHash === undefined) return { bound: false, reason: "claim_names_no_receipt", digest };
  if (claim.offerReceiptHash !== digest) {
    return { bound: false, reason: "digest_mismatch", digest, named: claim.offerReceiptHash };
  }
  return { bound: true, digest };
}

export interface Disagreement {
  field: "payer" | "transaction" | "issuedAt";
  claim: string;
  receipt: string;
  note: string;
}

export interface ComparisonResult {
  /** True only when at least one field was comparable and none disagreed. */
  agrees: boolean;
  /** Fields present on both sides that tell different stories. */
  disagreements: Disagreement[];
  /** Fields that could not be compared because the receipt side was absent. Never counted as agreement. */
  notCompared: Array<"payer" | "transaction" | "issuedAt">;
}

/**
 * Compare the two accounts field by field. Only fields both sides describe are
 * compared; a missing receipt field is reported as not compared, never as
 * agreement.
 */
export function compareClaimToReceipt(claim: ClaimSide, receipt: ReceiptFields): ComparisonResult {
  const disagreements: Disagreement[] = [];
  const notCompared: ComparisonResult["notCompared"] = [];

  if (receipt.payer === undefined) {
    notCompared.push("payer");
  } else if (receipt.payer.toLowerCase() !== claim.buyerAddress.toLowerCase()) {
    disagreements.push({
      field: "payer",
      claim: claim.buyerAddress,
      receipt: receipt.payer,
      note: "the receipt names a different paying party than the claim was signed for",
    });
  }

  if (receipt.transaction === undefined) {
    notCompared.push("transaction");
  } else if (receipt.transaction.toLowerCase() !== claim.settlementRef.toLowerCase()) {
    disagreements.push({
      field: "transaction",
      claim: claim.settlementRef,
      receipt: receipt.transaction,
      note: "the two halves are about different settlements",
    });
  }

  if (receipt.issuedAt === undefined) {
    notCompared.push("issuedAt");
  } else {
    const r = Date.parse(receipt.issuedAt);
    const c = Date.parse(claim.timestamp);
    if (Number.isNaN(r) || Number.isNaN(c)) {
      notCompared.push("issuedAt");
    } else if (r > c) {
      disagreements.push({
        field: "issuedAt",
        claim: claim.timestamp,
        receipt: receipt.issuedAt,
        note: "the seller issued the receipt after the buyer signed the claim about it",
      });
    }
  }

  const compared = 3 - notCompared.length;
  return { agrees: compared > 0 && disagreements.length === 0, disagreements, notCompared };
}
