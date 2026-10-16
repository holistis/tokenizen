// x402-receipt-authorization commitment for the SVM rail, method "svm-memo".
//
// WHY A SECOND METHOD AT ALL. The eip3009 method commits to the ERC-3009 nonce,
// which is 32 bytes and therefore keeps the preimage fixed length. Solana has an
// equivalent pre-settlement identifier, the Memo, which scheme_exact_svm §3.1
// requires on every payment and which exists precisely to make concurrent
// payments with identical parameters distinguishable. But a memo is UTF-8 of up
// to 256 bytes, so appending it directly breaks the fixed-length preimage rule.
//
// THE FIX, AND IT CHANGES NOTHING FOR eip3009. The identifier is always exactly
// 32 bytes. A rail whose native identifier is variable length commits to its
// SHA-256 instead of the raw value. For svm-memo that is sha256(memo bytes).
//
//   commitment = sha256( TAG || 0x00 || method || 0x00 || mint(32) || payer(32)
//                        || sha256(memo)(32) || salt(32) )
//
// THE CONSTRAINT THE SELLER CONTROLS, stated here rather than left as a surprise.
// scheme_exact_svm lets a seller pin extra.memo (an invoice id, say) and places
// no uniqueness requirement on it. The uniqueness guarantee in §3.1 comes from
// the random-nonce branch. A seller reusing one memo produces one identifier for
// many settlements, so link() finds more than one candidate and MUST fail closed
// rather than pick one. That case has its own vector.

import { createHash } from "node:crypto";

export const TAG = "x402-receipt-authorization/0";
export const METHOD = "svm-memo";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class Malformed extends Error {
  constructor(condition) {
    super(condition);
    this.condition = condition;
  }
}

/** Decode a base58 Solana pubkey to its 32 raw bytes. */
export function pubkey(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Malformed(`${name}_not_string`);
  let n = 0n;
  for (const ch of value) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Malformed(`${name}_not_base58`);
    n = n * 58n + BigInt(i);
  }
  // Leading '1' characters are leading zero bytes, which the integer loses.
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let bytes = Buffer.from(hex, "hex");
  let leading = 0;
  for (const ch of value) {
    if (ch !== "1") break;
    leading += 1;
  }
  bytes = Buffer.concat([Buffer.alloc(leading), bytes]);
  if (bytes.length !== 32) throw new Malformed(`${name}_not_32_bytes`);
  return bytes;
}

function salt32(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Malformed("salt_not_32_bytes");
  }
  return Buffer.from(value.slice(2), "hex");
}

/** The memo as transmitted, hashed to a fixed 32 bytes. */
export function identifier(memo) {
  if (typeof memo !== "string") throw new Malformed("memo_not_string");
  const raw = Buffer.from(memo, "utf8");
  if (raw.length === 0) throw new Malformed("memo_empty");
  if (raw.length > 256) throw new Malformed("memo_over_256_bytes");
  return createHash("sha256").update(raw).digest();
}

export function commit({ mint, payer, memo, salt }) {
  const pre = Buffer.concat([
    Buffer.from(TAG, "ascii"),
    Buffer.from([0]),
    Buffer.from(METHOD, "ascii"),
    Buffer.from([0]),
    pubkey(mint, "mint"),
    pubkey(payer, "payer"),
    identifier(memo),
    salt32(salt),
  ]);
  return "0x" + createHash("sha256").update(pre).digest("hex");
}

/**
 * Holder-side check. `candidates` is every memo the payer has used on this mint,
 * read from getSignaturesForAddress(payer) plus a getTransaction per signature.
 *
 * Exactly one match is a link. Zero is no link. More than one is the reused-memo
 * case and MUST fail closed, because the commitment no longer names one
 * settlement.
 */
export function link({ commitment, salt, mint, payer, candidates }) {
  if (typeof commitment !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(commitment)) {
    throw new Malformed("commitment_not_32_bytes");
  }
  if (!Array.isArray(candidates)) throw new Malformed("candidates_not_array");

  const hits = candidates.filter((memo) => {
    try {
      return commit({ mint, payer, memo, salt }) === commitment.toLowerCase();
    } catch {
      return false;
    }
  });

  if (hits.length === 1) return { result: "linked", memo: hits[0] };
  if (hits.length === 0) return { result: "no_match" };
  return { result: "ambiguous", matches: hits.length };
}
