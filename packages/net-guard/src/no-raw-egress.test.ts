// no-raw-egress.test.ts — THE BUILD GUARD.
//
// Finding #1 of the trust-layer security review was not "a guard is missing"
// but "the guard existed (self-check-server/network-guard.ts) and was not on
// the only road out". A guard that one code path forgets to call is not a
// guard. This test makes forgetting a build failure.
//
// SCOPE (deliberately asymmetric, see the trust-layer review's remediation
// note): the SSRF threat is "an anonymous visitor supplies the URL". That is
// true for the public servers (trust-attest-server, self-check-server) and
// for endpoint-attest's ownership verification. It is NOT true for
// capacity-attest, a published library whose caller supplies its own RPC URL
// on its own machine — changing its defaults would break real users to close
// a hole none of them have. So capacity-attest is NOT scanned for raw egress;
// instead, IF a server package ever calls one of capacity-attest's network
// entry points, that call must pass a guarded factory/fetch (the second rule
// below). Today there are no such call sites, so that rule is vacuous and
// documents the requirement for whoever adds the first one.
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

// Raw outbound primitives that must never appear in a guarded package.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: "global fetch fallback (inject net-guard guardedFetch instead of defaulting to fetch)", re: /\?\?\s*fetch\b/ },
  { label: "bare global fetch call (use net-guard guardedFetch)", re: /(^|[^.\w])fetch\s*\(/ },
  { label: "raw ethers JsonRpcProvider (use a net-guard-backed provider)", re: /new\s+(ethers\.)?JsonRpcProvider\s*\(/ },
  { label: "direct DNS (use net-guard resolveTxtGuarded)", re: /from\s+["']node:dns|require\(["']node:dns|(^|[^.\w])resolveTxt\s*\(|dns\.(lookup|resolve)\b/ },
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

  it("has no unguarded outbound primitive in any guarded package", () => {
    if (offenders.length) {
      // eslint-disable-next-line no-console
      console.error("\nUNGUARDED EGRESS SITES (each must route through net-guard):\n" + offenders.join("\n") + "\n");
    }
    expect(offenders).toEqual([]);
  });
});
