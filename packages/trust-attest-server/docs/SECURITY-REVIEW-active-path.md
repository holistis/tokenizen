# Internal adversarial security review: consent-gated active path

Status: INTERNAL review of branch `feat/consent-gated-active-trust-checks`, before any
merge. This was our own adversarial review, not an external audit, and no third party
has verified it. The branch is NOT merge-ready until the items below are resolved.

Scope: the new active path (`fetch-tools.ts`, `tool-chain-check.ts`) and its wiring in
`server.ts`, plus the interaction with the existing passive check in `checks.ts`.

6 review angles, 14 issues raised, 13 confirmed after adversarial verification.

## A. SSRF / outbound egress (highest priority) — confirmed HIGH + MEDIUM

The outbound probe (both the existing passive GET in checks.ts and the new active MCP
connect in fetch-tools.ts) connects to the caller-supplied `endpoint` with NO egress
restriction: no private-range / loopback / link-local / cloud-metadata denylist, no IP
pinning, and the MCP HTTP transports follow redirects.

1. (HIGH) dns-txt ownership proof only checks a TXT record at `_endpoint-attest.<host>`,
   never the host's A/AAAA record. An attacker owns a throwaway domain, publishes the
   TXT token AND points the A record at an internal IP (169.254.169.254, 127.0.0.1,
   10.x). Ownership "passes", then the probe connects to the internal target. The owner
   and the consenter are the attacker; the SSRF victim is the server operator's network.
2. (MEDIUM) No DNS pinning between the proof fetch and the active connect: DNS-rebinding
   TOCTOU even for well-known-file (serve the token from a public IP at proof time, flip
   DNS to internal before the connect).
3. (MEDIUM) The MCP HTTP transports follow redirects, so even a proven host can 302 the
   probe to an internal target.
4. (HIGH) Same root cause framed from the consent angle: the active handshake reaches a
   target whose real network location was never proven.

Data-exfil / oracle channel that makes it worse: `findings[].bodySnippet` echoes up to
500 bytes of the internal response, the connect error carries an open/closed/timeout
port oracle, and MCP tool names/descriptions of an internal MCP target are echoed into
findings.

Remediation: one shared egress guard, applied to BOTH the passive GET and the active
connect. Resolve the host, reject private/loopback/link-local/unique-local/metadata
ranges (v4 and v6), PIN the resolved IP and connect to that pinned IP for the actual
request (defeats rebinding), and disable redirect-following (or re-check every redirect
target against the guard). This also closes the pre-existing passive-path SSRF, which
this branch escalates from one GET to a full MCP handshake.

## B. Resource / DoS — confirmed HIGH + LOW

6. (HIGH) SSE-fallback connect can hang forever: the `{ timeout }` option does not cover
   the transport's own start(). A malicious endpoint fails the Streamable HTTP attempt
   fast, then hangs the SSE connect.
7. (HIGH) Unbounded tools/list + O(sources x sinks) enumeration: a consenting malicious
   endpoint returns tens of thousands of tools each crafted as both source and sink,
   producing a combinatorial explosion of finding strings and CPU/memory exhaustion.
5. (LOW) The MCP client/transport leaks when both connects fail.
8. (LOW) try/finally does not cover the connect() calls; close-on-connect-failure relies
   on undocumented SDK-internal behavior.

Remediation: wrap the whole fetch (both transports + listTools) in ONE hard overall
deadline via Promise.race, not just the per-call option. Cap the number of tools
processed (e.g. first N, record truncation) and cap the number of chains enumerated.
Always close the client in a finally that covers the connect attempts.

## C. Classification soundness — confirmed HIGH + MEDIUM

10. (HIGH) SINK_RE/SOURCE_RE vocabulary and word-boundary gaps let a genuinely dangerous
    server score "passed" — a false positive signal in a SIGNED attestation, breaking the
    fail-closed posture.
11. (MEDIUM) Over-broad CONFIRMATION_RE ("cannot .*without", "will not .*without")
    downgrades a real ungated chain from "failed" to "inconclusive" (e.g. "cannot run
    without a valid API key" wrongly reads as a confirmation gate).
12. (MEDIUM) Filler-word matches (SINK_RE "run" matching "run time") flag benign
    read-only tools, self-pairing a single harmless tool to "failed".

Remediation, fail-closed: the regex heuristic is too crude to justify signing a "passed"
safety claim. Change the heuristic so it NEVER emits "passed" on its own — only "failed"
(a clear ungated source-to-sink) or "inconclusive" (everything else, including "no chain
found: descriptions may be too sparse to tell"). Tighten CONFIRMATION_RE to real
confirmation phrasings, and reduce filler-word false matches (drop/again-bound the
weakest tokens like bare "run"). Accuracy of a keyword heuristic is inherently limited;
the honest fix is to make its ceiling "inconclusive", never a reassuring "passed".

## D. Consent binding — confirmed HIGH

13. (HIGH) The active handshake is gated on caller-ASSERTED consent (a boolean), not on
    owner-AUTHENTICATED consent. Because a passive ownership proof persists (owners keep
    the DNS/well-known record live for the 30-day window), a different caller can set
    consentToActiveTesting=true against someone else's still-proven endpoint and trigger
    active probing the real owner never authorized.

Remediation: bind consent to the owner's authenticated action, not a free-floating flag.
Options to decide: fold a consent marker into the published proof token itself (a distinct
challenge for active testing), or require the active test to run only in the same flow as
a fresh proof, so "consent" cannot be asserted by a third party riding a persistent proof.

## E. Attestation honesty — confirmed LOW

9. (LOW) checksPerformed lists the active check as performed even when it never connected
   (the finding is correctly "inconclusive", but the signed list implies a test ran).
   Remediation: keep the check name only when a connection/listing actually happened, or
   make the inconclusive detail unambiguous that no active contact occurred.

## Order of work

1. Shared egress guard (A) — blocks the HIGH SSRF on both paths.
2. Fail-closed classification (C #10) — stop signing a false "passed".
3. Consent binding (D #13) — a design choice, flag to the king if it changes the flow.
4. DoS hardening (B).
5. Classification tuning (C #11, #12) and attestation honesty (E).

No merge, no live deploy, no public mention until A, C#10 and D are resolved and re-reviewed.

---

# Full trust-layer Majlis al-Muraqaba (whole system, not just the active path)

Status: INTERNAL review of the ENTIRE trust layer (capacity-attest, endpoint-attest,
trust-attest-server, self-check-server), requested to be sure no OTHER leaks exist. Our
own adversarial review, not an external audit. 8 angles, 25 raised, 16 confirmed after
adversarial verification (1 high, 12 medium, 3 low). Most of these are in the EXISTING
product, not this branch. The branch is not merge-ready and the existing packages need
these fixes too.

## Dominant theme: the egress guard exists but is applied in only ONE place

self-check-server/src/network-guard.ts has a correct-ish private/loopback/link-local/
ULA/metadata blocklist (assertPubliclyRoutableHost), but it is imported ONLY by
self-check-server/app.ts. Every other outbound path in the system is unguarded.

### SSRF / egress (systemic)
1. (MEDIUM) capacity-attest/src/erc8004.ts: the shipped `resolve_agent_identity` MCP tool takes a caller-supplied rpcUrl, validated by scheme only (isHttpUrl), then makes JSON-RPC POSTs to it. Blind SSRF with a reachability oracle (differentiated reason strings). Same unguarded pattern also in http-source.ts, eas.ts, erc8004-reputation.ts.
7. (HIGH) self-check-server/src/app.ts: redirect-following SSRF. network-guard validates only the FIRST hop; verifyOwnership then follows 3xx redirects to internal targets and leaks their status back. The guard's own "known limits" never mention redirects (#16).
2. (MEDIUM) endpoint-attest/src/ownership.ts: well-known-file proof follows cross-origin redirects, so the token need not be served by the attested host.
15. (MEDIUM) endpoint-attest/src/schema.ts: ownershipProof.location/token are never bound to `endpoint`; verifyAttestation returns ok:true for a proof about a DIFFERENT host.
3. (LOW) ownership.ts: proof accepted over plaintext http://, token is public, so weaker than the ACME shape it mirrors.

### DoS / rate-limit / resource
8. (MEDIUM) self-check-server/rate-limit.ts: req.ip with no trust-proxy config = one global bucket behind a proxy; bypassable per-/128 over IPv6.
9/11. (MEDIUM) rate-limit.ts: bucket map never evicted/capped = unbounded memory DoS.
10. (MEDIUM) network-guard.ts: uncancellable dns.lookup() with no timeout = libuv threadpool exhaustion.
4/12. (MEDIUM) capacity-attest/eas.ts: EAS source materializes unbounded uids and one RPC per uid, and JSON.parses each with no byte cap, BEFORE discovery's per-source cap applies.
5. (LOW) erc8004.ts: chainId coerced via BigInt() with no digit-length bound (sibling agentId IS capped) = bignum-parse DoS.
13. (LOW) trust-attest-server/tool-chain-check.ts: CONFIRMATION_RE backtracks O(n^2) on unbounded attacker tool descriptions (ReDoS, distinct from the tool-count O(n^2)).

### Correctness / claims-vs-code / secrets
14. (MEDIUM) trust-attest-server/checks.ts: signs outcome "passed" on any 403, inferring auth-enforcement the README says it never guesses.
6. (MEDIUM) self-check-server/app.ts: the public /check process is forced to hold the attester signing private key it never uses (needless secret exposure surface).

## Consolidated remediation (supersedes the per-path plan above)

1. ONE shared egress guard module, reused everywhere (extract/generalise network-guard.ts): resolve host, reject private/loopback/link-local/ULA/metadata (v4+v6), PIN the resolved IP, add a DNS timeout, and RE-VALIDATE every redirect hop (or disable redirects). Apply to: endpoint-attest ownership.ts; trust-attest-server checks.ts + fetch-tools.ts; capacity-attest erc8004.ts, erc8004-reputation.ts, eas.ts, http-source.ts; and fix the first-hop-only gap in self-check-server (#7).
2. Fail-closed classification in tool-chain-check.ts (never sign "passed"); also bound the regexes (ReDoS, #13) and cap tool count.
3. Bind ownershipProof to endpoint in the schema (#15); stop following redirects / require https on proofs (#2, #3).
4. Rate-limit: fix trust-proxy + IPv6 /64 bucketing + evict/cap the map (#8, #9, #11).
5. Cap EAS/discovery materialisation + byte caps (#4, #12); bound chainId digits (#5).
6. Do not hold the signing key in the public /check process (#6).
7. Reconsider the 403 "passed" inference (#14) toward fail-closed.
8. Consent binding (#13 from the active-path review) remains.

Re-run the full Majlis after remediation. No merge, no live, no public mention until the
SSRF cluster (egress guard everywhere + redirect re-validation + proof-endpoint binding)
and the fail-closed classification are resolved and re-reviewed.

---

# Elite / proactive remediation architecture (prevent the class, not just the 16)

Goal set by the king: act as a cybersecurity elite, as if this product were mine, so this
CLASS of bug cannot recur. The root cause of the SSRF cluster is NOT "a missing check" but
"the check exists (network-guard.ts) and is not on the only road out". So the fix is
structural, not a set of patches.

1. One enforced egress choke-point. A shared package (packages/net-guard) generalises the
   existing self-check-server/network-guard.ts and exposes the ONLY sanctioned way to make
   an outbound request: a guardedFetch and a guarded transport/RPC factory. Every outbound
   call in every package routes through it. It:
   - resolves the host, rejects private/loopback/link-local/ULA/metadata ranges (v4+v6),
   - PINS the resolved IP into the actual connection (closes the DNS-rebinding gap the
     existing guard documents but does not fix),
   - RE-VALIDATES every redirect hop against the same ranges (closes #7/#16), or refuses
     redirects,
   - carries a hard DNS + connect + overall timeout (closes #10) and a response byte cap.
2. Fail-closed by default: ambiguity resolves to "refuse"/"inconclusive", never a guessed
   "passed" (classification and the 403 inference, #14).
3. Proof that it stays closed: regression tests asserting internal IPs, redirects and
   rebinding are all blocked, plus the fail-closed classification cases.
4. A guard on the build road: a test (and, if feasible, an ESLint rule) that FAILS if any
   package introduces a raw fetch / new JsonRpcProvider / new MCP transport outside the
   net-guard choke-point. This is what stops the class from silently returning: a future
   change cannot add an unguarded outbound path and still pass.
5. Limits baked into the shared layer as defaults (timeouts, byte caps, result caps), so a
   caller gets them without having to remember.

This turns "we fixed 16 findings" into "an unguarded outbound call is now structurally
impossible to ship", which is the cybersecurity-elite bar, not a patch bar.

Execution note: this is security-critical code; it is built carefully and tested, not
rushed. Done on the branch, behind a PR, re-audited by a fresh full Majlis before any
merge or deploy. Nothing live or public until then.
