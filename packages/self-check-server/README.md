# self-check-server

The small HTTP backend behind [tokenizen.nl/check](../website/src/components/pages/self-check-page.tsx). A browser cannot run `node:dns` or `node:crypto` directly, so this is the thin, real (non-mock) layer a browser page calls instead — it does not reimplement any ownership-proof logic, only wires the already-tested functions from [endpoint-attest](../endpoint-attest) and [trust-attest-server](../trust-attest-server) up over HTTP.

## Why this exists as its own package

`endpoint-attest`'s `verifyOwnership()` and `trust-attest-server`'s `getOwnershipChallenge()` were built for an MCP tool call, where the caller is an agent acting on its own operator's endpoint. Putting the same functions behind an anonymous public web form changes the threat model: any visitor can submit any `http(s)` URL and cause this server to make a real DNS lookup and/or HTTP fetch to it. That is a classic SSRF surface those functions were never exposed to before. Two things exist here specifically because of that:

- **`tokenizen-net-guard`** (packages/net-guard) — every outbound DNS or HTTP call goes through it. A host is resolved once, every returned address is checked against the loopback, private, link-local (including the cloud-metadata address) and reserved ranges, and only the validated addresses are dialed, on every hop including redirects. That pinning closes the DNS-rebinding gap this package's first version stated openly. A build test (`net-guard/src/no-raw-egress.test.ts`) fails if a production file here reaches for a raw fetch or DNS call.
- **`src/rate-limit.ts`** — a minimal in-memory per-IP fixed-window limiter on both routes, because this API is unauthenticated by design and each request does real network I/O. Single-process only; a multi-instance deployment would need a shared store instead.

## Two routes, matching the free/paid split in trust-attest-server

- **`POST /api/challenge`** (free, no network call) — wraps `getOwnershipChallenge`. Body: `{ endpoint, ownerAddress }`.
- **`POST /api/verify-ownership`** (free, one real DNS/HTTP check) — wraps `verifyOwnership` directly. Body: `{ endpoint, ownerAddress, method }`. This is the ownership proof only. It deliberately does **not** call `requestTrustAttestation` (the paid tool that also runs checks and signs an attestation) — a free "verify" button on a public page must never trigger a paid action. Wiring the paid step behind real payment (x402/mcp-paywall) is a separate, later change.

Both routes share `trust-attest-server`'s module-level attester identity by default, so a challenge issued by this server matches what verification expects — same "ephemeral, resets on process restart" caveat `attester-identity.ts` already documents.

## The free live x402 check

- **`POST /api/x402/check`** (free, one measurement of the visitor's own endpoint) — body `{ url, method? }`, behind tokenizen.nl/x402-check. Our server sends the endpoint one anonymous request, never pays, and answers with a dated verdict: whether the payment request passes the official x402 buyer schema (`parsePaymentRequired` from @x402/core, read from the Payment-Required header or the body), and how far up the receipt ladder of [agent-receipt-verify](https://github.com/holistis/agent-receipt-verify) it gets (levels 0 to 2, the ones that need no payment). The raw headers and bodies of the endpoint are never returned.

This reverses a rule written in `src/x402-badge.ts`, which never measures live so that nobody can use this server to probe other hosts from our address. The badge keeps that rule. The live route replaces "never" with limits, all in `src/x402-check.ts`: https and port 443 only, a public domain name (no IP literals), GET and POST only with a fixed `{}` body, at most two redirects that may only stay on the pasted host or its www sibling, a 64 KB response cap (8 KB for a DID document), at most six outbound requests and a 45 second deadline per measurement with the sockets aborted when it passes, at most eight checks busy at once, a two minute result cache, at most 12 live measurements per host and 200 in total per hour, and 8 requests per 10 minutes per IP on top. Any host other than the pasted one may be asked for exactly one thing, the fixed file `/.well-known/did.json` without a query, because the party being measured chooses which did:web document its offer names. Nothing is stored; the cache lives in memory, and the server logs no URL.

The library is agent-receipt-verify at exactly 0.2.9, the first published version that passes the injected fetch on to its did:web key lookup. Do not go below it. Before that fix the lookup, whose host the measured party chooses, used the global fetch and skipped every guard above (agent-receipt-verify#46); `x402-check.test.ts` fails if that ever comes back.

Known limits, written down because an adversarial review (ours, not independent) found them and they are not closed by code: whoever controls many IP addresses can use up the hourly global budget, after which every visitor gets a 429 until it resets, and twelve checks of one host with different query strings lock that host's owner out for an hour. A host name that sends our DNS lookup to a name server that never answers keeps a thread of the shared pool busy; the eight-at-once cap keeps that bounded, and setting `UV_THREADPOOL_SIZE=16` in the service environment gives it room. Behind a proxy, set `HOST=127.0.0.1` so nobody can reach the port directly and send their own X-Forwarded-For (the production server also has a firewall that only opens 22, 80 and 443).

Why the buyer check does not use x402-lint: x402-lint reads only the response body, and a v2 seller keeps its requirements in the Payment-Required header with a body of `{}`. Measured on 2026-10-24 against our own live paid route it reported "x402Version: Invalid discriminator value". Same schema, different place to read it from.

## The free CRA readiness check

- **`POST /api/cra/check`** (free, up to about twenty small read-only requests to GitHub, at most nine of them to its API) - body `{ repo }`, behind tokenizen.nl/cra-check. It answers with a dated list of eight points the EU Cyber Resilience Act (Regulation 2024/2847) asks around vulnerability handling and distribution of updates, each one `visible`, `not_visible` or `not_measured` for a PUBLIC GitHub repository: a security policy that names a contact address or a reporting link (the repository's own SECURITY.md, or the organisation's .github repository), a software bill of materials, signed releases or provenance, a lockfile, Dependabot or Renovate, a security scan in CI, maintenance in the last 90 days (last commit on the default branch), a licence. Each point that is not visible comes with what would make it visible, and the answer lists the GitHub pages that were read so a reader can open the same ones.

It is an indication from public data and says so in every answer (`notice`, `whatThisDoesNotMeasure`, `rules`). The mapping from each point to the Regulation is our own reading, built from secondary sources, not reviewed by a lawyer; the answer carries the rule set version so a dated result stays meaningful when the rules change. "Not visible" is never worded as "missing": signing or an SBOM done on a separate build server or a registry, and a scan or Dependabot alerts switched on in the repository settings, are not visible from the repository. **A point is only "not visible" when everything that could show it was read.** If a call failed, the file list is missing or only some of the workflow files were read, the point is "not measured"; if the repository itself cannot be read the answer is a 502 and nothing is cached; a report with an unread part is cached five minutes instead of an hour. This came out of the first adversarial review (2026-10-28), which found a version where a GitHub hiccup turned into five "not visible" points that stayed cached for an hour; `cra-repo-check.test.ts` keeps it closed.

What stands in the way of abuse, all in `src/cra-check.ts` and `src/cra-repo-check.ts`: the visitor chooses an `owner/repo` pair, never a host, and it must match a strict pattern before any address is built (every path segment is percent-encoded again, and files are read at `HEAD`, so no text chosen by the repository owner, such as a branch name, ends up in an address); the only hosts ever asked for are api.github.com and raw.githubusercontent.com, through net-guard's `guardedFetch`, with redirects refused; every response is read with a byte cap (1 MB for the API, 200 KB for a workflow file, at most twelve workflow files, release, publish and scan files first), because a repository owner chooses how big their files are; at most six checks busy at once, a 30 second deadline per check with the sockets aborted, a one hour cache per repository (a repository does not change by the minute) and a five minute cache for "not found", an hourly budget for the whole server (6 without a token, 300 with one; a name that does not exist gives its slot back and draws on a separate budget four times as large) and 6 requests per 10 minutes per IP on top; text that came from a repository is cut and stripped of control characters, and the page renders it as text. Nothing is stored, the cache lives in memory, and no repository name is logged.

**The GitHub allowance.** One check costs up to nine API calls (the raw file reads are not counted by GitHub). Without a token the allowance is 60 calls an hour for the whole server and one visitor could use it up for everybody, so the route is SWITCHED OFF (503) unless `CRA_CHECK_GITHUB_TOKEN` is set, or `CRA_CHECK_ALLOW_ANONYMOUS=1` says anonymous use is wanted. Set `CRA_CHECK_GITHUB_TOKEN` to a fine-grained token with NO permissions (public repositories, read only), made for this service only; it raises the allowance to 5000 and is sent to api.github.com only. Never a personal token. When GitHub says "slow down", the answer is a 429 and nothing is cached.

Not independently reviewed: an adversarial review of our own is the only one this route has had.

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

`npm test -w self-check-server` — all against a real Express app on a real (loopback, ephemeral-port) socket, with every DNS lookup and HTTP fetch replaced by an injected fake via the same dependency-injection seams `ownership.ts`/`checks.ts` already use. No test in this package performs a real DNS query or outbound HTTP request, including the x402 check tests, which replace the egress with a fake that plays net-guard.

## Status

Live at https://api.tokenizen.nl: Caddy in front, this service under its own unprivileged user behind it, deployed by hand (pull as the service user, build, restart the unit). The ownership routes and the paid route are older; the x402 check is new. The x402 check had an internal adversarial review before it went live. That is our own review, not an independent one, and no independent external review of this package has been done.
