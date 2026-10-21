// checks.ts — the "attester process" that endpoint-attest itself deliberately
// does not ship (see endpoint-attest/README.md, "What this does not do": "It
// does not run the checks for you"). This file is that missing process for
// one first check: does the endpoint's OWN response, on a plain request, say
// anything about whether authentication is required.
//
// HARD RED LINE, same posture as wazir-al-ghanima's passive-only research
// scripts (dangling-domain-scan.mjs, shodan-enrich.mjs): this performs
// EXACTLY one plain HTTP GET to the endpoint, the same request a browser
// would make. It NEVER sends a POST, NEVER attempts an MCP
// initialize/tools-call handshake or any other protocol-level probe, NEVER
// supplies credentials, and NEVER writes anything.
//
// POSTURE (fail-closed, never falsely assuring). This check can lower
// confidence but must never manufacture it. A 401/403 on a bare GET is a
// POSITIVE SIGNAL but NOT proof: it says nothing about whether the actual MCP
// surface (JSON-RPC over POST) requires auth, and the endpoint is controlled
// by the party being attested, who can return any status. So 401/403 is
// recorded as INCONCLUSIVE with the signal noted, never signed as "passed".
// "passed" is reserved for a future check that actually demonstrates a
// positive (e.g. an authenticated-vs-unauthenticated comparison on the
// consent-gated active path), so the attester never signs assurance it did not
// establish. An explicit, literal "no auth required"-style admission in the
// body IS signed as "failed": that is the endpoint self-reporting a negative in
// its own words, and erring toward a recorded concern is the safe direction.
// Everything else is inconclusive, never guessed — silently upgrading "we could
// not tell" into a verdict is exactly the untested overreach Al-Mizaan Poort 7b
// forbids.
//
// PURE VS NETWORK: fetchImpl is injected, same DI seam as
// endpoint-attest/src/ownership.ts's OwnershipCheckDeps, so this is fully
// unit-testable without a real socket.

export interface CheckDeps {
  /** REQUIRED: the caller must inject a fetch. server.ts injects net-guard's
   * guardedFetch so the endpoint URL (attacker-supplied) cannot be turned into
   * an SSRF probe; removing the old `?? fetch` default makes "forgot to guard"
   * a type error rather than a silent hole. Tests inject a stub. */
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

export type CheckOutcome = "passed" | "failed" | "inconclusive";

export interface CheckFinding {
  check: string;
  outcome: CheckOutcome;
  detail: string;
  status?: number;
  bodySnippet?: string;
}

export interface CheckResult {
  /** Names of every check that was actually run — feeds directly into AttestationContent.checksPerformed, which must be non-empty by schema. */
  checksPerformed: string[];
  outcome: CheckOutcome;
  findings: CheckFinding[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
// Enough to read an ordinary status/error page; this is a passive text scan
// of a public response, not a proof-token verification, so an oversized body
// is truncated rather than refused outright (contrast with ownership.ts's
// stricter MAX_FILE_BYTES posture, which is guarding a very different thing:
// a proof the caller is meant to have published deliberately and small).
const MAX_BODY_BYTES = 16 * 1024;
const CHECK_NAME = "auth-signal-on-plain-get";

// Literal phrases a server might use to ADMIT, in its own words, that no
// authentication is required. Matched case-insensitively as a substring.
// Deliberately narrow and literal: matched ONLY against text the endpoint
// itself actually returned, never inferred from the mere absence of a
// challenge (see the "inconclusive" branch below).
const NO_AUTH_PHRASES = [
  "no authentication required",
  "no auth required",
  "authentication is not required",
  "no authentication is required",
  "no api key required",
  "publicly accessible without authentication",
];

/**
 * Run the one check this attester currently performs: a single, passive GET
 * to `endpoint`, then read what the endpoint's OWN response says about
 * authentication. Never throws — a network failure, a read failure, or an
 * ambiguous response are all reported as structured findings with an
 * "inconclusive" outcome rather than an uncaught exception, matching
 * endpoint-attest's own posture of degrading untrusted-input/network
 * failures to a normal result instead of propagating them.
 */
export async function runChecks(endpoint: string, deps: CheckDeps): Promise<CheckResult> {
  const fetchImpl = deps.fetchImpl;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return singleFindingResult({
      check: CHECK_NAME,
      outcome: "inconclusive",
      detail: `GET failed before any response was received: ${(e as Error).message}`,
    });
  }

  let body: string;
  try {
    body = await readBounded(response, MAX_BODY_BYTES);
  } catch (e) {
    return singleFindingResult({
      check: CHECK_NAME,
      outcome: "inconclusive",
      status: response.status,
      detail: `response received (status ${response.status}) but its body could not be read: ${(e as Error).message}`,
    });
  }

  const lowerBody = body.toLowerCase();
  const bodySnippet = body.slice(0, 500);

  // A challenge status on a bare, unauthenticated GET is a POSITIVE SIGNAL but
  // not proof: it does not establish that the MCP surface (JSON-RPC over POST)
  // enforces auth, and the endpoint is controlled by the attested party. Record
  // it as inconclusive with the signal noted; never sign "passed" from it.
  if (response.status === 401 || response.status === 403) {
    return singleFindingResult({
      check: CHECK_NAME,
      outcome: "inconclusive",
      status: response.status,
      bodySnippet,
      detail: `plain GET was challenged with HTTP ${response.status} — a positive signal that some auth is enforced, but a bare GET cannot establish that the MCP method surface (JSON-RPC over POST) requires auth, so this is recorded as an observation rather than a passing verdict`,
    });
  }

  const admittedPhrase = NO_AUTH_PHRASES.find((p) => lowerBody.includes(p));
  if (admittedPhrase) {
    return singleFindingResult({
      check: CHECK_NAME,
      outcome: "failed",
      status: response.status,
      bodySnippet,
      detail: `the endpoint's own response admits, in its own words, that no authentication is required (matched phrase: ${JSON.stringify(admittedPhrase)})`,
    });
  }

  return singleFindingResult({
    check: CHECK_NAME,
    outcome: "inconclusive",
    status: response.status,
    bodySnippet,
    detail: `plain GET returned HTTP ${response.status} with no auth challenge and no explicit "no authentication required"-style admission in the body — a passive GET alone cannot determine this endpoint's authentication posture either way`,
  });
}

function singleFindingResult(finding: CheckFinding): CheckResult {
  return { checksPerformed: [finding.check], outcome: finding.outcome, findings: [finding] };
}

/** Read a response body up to maxBytes, truncating (not throwing) once the bound is hit — this is scanning an ordinary public page, so a body larger than the bound is read partially rather than refused outright. */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const stream = response.body;
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        chunks.push(value);
        if (total >= maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
  } catch (e) {
    throw new Error(`reading response body failed: ${(e as Error).message}`);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
    .toString("utf-8")
    .slice(0, maxBytes);
}
