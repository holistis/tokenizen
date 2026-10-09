# capacity-attest

*[Nederlandse versie / Dutch version: README.nl.md](README.nl.md)*

MCP server for delivery attestations in x402 capacity trading between AI agents.

> Status: MVP, published on npm (`npm install capacity-attest`) and in the official MCP registry (`io.github.holistis/capacity-attest`).

## Independently checked, not just claimed

Every claim about this project below is clickable and independently verifiable, not something you have to take our word for.

| What | By whom | Status |
|---|---|---|
| Uses `capacity-attest@0.2.0` as a real dependency, verifies claim digest/claimId/signature through our own code | [YE-YI7/asm-spec#18](https://github.com/YE-YI7/asm-spec/pull/18) | Merged |
| BSV rail adapter on the same content-addressed claim format | [YE-YI7/asm-spec#19](https://github.com/YE-YI7/asm-spec/pull/19) (author EmbryoSpace) | Merged |
| Our boundary claims ("discoverability ≠ completeness") independently verified on-chain by a third party, nothing taken on faith | [x402-foundation/x402#3379](https://github.com/x402-foundation/x402/issues/3379) | Public, ongoing |
| Live delivery claims as on-chain attestations on Base mainnet, decodable by anyone | [delivered=yes](https://base.easscan.org/attestation/view/0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc) · [delivered=no](https://base.easscan.org/attestation/view/0xe736b005cbcb54f8f196ac64ef09d75d939c8a18c0d5d9670b5c5025c07398c4) | Live |
| The same, live on a second and third chain (WP2), proving the EAS source works across deployments, not only Base | [Optimism](https://optimism.easscan.org/attestation/view/0x46148283cb005aa43387fb62b2e1ccd0b001ff82dc9310ea885237fd8dea8832) · [Ethereum mainnet](https://easscan.org/attestation/view/0x40da382231eeb6186b7daf231a430488627769feb64039ae3ac671a14f7a8137) | Live |
| A real `giveFeedback()` call on the ERC-8004 Reputation Registry, Base mainnet | [tx 0x2217...efc0](https://basescan.org/tx/0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0) | Live |
| Proposed as a buyer-side addition to someone else's agent spec | [omworldprotocol/om-world#18](https://github.com/omworldprotocol/om-world/pull/18) | In review, not yet merged |
| An independently rebuilt, stdlib-only Python verifier (its own secp256k1/EIP-191/canonical-JSON implementation, no shared code), 7/7 match against our own test vectors including both negative controls (forged signature, tampered claim), now a permanent regression test in a separate, independently published project | [x402-foundation/x402#2887 (comment)](https://github.com/x402-foundation/x402/issues/2887#issuecomment-5687398497), author goun7, integrated into Tamga (`pip install tamga-protocol`) | Permanently integrated into someone else's project |
| The `measured` block cited as the source of truth for metered delivery in a draft ERC-8004 grounded-feedback convention, pinned to a specific commit of this repo, with two independent verifiers (Node and Python) green on five signed test vectors | [erc-8004/erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99), schema doc at [predgeAI/erc8004-outcome-validator](https://github.com/predgeAI/erc8004-outcome-validator/blob/2c4d745f1205ba91f3aabded221b5b5acdbcb5ed/grounded-feedback/README.md) | Draft v0, public, referenced by commit hash |

**Kept honestly separate from the table above, because this is not third-party review:** before 0.6.0 (the first version that actually writes to the blockchain), we ran our own adversarial security review. Nine findings, all fixed: seven closed by a dedicated regression test, one verified by a packaging check (`npm pack --dry-run`) rather than a unit test, and one a documentation-only fix. Not an independent audit by an outside party. Full, checkable report: [docs/SECURITY-REVIEW-2026-09-11.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/SECURITY-REVIEW-2026-09-11.md).

## Why this exists

When an AI agent pays via the [x402 protocol](https://www.x402.org/) for capacity (GPU hours, storage, API/inference credits, bandwidth) from another agent or service, there is no proof after payment that what was promised was actually delivered. The buying agent knows it firsthand (it saw the output, or didn't), but that knowledge is lost the moment the session ends. The next agent looking to do business with the same seller starts blind again.

`capacity-attest` closes that specific gap: after settlement, the **paying** agent leaves behind a cryptographically signed, factual claim (`delivered: yes/no/partial` + a hash of the evidence). Other agents can pull that history **before** they do business with that same seller.

No judgment. No reputation score. No "verdict" — just a signed receipt-plus-claim, the same way you'd get a delivery slip for a physical shipment.

## What this deliberately is NOT

This is deliberately and permanently **not**:

- **Not a reputation score or rating.** `get_delivery_history` returns the raw, chronological list of claims, no average, no percentage, no "trust score". Summarizing it into a single number is implicitly a judgment, and that was explicitly rejected during this project's design phase.
- **Not a financial product.** No interest, no time-discounting on payments, no yield on a ledger balance (there is no balance, this is not an escrow), no lending, no collateral, no invoice financing/factoring. `assetType` is a closed enum of capacity kinds (`gpu-hours`, `storage`, `api-credits`, `bandwidth`) and deliberately contains nothing resembling a financial instrument.
- **Not its own token or coin.** Payments run through x402/USDC as usual; this project only records the *receipt* of a settlement that already happened elsewhere.
- **Not credit extension.** A claim is only created **after** a completed payment. This project finances nothing; it documents an already-completed ijara (rental/service) transaction.
- **Not its own identity, authority, or dispute-resolution layer.** `externalRefs` (see below) is purely a citation to someone else's system (ERC-8004, AP2, Legal Context Protocol, ...). This project never resolves, verifies, or judges that reference itself. See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-007 through D-013 for why this deliberately did not become its own protocol.

This is a deliberate, formally reviewed design choice, not an incidental scope limit. See the guardrails section in the project brief if you're considering adding something here: when in doubt whether a field/function brushes against this line, leave it out.

Deliberately deferred features (anchoring, interim status, formal conformance vectors), including the exact condition under which we'd build them anyway: see [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md).

Further reading: [nine ways to fake a delivery claim, and why none of them fully worked](https://tokenizen.nl/en/notes/nine-ways-to-fake-a-delivery-claim), the public write-up of D-014/D-018 above.

## How it works

### 1. `record_delivery`

The paying agent (the buyer) calls this **after** an x402 settlement, once it's known whether what was promised arrived. The claim contains:

| Field | Meaning |
| --- | --- |
| `sellerAddress` | 0x address of the party that was paid |
| `buyerAddress` | 0x address of the paying agent, must match the address recovered from `signature` |
| `assetType` | `gpu-hours` \| `storage` \| `api-credits` \| `bandwidth` |
| `promisedSpec` | What was promised: free text or a structured object |
| `delivered` | `yes` \| `no` \| `partial` |
| `evidenceHash` | sha256 hex of the supporting evidence (logs, response payload, ...); the evidence itself is not stored |
| `settlementRef` | x402 payment ref or on-chain tx hash of the underlying payment |
| `timestamp` | ISO-8601 timestamp |
| `claimId` | content-addressed sha256 hash of all the fields above, see `computeClaimId()` in `src/schema.ts` |
| `signature` | EIP-191 personal-sign signature by the buyer over `claimId` |
| `externalRefs` | *(optional, since 0.3.0)* unverified references to other agent-economy infrastructure: `sellerAgentRef`/`buyerAgentRef` (e.g. an ERC-8004 agent id or DID), `mandateRef`+`mandateIssuerDid` (an externally issued AP2/AAE mandate), `intentRef` (an external AP2 IntentMandate), `disputeContext` (`protocol`+`termsHash`+optional `resolutionRef`, e.g. a Legal Context Protocol reference). See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-007 through D-013 |
| `priorClaimId` | *(optional, since 0.4.0)* the `claimId` of your previous claim about the same `sellerAddress`, so your claims about that seller form a chain. Omitted on your first claim about a seller. Part of the signed content, so a host can't strip it. Lets a reader catch a host hiding a middle claim. See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-006 |

The server first validates the schema, then whether `claimId` really is the hash of the content, then whether `signature` really recovers to `buyerAddress`. Only then is the claim appended to the append-only ledger (`data/claims.jsonl`). An invalid signature or a claim that's already stored (same `claimId`) is rejected.

### 2. `get_delivery_history`

Given a `sellerAddress`, this returns all known claims against that seller on **this** installation, chronologically (oldest first). Purely factual, no summarized number. A buying agent calls this **before** paying, to see the raw delivery history of a prospective seller and judge it themselves.

The response includes `sellerAddress`, `count` and `claims`, plus `scope` (always `"local-ledger"`) and `note`: a fixed, factual text explaining that this result only reflects the local ledger of **this** installation. An empty or short history doesn't mean the seller has a clean record — it can also mean no claims have been recorded here yet.

Since 0.4.0 the response also includes `completeness`: an analysis of the per-buyer chains (`priorClaimId`) within exactly this result set. If a claim shown here refers back to a claim that is NOT in the result set, that shows up in `possibleOmissions`. That's a concrete, checkable signal that the host might be hiding a middle claim, rather than a vague suspicion.

Note, and this is the most important point: that `completeness` field is computed by the same server that returns the claims. If you don't trust that server, don't trust that field either — a dishonest host can just set "everything's complete" regardless. The real guarantee lives in the signed `priorClaimId` inside the claims themselves, which a host cannot forge or remove. So recompute the check yourself over the claims you got back:

```js
// recompute-completeness.mjs
import { verifyClaim } from "capacity-attest/dist/signing.js";
import { analyzeCompleteness } from "capacity-attest/dist/completeness.js";

// `claims` = the array from the get_delivery_history response.
const allSigned = claims.every((c) => verifyClaim(c).ok);   // is every claim genuine?
const report = analyzeCompleteness(claims);                  // recompute yourself, don't trust the host field
console.log({ allSigned, chainConsistent: report.chainConsistent, possibleOmissions: report.possibleOmissions });
```

Honest limit: even recomputing yourself won't catch a hidden *last* claim, or a whole hidden buyer, because there's no link to trip over in either case. And a dangling back-reference isn't necessarily foul play either — the earlier claim might simply have been recorded on a different installation (the D-005 case). For real certainty you still need external witnesses: your own retained copy from above, and the on-chain payment via `settlementRef`. See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-006.

A public, self-checkable example with a simulated hiding host and deliberately broken test cases is in [docs/COMPLETENESS-FIXTURE.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/COMPLETENESS-FIXTURE.md). Run it with `npm run fixture`; the same checks run on every push as a test. So you can verify our claim yourself instead of taking our word for it.

## Finding claims from other installations (D-005)

`get_delivery_history` is local by definition: buyer B doesn't see what buyer A recorded about the same seller on a different installation. Because every claim is self-verifiable, discoverability doesn't need a trusted index. `discoverDeliveryHistory(seller, sources)` (see `src/discovery.ts`) reads a seller's claims from multiple independent, UNTRUSTED sources (your local ledger plus any host-independent substrate you want to read), deduplicates, re-verifies every claim, filters out other sellers, and runs the completeness check over the combined set. A source that injects fakes gets rejected; a source that omits things is the D-006 problem — accounted for, not magically solved.

The production substrate is live on all three chains this project targets: EAS attestations exist on Base mainnet, Optimism mainnet, and Ethereum mainnet, each independently verifiable via a public block explorer link, not just described. A public, runnable example with two simulated installations is in [docs/DISCOVERY-FIXTURE.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/DISCOVERY-FIXTURE.md), run it with `npm run discovery-fixture`. See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-005.

A second, non-EAS production-grade `ClaimSource` also ships: `httpClaimSource` (`src/http-source.ts`), a plain HTTP endpoint following the convention `GET <url>?seller=<address>` -> a JSON array of claims, one concrete shape of "another installation's public endpoint" from `discoverDeliveryHistory`'s own header comment. It exists to prove the aggregation layer against a genuinely different source type, not just a second EAS deployment; like every source it is untrusted, so a malformed or hostile response never crashes discovery, it just shows up as a per-source error. `examples/reputation-lookup.mjs` is a runnable CLI combining the local ledger with both production sources (EAS and this one) in a single real lookup: `npm run build && node examples/reputation-lookup.mjs <sellerAddress>` (optionally set `RPC_URL` and/or `HTTP_SOURCE_URL` first; it needs no funded key, since it only reads).

[docs/INTEGRATION-GUIDE.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/INTEGRATION-GUIDE.md) walks through all three source types with real code, plus two independent, real integrations built by other projects (a Base-linkage fixture and a BSV rail, neither built by us) as concrete worked examples of extending this claim format to a new chain.

### 3. `resolve_agent_identity` *(since 0.3.0)*

Read-only lookup against an ERC-8004 Identity Registry: who owns `agentId` (`ownerOf`) and where is its registration file (`tokenURI`). Only the standard ERC-721 interface is called, nothing ERC-8004-specific. Requires the caller to supply both `agentRegistryRef` (`"eip155:<chainId>:<registryAddress>"`) and an `rpcUrl` for that chain: this project deliberately bundles no own RPC provider and no canonical registry address, since ERC-8004 has independent deployments per chain and the EIP text itself names no fixed address. Deliberately NEVER fetches what `tokenURI` points to (that stays a pointer the caller can retrieve themselves if they want); doing so would be an SSRF-shaped risk on caller-controlled on-chain data.

Tested against an injectable `ContractFactory` (`src/erc8004.test.ts`, no network dependency) and live against the real, deployed registry on Base mainnet (`examples/verify-erc8004-live.mjs`, `npm run build && node examples/verify-erc8004-live.mjs`). See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-007 for the full background.

### 4. `publishReputationFeedback` *(since 0.6.0, library function, not an MCP tool)*

**Note (adversarial review 2026-09-11): at the time of writing, npm still has version 0.5.0 published, without this function.** Anyone reading via GitHub and immediately running `npm install capacity-attest` as described further below will not yet get `publishReputationFeedback` — check `npm view capacity-attest version` for the actually published version before importing this. Everything below describes the code as it stands on the `main` branch.

Publishes the `delivered` fact of an already-signed claim to an ERC-8004 Reputation Registry's `giveFeedback()`, the same place roughly 500k registered agents can already look for reputation signals, instead of only this installation's own ledger or EAS. The contract requires a numeric `value`+`valueDecimals` field; this package deliberately does not invent its own rating scale for that. `value` is a literal, mechanical mirror of `delivered` (yes=1.0, partial=0.5, no=0.0), never a new judgment, and capacity-attest never reads or displays that number back anywhere itself. Re-verifies the claim's signature before writing anything on-chain.

Requires the caller to supply `reputationRegistryRef` (`"eip155:<chainId>:<registryAddress>"`, the Reputation Registry, not the Identity Registry), `agentRegistryRef` (same chain, but the Identity Registry) and an `rpcUrl`, the same caller-supplies-everything stance as `resolve_agent_identity`. `agentId` (the seller's ERC-8004 agent) must already be a validly registered Identity Registry agent; the contract itself refuses feedback from the agent's own owner ("Self-feedback not allowed"). Since the 2026-09-11 adversarial review, `agentId`'s registered owner (via `agentRegistryRef`) is also always checked against `claim.sellerAddress` before anything is written on-chain — without that check, a caller could attach a genuine, validly signed claim to an arbitrary other agentId.

**Deliberately NOT an MCP tool**, for the same reason as EAS's `publishClaim`: this is a write action that requires a real, funded signer and gas, and this server deliberately bundles or stores no private key of its own. Available as a direct import (`src/erc8004-reputation.ts`) for anyone managing their own signer.

Tested against an injectable `ReputationContractFactory` (`src/erc8004-reputation.test.ts`, 19 tests, no network dependency, including an explicit test that `value` depends solely on `delivered`, and three tests for the agentId ownership check) and live against the real, deployed registry on Base mainnet (`examples/erc8004-reputation-live-demo.ts`, `npm run erc8004-reputation-demo`): confirmed on 2026-09-10 via our own, disposable test agent (agentId 85888) and a real `giveFeedback()` call, [tx 0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0](https://basescan.org/tx/0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0), independently double-checked via a separate `eth_getTransactionReceipt` call. See [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-016 for the full background, including why this got built today despite D-005's own trigger criterion.

## Signing

The claim is signed by the **buyer** (the party that paid and therefore knows what did or didn't arrive), not by the seller. This is deliberately plain EIP-191 `personal_sign` over `claimId` (via `ethers.Signer#signMessage`), not EIP-712 typed data. That keeps this MVP's crypto surface small and easy to audit. A later upgrade to EIP-712 (like in `mcp-paywall/src/x402.mjs`) is possible additively, without invalidating existing claims.

## Independently verifying a claim

Every claim in the ledger can be re-checked with only the npm package and the raw claim bytes, no access to this project or a network call to us needed. No account, no hosted call.

```bash
npm install capacity-attest
```

```js
// verify.mjs, run as an ES module (top-level await)
import { verifyClaim } from "capacity-attest/dist/signing.js";

const claim = JSON.parse(await (await fetch("<url to a claim.jsonl line>")).text());
console.log(verifyClaim(claim));
// { ok: true } if claimId really is the hash of the content AND signature really recovers to buyerAddress
```

Note: import `capacity-attest/dist/signing.js` directly, not the package root. The root (`dist/index.js`) starts the MCP server over stdio the moment it's imported, which will hang a standalone verification script.

`verifyClaim()` checks exactly two things: that `claimId` is the content-addressed hash of the claim fields, and that `signature` (EIP-191) recovers to `buyerAddress`. It does not check whether the underlying settlement (`settlementRef`) really checks out on-chain — that's a separate check against the relevant chain — and it does not check whether `delivered` is true or whether `evidenceHash` covers real evidence; that remains the paying agent's own statement.

A working, externally reproduced example of these exact steps is in [github.com/YE-YI7/asm-spec, PR #18](https://github.com/YE-YI7/asm-spec/pull/18): an independent project that ran this against a real, live registered claim.

## Sharing your own submitted claims, independent of a host (D-006)

`get_delivery_history` relies on the honesty of whoever operates the MCP server: see the `note` in that tool's response and [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) (D-006). Every claim shown is genuinely real (the signature has also been re-checked on read since 2026-09-06, not only on write), but nothing proves the host is showing the FULL set it actually has.

If you're the buyer who submitted a claim yourself, you don't need to wait on that host: you already signed that claim yourself, so you can show it directly to a skeptical counterparty, bypassing any host.

```js
// export-my-claims.mjs
import { claimsForSeller } from "capacity-attest/dist/ledger.js";

const myAddress = "0x...";     // your buyerAddress
const seller = "0x...";        // the seller in question

const mine = (await claimsForSeller(seller)).filter(
  (c) => c.buyerAddress.toLowerCase() === myAddress.toLowerCase(),
);
console.log(JSON.stringify(mine, null, 2));
```

Every claim in that list is independently verifiable with `verifyClaim()` (see above), without the recipient having to trust your installation or any host. This doesn't solve discoverability (D-005: how does someone else find your claim if you don't share it) or completeness across ALL buyers together (D-006: this only proves what YOU submitted, not what a host might otherwise be withholding from other buyers), but it gives you a concrete, free way to prove one specific dispute without needing to trust a host.

## Running locally

```bash
npm install
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run demo       # end-to-end local demo with TEST keys, no live infrastructure
npm start           # start the MCP server over stdio (e.g. for Claude Desktop/Code as a local MCP server)
```

The ledger location is configurable via `CAPACITY_ATTEST_DATA_DIR` (default: `./data` in this package). Tests and the demo always use their own, disposable temp directory, never the real `data/` folder.

## Architecture

```text
src/
  schema.ts        DeliveryClaim zod schema + content-addressing (computeClaimId, canonicalize)
  signing.ts        sign/verify a claim (ethers, EIP-191 personal-sign)
  ledger.ts          append-only JSONL storage (data/claims.jsonl), never mutated
  tools.ts           the actual logic behind both MCP tools, transport-agnostic
  config.ts          where the ledger directory lives, lazy so tests can override it
  index.ts            MCP server wiring (registers record_delivery + get_delivery_history)
examples/demo.ts   end-to-end local example with TEST keys
```

`tools.ts` holds the actual business logic; `index.ts` only translates that into MCP tool calls. That way tests and the demo can call the same logic directly without spinning up a stdio transport.

## Relation to x402

This project itself verifies or settles no x402 payments — that already happens at the payment step (see e.g. `mcp-paywall/src/x402.mjs` in this ecosystem for a full EIP-3009 verify/settle implementation). `settlementRef` simply points at that already-completed settlement. That also means the MVP integration with a real x402 facilitator can stay simple: `settlementRef` is free text, on the assumption that the buyer fills it in honestly. A later version could optionally verify that field against a real facilitator (TODO, not in this MVP).

## Relation to AWS Bedrock AgentCore Payments

No overlap, no competition: different step in the chain. Bedrock AgentCore Payments (Amazon, since 2026) handles the payment step itself, up to and including the moment "the merchant verifies the payment proof... [and] returns the requested content" ([official AWS documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments-how-it-works.html)). That proof is proof of **payment**, not of **delivery**: nowhere is it recorded whether the agent actually received what was promised after that step. That's exactly where `capacity-attest` picks up. Same as with x402 above: this project settles no payments and doesn't compete with the payment rail — it records what did or didn't actually arrive after payment, regardless of which rail (x402 or otherwise) handled that payment.
