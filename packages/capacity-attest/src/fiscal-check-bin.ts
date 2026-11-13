#!/usr/bin/env node
// fiscal-check-bin.ts — standalone consumer CLI for capacity-attest's
// fiscal-controls validator. validateFiscalControls() (fiscal-controls.ts)
// is documented as being "for a stranger to check any server's claim, not
// just ours", but until now nothing actually exposed it as a runnable tool —
// a stranger would have had to install this whole package and write their
// own script just to call it. `npx capacity-attest-fiscal-check <url-or-file>`
// is that tool: fetch (or read) a fiscal-controls document, validate it, and
// print a plain-language report, with no capacity-attest-specific knowledge
// required beyond the URL or file path itself.
//
// The real target this is built against: http-server.ts's own
// `GET /.well-known/fiscal-controls.json` route (see fiscal-controls.test.ts,
// "the real HTTP route, no payment, no auth") — any MCP server publishing a
// document at that well-known path, ours or a third party's, is something
// this CLI can check directly, e.g.:
//   npx capacity-attest-fiscal-check https://example.com/.well-known/fiscal-controls.json
//
// WHY THIS FILE DOES ITS OWN THING, NOT http-server-bin.ts's SPLIT: that
// file is deliberately nothing but `startServer()` — the real logic lives in
// http-server.ts, a 1000+ line module independently imported by many other
// test files. This tool is small and has exactly one consumer (its own test
// file), so the testable logic (checkFiscalControls) and the thin CLI glue
// (main, the entrypoint guard below) live together in one file rather than
// splitting off a second module nothing else would ever import.
//
// REUSE, NOT A SECOND FETCH PATH: the URL branch below calls
// fetchJsonBounded (http-source.ts) — the same timeout + bounded-read +
// parse guard httpClaimSource already uses for the delivery-claims
// protocol, extracted there so this CLI does not inline a second copy of
// that sequence. See fetchJsonBounded's own doc comment in http-source.ts.
//
// OUTBOUND GUARD (adversarial red-team finding, 13 nov 2026, the most
// severe one found): fetchJsonBounded itself applies NO outbound guard —
// by its own doc comment it "deliberately does NOT check the parsed
// shape", and the same division of responsibility means it does not pick a
// fetchImpl either; that is each CALLER's job. http-server.ts's own
// httpClaimSource gets net-guard's protection only because ITS call site
// explicitly passes `fetchImpl: guardedFetch` (http-server.ts:934); this
// file's checkFiscalControls previously passed `deps.fetchImpl` straight
// through — undefined in every real run, since main() below never sets
// it — so fetchJsonBounded fell back to the raw global `fetch` with no
// guard at all. Confirmed by running the real default path (no injected
// fetchImpl) against http://169.254.169.254/..., http://127.0.0.1:9/rpc
// and http://10.0.0.1/internal: this CLI made genuine, unguarded outbound
// connection attempts to all three (the 10.0.0.1 case hung until timeout —
// a real TCP SYN went out). That is the exact threat no-raw-egress.test.ts
// (net-guard) exists to catch, just arriving through a CLI entry point
// that file's own GUARDED_PACKAGES list does not scan. Defaulting to
// net-guard's guardedFetch here — still overridable by deps.fetchImpl, so
// every existing test's injected fetchImpl keeps working unchanged — closes
// it the same way http-server.ts already does, without copying guard logic
// into this file.
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateFiscalControls, FiscalControlsDocumentSchema, type FiscalControl, type SpendCap } from "./fiscal-controls.js";
import { fetchJsonBounded } from "./http-source.js";
import { guardedFetch } from "tokenizen-net-guard";

export interface CheckFiscalControlsDeps {
  /** Injection seam for tests: forwarded to fetchJsonBounded's own fetchImpl. Defaults to net-guard's guardedFetch (NOT the raw global fetch — see the outbound-guard comment above), so an uninjected real run still refuses a private/loopback/link-local/metadata target. Unused for a local file path. */
  fetchImpl?: typeof fetch;
}

// A real fiscal-controls document is a handful of tool entries, a few
// hundred bytes each (see this file's own VALID_CONTROL test fixture and
// fiscal-controls.test.ts) — even a few thousand tools would stay well
// under a few MB. http-source.ts's own fetchJsonBounded defaults to 16 MiB
// because IT is shared infrastructure sized for "thousands of real
// [delivery] claims" (its own header comment); this CLI expects exactly one
// small, fixed document shape, so it asks fetchJsonBounded for a much
// tighter bound on the URL path, and enforces the SAME bound itself on the
// local-file path (which fetchJsonBounded never touches, and which
// previously had NO size bound at all — an arbitrarily large local file was
// read entirely into memory via readFileSync before anything could refuse
// it). Measured directly (13 nov 2026): a 16 MiB payload consisting purely
// of JSON array nesting — a shape no real fiscal-controls document would
// ever have, see MAX_JSON_NESTING_DEPTH below — drove Node's RSS to ~635 MB
// during JSON.parse alone. A tighter cap here shrinks that worst case
// proportionally (8x) on both paths, on top of the depth guard below.
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

// JSON.parse itself does NOT stack-overflow on deep array/object nesting in
// modern V8 (measured: 10,000,000 levels of "[" parses in ~4s without
// throwing) — the stack-overflow class schema.ts's own exceedsMaxDepth
// guards against (ClaimContentSchema's promisedSpec, found 2026-08-31) is a
// DIFFERENT mechanism: recursive canonicalize()/zod walking an already-
// parsed, deeply nested OBJECT, which FiscalControlsDocumentSchema has no
// field shaped to invite (no promisedSpec-like arbitrary-depth field
// exists here). The real cost measured for THIS schema's threat model is
// JSON.parse's own memory allocation: at MAX_DOCUMENT_BYTES of pure
// bracket nesting, RSS still reaches well over 100x the input size. No
// real fiscal-controls document ever nests past document→controls[]→
// control{}→spend_cap{} (depth 4); this cap leaves a wide, deliberately
// generous margin over that while refusing anything that looks like an
// attempt to make JSON.parse do expensive, pointless work — checked on the
// RAW TEXT, before JSON.parse ever runs, so the cost is never paid at all.
const MAX_JSON_NESTING_DEPTH = 64;

/**
 * True if `raw` contains `{`/`[` nesting deeper than `maxDepth` at any
 * point, scanning once over the text and tracking whether each character is
 * inside a (possibly backslash-escaped) JSON string — a brace or bracket
 * inside a string value is text, not structure, and must not be counted.
 * Deliberately does not validate that `raw` is otherwise well-formed JSON;
 * JSON.parse (run afterward, only if this returns false) is still the one
 * source of truth for "is this valid JSON at all".
 */
function exceedsJsonNestingDepth(raw: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      depth++;
      if (depth > maxDepth) return true;
    } else if (c === "}" || c === "]") {
      if (depth > 0) depth--;
    }
  }
  return false;
}

/** The strict decoder every local-file read below uses instead of readFileSync's own lossy "utf-8" mode — see formatFileReadError's ETOOLARGE/EINVALIDUTF8 comment for why. Constructed once; TextDecoder instances are stateless/reusable across decode() calls given no streaming option is used. */
const STRICT_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export interface CheckOutcome {
  /** 0 = valid document, 1 = invalid document OR any fetch/read/parse failure — matches this CLI's documented process exit code. */
  exitCode: 0 | 1;
  /** Report lines for a successful validation (which tool entries were found, one summary line each). Empty on failure. */
  stdout: string[];
  /** Error lines: a one-line failure summary, or "Invalid fiscal-controls document:" followed by one validation error per line. Empty on success. */
  stderr: string[];
}

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Turn a raw fs error into one of this CLI's own documented specific
 * failure messages instead of a generic, code-less one — ENOENT ("file not
 * found") is the one a stranger pointing this at a typo'd path hits most
 * often, so it gets its own exact wording rather than falling through to
 * the generic branch below.
 *
 * ETOOLARGE is not a real Node errno — it is this file's own synthetic code
 * (thrown by checkFiscalControls's statSync check below, never by fs
 * itself) for "refused before reading", routed through this same function
 * so every file-read-stage failure shares one formatting path. Its message
 * is already complete at the throw site (it names the actual size and the
 * limit), so this just passes it through rather than re-deriving it.
 */
function formatFileReadError(path: string, e: unknown): string {
  const code = e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
  if (code === "ENOENT") return `file not found: ${path}`;
  if (code === "EISDIR") return `${path} is a directory, not a file`;
  if (code === "EACCES") return `permission denied reading ${path}`;
  if (code === "ETOOLARGE") return errorMessage(e);
  return `could not read ${path}: ${errorMessage(e)}`;
}

function summarizeSpendCap(cap: SpendCap | null): string {
  if (cap === null) return "none";
  return `${cap.max_per_window} ${cap.unit}/${cap.window_seconds}s (${cap.scope}, ${cap.persistence})`;
}

/** One summary line per tool entry: spend_cap/signer_isolation/revocation_path, as the module doc comment promises. */
function summarizeControl(control: FiscalControl): string {
  const signerIsolation = control.signer_isolation === null ? "null" : String(control.signer_isolation);
  return `spend_cap=${summarizeSpendCap(control.spend_cap)}, signer_isolation=${signerIsolation}, revocation_path=${control.revocation_path}`;
}

function fail(message: string): CheckOutcome {
  return { exitCode: 1, stdout: [], stderr: [`Error: ${message}`] };
}

/**
 * candidate has already passed validateFiscalControls (called first below,
 * in every caller), so re-running it through the SAME schema's .parse() on
 * the SAME value cannot newly fail — this only re-parses to get a typed
 * `controls` array for display, not a second validation pass. The one case
 * where re-reading a candidate twice could disagree with itself — a hostile
 * object with a value-changing getter — cannot reach here: both call sites
 * below pass this function a plain JSON.parse() result (one directly, one
 * via fetchJsonBounded's own internal JSON.parse), and JSON.parse never
 * produces accessor properties, only plain data — the same reasoning
 * fiscal-controls.ts's own header comment gives for why that threat model
 * does not apply to real JSON-over-HTTP.
 */
function report(candidate: unknown): CheckOutcome {
  const result = validateFiscalControls(candidate);
  if (!result.valid) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: ["Invalid fiscal-controls document:", ...(result.errors ?? []).map((e) => `  - ${e}`)],
    };
  }
  const document = FiscalControlsDocumentSchema.parse(candidate);
  const count = document.controls.length;
  return {
    exitCode: 0,
    stdout: [
      `Valid fiscal-controls document (version ${document.version}). Found ${count} tool ${count === 1 ? "entry" : "entries"}:`,
      ...document.controls.map((c) => `  - ${c.tool}: ${summarizeControl(c)}`),
    ],
    stderr: [],
  };
}

/**
 * The testable core: fetch (a http:// or https:// URL) or read (a local
 * path) `input`, parse it as JSON, validate it, and return a structured
 * report plus the exit code this CLI's own documented contract promises (0
 * valid, 1 everything else) — never throws, so main() below can always
 * print and exit cleanly, and a test can call this directly with no
 * process/console involved at all.
 */
export async function checkFiscalControls(input: string, deps: CheckFiscalControlsDeps = {}): Promise<CheckOutcome> {
  try {
    if (isHttpUrl(input)) {
      let candidate: unknown;
      try {
        // deps.fetchImpl ?? guardedFetch, NOT deps.fetchImpl alone — see the
        // outbound-guard header comment above. maxResponseBytes: MAX_DOCUMENT_BYTES
        // overrides fetchJsonBounded's own generic 16 MiB default with the
        // tighter bound sized for this CLI's one small document shape.
        candidate = await fetchJsonBounded(input, {
          fetchImpl: deps.fetchImpl ?? guardedFetch,
          maxResponseBytes: MAX_DOCUMENT_BYTES,
        });
      } catch (e) {
        return fail(`could not fetch ${input}: ${errorMessage(e)}`);
      }
      return report(candidate);
    }

    // Local-file path: stat before read, so an oversized file is refused
    // without ever being buffered whole into memory (readFileSync has no
    // size bound of its own), and a directory gets this function's own
    // specific EISDIR wording rather than whatever readFileSync would have
    // thrown reaching for its content. statSync itself still throws the
    // genuine ENOENT/EACCES fs errors for formatFileReadError to handle.
    let rawBuf: Buffer;
    try {
      const stat = statSync(input);
      if (stat.isDirectory()) {
        throw Object.assign(new Error(`${input} is a directory`), { code: "EISDIR" });
      }
      if (stat.size > MAX_DOCUMENT_BYTES) {
        throw Object.assign(
          new Error(`${input} is ${stat.size} bytes, over this CLI's ${MAX_DOCUMENT_BYTES}-byte limit — refused before reading it into memory`),
          { code: "ETOOLARGE" },
        );
      }
      rawBuf = readFileSync(input);
    } catch (e) {
      return fail(formatFileReadError(input, e));
    }

    // Strict UTF-8 decode, not readFileSync's own lossy "utf-8" mode: that
    // mode silently replaces any invalid byte sequence with U+FFFD and
    // keeps going, so a file with corrupted or non-UTF-8 bytes could still
    // parse as valid JSON and be reported "valid" with mangled field
    // content — no error, no warning, just quietly wrong output from a tool
    // whose entire purpose is an honest report on someone else's document.
    let raw: string;
    try {
      raw = STRICT_UTF8_DECODER.decode(rawBuf);
    } catch {
      return fail(`${input} contains bytes that are not valid UTF-8 — refusing to guess at the intended text`);
    }

    if (exceedsJsonNestingDepth(raw, MAX_JSON_NESTING_DEPTH)) {
      return fail(`${input} is nested more than ${MAX_JSON_NESTING_DEPTH} levels deep — refused before parsing, far past any real fiscal-controls document's shape`);
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch (e) {
      return fail(`${input} is not valid JSON: ${errorMessage(e)}`);
    }
    return report(candidate);
  } catch (e) {
    // Last-resort safety net: every anticipated failure above already
    // returns a clean CheckOutcome. This only catches something genuinely
    // unanticipated, so the CLI still never shows a bare stack trace to
    // whoever is running it — the same exposure-check http-server.ts
    // applies to every request handler, applied here to this CLI's output.
    return fail(`unexpected error: ${errorMessage(e)}`);
  }
}

async function main(): Promise<number> {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: capacity-attest-fiscal-check <url-or-file-path>");
    console.error("  Fetches (http:// or https://) or reads (a local path) a fiscal-controls");
    console.error("  document and validates it against capacity-attest's FiscalControlsDocumentSchema.");
    return 1;
  }
  const outcome = await checkFiscalControls(input);
  for (const line of outcome.stdout) console.log(line);
  for (const line of outcome.stderr) console.error(line);
  return outcome.exitCode;
}

// Entry-point guard: run main() only when this file is the actual process
// entrypoint (npx capacity-attest-fiscal-check / node dist/fiscal-check-bin.js),
// never as an import-time side effect — fiscal-check-bin.test.ts imports
// checkFiscalControls directly from this same file, and must not trigger a
// real CLI run (console output, process.exit) just by doing that.
//
// http-server.ts documents, at length, why IT deliberately avoids exactly
// this import.meta.url-vs-process.argv[1] comparison for its OWN entrypoint:
// under PM2 fork mode the comparison silently evaluated to false, so a
// long-running SERVER never started, with no crash to even signal the
// problem — which is why that file's real entrypoint is a separate,
// untested http-server-bin.ts instead. That failure mode is specific to a
// DAEMON managed by a process supervisor that may wrap or re-exec node.
// capacity-attest-fiscal-check is a one-shot CLI a human runs directly (or
// via npx) that exits immediately after — there is no supervisor re-exec
// step here for this comparison to be fooled by, and if it were ever wrong,
// running this file's own test suite (where process.argv[1] is vitest's own
// entry script, never this file) would fail loudly and immediately, not
// silently in production the way a never-started server would.
// EXIT CODE VS. FLUSHED OUTPUT (adversarial red-team finding, 13 nov 2026):
// process.exit(code) terminates the process immediately, without waiting
// for pending I/O — and per Node's own documented stdout/stderr semantics,
// writing to a PIPE (as opposed to a file or TTY) is asynchronous on every
// platform (POSIX: pipes are async; Windows: pipes/sockets are always
// async, for both stdout and stderr). A shell script that runs
// `capacity-attest-fiscal-check big.json | somewhere` — exactly the
// documented use case, checking a real server's document that may list
// many tools — pipes this CLI's stdout; main() above can emit thousands of
// console.log lines (one per tool entry) right before returning its exit
// code. The old code's `.then((code) => process.exit(code))` could exit
// while some of those writes were still queued, truncating the very report
// the exit code is supposed to describe: a shell script would see exit 0
// (or 1) paired with an INCOMPLETE stdout/stderr — worse than a crash,
// because it looks like a clean success. (Attempted a direct repro here,
// 13 nov 2026: a 36 MB / 300,000-line output piped through an artificially
// slow consumer did not visibly truncate on this exact Node/Windows build
// within a bounded test budget — the race is real per Node's own documented
// async-pipe-write behavior, but not independently reproduced under the
// time available, so this fix is applied on documented semantics + code
// review, not a confirmed live repro.) The standard, Node-documented fix:
// never call process.exit() here at all. Setting process.exitCode and
// returning lets the process exit NATURALLY once the event loop has no
// more pending work — which includes draining any queued stdout/stderr
// writes — so the exit code and the output it describes can never finish
// arriving out of sync.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      console.error("capacity-attest-fiscal-check failed:", errorMessage(e));
      process.exitCode = 1;
    });
}
