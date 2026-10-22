// no-raw-egress.test.ts — THE BUILD GUARD.
//
// Finding #1 of the trust-layer security review was not "a guard is missing"
// but "the guard existed (self-check-server/network-guard.ts) and was not on
// the only road out". A guard that one code path forgets to call is not a
// guard. This test is a build-time backstop that fails on the common ways a
// raw outbound primitive gets added outside net-guard. It is a broad denylist,
// one layer alongside code review and the required-fetchImpl contract, not a
// proof that egress is impossible.
//
// SCOPE (deliberately asymmetric, see the trust-layer review's remediation
// note): the SSRF threat is "an anonymous visitor supplies the URL". That is
// true for the public servers (trust-attest-server, self-check-server) and
// for endpoint-attest's ownership verification. It is NOT true for
// capacity-attest's LIBRARY surface (index.ts, the examples/ scripts), a
// published library whose caller supplies its own RPC URL on its own
// machine — changing its defaults would break real users to close a hole
// none of them have. So capacity-attest's library files stay unscanned for
// raw egress.
//
// 2026-10-22: the "today there are no such call sites" note above stopped
// being true the moment capacity-attest grew its OWN embedded server
// (http-server.ts, discover_delivery_history) that takes a CALLER-supplied
// rpcUrl/httpSources from an anonymous MCP caller — exactly the threat model
// this file's rule 2 was written for, just arriving a level down from where
// this comment expected a "server package" to live. http-server*.ts is
// therefore scanned under CAPACITY_ATTEST_SERVER_FILES below, for rule 2
// only (MUST_BE_GUARDED) — never rule 1 (FORBIDDEN), because http-server.ts
// itself has no raw fetch/ethers calls; it calls capacity-attest's own
// higher-level functions, and THOSE calls are what must carry a guarded
// factory nearby.
//
// Two rules:
//  1. In the guarded packages, a raw outbound primitive (global fetch
//     fallback, bare fetch, raw ethers JsonRpcProvider, direct node:dns) is
//     forbidden outright — route it through net-guard.
//  2. A construct that legitimately stays in place but must be BOUND to
//     net-guard (an MCP transport; a capacity-attest network entry point
//     called from a server) is allowed only if a `guarded` identifier appears
//     within two lines of it.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// The packages whose production code faces anonymous, attacker-supplied URLs.
// net-guard (the guard itself), capacity-attest (a library, see header) and
// the browser-only website are intentionally not here.
const GUARDED_PACKAGES = ["trust-attest-server", "self-check-server", "endpoint-attest"];

// capacity-attest's OWN embedded server files — see the header comment.
// Scanned for rule 2 (MUST_BE_GUARDED) only, never rule 1, and matched by
// filename prefix rather than listed by hand so a future http-server-*.ts
// split file is covered without anyone remembering to update this list.
const CAPACITY_ATTEST_SERVER_FILE_PREFIX = "http-server";

// A production source file. Tests, benches and fixtures are not the SSRF
// surface — they hit the network only against their own stubs or on purpose.
function isProductionSource(file: string): boolean {
  if (!file.endsWith(".ts")) return false;
  if (file.endsWith(".test.ts") || file.endsWith(".fuzz.test.ts") || file.endsWith(".bench.ts")) return false;
  const base = file.split(sep).pop()!;
  if (base === "test-helpers.ts") return false;
  if (base.endsWith("-fixture.ts")) return false;
  return true;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Raw outbound primitives that must never appear in a guarded package. This is
// a best-effort denylist backstop, not a proof: a denylist of named APIs will
// always lag some exotic spelling, so it is one layer, alongside code review
// and the injected-fetchImpl contract, not a guarantee on its own. It is kept
// deliberately broad so the common ways to open a socket all trip it.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: "global fetch fallback (inject net-guard guardedFetch instead of defaulting to fetch)", re: /\?\?\s*(?:(?:globalThis|window|self|global)\.)?fetch\b/ },
  { label: "bare/global fetch call (use net-guard guardedFetch)", re: /(^|[^.\w])(?:(?:globalThis|window|self|global)\.)?fetch\s*\(/ },
  { label: "raw ethers provider (v5 or v6 namespace; use a net-guard-backed provider)", re: /new\s+(?:ethers\.)?(?:providers\.)?(?:JsonRpc(?:Batch)?|StaticJsonRpc|WebSocket|Fallback|Ipc|Alchemy|Infura|Etherscan|Pocket|Quorum)Provider\s*\(/ },
  { label: "direct DNS (use net-guard resolveTxtGuarded)", re: /from\s+["']node:dns|require\(["']node:dns|(^|[^.\w])resolveTxt\s*\(|\bdns\.(?:lookup|resolve|resolve4|resolve6)\b/ },
  { label: "node http/https/net/tls/dgram module (egress must go through net-guard)", re: /from\s+["'](?:node:)?(?:http|https|net|tls|dgram)["']|require\(["'](?:node:)?(?:http|https|net|tls|dgram)["']/ },
  { label: "raw http/https request or net/tls connect", re: /(^|[^.\w])https?\.(?:request|get)\s*\(|(^|[^.\w])(?:net|tls)\.connect\s*\(/ },
  { label: "third-party HTTP client (axios/got/node-fetch/undici/superagent/request)", re: /from\s+["'](?:axios|got|node-fetch|undici|superagent|request|phin|needle)["']|require\(["'](?:axios|got|node-fetch|undici|superagent|request|phin|needle)["']/ },
];

// Constructs that may stay but must be bound to net-guard: an MCP transport,
// or a capacity-attest network entry point called from a server. Each is only
// allowed if a `guarded` identifier sits within two lines.
const MUST_BE_GUARDED: Array<{ label: string; re: RegExp }> = [
  { label: "MCP StreamableHTTPClientTransport must pass net-guard's guardedFetch", re: /new\s+StreamableHTTPClientTransport\s*\(/ },
  { label: "MCP SSEClientTransport must pass net-guard's guardedFetch", re: /new\s+SSEClientTransport\s*\(/ },
  { label: "capacity-attest network entry point must be called with a guarded factory/fetch", re: /\b(easSource|rpcAttestationReader|discoverDeliveryHistory|httpSource)\s*\(/ },
];

const GUARD_NEARBY = /guarded/i;
const WINDOW = 2;

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

describe("no raw egress outside net-guard", () => {
  const offenders: string[] = [];

  for (const pkg of GUARDED_PACKAGES) {
    const srcDir = join(REPO_ROOT, "packages", pkg, "src");
    let files: string[] = [];
    try {
      files = walk(srcDir);
    } catch {
      continue;
    }
    for (const full of files) {
      if (!isProductionSource(full)) continue;
      const rel = relative(join(REPO_ROOT, "packages"), full);
      const lines = readFileSync(full, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        for (const { label, re } of FORBIDDEN) {
          if (re.test(line)) offenders.push(`${rel}:${i + 1}  [FORBIDDEN: ${label}]  ${line.trim().slice(0, 100)}`);
        }
        for (const { label, re } of MUST_BE_GUARDED) {
          if (!re.test(line)) continue;
          const from = Math.max(0, i - WINDOW);
          const to = Math.min(lines.length - 1, i + WINDOW);
          const near = lines.slice(from, to + 1).join("\n");
          if (!GUARD_NEARBY.test(near)) {
            offenders.push(`${rel}:${i + 1}  [UNBOUND: ${label}]  ${line.trim().slice(0, 100)}`);
          }
        }
      });
    }
  }

  // Second pass: capacity-attest's own http-server*.ts files, rule 2 only —
  // see the header comment for why this package's library files stay out of
  // the loop above while these specific, server-facing files do not.
  {
    const srcDir = join(REPO_ROOT, "packages", "capacity-attest", "src");
    let files: string[] = [];
    try {
      files = walk(srcDir);
    } catch {
      files = [];
    }
    for (const full of files) {
      if (!isProductionSource(full)) continue;
      if (!full.split(sep).pop()!.startsWith(CAPACITY_ATTEST_SERVER_FILE_PREFIX)) continue;
      const rel = relative(join(REPO_ROOT, "packages"), full);
      const lines = readFileSync(full, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        for (const { label, re } of MUST_BE_GUARDED) {
          if (!re.test(line)) continue;
          const from = Math.max(0, i - WINDOW);
          const to = Math.min(lines.length - 1, i + WINDOW);
          const near = lines.slice(from, to + 1).join("\n");
          if (!GUARD_NEARBY.test(near)) {
            offenders.push(`${rel}:${i + 1}  [UNBOUND: ${label}]  ${line.trim().slice(0, 100)}`);
          }
        }
      });
    }
  }

  it("has no unguarded outbound primitive in any guarded package", () => {
    if (offenders.length) {
      // eslint-disable-next-line no-console
      console.error("\nUNGUARDED EGRESS SITES (each must route through net-guard):\n" + offenders.join("\n") + "\n");
    }
    expect(offenders).toEqual([]);
  });
});
