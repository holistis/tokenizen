# trust-attest-server

An MCP server (stdio, `@modelcontextprotocol/sdk`) that runs the "request a trust attestation" flow for the tokenizen.nl AI-agent trust layer, on top of [endpoint-attest](../endpoint-attest). Meant to sit behind an x402 paywall (mcp-paywall, a separate repository, not part of this package) so `request_trust_attestation` is a paid tool.

endpoint-attest handles ownership proof, content-addressing, and signing, but deliberately does not run any checks itself ("It does not run the checks for you" — see its own README). This package is that missing attester process: one passive check (`src/checks.ts`) that reads what an endpoint's own plain-GET response says about authentication, plus the MCP wiring (`src/server.ts`) and the attester's own signing identity (`src/attester-identity.ts`).

## Two tools

- **`get_ownership_challenge`** (free): given `endpoint` and `ownerAddress`, returns the ACME-style challenge token to publish — both the DNS TXT and well-known-file forms — so the owner knows what to publish before paying for anything.
- **`request_trust_attestation`** (paid): given `endpoint`, `ownerAddress` and which `method` was published, verifies ownership first. Only on success does it run the check and return a signed, content-addressed, expiring `EndpointAttestation`. If ownership cannot be verified, it returns a clear error and issues nothing — no partial or speculative attestation ever exists.

## What the one check actually does

`checks.ts` performs exactly one plain HTTP GET to the endpoint — the same request a browser would make. It never sends a POST, never attempts an MCP `initialize`/`tools/call` handshake, never logs in, never writes anything. A `401`/`403` challenge on that bare GET is read as a good signal (the server is demonstrating enforcement); an explicit, literal "no authentication required"-style admission in the body is read as a bad signal. Anything else is reported `inconclusive` rather than guessed either way.

## Identity: set two environment variables before deploying this for real use

`attester-identity.ts` reads `TRUST_ATTEST_PRIVATE_KEY` and `TRUST_ATTEST_OWNERSHIP_SECRET` from the environment. Set both and the identity is stable across restarts: every attestation this process signs keeps the same `attesterAddress` forever, and an ownership challenge token issued before a restart still matches after one.

Leave either unset and this falls back to a fresh, random wallet and secret every process start, and prints a loud warning to stderr rather than pretending to be production-ready. That fallback is fine for `npm test` and the demo, and it is NOT fine for anyone who actually installs this package expecting attestations to mean something: a different signer after every restart means no continuous trust history is possible.

```bash
export TRUST_ATTEST_PRIVATE_KEY=0x...      # the attester's own signing key, kept secret
export TRUST_ATTEST_OWNERSHIP_SECRET=...   # at least 32 characters, kept secret
```

This is the documented minimum bar, not the final word on key custody. Real, safely custodied key management (hardware-backed signing, rotation, backup) is a separate, later decision.

## Usage

```bash
npm install   # from the monorepo root, links endpoint-attest via the workspace
npm test      # in this package
npx tsx examples/demo.ts
```

Full worked example, including the "ownership not yet proven" failure path and an honest `failed` outcome: [examples/demo.ts](examples/demo.ts).

**This package is published on npm, but `npm install trust-attest-server` on its own, outside this monorepo, currently fails.** Its dependency `endpoint-attest` is deliberately `"private": true` and is not published to the npm registry, so npm cannot resolve it (`404 Not Found - endpoint-attest`). Use it from within the `tokenizen` monorepo (the `npm install` above) until that dependency is either published separately or bundled into this package.

## Status

Built on endpoint-attest (43 tests passing — see its own README). 27 tests in this package. No independent, external review of this code has been done.
