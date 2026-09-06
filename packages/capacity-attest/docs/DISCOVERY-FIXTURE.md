# Cross-installation discovery fixture

A public, reproducible demonstration that a buyer on one installation can find
and trust a seller's claims recorded by other buyers on other installations
(D-005), without any trusted index. Companion to the completeness fixture
(D-006). You run it, you check it.

Run it:

```bash
cd packages/capacity-attest
npm install
npm run build
npm run discovery-fixture
```

The same controls run on every push as a test (`src/discovery.test.ts`).

## The problem

`get_delivery_history` is local by construction. Buyer B, on installation B,
does not see the claim buyer A recorded on installation A about the same
seller. So B can be about to pay a seller that A already recorded a failed
delivery against, and B has no way to know.

## The insight

Our claims are self-verifying: `claimId` is a content hash and the signature
recovers to `buyerAddress`. Findability therefore needs no trusted index.
Claims can be published anywhere, and whoever discovers them re-verifies each
one locally. A source that injects a forged claim is caught. A source that
omits claims is the completeness problem (D-006), unchanged and carried over.
So findability and verification compose: gather from anywhere untrusted, verify
everything locally.

## What was built

A substrate-agnostic aggregation seam. `discoverDeliveryHistory(seller, sources)`
reads a seller's claims from several independent `ClaimSource`s (the local
ledger, and any host-independent substrate the buyer chooses to also read),
de-duplicates by claimId, re-verifies every single claim regardless of source,
filters out claims about other sellers, and runs the completeness analysis over
the survivors. The result carries per-source accounting (fetched, accepted,
rejected, duplicates) so you can see exactly what each source contributed.

No source is trusted. A `ClaimSource` is untrusted input; the trust comes
entirely from re-verifying each claim.

## The production substrate is not wired here

The real, host-independent place to publish and discover claims already exists:
the Ethereum Attestation Service on Base, and ERC-8004, both live and queryable
by anyone. Wiring those in needs gas, a live chain, and a real integrator, so
it waits for a real case (DECISIONS.md D-005, D-012). This module is the seam
plus a reference in-memory source for simulation and tests. Publishing a claim
to such a substrate is additive and outside this package's trust boundary: the
package never becomes the index.

## Controls

Six GREEN properties that must hold, two RED tamper cases that must be rejected.
All eight pass on every push.

| id | kind | what it checks | expected |
| --- | --- | --- | --- |
| D1 | GREEN | B's own installation alone does NOT contain A's negative claim (the gap is real) | a2 absent |
| D2 | GREEN | Discovery over B-local plus a shared substrate surfaces A's negative claim to B | a2 present |
| D3 | GREEN | Every claim in the aggregate re-verifies locally | true |
| D4 | GREEN | A different-seller claim returned by a source is filtered out | y1 absent |
| D5 | GREEN | The same claim from two sources is counted once | dedup holds |
| D6 | RED | A forged claim (signed by the wrong wallet) is rejected, not surfaced | rejected |
| D7 | RED | A tampered claim (flipped byte, claimId not recomputed) is rejected | rejected |
| D8 | GREEN | A source hiding a middle claim is caught by completeness, across installations | flagged |

D2 is findability: the thing B could not see is now visible and verified. D6
and D7 are the trust model: a malicious source cannot inject anything, because
every claim is re-verified. D8 is the composition with D-006: hiding a middle
claim is caught even across installations, because the signed `priorClaimId`
links travel with the claims.

## What this does NOT prove

Stated plainly, because the honesty is the point:

- Verification proves authorship of content, nothing more. It proves the
  content hashes to claimId and that a keypair signed it as buyerAddress. It
  does NOT prove a real payment or delivery happened: settlementRef is free
  text, not checked on-chain here. And it does NOT prove buyers are distinct,
  so a single keypair can flood valid positive claims to inflate a seller, or
  valid negatives to grief one. Volume and Sybil are not addressed by
  aggregation (the per-source cap only bounds work, it is not a Sybil defense).
- Discovery solves findability, not completeness. A source that omits a claim
  cannot be forced to reveal it, and no aggregation invents what no source
  shows. Adding more independent sources raises the cost of a coordinated
  omission; it never reaches a proof. The completeness field carries the same
  D-006 detection and limits over the aggregate.
- The package does not run, host, or endorse any index. A source is untrusted;
  trust comes only from re-verifying each claim.
- The production substrate (EAS, ERC-8004) is documented, not wired live here.

Full reasoning: DECISIONS.md, D-005 and D-012.
