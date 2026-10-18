# tokenizen

*[Nederlandse versie / Dutch version: README.nl.md](README.nl.md)*

Signed, content-addressed records of what an agent delivered, checkable by another agent without a human in the loop. Two of the packages here are MCP servers, so an agent can write and read these records as tools.

### What the buyer can check, and what he cannot

An agent buys 8 hours of GPU capacity from another agent and pays over x402. The money settles. Today the trail stops there, and whatever the buying agent learned dies with its session.

With a delivery claim, the buyer leaves behind a signed record: 28,800 seconds promised, 25,230 delivered, hashed to its own content so it cannot be edited afterwards. The next agent can pull that history before paying the same seller.

What a later reader can check: that this record is the one that was signed, by that key, about that exact delivered amount, and that nobody edited it afterwards.

What he cannot check: whether 25,230 is true. A signature proves origin and integrity, never truth. This is a delivery slip, not a verdict, and the whole design follows from that line.

## Three things in the box

The example above is one of three. All three leave a record that someone else can check:

- A signed delivery claim the buyer leaves behind after settlement, including the gap between what was promised and what arrived, hashed to its own content so it cannot be edited after the fact.
- A time-bounded attestation about a network endpoint, issued only after the operator has proved it controls that endpoint.
- Verifiers and signed test vectors, so anyone can check a claim against an independent implementation instead of trusting ours.

No reputation score, no judgment, no financial instrument. A delivery slip, not a verdict.

## Call it

There is a live endpoint. It answers 402 with signed offers in the `Payment-Required` header, and issues an EIP-712 receipt after settlement, under the x402 offer-and-receipt extension.

```bash
curl -i -X POST https://api.tokenizen.nl/api/paid/verify-ownership \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://api.tokenizen.nl/sse","ownerAddress":"0x1111111111111111111111111111111111111111","method":"dns-txt"}'
```

The offers are in the header, not the body. Base64-decode it, recover the signature against the domain `{name: "x402 offer", version: "1", chainId: 1}`, then check that the recovered key is allowed to speak for the host, which the specification treats as a separate question:

```bash
dig +short TXT _controllers.tokenizen.nl
"v=1;controller=did:pkh:eip155:1:0x4E1174b774643B6AD9EE966A81ea1e3665D1159a"
```

Same key. Two commands, no trust in us required.

It runs on Base Sepolia, so the money is test money and the cryptography is not. If you are implementing the client side of that extension, this gives you a live signed artifact instead of a fixture you wrote yourself and therefore cannot be surprised by.

Two honest limits. The `transaction` field in those receipts is empty, so a receipt cannot name its own settlement; that is an upstream bug we traced and filed, with the fix open as [x402#3826](https://github.com/x402-foundation/x402/pull/3826). And every payment through it so far has been ours on both sides, which proves the chain runs and proves nothing about adoption.

## Independently verified

Code is copyable, independent verification is not. Everything below is someone else checking our work instead of reading about it, with the link so it can be checked again.

| What someone else verified | Where |
| --- | --- |
| The `measured` block cited as the source of truth for metered delivery in a draft ERC-8004 grounded-feedback convention, pinned to a specific commit of this repo. That party built its own conformance set of five signed vectors around it, plus two verifiers that share no code (Node and Python), both green | [erc-8004/erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99), vectors and verifiers in [predgeAI/erc8004-outcome-validator](https://github.com/predgeAI/erc8004-outcome-validator/tree/main/grounded-feedback) |
| An independently rebuilt, stdlib-only Python verifier with its own secp256k1, EIP-191 and canonical-JSON implementation, no shared code, 7/7 match including both negative controls, now a permanent regression test in a separate published project | [x402#2887 (comment)](https://github.com/x402-foundation/x402/issues/2887#issuecomment-5687398497), author goun7, shipped in Tamga |
| A second implementer ran the metered test vector from a fresh clone at HEAD: 12/12 green across canonical preimage, claimId recomputation, EIP-191 digest, signature recovery, buyer address match, tamper detection on `deliveredAmount` and both period checks, with no network call | [x402#2833 (comment)](https://github.com/x402-foundation/x402/issues/2833#issuecomment-5680708467), author StelarDigital |
| The same implementer then composed our `claimId`s into his own RFC-6962 Merkle batch alongside his delivery receipts, using our public test vector unmodified and his own unchanged `merkle.js`, to check the two formats meet at the leaf. His own receipts in that batch are synthetic fixtures, which he labels as such | [x402#2833 (comment)](https://github.com/x402-foundation/x402/issues/2833#issuecomment-5798402436), author StelarDigital |
| A protocol maintainer linked our verifier in his own official documentation as the independent implementation for his format, noting it was written from his SPEC.md and not from his source, with his own measured results: 4 of 4 countersigned cases and 10 of 10 canonical cases. His caveat, in his words: "We have not audited its code; run the vectors yourself." The same merge wrote a limitation we reported, that the signed content does not constrain the amount, into the normative method text, crediting us by name | [inamprotocol/inam-protocol#143](https://github.com/inamprotocol/inam-protocol/pull/143), text in [`docs/VERIFIER.md`](https://github.com/inamprotocol/inam-protocol/blob/main/docs/VERIFIER.md) and [`interop/countersigned/METHOD.md`](https://github.com/inamprotocol/inam-protocol/blob/main/interop/countersigned/METHOD.md) |
| A BSV rail adapter built on the same content-addressed claim format by a separate author, merged into a third party's spec repo | [asm-spec#19](https://github.com/YE-YI7/asm-spec/pull/19), author EmbryoSpace |
| Live delivery claims readable on-chain by anyone, on three separate deployments | [Base](https://base.easscan.org/attestation/view/0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc) · [Optimism](https://optimism.easscan.org/attestation/view/0x46148283cb005aa43387fb62b2e1ccd0b001ff82dc9310ea885237fd8dea8832) · [Ethereum](https://easscan.org/attestation/view/0x40da382231eeb6186b7daf231a430488627769feb64039ae3ac671a14f7a8137) |
| A real `giveFeedback()` call against the ERC-8004 Reputation Registry on Base mainnet | [tx 0x2217...efc0](https://basescan.org/tx/0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0) |

Full list, including the entries still in review: [`packages/capacity-attest/README.md`](packages/capacity-attest/README.md).

One honest update to the first row, because the numbers in it are from before a change. A fifth vector was added to that conformance set after those results were published. We ran it against our own verifier before anyone asked us to, and it failed in the worst direction: we accepted a receipt claiming a value of 999 for a delivery the method scores at 100. The check for that existed in our code but could never fire, because it read a field this format does not have. Fixed, and the fix names the cause: [agent-receipt-verify#37](https://github.com/holistis/agent-receipt-verify/pull/37). Five of five now, and the same maintainer has said publicly that he will make his own paid call, recompute both hashes from the bytes he observes, and publish the result either way.

Separate from that table, because it is not third-party review: we ran our own adversarial security review before the first version that writes to a blockchain. Nine findings, all fixed, report published. That was our own work, not an independent audit, and it is listed apart for that reason.

## Why this exists

The chain of an agent buying or selling something has six links: agent, identity, rights, asset, payment, settlement. The buyer side of that chain is already under heavy development: wallets, payment protocols like x402, agent identity. What's missing is the seller side: how do you record what you, as an agent, claim to have delivered, what you own, and what the rights to it are, in a way another agent can verify without a human in the loop. That's a signed trail, not independent proof of the underlying reality.

Tokenizen builds that object, not the buyer side. Three independent tracks converged on the same conclusion: a formal internal review of what is and isn't permissible in agent-to-agent commerce, market research into what already exists in this space and what's missing, and an inventory of our own code that had been running into similar problems for years. All three pointed at the same gap: verification and settlement on the seller side, without financial constructs that aren't permissible.

## The design boundary

This project has a permanent, deliberate boundary, the result of a formal internal review. That boundary applies to the whole project, not just one package.

Green (we build this):

- Verification and audit trails for delivered services or assets
- Policy and scope checks between agents
- Real capacity trading (compute, storage, API credits, bandwidth) that is actually delivered

Yellow (with conditions):

- Settlement is spot-only: payment against immediate delivery, no deferred settlement
- Credits are redeemable vouchers for a service, not a tradeable financial instrument

Red (never):

- Interest or time-discounting on payments
- Loans or credit extension
- A native token or coin
- Factoring or invoice financing
- Yield products

If in doubt whether something brushes against this line: it stays out, no matter how technically interesting.

## Packages

Installable today, both on npm:

| Package | What it does |
| --- | --- |
| [`capacity-attest`](packages/capacity-attest) | The claim format, plus an MCP server with `record_delivery` and `get_delivery_history`. After paying for capacity over x402, the buying agent leaves a signed claim of what actually arrived, promised against delivered. Other agents pull that history before paying the same seller. |
| [`trust-attest-server`](packages/trust-attest-server) | MCP server for the trust layer. An agent proves it controls an endpoint, a passive check reads what that endpoint says about its own authentication, and the outcome comes back as a signed, expiring attestation. Ownership proof is required before any check runs. |

Both are one version behind this repository. The newer versions are not published yet, and that is a backlog item, not a decision.

In the repository but not published: [`endpoint-attest`](packages/endpoint-attest) (owner-requested, time-bounded endpoint attestations), [`net-guard`](packages/net-guard) (the single enforced egress choke-point, refuses private, loopback, link-local and cloud-metadata addresses on every hop including redirects), [`self-check-server`](packages/self-check-server) (the backend behind tokenizen.nl/check) and [`website`](packages/website). Each has its own README.
## Running locally

This is an npm-workspaces monorepo. From the root:

```bash
npm install
```

That installs the dependencies for all packages under `packages/*` at once. To run, test, or build a specific package: follow that package's own README, or use the workspace flag from the root, e.g.:

```bash
npm test --workspace=capacity-attest
npm run build --workspace=capacity-attest
```

## Status

Early-stage open source. What that means in numbers, because the word users hides the difference: last month npm counted 573 downloads of `capacity-attest` and 157 of `trust-attest-server`, and downloads are not users. There are no paying customers. What there is: four external implementers who build on the claim format and pin it by commit, each linked in the table above. Every payment through our own live endpoint so far has been ours on both sides. Two packages are on npm (`capacity-attest`, `trust-attest-server`), both currently one version behind this repo, with the newer versions not yet published. The claim format itself is the part other projects already depend on, and it is pinned by commit hash in at least one external specification, so it is treated as stable: breaking it would break their work, not only ours.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to file an issue or pull request, how to test locally, and the hard contribution rule around the design boundary.

## License

[MIT](LICENSE)
