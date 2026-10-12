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
