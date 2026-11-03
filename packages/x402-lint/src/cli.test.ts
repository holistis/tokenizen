// cli.test.ts — the command-line surface that the README describes: exit code 0 for ok, 1 for a failed check, 2 for a usage
// error, --json for the full report, --args that must be JSON. Each test starts the built CLI (dist/cli.js), exactly as a
// user does after `npm install -g @alghanima/x402-lint`; CI builds before it tests (see .github/workflows/ci.yml).
//
// What this file cannot prove: the exit-0 path. check.ts refuses loopback and private addresses on purpose (the SSRF guard,
// tested in check.test.ts), so a local fake server can never be reached through the CLI. The ok path is covered at the
// checkX402Conformance level in check.test.ts against a fake server that skips the guard.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(...args: string[]) {
  if (!existsSync(CLI)) throw new Error("dist/cli.js is missing: run `npm run build -w @alghanima/x402-lint` first (CI does)");
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("check-x402 command line", () => {
  it("exits 2 and prints the usage when no URL is given", () => {
    const r = run();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage: check-x402 <resourceUrl>");
  });

  it("exits 2 when more than one URL is given", () => {
    const r = run("https://a.example/one", "https://b.example/two");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage: check-x402");
  });

  it("shows the help and exits 0 with --help and -h", () => {
    for (const flag of ["--help", "-h"]) {
      const r = run(flag);
      expect(r.status, flag).toBe(0);
      expect(r.stderr, flag).toContain("--tool <name>");
      expect(r.stderr, flag).toContain("Exit code: 0 if ok, 1 if the response failed the check, 2 on a usage error.");
    }
  });

  it("exits 2 on an unknown option, with a message that names the program", () => {
    const r = run("--nonsense", "https://example.com/x");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("check-x402:");
  });

  it("exits 2 and says so when --args is not valid JSON, before touching the network", () => {
    const r = run("https://example.com/x", "--args", "{not json");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--args must be valid JSON");
  });

  it("exits 1 for a check that fails, and prints a FAIL line (a loopback address is refused by the SSRF guard, never silently ok)", () => {
    const r = run("http://127.0.0.1:9/never");
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^FAIL {2}http:\/\/127\.0\.0\.1:9\/never/);
  });

  it("prints the full machine-readable report with --json, as valid JSON with ok:false, and still exits 1", () => {
    const r = run("http://127.0.0.1:9/never", "--json");
    expect(r.status).toBe(1);
    const report = JSON.parse(r.stdout) as { ok: boolean; testedUrl: string; schemaValid: boolean | null; schemaErrors: unknown[]; issues: unknown[] };
    expect(report.ok).toBe(false);
    expect(report.testedUrl).toBe("http://127.0.0.1:9/never");
    expect(report.schemaValid).toBeNull();
    expect(Array.isArray(report.schemaErrors)).toBe(true);
    expect(Array.isArray(report.issues)).toBe(true);
  });
});
