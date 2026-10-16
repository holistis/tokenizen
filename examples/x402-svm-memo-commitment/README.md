# Authorization commitment for the Solana rail

A receipt with an empty `transaction` field can be matched to a settlement only by payer, payee, amount and time. On EVM the fix is a salted commitment to the EIP-3009 nonce, proposed in [x402#3827](https://github.com/x402-foundation/x402/pull/3827). This directory is the same construction for the Solana rail, where the pre-settlement identifier is the Memo.

```bash
node run-vectors.mjs
```

22 vectors. Weaken the construction and they go red: drop the mint from the preimage and two of them fail, which is the point of having them.

## Why the memo works as the identifier

`scheme_exact_svm` §3.1 is normative: a client MUST include a Memo instruction carrying either the seller's `extra.memo` or a random nonce of at least 16 bytes. The stated purpose is uniqueness across concurrent payments with identical parameters, which is exactly the ambiguity the commitment is there to resolve.

The server holds it before settlement in both cases. Either it chose `extra.memo` itself, or it receives the signed transaction and can read the memo before the sponsor submits it.

The retrieval side is confirmed against mainnet rather than assumed. A memo comes back from `getTransaction` with `jsonParsed` as an instruction with `program: "spl-memo"` and the memo string in `parsed`. A candidate set is therefore `getSignaturesForAddress(payer)` plus one read per signature.

## Why the construction needed one change

[x402#3827](https://github.com/x402-foundation/x402/pull/3827) §5.6.2 says every field after `method` has a fixed length, which is what makes the preimage unambiguous. That holds for a 32-byte nonce. A memo is UTF-8 of up to 256 bytes, so appending it directly breaks the rule the sentence relies on.

The identifier is therefore always exactly 32 bytes, and a rail whose native identifier is variable length commits to its SHA-256:

```
commitment = sha256( "x402-receipt-authorization/0" || 0x00 || "svm-memo" || 0x00
                     || mint(32) || payer(32) || sha256(memo)(32) || salt(32) )
```

Nothing about the `eip3009` method changes. Its identifier is already 32 bytes, so its preimage and its published example stay byte-identical.

## The hazard this rail has and EVM does not

`extra.memo` is seller-defined and the scheme places no uniqueness requirement on it. The uniqueness guarantee in §3.1 comes from the random-nonce branch. A seller who pins one invoice id across several payments produces one identifier for several settlements, so the commitment stops naming exactly one.

`link()` returns `ambiguous` with the count in that case, rather than picking the first match. A method definition for this rail has to say so, because the failure is caused by a legitimate seller using a documented field.

Vector: `reused-memo-is-ambiguous-not-linked`.

## What is not here

No live settlement. The EVM side of this work is backed by two real Base Sepolia payments ([examples/x402-nonce-proof](../x402-nonce-proof)); the Solana side is the construction and its vectors, with the memo retrieval path checked against mainnet but not against an x402 payment, because there is no live x402 SVM seller to pay.

The salt rules are unchanged from the EVM method: 32 bytes from a CSPRNG per payment, never derived from public data, never inside the receipt, and stored by whoever wants the link later.
