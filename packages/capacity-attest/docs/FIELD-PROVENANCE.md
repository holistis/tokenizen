# Field provenance: what is proven versus what is asserted

A per-field breakdown of `DeliveryClaim`, for anyone composing this record
with a different evidence type (execution receipts, content hashes, dispute
records) and needing to know exactly which parts of ours are checkable and
which are just the buyer's word. Companion to the discovery fixture (D-005)
and completeness fixture (D-006), same posture: you check it yourself instead
of trusting the label.

## The two categories

**Derived** — computed or cryptographically verified. Recomputing it from the
claim's own bytes gives the same answer, regardless of who is asking.

**Asserted** — the buyer typed it in. Nothing in this package checks it
against reality. `schema.ts`'s own comment says this plainly: "every field in
a claim is an assertion by the buyer."

## The table

| Field | Provenance | What it actually proves |
|---|---|---|
| `claimId` | Derived | sha256 of the claim's canonical content. Recomputable by anyone from the bytes alone. |
| `signature` | Derived | EIP-191 signature over `claimId`. Proves a specific private key signed this exact content. |
| `buyerAddress` | Derived | Must equal the address `signature` recovers to (`verifyClaim()` checks this). The one field in the content block that is bound to something outside the buyer's own typing. |
| `sellerAddress` | Asserted | Who the buyer says they paid. Not checked against any payment record. |
| `delivered` (yes / no / partial) | Asserted | The buyer's own summarizing call. Not a score, not a judgment computed by this package — the buyer's word, full stop. |
| `evidenceHash` | Asserted | A hash the buyer supplies. The evidence itself is never stored or checked; only its hash's presence is recorded. |
| `settlementRef` | Asserted | A payment reference (x402 ref or tx hash). Never resolved against a facilitator or chain. This is the exact gap named in D-014. |
| `promisedSpec` | Asserted | Free text or a structured object describing what was promised. |
| `timestamp` | Asserted | Self-reported. Not bound to any external clock. |
| `measured.*` (unit, basis, amounts, period, method) | Asserted | All buyer-supplied numbers. `method.readingsHash` is a hash of meter data that, like `evidenceHash`, is never itself checked. |
| `externalRefs.*` (agent refs, mandate, intent, disputeContext) | Asserted | Pure citations into other systems. The package's own doc comment: "Tokenizen never resolves or trusts these — they are citations, not verified facts." |
| `priorClaimId` | Asserted, self-consistency checkable | Not verified at ingest, but internally checkable: if a later claim in the same buyer's chain doesn't reference it, `analyzeCompleteness()` flags the gap (D-006). Detects a dangling middle claim; proves nothing about the two claims' content. |

## The one-sentence version

Two fields are proven: the content hash and the signature. Everything else,
including who was paid, whether delivery happened, and what backs the
settlement, is the buyer's word, unverified, by design and stated as such.
The signature proves who said it. It never proves what happened.
