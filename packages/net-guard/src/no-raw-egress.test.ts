// no-raw-egress.test.ts — THE BUILD GUARD.
//
// Finding #1 of the trust-layer security review was not "a guard is missing"
// but "the guard existed (self-check-server/network-guard.ts) and was not on
// the only road out". A guard that one code path forgets to call is not a
// guard. This test makes forgetting impossible: it fails as long as ANY
// production source file in ANY backend package opens an outbound connection
// through a raw primitive instead of through net-guard.
//
// It is written to FAIL against today's tree on purpose (it lists every
// unguarded egress site). Making it GREEN — by routing every one of those
// sites through net-guard — is the definition of "the SSRF class is closed",
// not a nice-to-have afterwards.
//
// A raw primitive is only allowed inside net-guard itself and inside the two
// thin, single-purpose adapter files that exist solely to bind a library's
// own constructor (ethers' JsonRpcProvider, the MCP transports) to
// net-guard's guardedFetch. Those are listed in ALLOWLIST and reviewed as the
// choke-point they are.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Backend packages whose production code must never reach the network raw.
const PACKAGES = ["capacity-attest", "endpoint-attest", "trust-attest-server", "self-check-server"];

// Files permitted to use a raw egress primitive: net-guard itself is scanned
// out by package, these are the per-library adapters that wrap a constructor
// net-guard cannot own (ethers / MCP SDK live in those packages). Each is a
// thin shim that forwards to net-guard's guardedFetch and nothing else.
const ALLOWLIST = new Set<string>([
  join("capacity-attest", "src", "guarded-provider.ts"),
  join("trust-attest-server", "src", "guarded-mcp.ts"),
]);

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

// Each pattern is a raw outbound primitive that must instead come from
// net-guard. The label is what the failure prints so the fix is obvious.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: "global fetch fallback (use net-guard guardedFetch)", re: /\?\?\s*fetch\b/ },
  { label: "bare global fetch call (use net-guard guardedFetch)", re: /(^|[^.\w])fetch\s*\(/ },
  { label: "raw ethers JsonRpcProvider (use net-guard guardedJsonRpcProvider)", re: /new\s+(ethers\.)?JsonRpcProvider\s*\(/ },
  { label: "raw MCP StreamableHTTPClientTransport (use net-guard guarded MCP client)", re: /new\s+StreamableHTTPClientTransport\s*\(/ },
  { label: "raw MCP SSEClientTransport (use net-guard guarded MCP client)", re: /new\s+SSEClientTransport\s*\(/ },
  { label: "direct DNS (use net-guard resolveTxtGuarded / guardedLookup)", re: /from\s+["']node:dns|require\(["']node:dns|resolveTxt\s*\(|dns\.(lookup|resolve)\b/ },
];

describe("no raw egress outside net-guard", () => {
  const offenders: string[] = [];

  for (const pkg of PACKAGES) {
    const srcDir = join(REPO_ROOT, "packages", pkg, "src");
    let files: string[] = [];
    try {
      files = walk(srcDir);
    } catch {
      continue; // package has no src yet
    }
    for (const full of files) {
      if (!isProductionSource(full)) continue;
      const rel = relative(join(REPO_ROOT, "packages"), full); // e.g. capacity-attest/src/eas.ts
      if (ALLOWLIST.has(rel)) continue;
      const lines = readFileSync(full, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        // ignore comment-only lines so prose mentioning fetch() is not flagged
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        for (const { label, re } of FORBIDDEN) {
          if (re.test(line)) offenders.push(`${rel}:${i + 1}  [${label}]  ${trimmed.slice(0, 100)}`);
        }
      });
    }
  }

  it("has no unguarded outbound primitive in any backend package", () => {
    if (offenders.length) {
      // eslint-disable-next-line no-console
      console.error("\nUNGUARDED EGRESS SITES (each must route through net-guard):\n" + offenders.join("\n") + "\n");
    }
    expect(offenders).toEqual([]);
  });
});
