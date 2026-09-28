# Integration guide

What actually exists in this package after WP1 (discovery hardening) and WP2
(multi-chain EAS), described from the outside: what a new integrator gets,
what two independent, real projects already did with it, and exactly what is
and is not proven. Every claim below points at real code, a real test, or a
real, independently checkable transaction, not a description alone.

## The trust model, in one paragraph

A `DeliveryClaim` is self-verifying: `claimId` is the sha256 of its own
canonical content, and `signature` is an EIP-191 signature over `claimId`
that recovers to `buyerAddress`. Because of that, nothing that HOLDS or
FORWARDS a claim needs to be trusted -- `verifyClaim()` catches a forged or
tampered one regardless of where it came from. See
[FIELD-PROVENANCE.md](./FIELD-PROVENANCE.md) for exactly which fields that
covers (two: the hash and the signature) and which fields remain the buyer's
unverified word (everything else, by design).

## The three ways to get claims into and out of the system

### 1. The local ledger (always available, zero configuration)

```js
import { recordDelivery, getDeliveryHistory } from "capacity-attest/dist/tools.js";
```

Append-only JSONL storage (`ledger.ts`), re-verifies every claim on every
read, not only on write. This is what a single installation uses on its own.
It does NOT solve cross-installation discovery -- that is what the next two
sources are for. See D-005/D-006 in [DECISIONS.md](../DECISIONS.md) for the
exact boundary.

### 2. EAS (Ethereum Attestation Service), now on three chains

```js
import { easSourceFromRpc, publishClaim, ensureSchema, EAS_DEPLOYMENTS } from "capacity-attest/dist/eas.js";
import { discoverDeliveryHistory, localLedgerSource } from "capacity-attest/dist/discovery.js";

const base = EAS_DEPLOYMENTS[8453];
const result = await discoverDeliveryHistory(sellerAddress, [
  localLedgerSource(),
  easSourceFromRpc("https://mainnet.base.org", { easAddress: base.easAddress, name: "eas-base" }),
]);
```

`EAS_DEPLOYMENTS` (added in WP2) carries every known deployment: Base (8453),
Base Sepolia (84532), Optimism (10), and Ethereum mainnet (1). Optimism
shares Base's exact OP-Stack predeploy addresses; Ethereum mainnet does not
(it is the underlying L1, not an OP-Stack chain). Both facts were verified,
not assumed -- see the WP2 entries in
[NLNET-SELFBUILD-PLAN-2026-09-28.md](../../../docs/NLNET-SELFBUILD-PLAN-2026-09-28.md)
for the independent cross-checks (EAS's own deployment records, block
explorers, and a live `eth_getCode` call against each chain).

**Live, independently checkable, on two chains right now:**

- Base mainnet: [delivered=yes](https://base.easscan.org/attestation/view/0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc) / [delivered=no](https://base.easscan.org/attestation/view/0xe736b005cbcb54f8f196ac64ef09d75d939c8a18c0d5d9670b5c5025c07398c4)
- Optimism mainnet: [a real attestation](https://optimism.easscan.org/attestation/view/0x46148283cb005aa43387fb62b2e1ccd0b001ff82dc9310ea885237fd8dea8832), tx `0xa91b7bbbb80570be7d1a6a379c9252b5ed116b064f63180cc9584c8cde1c71b0`, independently re-checked via a separate `eth_getTransactionReceipt` call before being counted as proof, and read back through the actual production `discoverDeliveryHistory` path (not a special check).

Ethereum mainnet has the correct addresses wired in and unit-tested
(`eas.test.ts`), but no live attestation posted there yet -- that costs
meaningfully more gas than Optimism and is its own, separate decision.

### 3. A plain HTTP endpoint (added in WP1, `http-source.ts`)

```js
import { httpClaimSource } from "capacity-attest/dist/http-source.js";

const source = httpClaimSource("https://your-installation.example/claims", { name: "your-http-source" });
```

One concrete shape of "another installation's public endpoint" --
`discovery.ts`'s own header comment names this as a valid substrate.
Convention: `GET <url>?seller=<address>` returns a JSON array of claims.
Untrusted like every other source: a malformed or hostile response becomes a
per-source error, never a crash of the whole lookup. Byte-capped streaming
read, so an oversized response is refused before `JSON.parse` runs, not
after.

### Combining all three: `reputation-lookup.mjs`

```bash
npm run build && node examples/reputation-lookup.mjs <sellerAddress>
```

Read-only, needs no funded key. `RPC_URL` adds EAS, `HTTP_SOURCE_URL` adds
the HTTP source; whatever is not configured is skipped, with an explicit
note that a skipped source narrows what the lookup can find (D-005's own
honesty boundary, not glossed over).

## Two real, independent integrations (not built by us)

The strongest evidence for an integration guide is someone else's real code,
not our own demo. Two exist, both merged, both externally reviewable:

### asm-spec (YE-YI7), base linkage

[YE-YI7/asm-spec#18](https://github.com/YE-YI7/asm-spec/pull/18), merged
2026-09-06. Uses `capacity-attest@0.2.0` as a real npm dependency, not a
reimplementation: recomputes the claim-byte digest, `claimId`, and the
EIP-191 signer through OUR code, then links that to a Base USDC Transfer log
as the settlement reference. Their own stated boundaries (quoted from the
PR, so an integrator sees the same honesty standard applied both ways):
"`delivered=yes`, the `evidenceHash` preimage, and task correctness remain
unproven." Their test suite (208 passed, 1 skipped) runs this as a pinned,
reference-only fixture, not a live network call, so it stays a stable CI
citizen.

### bsv-capacity-attest (EmbryoSpace), a second, different rail

[YE-YI7/asm-spec#19](https://github.com/YE-YI7/asm-spec/pull/19), merged
2026-09-07, authored by a THIRD party (EmbryoSpace, not YE-YI7 and not us).
This is the more instructive one for a future integrator on a non-EVM chain:
it reuses the exact content-addressed claim shape (`claimId` = sha256 of the
canonical content, byte-identical route) but swaps out everything
EVM-specific. `verifyClaim()` is EIP-191-typed and cannot verify a base58
BSV signature, so EmbryoSpace built their own signature-recovery adapter
(Bitcoin Signed Message / BRC-77, signature -> pubkey -> base58
`buyerAddress`) while keeping the hash route identical. Settlement is a REAL
BSV mainnet transaction, pinned by txid (a real x402 pay-per-call to
`inference.bsvkey.com`, 5,942 sats), not a simulated one.

**The generalizable pattern, proven twice now by two different rails
(Base/EVM and BSV):** the part of this format worth reusing on a new chain
is the CONTENT-ADDRESSING (claimId = hash of canonical content), not the
signature scheme. A new rail keeps the hash route identical and swaps only
the signature-verification adapter for its own chain's native scheme. This
is exactly what `discovery.ts`'s trust model already assumes (a source is
untrusted, verification is what matters), it has now been independently
validated by a real second implementer, not just asserted by us.

## What this guide does NOT claim

- No claim here is "audited". The external test suites above are real and
  independently run, but they are not a security audit of this package (see
  work package 3 in the self-build plan: an external audit stays dependent
  on funding, by definition it cannot be self-built).
- `settlementRef` is never resolved against a facilitator or chain by this
  package itself, on any rail. Both external integrations above link their
  own settlement evidence (a Base log, a BSV tx) SEPARATELY, alongside the
  claim, not by teaching capacity-attest to check it.
- Findability (WP1, D-005) and completeness (D-006) both have documented,
  real blind spots (a hidden most-recent claim, a hidden whole buyer)
  which no amount of aggregation can close. See
  [FIELD-PROVENANCE.md](./FIELD-PROVENANCE.md) and
  [DISCOVERY-FIXTURE.md](./DISCOVERY-FIXTURE.md) for the exact, tested
  boundary, not a hedge added after the fact.
