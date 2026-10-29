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

This reverses a rule written in `src/x402-badge.ts`, which never measures live so that nobody can use this server to probe other hosts from our address. The badge keeps that rule. The live route replaces "never" with limits, all in `src/x402-check.ts`: https and port 443 only, a public domain name (no IP literals), GET and POST only with a fixed `{}` body, at most two redirects that may only stay on the pasted host or its www sibling, a 64 KB response cap (8 KB for a DID document), at most six outbound requests and a 45 second deadline per measurement with the sockets aborted when it passes, at most eight checks busy at once, a two minute result cache, at most 12 live measurements per host and 200 in total per hour, and 8 requests per 10 minutes per IP on top. Any host other than the pasted one may be asked for exactly one thing, the fixed file `/.well-known/did.json` without a query, because the party being measured chooses which did:web document its offer names. No result is stored; the cache lives in memory, and the server logs no URL. One count line per answer (route, status, own-client flag) is written, see `src/usage-log.ts`.

The library is agent-receipt-verify at exactly 0.2.9, the first published version that passes the injected fetch on to its did:web key lookup. Do not go below it. Before that fix the lookup, whose host the measured party chooses, used the global fetch and skipped every guard above (agent-receipt-verify#46); `x402-check.test.ts` fails if that ever comes back.

Known limits, written down because an adversarial review (ours, not independent) found them and they are not closed by code: whoever controls many IP addresses can use up the hourly global budget, after which every visitor gets a 429 until it resets, and twelve checks of one host with different query strings lock that host's owner out for an hour. A host name that sends our DNS lookup to a name server that never answers keeps a thread of the shared pool busy; the eight-at-once cap keeps that bounded, and setting `UV_THREADPOOL_SIZE=16` in the service environment gives it room. Behind a proxy, set `HOST=127.0.0.1` so nobody can reach the port directly and send their own X-Forwarded-For (the production server also has a firewall that only opens 22, 80 and 443).

Why the buyer check does not use x402-lint: x402-lint reads only the response body, and a v2 seller keeps its requirements in the Payment-Required header with a body of `{}`. Measured on 2026-10-24 against our own live paid route it reported "x402Version: Invalid discriminator value". Same schema, different place to read it from.

## The free CRA readiness check

- **`POST /api/cra/check`** (free, up to about nineteen small read-only requests to GitHub, at most six of them to its API) - body `{ repo }`, behind tokenizen.nl/cra-check. It answers with a dated list of EIGHT SELECTED SIGNALS about a PUBLIC GitHub repository, each one `visible`, `not_visible` or `not_measured`: a security policy that names a contact address or a reporting link (the repository's own SECURITY.md in the root, .github/ or docs/, or the one in the owner's .github repository), a software bill of materials, signed releases or provenance, a lockfile, Dependabot or Renovate, a security scan in CI, maintenance in the last 90 days (last commit on the default branch), a licence. Each signal that is not visible comes with what would make it visible, and the answer lists the GitHub pages that were asked for and what came of each (`sources`: read, partly read, not found, moved, failed), so a reader can open the same ones.

**What the eight signals are, and are not.** They are not one signal for each of the eight legal requirements in Annex I part II of Regulation (EU) 2024/2847 (points 1 to 8). Some relate to those requirements (a bill of materials to point 1, automatic updates to 2, security scans to 3, a disclosure policy and a contact to 5 and 6, signed releases to 7); others are general good practice that the Regulation does not list as such (pinned dependencies, recent maintenance, a licence), and several legal requirements are not measured at all (whether fixed vulnerabilities are made public, whether vulnerabilities are really handled without delay, the reporting process, the documentation). The topics were compared with the official text on 2026-10-28; the choice of signals and their reading are our own and have not been reviewed by a lawyer. The answer says all of this itself (`rules.basis`, `notice`, `whatThisDoesNotMeasure`) and carries the rule set version so a dated result stays meaningful when the rules change. It is an indication from public data, not a compliance check.

**The rule that shapes the code: a signal is only "not visible" when everything that could show it was read.** The whole file tree comes from ONE call (git trees, recursive), so a lockfile or an SBOM anywhere in a monorepo is seen; a tree GitHub cut off, or one bigger than our cap, makes the file-based signals "not measured". A failed call, workflow files that were only partly read (twelve at most, release, publish and scan files first, 64 KB of each), a SECURITY.md that was only partly examined (past 16 KB, on a line over 1000 characters, or beyond the read cap) also give "not measured". An unreadable repository is a 502 and nothing is cached; a report with an unread part is cached five minutes instead of an hour. A link only counts as a contact when it looks like a reporting channel (security, advisories, report, disclosure, a bounty platform, contact), not a project homepage. "Not visible" is never worded as "missing": signing or an SBOM done on a separate build server or a registry, and a scan or Dependabot alerts switched on in the repository settings, are not visible from the repository. This came out of an outside second opinion and two reviews of our own (28 Oct 2026); `cra-repo-check.test.ts` keeps every case closed.

What stands in the way of abuse, all in `src/cra-check.ts` and `src/cra-repo-check.ts`: the visitor chooses an `owner/repo` pair, never a host, and it must match a strict pattern before any address is built (every path segment is percent-encoded again, and files are read at `HEAD`, so no text chosen by the repository owner, such as a branch name, ends up in an address); the only hosts ever asked for are api.github.com and raw.githubusercontent.com, through net-guard's `guardedFetch`, with redirects not followed; every response is read with a byte cap (3 MB for the file tree, 1 MB for other API answers, 200 KB per raw file), because a repository owner chooses how big their files are; policy text is cut at 16 KB and matched line by line with bounded patterns, workflow text at 64 KB; at most six checks busy at once, a 30 second deadline per check with the sockets aborted, a one hour cache per repository (a repository does not change by the minute) and a five minute cache for "not found", an hourly budget for the whole server (5 without a token, 250 with one; a name that does not exist gives its slot back and draws on a separate budget four times as large) and 6 requests per 10 minutes per IP on top; text that came from a repository is cut and stripped of control characters, and the page renders it as text. Reports are not stored: answers sit in server memory for up to an hour, and no repository name is logged by this service.

**The GitHub allowance.** One check costs up to six API calls (repository, file tree, releases, advisories, last commit, and the owner's .github tree when the repository has no policy of its own); the raw file reads are not counted by GitHub. Without a token the allowance is 60 calls an hour for the whole server and one visitor could use it up for everybody, so the route is SWITCHED OFF (503) unless `CRA_CHECK_GITHUB_TOKEN` is set, or `CRA_CHECK_ALLOW_ANONYMOUS=1` says anonymous use is wanted. Set `CRA_CHECK_GITHUB_TOKEN` to a fine-grained token with NO permissions (public repositories, read only), made for this service only; it raises the allowance to 5000, leaves room for other uses of the same token (the defaults use at most about half of it) and is sent to api.github.com only. Never a personal token. When GitHub says "slow down", the answer is a 429 and nothing is cached.

Known limits, not closed by code: whoever controls many IP addresses (about 40 with a token) can fill the budget for NEW names for an hour, after which every new name gets a 429 until it resets; repositories already in the cache keep answering. CORS only decides which browser pages may read the answer; it does not stop other callers. A renamed repository answers "moved" and has to be asked for again under its current name. A policy, an SBOM or a signing step that lives outside the public repository and its GitHub releases cannot be seen. Renovate settings in a package.json deeper than the root are not read. The licence signal accepts GitHub's own detection or a LICENSE, COPYING or UNLICENSE file in the root, and does not read the text.

One outside second opinion and two adversarial reviews of our own went into this route (28 Oct 2026). The second review found that a 200 KB line in a SECURITY.md could keep a regex busy for about 20 seconds and stop every route; the tests now time hostile input. No independent external review has been done.

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

## The CRA check as an MCP tool

The same check is also an MCP tool at `POST /mcp` (`src/cra-mcp.ts`), so that an AI agent can ask for it without a browser. It is one read-only tool, `check_github_repo`, that takes `repo` (`owner/name` or its github.com address) and returns the same dated report as `POST /api/cra/check`, or a plain error. It goes through the same checker, so the limits behind the web page stand behind it too: the strict `owner/repo` pattern, the one hour cache, at most a few checks at once and the hourly budget for GitHub.

Stateless: every request gets its own server and transport and nothing is kept between requests. Only `POST` is allowed (`GET` and `DELETE` answer 405) and a batch of messages is refused, because a batch could hold many tool calls under one request. A request that calls the tool uses the same limiter as the web route (six per ten minutes per address); connecting, listing tools and pings use a looser one (sixty per ten minutes), so an agent can look around without using up its checks. Answers are counted like the other free checks (`src/usage-log.ts`: route `mcp`, status, own-client flag; no address and no repository name).

Try it with the MCP Inspector in its default proxy mode: `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL `https://api.tokenizen.nl/mcp` (its direct-from-browser mode is not allowed by the CORS list). A tool call that is over the limit is answered as a tool result with `isError` and the wait in seconds, not as a bare HTTP 429. Only tool calls are counted as use. `server.json` in this folder is the entry for the official MCP registry.

## Checking a Signal log without us
`website/public/verify-cra-log.mjs` (served at `https://tokenizen.nl/verify-cra-log.mjs`) checks a log from its text alone: one file, no installs, no network. `node verify-cra-log.mjs yourlog.jsonl` prints `ok` with the head of the chain, or `NOT OK at line N` with the reason. It is the same check as `verifyChain` in `src/cra-log.ts`; `src/cra-log-standalone.test.ts` runs both over a good log and over fourteen kinds of broken ones and fails when they differ. It shows that the lines belong together and were not changed; when they were written is shown by the timestamp of the head (OpenTimestamps, `ots verify`).

## The weekly run, by hand, on the server
`bench/cra-weekly.sh repos.txt logdir` adds one line for every repository in `repos.txt`, writes the heads of all logs and stamps that file with OpenTimestamps; a few hours later `ots upgrade <file>.ots` makes the stamp confirmed. The Linux server has the client in `/opt/ots` (a Python virtual environment; remove the folder to undo it): `OTS=/opt/ots/bin/ots bench/cra-weekly.sh ...`. The client does not start on Windows (a missing library), so the run belongs on the server. The logs are customer data (repository names): keep the log folder outside the repository and out of backups that leave the server.

## The public list of delivered scan reports (built, not live)

A list of the scan reports we delivered, in which every line holds the hash of the line before it, and whose head is timestamped with OpenTimestamps. A buyer can check with one file that a report was delivered, with which outcome and coverage, and that it has not changed since. `src/scan-receipts.ts` is the chain (pure functions), `bench/scan-receipts.mjs` reads the feed and keeps the list, `bench/scan-receipts-daily.sh` runs it daily and stamps the head, and `packages/website/public/verify-scan-receipts.mjs` is the one-file checker (a test makes sure it judges exactly like the module).

What a line holds: the SHA-256 of the job number, the SHA-256 of the report, the outcome, the coverage in percent, when it was delivered, when the line was written. No repository, no buyer, no report.

Check your own report (job number and the report file you received):

    curl -O https://tokenizen.nl/verify-scan-receipts.mjs
    node verify-scan-receipts.mjs scan-receipts.jsonl <job number> report.html
    ots verify <head file>.ots      # the date, from OpenTimestamps, outside our control

What it does not prove: which version of the code was scanned (the job record holds no commit), that the report is right, or that the code is safe. A chain can be rebuilt from the start; only the timestamp of the head dates it, and a timestamp is not an anchor until Bitcoin has confirmed it.

Not live yet: the feed route on the scan server is a proposed patch that waits for the owner's approval.
