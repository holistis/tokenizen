# trust-attest-server

An MCP server (stdio, `@modelcontextprotocol/sdk`) that runs the "request a trust attestation" flow for the tokenizen.nl AI-agent trust layer, on top of [endpoint-attest](../endpoint-attest). Meant to sit behind an x402 paywall (mcp-paywall, a separate repository, not part of this package) so `request_trust_attestation` is a paid tool.

endpoint-attest handles ownership proof, content-addressing, and signing, but deliberately does not run any checks itself ("It does not run the checks for you" — see its own README). This package is that missing attester process: one passive check (`src/checks.ts`) that reads what an endpoint's own plain-GET response says about authentication, plus the MCP wiring (`src/server.ts`) and the attester's own signing identity (`src/attester-identity.ts`).

## Two tools

- **`get_ownership_challenge`** (free): given `endpoint` and `ownerAddress`, returns the ACME-style challenge token to publish — both the DNS TXT and well-known-file forms — so the owner knows what to publish before paying for anything.
- **`request_trust_attestation`** (paid): given `endpoint`, `ownerAddress` and which `method` was published, verifies ownership first. Only on success does it run the check and return a signed, content-addressed, expiring `EndpointAttestation`. If ownership cannot be verified, it returns a clear error and issues nothing — no partial or speculative attestation ever exists.

## What the one check actually does

`checks.ts` performs exactly one plain HTTP GET to the endpoint — the same request a browser would make. It never sends a POST, never attempts an MCP `initialize`/`tools/call` handshake, never logs in, never writes anything. A `401`/`403` challenge on that bare GET is read as a good signal (the server is demonstrating enforcement); an explicit, literal "no authentication required"-style admission in the body is read as a bad signal. Anything else is reported `inconclusive` rather than guessed either way.

## Identity is a test wallet, on purpose

`attester-identity.ts` generates a fresh, in-memory `ethers.Wallet.createRandom()` and a fresh random ownership secret every time the process starts. There is no persistent signing key or persistent shared secret yet — that is a separate, later decision (real key custody, rotation, persistence across restarts) that has not been made. See the comments in that file for the practical consequences of that choice.

## Usage

```bash
npm install   # from the monorepo root, links endpoint-attest via the workspace
npm test      # in this package
npx tsx examples/demo.ts
```

Full worked example, including the "ownership not yet proven" failure path and an honest `failed` outcome: [examples/demo.ts](examples/demo.ts).

## Status

New. Built on endpoint-attest (43 tests passing, not yet published to npm — see its own README). This package is not published to npm either. No independent, external review of this code has been done.
