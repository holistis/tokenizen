# tokenizen

*[Nederlandse versie / Dutch version: README.nl.md](README.nl.md)*

Open-source infrastructure for agent commerce: AI agents learning to understand, verify, and settle rights to economic assets.

## Why this exists

The chain of an agent buying or selling something has six links: agent, identity, rights, asset, payment, settlement. The buyer side of that chain is already under heavy development: wallets, payment protocols like x402, agent identity. What's missing is the seller side: how do you record what you, as an agent, claim to have delivered, what you own, and what the rights to it are, in a way another agent can verify without a human in the loop. That's a signed trail, not independent proof of the underlying reality.

Tokenizen builds that object, not the buyer side. Three independent tracks converged on the same conclusion: a formal internal review of what is and isn't permissible in agent-to-agent commerce, market research into what already exists in this space and what's missing, and an inventory of our own code that had been running into similar problems for years. All three pointed at the same gap: verification and settlement on the seller side, without financial constructs that aren't permissible.

## The design boundary

This project has a permanent, deliberate boundary, the result of a formal internal review. That boundary applies to the whole project, not just one package.

**Green (we build this):**

- Verification and audit trails for delivered services or assets
- Policy and scope checks between agents
- Real capacity trading (compute, storage, API credits, bandwidth) that is actually delivered

**Yellow (with conditions):**

- Settlement is spot-only: payment against immediate delivery, no deferred settlement
- Credits are redeemable vouchers for a service, not a tradeable financial instrument

**Red (never):**

- Interest or time-discounting on payments
- Loans or credit extension
- A native token or coin
- Factoring or invoice financing
- Yield products

If in doubt whether something brushes against this line: it stays out, no matter how technically interesting.

## Packages

### `packages/capacity-attest`

An MCP server with two tools: `record_delivery` and `get_delivery_history`. After an x402 payment for capacity (GPU hours, storage, API credits, bandwidth), the paying agent leaves behind a cryptographically signed, factual claim about what was or wasn't delivered. Other agents can pull that history on a seller before paying themselves. No reputation score, no judgment, purely a factual, append-only history.

See [`packages/capacity-attest/README.md`](packages/capacity-attest/README.md) for the full mechanics, the schema, and how to run it locally.

### `packages/website`

The public site for tokenizen.nl, in the same monorepo as the packages it describes. Under development alongside this documentation; see that folder's own README for current status.

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

Early-stage open source. `packages/capacity-attest` is published on npm (`npm install capacity-attest`).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to file an issue or pull request, how to test locally, and the hard contribution rule around the design boundary.

## License

[MIT](LICENSE)
