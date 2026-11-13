// fiscal-check-bin.test.ts — exercises checkFiscalControls() directly (the
// testable core of the CLI), never main() or the entry-point guard itself:
// main() is a few lines of pure glue (read process.argv, print, return an
// exit code) over the already-tested core, the same judgment this package
// already makes for http-server-bin.ts (no test file at all, because it is
// "deliberately nothing but call startServer()"). Local-file cases use REAL
// temporary files and the real fs.readFileSync code path — not an injected
// read function — so these tests prove the actual file-reading code works,
// not a mock of it. URL cases inject fetchImpl (the same seam
// http-source.ts's own httpClaimSource already uses) so no test here ever
// makes a real network call.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFiscalControls, MAX_DOCUMENT_BYTES } from "./fiscal-check-bin.js";

const SPEND_CAP = {
  unit: "paid-attempts",
  max_per_window: 20,
  window_seconds: 3600,
  scope: "server-instance",
  persistence: "in-memory",
  reset_on_restart: true,
  reservation_before_settlement: true,
  pending_reservation_ttl_seconds: 600,
};

// Mirrors fiscal-controls.test.ts's own WELL_FORMED_CONTROL shape exactly
// (same field values where it matters), so this fixture is proven against
// the real schema's invariants, not a shape invented fresh for this file.
const VALID_CONTROL = {
  tool: "publish_reputation_feedback",
  paid: true,
  paid_action_surface: "broadcasts one on-chain transaction",
  signer_isolation: true,
  signer_custody: "a private key in an in-process wallet, isolated from caller funds and influence",
  spend_cap: SPEND_CAP,
  human_approval_threshold: null,
  charge_evidence: "the on-chain transaction itself",
  audit_trail: "the registry contract on-chain",
  next_safe_threshold: null,
  revocation_path: "rotate the key and redeploy",
};

// A second, differently-shaped entry: no server-held signer at all (null,
// not false — see fiscal-controls.ts's own header comment on that
// distinction) and no spend cap. Used to prove the CLI lists EVERY entry
// (not just the first) and formats both a present and an absent spend_cap /
// signer_isolation correctly.
const RECORD_DELIVERY_CONTROL = {
  tool: "record_delivery",
  paid: true,
  paid_action_surface: "writes one line to a local append-only ledger file",
  signer_isolation: null,
  signer_custody: null,
  spend_cap: null,
  human_approval_threshold: null,
  charge_evidence: "the ledger entry itself",
  audit_trail: null,
  next_safe_threshold: null,
  revocation_path: "n/a - no signer involved",
};

const VALID_DOCUMENT = { version: "2", controls: [VALID_CONTROL] };
const TWO_ENTRY_DOCUMENT = { version: "2", controls: [VALID_CONTROL, RECORD_DELIVERY_CONTROL] };
// The documented refinement violation (fiscal-controls.ts, found 13 nov
// 2026): signer_isolation true/false requires a non-null, non-empty
// signer_custody. Chosen deliberately over "just delete a required field"
// so this test proves a SPECIFIC, real business rule survives end to end
// through this CLI, not just that validation of some kind happened.
const INVALID_DOCUMENT = { version: "2", controls: [{ ...VALID_CONTROL, signer_custody: null }] };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fiscal-check-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("checkFiscalControls — local file", () => {
  it("a valid fixture: exit 0, reports the tool entry found with its spend_cap/signer_isolation/revocation_path", async () => {
    const path = writeFixture("valid.json", JSON.stringify(VALID_DOCUMENT));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toEqual([]);
    expect(outcome.stdout[0]).toMatch(/Found 1 tool entry:/);
    const line = outcome.stdout.find((l) => l.includes("publish_reputation_feedback"));
    expect(line, outcome.stdout.join("\n")).toBeDefined();
    expect(line).toContain("signer_isolation=true");
    expect(line).toMatch(/spend_cap=20 paid-attempts\/3600s \(server-instance, in-memory\)/);
    expect(line).toContain("revocation_path=rotate the key and redeploy");
  });

  it("an invalid fixture: exit 1, prints the specific validation error (signer_custody) with a path, under a clear header, nothing on stdout", async () => {
    const path = writeFixture("invalid.json", JSON.stringify(INVALID_DOCUMENT));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toEqual([]);
    expect(outcome.stderr[0]).toBe("Invalid fiscal-controls document:");
    expect(outcome.stderr.length).toBeGreaterThan(1);
    expect(outcome.stderr.some((l) => l.includes("signer_custody"))).toBe(true);
    // Every error line after the header is indented, one error per line (not
    // all errors crammed onto a single line) — this is what "one per line,
    // with its exact path" actually commits to, beyond just "mentions it somewhere".
    for (const line of outcome.stderr.slice(1)) expect(line.startsWith("  - ")).toBe(true);
  });

  it("an invalid fixture with THREE distinct errors (missing spend_cap.unit/scope/persistence, the exact multi-error case fiscal-controls.test.ts already proves): all three are printed, one per line — a truncate-to-first-error mutation would shrink this to 1", async () => {
    const doc = {
      version: "2",
      controls: [
        {
          ...VALID_CONTROL,
          // Only unit/scope/persistence omitted — the other three SpendCapSchema
          // fields are present, so this produces EXACTLY 3 errors, not more.
          spend_cap: { max_per_window: 20, window_seconds: 3600, reset_on_restart: true, reservation_before_settlement: true, pending_reservation_ttl_seconds: 600 },
        },
      ],
    };
    const path = writeFixture("multi-error.json", JSON.stringify(doc));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr[0]).toBe("Invalid fiscal-controls document:");
    const errorLines = outcome.stderr.slice(1);
    expect(errorLines, errorLines.join("\n")).toHaveLength(3);
    expect(errorLines.some((l) => l.includes("spend_cap.unit"))).toBe(true);
    expect(errorLines.some((l) => l.includes("spend_cap.scope"))).toBe(true);
    expect(errorLines.some((l) => l.includes("spend_cap.persistence"))).toBe(true);
  });

  it("malformed JSON: exit 1, says the file is not valid JSON, names the file, never a bare parser stack trace", async () => {
    const path = writeFixture("malformed.json", "{ this is not json");
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toHaveLength(1);
    expect(outcome.stderr[0]).toContain(path);
    expect(outcome.stderr[0]).toMatch(/not valid JSON/);
    expect(outcome.stderr[0]).not.toContain("\n    at "); // no raw V8 stack trace leaking through
  });

  it("a nonexistent path: exit 1, says file not found with the exact path, never a bare ENOENT error object", async () => {
    const path = join(dir, "does-not-exist.json");
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toEqual([`Error: file not found: ${path}`]);
  });

  it("a directory instead of a file: exit 1, a specific message distinct from file-not-found", async () => {
    const outcome = await checkFiscalControls(dir); // dir is a real, existing directory
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr[0]).toContain("is a directory, not a file");
    expect(outcome.stderr[0]).not.toContain("file not found");
  });

  it("a valid document with zero control entries: exit 0, says so, lists nothing — not an off-by-one on the count or a crash on an empty array", async () => {
    const path = writeFixture("empty.json", JSON.stringify({ version: "2", controls: [] }));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toEqual(["Valid fiscal-controls document (version 2). Found 0 tool entries:"]);
  });

  it("two control entries: BOTH are listed (not just the first), with the right spend_cap/signer_isolation shown for each, including the null/none case", async () => {
    const path = writeFixture("two.json", JSON.stringify(TWO_ENTRY_DOCUMENT));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout[0]).toMatch(/Found 2 tool entries:/);
    expect(outcome.stdout).toHaveLength(3); // header + exactly one line per entry
    const paid = outcome.stdout.find((l) => l.includes("publish_reputation_feedback"));
    const free = outcome.stdout.find((l) => l.includes("record_delivery"));
    expect(paid).toContain("signer_isolation=true");
    expect(free, outcome.stdout.join("\n")).toBeDefined();
    expect(free).toContain("spend_cap=none");
    // null, not "false" — record_delivery holds no signer at all, a different
    // claim from "holds one but it is not isolated" (fiscal-controls.ts).
    expect(free).toContain("signer_isolation=null");
    expect(free).toContain("revocation_path=n/a - no signer involved");
  });
});

describe("checkFiscalControls — URL (fetchImpl always injected, never a real network call)", () => {
  it("a successful fetch: exit 0, reports every tool entry, via the shared fetchJsonBounded guard (http-source.ts), not a second fetch path", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(TWO_ENTRY_DOCUMENT), { status: 200 })) as unknown as typeof fetch;
    const outcome = await checkFiscalControls("https://example.invalid/.well-known/fiscal-controls.json", { fetchImpl });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout[0]).toMatch(/Found 2 tool entries:/);
    expect(outcome.stdout.some((l) => l.includes("publish_reputation_feedback"))).toBe(true);
    expect(outcome.stdout.some((l) => l.includes("record_delivery"))).toBe(true);
  });

  it("an unreachable URL (fetchImpl rejects, e.g. DNS failure): exit 1, says it could not fetch, carries the underlying reason", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND example.invalid");
    }) as unknown as typeof fetch;
    const outcome = await checkFiscalControls("https://example.invalid/fiscal-controls.json", { fetchImpl });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toHaveLength(1);
    expect(outcome.stderr[0]).toMatch(/could not fetch/);
    expect(outcome.stderr[0]).toContain("ENOTFOUND");
  });

  it("a non-2xx response: exit 1, the status is visible in the message", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404, statusText: "Not Found" })) as unknown as typeof fetch;
    const outcome = await checkFiscalControls("https://example.invalid/fiscal-controls.json", { fetchImpl });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr[0]).toContain("404");
  });

  it("a 200 response whose body is not JSON: exit 1, says so specifically, never a bare JSON.parse stack trace", async () => {
    const fetchImpl = (async () => new Response("<html>definitely not json</html>", { status: 200 })) as unknown as typeof fetch;
    const outcome = await checkFiscalControls("https://example.invalid/fiscal-controls.json", { fetchImpl });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr[0]).toMatch(/not valid JSON/);
    expect(outcome.stderr[0]).not.toContain("\n    at ");
  });

  it("a fetched document that parses as JSON but fails schema validation is reported exactly like the local-file invalid case (one validator, one report path, regardless of source)", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(INVALID_DOCUMENT), { status: 200 })) as unknown as typeof fetch;
    const outcome = await checkFiscalControls("https://example.invalid/fiscal-controls.json", { fetchImpl });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toEqual([]);
    expect(outcome.stderr[0]).toBe("Invalid fiscal-controls document:");
    expect(outcome.stderr.some((l) => l.includes("signer_custody"))).toBe(true);
  });
});

describe("checkFiscalControls — SSRF / outbound guard (adversarial red-team, 13 nov 2026)", () => {
  // No fetchImpl injected anywhere in this block, and that is the point: these
  // calls go through this CLI's REAL default path exactly as a stranger running
  // `npx capacity-attest-fiscal-check <url>` would hit it. They still never reach
  // the network: for a literal address in a blocked range, net-guard's
  // guardedFetch throws (UnsafeHostError) BEFORE any socket is opened — see
  // ip-rules.ts's assertHostnameLiteralSafe, called synchronously from
  // assertSafeRequestUrl before undici's fetch ever runs — so this is a safe,
  // deterministic, offline test of the refusal itself, not a live probe.
  //
  // Before this file's fix (13 nov 2026): checkFiscalControls's URL branch
  // called fetchJsonBounded with `fetchImpl: deps.fetchImpl` — undefined by
  // default — which fetchJsonBounded (http-source.ts) then defaults to the
  // raw global `fetch`, with NO outbound guard at all. http-server.ts's own
  // httpClaimSource gets the guard only because ITS call site explicitly
  // passes `fetchImpl: guardedFetch` (http-server.ts:934); this CLI's call
  // site passed nothing. A stranger pointing this CLI at an attacker-chosen
  // URL (exactly this tool's documented use case: check ANY server's
  // well-known fiscal-controls.json) had their own machine make a real,
  // unguarded outbound request to wherever that URL pointed — classic SSRF,
  // including straight at 169.254.169.254, the cloud metadata address.
  for (const url of [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://localhost:8080/admin",
    "http://127.0.0.1:9/rpc",
    "http://10.0.0.1/internal",
  ]) {
    it(`refuses ${url} without making a request, via the same outbound guard http-server.ts's httpClaimSource uses`, async () => {
      const outcome = await checkFiscalControls(url); // no deps — the CLI's real default
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stdout).toEqual([]);
      expect(outcome.stderr).toHaveLength(1);
      expect(outcome.stderr[0]).toMatch(/publicly routable|link-local|loopback|private/i);
    });
  }

  it("a normal public-looking https URL still only fails for a network reason (DNS), never for being refused by the guard — the guard is not swallowing ordinary traffic", async () => {
    // example.invalid is itself unroutable per RFC 2606, but it is not a
    // LITERAL blocked address, so this exercises "the guard lets a real
    // hostname through to the DNS-resolution stage" rather than refusing on
    // sight — distinguishing "the guard fired" from "any URL just fails".
    const outcome = await checkFiscalControls("https://example.invalid/.well-known/fiscal-controls.json");
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr[0]).not.toMatch(/publicly routable|link-local|loopback|private address/i);
  });
});

describe("checkFiscalControls — local file memory/CPU exhaustion (adversarial red-team, 13 nov 2026)", () => {
  it("a local file over MAX_DOCUMENT_BYTES is refused by its stated size before being read into memory, never attempting readFileSync on the whole thing", async () => {
    const path = join(dir, "oversized.json");
    // One byte over the cap is enough to prove the boundary; the content need
    // not be valid JSON since the size check runs before any parsing.
    writeFileSync(path, Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x20));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toEqual([]);
    expect(outcome.stderr[0]).toContain(String(MAX_DOCUMENT_BYTES));
    expect(outcome.stderr[0]).toMatch(/limit|too large|larger/i);
  });

  it("a local file of exactly MAX_DOCUMENT_BYTES is NOT refused for size (boundary is >, not >=) — it proceeds to parsing and fails there instead, on different, specific grounds", async () => {
    const path = join(dir, "exactly-cap.json");
    // Padded with JSON whitespace so the exact byte count is both the cap AND
    // syntactically valid-ish JSON (an empty document would parse to nothing
    // useful); content doesn't matter beyond "not a size-limit rejection".
    const padding = " ".repeat(MAX_DOCUMENT_BYTES - Buffer.byteLength('{"version":"2","controls":[]}'));
    writeFileSync(path, padding + '{"version":"2","controls":[]}');
    const outcome = await checkFiscalControls(path);
    expect(outcome.stderr.join("\n")).not.toMatch(/limit|too large/i);
  });

  it("a local JSON file nested far past any real fiscal-controls document's shape is refused BEFORE JSON.parse runs on it, with a specific message naming the depth problem — not left to JSON.parse/validateFiscalControls to absorb the cost", async () => {
    const depth = 5000; // far past any real depth (document→controls[]→control{}→spend_cap{} ≈ 4), nowhere near stack-overflow territory either — this must be a REFUSAL on purpose, not an accidental crash
    const path = writeFixture("deeply-nested.json", "[".repeat(depth) + "]".repeat(depth));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toEqual([]);
    expect(outcome.stderr[0]).toMatch(/nest/i);
    expect(outcome.stderr[0]).not.toMatch(/not valid JSON/); // must be refused BEFORE JSON.parse, not surfaced as a parse error
  });

  it("a local JSON file nested at a realistic, shallow depth is NOT refused by the nesting guard (no false positive on ordinary input)", async () => {
    const path = writeFixture("shallow-nested.json", JSON.stringify(TWO_ENTRY_DOCUMENT));
    const outcome = await checkFiscalControls(path);
    expect(outcome.stderr.join("\n")).not.toMatch(/nest/i);
  });
});

describe("checkFiscalControls — non-UTF-8 local file bytes (adversarial red-team, 13 nov 2026)", () => {
  it("a file containing invalid UTF-8 byte sequences is refused with a specific error, never silently decoded with U+FFFD replacement characters and reported as a 'valid' document with mangled content", async () => {
    const path = join(dir, "bad-utf8.json");
    const prefix = Buffer.from('{"version":"2","controls":[{"tool":"t","paid":true,"paid_action_surface":"x","signer_isolation":null,"signer_custody":null,"spend_cap":null,"human_approval_threshold":null,"charge_evidence":null,"audit_trail":null,"next_safe_threshold":null,"revocation_path":"');
    const invalidBytes = Buffer.from([0xff, 0xfe, 0x80, 0x81]); // not valid UTF-8 under any interpretation
    const suffix = Buffer.from('"}]}');
    writeFileSync(path, Buffer.concat([prefix, invalidBytes, suffix]));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(1);
    // The old, buggy behavior: readFileSync(path, "utf-8") silently replaces
    // the bad bytes with U+FFFD and JSON.parse happily accepts the result,
    // so this would have been exitCode 0 with "revocation_path=rotate the
    // ���� key..." — a SUCCESS report built on silently corrupted content.
    expect(outcome.stdout).toEqual([]);
    expect(outcome.stderr[0]).toMatch(/utf-8/i);
    expect(outcome.stderr[0]).not.toContain("�");
  });

  it("a file with legitimate, valid multi-byte UTF-8 (Arabic, Chinese) is NOT rejected by the strict decoder — the fix must not break real international text", async () => {
    const doc = { version: "2", controls: [{ ...VALID_CONTROL, tool: "استرجاع_السمعة_中文_😀" }] };
    const path = writeFixture("valid-utf8.json", JSON.stringify(doc));
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout.some((l) => l.includes("استرجاع_السمعة_中文_😀"))).toBe(true);
  });
});

describe("URL vs. file routing", () => {
  it("only http:// and https:// prefixes are treated as a URL; anything else, including a path that merely contains the substring 'http', goes through the file reader", async () => {
    const path = writeFixture("http-in-the-name-but-a-file.json", JSON.stringify(VALID_DOCUMENT));
    expect(path).toContain("http"); // the fixture name itself contains "http", on purpose
    const outcome = await checkFiscalControls(path);
    expect(outcome.exitCode).toBe(0); // read as a file, not misrouted into a fetch
  });
});
