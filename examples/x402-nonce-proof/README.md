# Telling two identical x402 payments apart

Two payments to the same route, same payer, same payee, same amount, three seconds apart on Base Sepolia. The receipts the seller signed for them are identical field by field except `issuedAt`, and `transaction` is empty in both. The EIP-3009 authorization nonce does separate them, and unlike the settlement hash the seller already holds it before settlement runs.

This directory holds the two artifacts and a script that re-checks the claim against the chain, so you do not have to take any of it on our word.

```bash
node verify-nonce.mjs
```

It reads `payment-a.json` and `payment-b.json`, prints the field by field comparison, then for each payment calls `authorizationState(payer, nonce)` on the USDC contract and pulls the `AuthorizationUsed` log out of the settlement transaction. If a nonce does not line up with its settlement the script exits non zero, because a check that cannot fail proves nothing.

Point it at your own artifacts with `node verify-nonce.mjs mine-a.json mine-b.json`, or at a different RPC with `BASE_SEPOLIA_RPC=...`.

## Why the nonce rather than the settlement hash

A receipt is the seller's signed account of its own performance. With `transaction` empty, the only way to match a receipt to a settlement is payer, payee, amount and time. In these two artifacts the first three are identical and the fourth differs by three seconds. Run the two calls closer together and that last discriminator disappears too. A seller with repeat buyers at a fixed price produces that case all day.

The nonce has two properties the hash does not. The seller holds it from the payment payload before settlement runs, so it does not depend on anything the facilitator returns. And `authorizationState` plus the `AuthorizationUsed` log identify exactly one settlement from the rail itself, so a verifier recomputes the mapping instead of trusting either counterparty.

It is also method specific, which is the honest counterargument. EIP-3009 and Permit2 do not share a nonce shape, and a non EVM rail has no EIP-3009 nonce at all, so a bare `nonce` field would mean different things on different networks or nothing.

## One implementation note that cost us two payments

The signed authorization does not travel in `X-PAYMENT`. At `x402Version: 2` the client sets `PAYMENT-SIGNATURE`, which is what `encodePaymentSignatureHeader` in `@x402/core` actually does. If you log or proxy the payment payload and match on `X-PAYMENT`, you see nothing and conclude the nonce is unavailable.

## What this does not show

Buyer and seller in these artifacts are both us. This shows the chain runs end to end. It is not evidence that anyone else uses it, and the first external caller will be a bigger milestone than anything here.

The `transaction` field is still empty in every receipt this route issues. That is not a choice; the route declares `includeTxHash: true` and the declaration does not survive to the point where the receipt is signed. Filed upstream as x402-foundation/x402#3824. The nonce route works today without waiting on that fix, which is the reason this directory exists.
