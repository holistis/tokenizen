# Completeness fixture

A public, reproducible demonstration of exactly what the per-buyer claim chain
(`priorClaimId`) and `analyzeCompleteness()` detect, and what they do not. The
goal is that you do not have to trust this prose: you run the fixture and check
the outcomes yourself.

Run it:

```bash
cd packages/capacity-attest
npm install
npm run build
npm run fixture
```

The same controls run on every push as a test (`src/completeness-fixture.test.ts`),
so the code and this document cannot silently drift apart.

## The scenario

One buyer, one seller, three of the buyer's claims about that seller, chained
oldest to newest through the signed `priorClaimId` field:

```
c1  delivered = yes   priorClaimId = (genesis, omitted)
c2  delivered = NO    priorClaimId = c1.claimId
c3  delivered = yes   priorClaimId = c2.claimId
```

`c2` is the negative claim a seller-friendly host is tempted to hide. A
dishonest host returns only `[c1, c3]` and drops `c2`.

The whole scenario is regenerable from a fixed TEST private key, so anyone can
rebuild the exact same claimIds and signatures and check our numbers.

## Source labels

Every value in the fixture is labeled by where it comes from, the same
discipline the Tamga Protocol pairing fixture uses:

- simulated: a stand-in value with no real-world counterpart claimed. The
  `settlementRef` values are simulated: no real x402 payment was made to
  produce this fixture.
- derived: computed deterministically from other fields. `claimId`, the chain
  links, and the completeness report are derived.
- observed: a real, reproducible output of this package's own code. The EIP-191
  signatures are observed output of the actual `signClaim()`.

## Controls

Five GREEN properties that must hold, and four RED tamper negatives that must
be rejected. All nine pass on every push.

| id | kind | what it checks | expected |
| --- | --- | --- | --- |
| G1 | GREEN | Every claim in the honest view verifies (claimId + signature) | true |
| G2 | GREEN | Honest full view: chain consistent, zero possibleOmissions | true |
| G3 | GREEN | Under hiding, each shown claim STILL verifies (authenticity is intact, omission is the threat, not forgery) | true |
| G4 | GREEN | Recomputing `analyzeCompleteness()` locally over the hidden view flags exactly the missing `c2` | true |
| G5 | GREEN | A rosy `completeness` field supplied by the host is contradicted by the local recompute | true |
| R1 | RED | Flip `c2.delivered` from no to yes without recomputing claimId | rejected |
| R2 | RED | Strip `c3.priorClaimId` but keep its signature (a host trying to remove the chain link) | rejected |
| R3 | RED | Repoint `c3.priorClaimId` to another claim, keep its signature | rejected |
| R4 | RED | Sign `c2` with a different wallet while still claiming the fixture buyer's address | rejected |

G3 and G4 together are the point of the whole design. A host that hides `c2`
cannot forge its way out: the claims it does show are still authentic, but `c3`
now points back, through a signed link the host cannot alter, to a `c2` that is
not in the response. Recomputing the report locally turns that into a concrete,
named omission instead of a vague suspicion.

R2 is the load-bearing security control. It proves the host cannot simply
delete the `priorClaimId` link to make the gap disappear, because the link is
inside the signed content: removing it changes the claimId, and the signature
no longer matches, so the read path rejects the claim.

## What this does NOT prove

Stated plainly, because the value of the fixture is its honesty:

- The `completeness` field returned by `get_delivery_history` is computed by
  the same server that returns the claims. If you do not run that server
  yourself, do not trust the field: a dishonest host can put a rosy report in
  it (control G5 is exactly this case). The trust lives in the signed
  `priorClaimId` links inside the claims, not in the derived report. Recompute
  `analyzeCompleteness()` locally over the returned, independently verified
  claims.
- It catches a hidden claim in the MIDDLE of a buyer's chain. It does not catch
  a hidden most-recent claim (a truncated tail leaves no dangling link), nor a
  hidden entire buyer (there is no link to dangle from a chain you were shown
  zero links of).
- A dangling link is not proof of dishonesty. The referenced prior claim may
  simply have been recorded on a different installation, which is legitimate
  (see DECISIONS.md D-005). A flagged omission means look closer, not the host
  lied.
- Full prevention of omission is not achievable by anyone from a single
  answer, and this fixture never claims it is. For assurance beyond middle-claim
  detection, cross-check against the buyer's own retained copy of their claims
  (see the README section on sharing your own claims) and the on-chain payment
  the `settlementRef` points to.

Full reasoning and the research behind these boundaries: DECISIONS.md, D-006.
