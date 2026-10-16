// run-vectors.mjs — the vectors for method "svm-memo".
//
// Every vector states what it must produce. A vector that cannot fail proves
// nothing, so the attack cases assert that a weak salt IS recovered from the
// candidate set, not merely that the construction runs.

import { commit, link, pubkey, identifier, Malformed } from "./commitment.mjs";
import { createHash } from "node:crypto";

// USDC on Solana mainnet, and a payer. Real addresses, no real payment implied.
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

const SALT_A = "0x8f2b1d4e6a0c93758e1fb2a4c6d80e5f3719ab42cd6e805f1a3b7c9d2e4f6081";
const SALT_B = "0x2c7e91a3b5d70f486192c3e5a7b90d2f4816ae53bd7f916021c4d8e3f507a2b9";
const MEMO_A = "9f1c0b7a4e52d386";
const MEMO_B = "c3d82a5f17b40e69";

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}  ${detail ?? ""}`);
  }
};

// --- commit -----------------------------------------------------------------
const cA = commit({ mint: MINT, payer: PAYER, memo: MEMO_A, salt: SALT_A });
const cB = commit({ mint: MINT, payer: PAYER, memo: MEMO_B, salt: SALT_B });
check("commit-A-is-32-bytes", /^0x[0-9a-f]{64}$/.test(cA), cA);
check("commit-is-deterministic", commit({ mint: MINT, payer: PAYER, memo: MEMO_A, salt: SALT_A }) === cA);
check("commit-differs-per-payment", cA !== cB);

// A different mint with everything else equal must not collide: the mint is bound.
const cOtherMint = commit({
  mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  payer: PAYER,
  memo: MEMO_A,
  salt: SALT_A,
});
check("commit-binds-the-mint", cOtherMint !== cA);

// --- link -------------------------------------------------------------------
const CANDIDATES = [MEMO_A, MEMO_B, "0s", "invoice-2026-10-16", "7a".repeat(8)];
check("link-A", link({ commitment: cA, salt: SALT_A, mint: MINT, payer: PAYER, candidates: CANDIDATES }).result === "linked");
check("link-A-names-the-right-memo", link({ commitment: cA, salt: SALT_A, mint: MINT, payer: PAYER, candidates: CANDIDATES }).memo === MEMO_A);
check("link-B", link({ commitment: cB, salt: SALT_B, mint: MINT, payer: PAYER, candidates: CANDIDATES }).memo === MEMO_B);
check(
  "link-swapped-salt-finds-nothing",
  link({ commitment: cA, salt: SALT_B, mint: MINT, payer: PAYER, candidates: CANDIDATES }).result === "no_match",
);
check(
  "link-other-mint-finds-nothing",
  link({ commitment: cA, salt: SALT_A, mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", payer: PAYER, candidates: CANDIDATES }).result === "no_match",
);
// A commitment made for a different payer opens to nothing rather than to a
// false link, the same property as the eip3009 method.
check(
  "link-other-payer-finds-nothing",
  link({ commitment: cA, salt: SALT_A, mint: MINT, payer: "11111111111111111111111111111111", candidates: CANDIDATES }).result === "no_match",
);

// --- the reused seller memo, which is this rail's own hazard ----------------
// extra.memo is seller-defined and the scheme puts no uniqueness requirement on
// it. One memo across two settlements means the candidate list contains it twice.
const REUSED = "invoice-2026-10-16";
const cReused = commit({ mint: MINT, payer: PAYER, memo: REUSED, salt: SALT_A });
const twice = link({ commitment: cReused, salt: SALT_A, mint: MINT, payer: PAYER, candidates: [REUSED, MEMO_A, REUSED] });
check("reused-memo-is-ambiguous-not-linked", twice.result === "ambiguous", JSON.stringify(twice));
check("reused-memo-reports-the-count", twice.matches === 2);

// --- attacks ----------------------------------------------------------------
// Unsalted: anyone holding the receipt lists the payer's memos and hashes them.
const unsalted = "0x" + createHash("sha256").update(Buffer.from(MEMO_A, "utf8")).digest("hex");
const recoveredUnsalted = CANDIDATES.filter(
  (m) => "0x" + createHash("sha256").update(Buffer.from(m, "utf8")).digest("hex") === unsalted,
);
check("attack-unsalted-is-recovered", recoveredUnsalted.length === 1 && recoveredUnsalted[0] === MEMO_A);

// A salt derived from public data is no salt: the attacker derives it too.
const derived = "0x" + createHash("sha256").update(pubkey(PAYER, "payer")).digest("hex");
const cDerived = commit({ mint: MINT, payer: PAYER, memo: MEMO_A, salt: derived });
check(
  "attack-payer-derived-salt-is-recovered",
  link({ commitment: cDerived, salt: derived, mint: MINT, payer: PAYER, candidates: CANDIDATES }).memo === MEMO_A,
);

// A 32-byte CSPRNG salt survives the same search.
const strong = "0x" + createHash("sha256").update("not derivable from anything public").digest("hex");
const cStrong = commit({ mint: MINT, payer: PAYER, memo: MEMO_A, salt: strong });
const guessed = CANDIDATES.some((m) => {
  try {
    return commit({ mint: MINT, payer: PAYER, memo: m, salt: derived }) === cStrong;
  } catch {
    return false;
  }
});
check("attack-csprng-salt-survives", guessed === false);

// --- malformed input, refused with a named condition ------------------------
const refuses = (name, fn, condition) => {
  try {
    fn();
    check(name, false, "no error");
  } catch (e) {
    check(name, e instanceof Malformed && e.condition === condition, `${e.condition ?? e.message}`);
  }
};
refuses("bad-salt-16-bytes", () => commit({ mint: MINT, payer: PAYER, memo: MEMO_A, salt: "0x" + "ab".repeat(16) }), "salt_not_32_bytes");
refuses("bad-salt-no-0x", () => commit({ mint: MINT, payer: PAYER, memo: MEMO_A, salt: "ab".repeat(32) }), "salt_not_32_bytes");
refuses("bad-memo-empty", () => identifier(""), "memo_empty");
refuses("bad-memo-over-256", () => identifier("x".repeat(257)), "memo_over_256_bytes");
refuses("bad-memo-not-string", () => identifier(42), "memo_not_string");
refuses("bad-pubkey-not-base58", () => pubkey("0OIl", "mint"), "mint_not_base58");
refuses("bad-pubkey-too-short", () => pubkey("abc", "mint"), "mint_not_32_bytes");

console.log(`\n${pass}/${pass + fail} pass`);
process.exit(fail === 0 ? 0 : 1);
