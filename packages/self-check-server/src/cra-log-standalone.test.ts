import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { appendToLog, verifyChain } from "./cra-log.js";
import type { RepoReport } from "./cra-repo-check.js";

// The file a customer downloads (served from the website) must judge a log exactly like the checker of the server does.
const FILE = resolve(import.meta.dirname, "../../website/public/verify-cra-log.mjs");
const standalone = (await import(pathToFileURL(FILE).href)) as { verifyChain: (text: string) => unknown; canonicalJson: (v: unknown) => string };

function report(i: number, repo = "Owner/Repo"): RepoReport {
  return {
    repo,
    measuredAt: new Date(Date.parse("2026-10-27T10:00:00Z") + i * 7 * 86_400_000).toISOString(),
    rules: { version: "2026-10-28.7" },
    summary: { measured: 8, visible: 8 - (i % 3), notVisible: i % 3, notMeasured: 0 },
    controls: [
      { id: "vulnerability-policy", status: "visible", evidence: "SECURITY.md" },
      { id: "sbom", status: i % 2 ? "not_visible" : "visible" },
    ],
    sources: [{ url: "https://api.github.com/repos/owner/repo", outcome: "read" }],
  } as unknown as RepoReport;
}

function log(n: number): string {
  let text = "";
  for (let i = 0; i < n; i++) text = appendToLog(text, report(i)).text;
  return text;
}

describe("verify-cra-log.mjs, the file a customer downloads", () => {
  const good = log(4);
  const lines = good.trimEnd().split("\n");
  const mutate = (i: number, change: (e: Record<string, unknown>) => void) => {
    const copy = [...lines];
    const entry = JSON.parse(copy[i]!) as Record<string, unknown>;
    change(entry);
    copy[i] = JSON.stringify(entry);
    return copy.join("\n") + "\n";
  };
  const cases: Array<[string, string]> = [
    ["a good log", good],
    ["an empty log", ""],
    ["one line", log(1)],
    ["a changed line", mutate(1, (e) => ((e.summary as { visible: number }).visible = 0))],
    ["a changed hash", mutate(2, (e) => (e.hash = "0".repeat(64)))],
    ["a removed line", [lines[0], lines[2], lines[3]].join("\n") + "\n"],
    ["a swapped pair of lines", [lines[0], lines[2], lines[1], lines[3]].join("\n") + "\n"],
    ["a wrong previous hash", mutate(1, (e) => (e.prev = "f".repeat(64)))],
    ["a half written line", good + '{"v":1,"seq":5,'],
    ["a line from another repository", mutate(2, (e) => (e.repo = "Other/Repo"))],
    ["time going backwards", mutate(3, (e) => (e.measuredAt = "2026-01-01T00:00:00.000Z"))],
    ["a missing hash", mutate(0, (e) => delete e.hash)],
    ["an unknown version", mutate(0, (e) => (e.v = 2))],
    ["not an object", '"hello"\n'],
    ["no final newline", good.trimEnd()],
  ];

  for (const [name, text] of cases) {
    it(`gives the same answer as the checker of the server for ${name}`, () => {
      expect(standalone.verifyChain(text)).toEqual(verifyChain(text));
    });
  }

  it("makes the same bytes from the same value as the checker of the server", () => {
    const value = { b: [1, { z: undefined, a: "x" }, null], a: { y: 2, x: undefined }, c: "é\n" };
    expect(standalone.canonicalJson(value)).toBe('{"a":{"y":2},"b":[1,{"a":"x"},null],"c":"é\\n"}');
  });

  it("answers on the command line with 0 for a good log and 1 for a changed one, and says which line", () => {
    const dir = mkdtempSync(join(tmpdir(), "cra-log-"));
    const goodFile = join(dir, "good.jsonl");
    const badFile = join(dir, "bad.jsonl");
    writeFileSync(goodFile, good);
    writeFileSync(badFile, mutate(1, (e) => ((e.summary as { visible: number }).visible = 0)));
    const ok = execFileSync(process.execPath, [FILE, goodFile], { encoding: "utf8" });
    expect(ok).toContain("ok: 4 lines, head 4 ");
    const bad = spawnSync(process.execPath, [FILE, badFile], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("NOT OK at line 2");
    expect(spawnSync(process.execPath, [FILE], { encoding: "utf8" }).status).toBe(2);
  });
});
