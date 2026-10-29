import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { appendReceipts, jobKeyOf, verifyReceiptChain, type ScanReceipt } from "./scan-receipts.js";

// The file a buyer downloads (served from the website) must judge a list exactly like the checker of the server does.
const FILE = resolve(import.meta.dirname, "../../website/public/verify-scan-receipts.mjs");
const standalone = (await import(pathToFileURL(FILE).href)) as {
  verifyReceiptChain: (text: string) => unknown;
  findJob: (text: string, jobNumber: string) => { seq: number } | null;
  sha256: (text: string) => string;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const JOB = (i: number) => `bi-17900000000${i}-ab${i}c`;

function receipt(i: number, report = `report ${i}`): ScanReceipt {
  return {
    jobKey: jobKeyOf(JOB(i)),
    reportSha256: sha(report),
    outcome: i % 2 ? "hypotheses" : "no_hypotheses",
    coveragePct: i === 3 ? null : 40 + i,
    completedAt: new Date(Date.parse("2026-10-20T10:00:00Z") + i * 3_600_000).toISOString(),
  };
}

const good = appendReceipts("", [1, 2, 3, 4].map((i) => receipt(i)), "2026-10-30T01:00:00.000Z").text;
const lines = good.trimEnd().split("\n");
const mutate = (i: number, change: (e: Record<string, unknown>) => void) => {
  const copy = [...lines];
  const entry = JSON.parse(copy[i]!) as Record<string, unknown>;
  change(entry);
  copy[i] = JSON.stringify(entry);
  return copy.join("\n") + "\n";
};

describe("verify-scan-receipts.mjs, the file a buyer downloads", () => {
  const cases: Array<[string, string]> = [
    ["a good list", good],
    ["an empty list", ""],
    ["no final newline", good.trimEnd()],
    ["a changed coverage", mutate(1, (e) => (e.coveragePct = 99))],
    ["a changed report hash", mutate(2, (e) => (e.reportSha256 = sha("other")))],
    ["a changed hash", mutate(0, (e) => (e.hash = "0".repeat(64)))],
    ["a removed line", [lines[0], lines[2], lines[3]].join("\n") + "\n"],
    ["a swapped pair of lines", [lines[0], lines[2], lines[1], lines[3]].join("\n") + "\n"],
    ["a wrong previous hash", mutate(1, (e) => (e.prev = "f".repeat(64)))],
    ["a half written line", good + '{"v":1,"seq":5,'],
    ["time going backwards", mutate(3, (e) => (e.loggedAt = "2026-01-01T00:00:00.000Z"))],
    ["an unknown version", mutate(0, (e) => (e.v = 2))],
    ["an unknown outcome", mutate(0, (e) => (e.outcome = "safe"))],
    ["a time not written the canonical way", mutate(0, (e) => (e.completedAt = "2026-10-20 11:00:00"))],
    ["a missing hash", mutate(0, (e) => delete e.hash)],
    ["not an object", '"hello"\n'],
    ["a job twice", good + good.split("\n")[0]!.replace('"seq":1', '"seq":5') + "\n"],
  ];
  for (const [name, text] of cases) {
    it(`gives the same answer as the checker of the server for ${name}`, () => {
      expect(standalone.verifyReceiptChain(text)).toEqual(verifyReceiptChain(text));
    });
  }

  it("finds a job by its number and not by anything else", () => {
    expect(standalone.findJob(good, JOB(2))?.seq).toBe(2);
    expect(standalone.findJob(good, "bi-0-nope")).toBeNull();
  });

  it("answers on the command line: 0 for a good list and your own report, 1 for a changed list, another report or a missing job", () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-receipts-"));
    const list = join(dir, "list.jsonl");
    const bad = join(dir, "bad.jsonl");
    const mine = join(dir, "report.html");
    const other = join(dir, "other.html");
    writeFileSync(list, good);
    writeFileSync(bad, mutate(1, (e) => (e.coveragePct = 99)));
    writeFileSync(mine, "report 2");
    writeFileSync(other, "report 2 but edited");
    const run = (...args: string[]) => spawnSync(process.execPath, [FILE, ...args], { encoding: "utf8" });

    expect(execFileSync(process.execPath, [FILE, list], { encoding: "utf8" })).toContain("ok: 4 lines");
    const ok = run(list, JOB(2), mine);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("YOUR JOB: line 2");
    expect(ok.stdout).toContain("YOUR REPORT: matches the list, byte for byte.");
    expect(run(list, JOB(3)).stdout).toContain("coverage not stated");
    expect(run(list, JOB(2), other)).toMatchObject({ status: 1 });
    expect(run(list, JOB(2), other).stdout).toContain("does NOT match");
    expect(run(list, "bi-0-nope")).toMatchObject({ status: 1 });
    const broken = run(bad);
    expect(broken.status).toBe(1);
    expect(broken.stdout).toContain("NOT OK at line 2");
    expect(run().status).toBe(2);
  });
});
