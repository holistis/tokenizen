# self-check-server

The small HTTP backend behind [tokenizen.nl/check](../website/src/components/pages/self-check-page.tsx). A browser cannot run `node:dns` or `node:crypto` directly, so this is the thin, real (non-mock) layer a browser page calls instead — it does not reimplement any ownership-proof logic, only wires the already-tested functions from [endpoint-attest](../endpoint-attest) and [trust-attest-server](../trust-attest-server) up over HTTP.

## Why this exists as its own package

`endpoint-attest`'s `verifyOwnership()` and `trust-attest-server`'s `getOwnershipChallenge()` were built for an MCP tool call, where the caller is an agent acting on its own operator's endpoint. Putting the same functions behind an anonymous public web form changes the threat model: any visitor can submit any `http(s)` URL and cause this server to make a real DNS lookup and/or HTTP fetch to it. That is a classic SSRF surface those functions were never exposed to before. Two things exist here specifically because of that:

- **`src/network-guard.ts`** — resolves the endpoint's host and refuses to proceed if it (or any of its resolved addresses) falls in a loopback/private/link-local/reserved range, including the cloud-metadata address `169.254.169.254`. Stated honestly: it checks at request time, so it does not fully defeat DNS rebinding (a host that resolves differently a few requests later) — see the file's own header comment for what would close that gap and why it is a deliberate follow-up, not silently claimed as solved here.
- **`src/rate-limit.ts`** — a minimal in-memory per-IP fixed-window limiter on both routes, because this API is unauthenticated by design and each request does real network I/O. Single-process only; a multi-instance deployment would need a shared store instead.

## Two routes, matching the free/paid split in trust-attest-server

- **`POST /api/challenge`** (free, no network call) — wraps `getOwnershipChallenge`. Body: `{ endpoint, ownerAddress }`.
- **`POST /api/verify-ownership`** (free, one real DNS/HTTP check) — wraps `verifyOwnership` directly. Body: `{ endpoint, ownerAddress, method }`. This is the ownership proof only. It deliberately does **not** call `requestTrustAttestation` (the paid tool that also runs checks and signs an attestation) — a free "verify" button on a public page must never trigger a paid action. Wiring the paid step behind real payment (x402/mcp-paywall) is a separate, later change.

Both routes share `trust-attest-server`'s module-level attester identity by default, so a challenge issued by this server matches what verification expects — same "ephemeral, resets on process restart" caveat `attester-identity.ts` already documents.

## Usage

```bash
npm install              # from the monorepo root
npm run build -w self-check-server -w endpoint-attest -w trust-attest-server
PORT=8787 npm run start -w self-check-server
# or, for local development with auto-reload:
npm run dev -w self-check-server
```

Configure with env vars: `PORT` (default `8787`), `ALLOWED_ORIGINS` (comma-separated, defaults to `http://localhost:5173` plus the production `tokenizen.nl` domains).

## Tests

`npm test -w self-check-server` — 31 tests, all against a real Express app on a real (loopback, ephemeral-port) socket, with every DNS lookup and HTTP fetch replaced by an injected fake via the same dependency-injection seams `ownership.ts`/`checks.ts` already use. No test in this package performs a real DNS query or outbound HTTP request.

## Status

New. Not deployed anywhere yet — `packages/website`'s `/check` page defaults to `https://api.tokenizen.nl` in production builds, which does not exist yet; that is a stated placeholder for an infrastructure decision (where this small Node service runs) that has not been made. No independent, external review of this code has been done.
