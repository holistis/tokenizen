import { describe, expect, it } from "vitest";

import { GENESIS, appendToLog, canonicalJson, entryHash, headsFile, nextEntry, verifyChain, type LogEntry } from "./cra-log.js";
import type { RepoReport } from "./cra-repo-check.js";

function report(overrides: Partial<RepoReport> = {}): RepoReport {
  return {
    repo: "Owner/Repo",
    measuredAt: "2026-10-28T12:00:00.000Z",
    rules: { version: "2026-10-28.4", reviewedOn: "2026-10-28", basis: "basis", regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj" },
    summary: { measured: 3, visible: 2, notVisible: 1, notMeasured: 0 },
    controls: [
      { id: "vulnerability-policy", topic: "Policy", status: "visible", evidence: "SECURITY.md", explanation: "e" },
      { id: "sbom", topic: "SBOM", status: "not_visible", explanation: "e", fix: "f" },
      { id: "license", topic: "Licence", status: "visible", evidence: "LICENSE", explanation: "e" },
    ],
    advisories: "0",
    whatThisDoesNotMeasure: [],
    notice: "n",
    sources: [{ url: "https://api.github.com/repos/Owner/Repo", outcome: "read" }],
    ...overrides,
  };
}

/** A chain of `n` lines, one measurement a week. */
function chain(n: number): string {
  let text = "";
  for (let i = 0; i < n; i++) text = appendToLog(text, report({ measuredAt: new Date(Date.UTC(2026, 9, 28 + 7 * i)).toISOString() })).text;
  return text;
}

describe("canonicalJson", () => {
  it("gives the same bytes whatever the order of the keys", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: "x" } })).toBe(canonicalJson({ a: { c: "x", d: [1, { y: 2, z: 1 }] }, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("leaves out undefined members and keeps strings exact", () => {
    expect(canonicalJson({ a: undefined, b: 'q"\n' })).toBe('{"b":"q\\"\\n"}');
  });
});

describe("a chain of measurements", () => {
  it("starts at the genesis hash and every line names the hash of the line before it", () => {
    const text = chain(3);
    const lines = text.trim().split("\n").map((l) => JSON.parse(l) as LogEntry);
    expect(lines[0].prev).toBe(GENESIS);
    expect(lines[1].prev).toBe(lines[0].hash);
    expect(lines[2].prev).toBe(lines[1].hash);
    expect(lines.map((l) => l.seq)).toEqual([1, 2, 3]);
    expect(lines[0].hash).toBe(entryHash({ ...lines[0], hash: undefined } as unknown as Omit<LogEntry, "hash">));
  });

  it("verifies, and reports its head", () => {
    const check = verifyChain(chain(4));
    expect(check.ok).toBe(true);
    expect(check.entries).toBe(4);
    expect(check.head?.seq).toBe(4);
    expect(check.head?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an empty log is a valid log with no head", () => {
    expect(verifyChain("")).toEqual({ ok: true, entries: 0, head: null });
  });

  it("keeps what was seen: the controls, their evidence and the pages that were read", () => {
    const entry = nextEntry(null, report());
    expect(entry.controls.find((c) => c.id === "vulnerability-policy")).toEqual({ id: "vulnerability-policy", status: "visible", evidence: "SECURITY.md" });
    expect(entry.controls.find((c) => c.id === "sbom")).toEqual({ id: "sbom", status: "not_visible" });
    expect(entry.sources).toEqual([{ url: "https://api.github.com/repos/Owner/Repo", outcome: "read" }]);
    expect(entry.rules).toBe("2026-10-28.4");
  });
});

describe("tampering is found, and the line is named", () => {
  const lines = (text: string) => text.trimEnd().split("\n");
  const join = (l: string[]) => l.join("\n") + "\n";

  it("a changed value in an old line", () => {
    const l = lines(chain(4));
    l[1] = l[1].replace('"visible":2', '"visible":3');
    const check = verifyChain(join(l));
    expect(check.ok).toBe(false);
    expect(check.error?.line).toBe(2);
    expect(check.entries).toBe(1);
  });

  it("a changed value together with its hash recomputed: the next line no longer follows", () => {
    const l = lines(chain(4));
    const entry = JSON.parse(l[1]) as LogEntry;
    entry.summary.visible = 3;
    const { hash: _old, ...body } = entry;
    entry.hash = entryHash(body);
    l[1] = JSON.stringify(entry);
    const check = verifyChain(join(l));
    expect(check.ok).toBe(false);
    expect(check.error?.line).toBe(3);
    expect(check.error?.reason).toMatch(/does not follow/);
  });

  it("a removed line", () => {
    const l = lines(chain(4));
    l.splice(1, 1);
    const check = verifyChain(join(l));
    expect(check.ok).toBe(false);
    expect(check.error?.line).toBe(2);
  });

  it("two lines swapped", () => {
    const l = lines(chain(4));
    [l[1], l[2]] = [l[2], l[1]];
    expect(verifyChain(join(l)).ok).toBe(false);
  });

  it("a line cut off in the middle, as after a crash while writing", () => {
    const l = lines(chain(3));
    l[2] = l[2].slice(0, 40);
    const check = verifyChain(join(l));
    expect(check.ok).toBe(false);
    expect(check.error?.line).toBe(3);
    expect(check.entries).toBe(2);
    expect(check.head?.seq).toBe(2);
  });

  it("an empty line in the middle", () => {
    const l = lines(chain(3));
    l.splice(1, 0, "");
    expect(verifyChain(join(l)).ok).toBe(false);
  });

  it("a line from another repository", () => {
    const foreign = nextEntry(null, report({ repo: "Other/Thing" }));
    const first = chain(1).trim();
    const check = verifyChain(`${first}\n${JSON.stringify({ ...foreign, seq: 2 })}\n`);
    expect(check.ok).toBe(false);
  });

  it("time that goes backwards", () => {
    const first = nextEntry(null, report({ measuredAt: "2026-11-10T00:00:00.000Z" }));
    const second = nextEntry({ seq: 1, hash: first.hash, measuredAt: "2026-11-10T00:00:00.000Z", repo: "Owner/Repo" }, report({ measuredAt: "2026-11-11T00:00:00.000Z" }));
    const back = { ...second, measuredAt: "2026-11-01T00:00:00.000Z" };
    const { hash: _h, ...body } = back;
    const forged = { ...body, hash: entryHash(body) };
    expect(verifyChain(`${JSON.stringify(first)}\n${JSON.stringify(forged)}\n`).error?.reason).toMatch(/backwards/);
  });

  it("garbage", () => {
    expect(verifyChain("not json\n").ok).toBe(false);
    expect(verifyChain("[]\n").ok).toBe(false);
    expect(verifyChain("null\n").ok).toBe(false);
  });
});

describe("appending", () => {
  it("refuses to extend a log that does not verify, so a break never looks like history", () => {
    const l = chain(2).trimEnd().split("\n");
    l[0] = l[0].replace("Owner/Repo", "Owner/Rope");
    expect(() => appendToLog(l.join("\n") + "\n", report({ measuredAt: "2026-12-01T00:00:00.000Z" }))).toThrow(/does not verify/);
  });

  it("refuses a measurement older than the last line, and one from another repository", () => {
    const text = chain(2);
    expect(() => appendToLog(text, report({ measuredAt: "2026-01-01T00:00:00.000Z" }))).toThrow(/older/);
    expect(() => appendToLog(text, report({ repo: "Other/Thing", measuredAt: "2027-01-01T00:00:00.000Z" }))).toThrow(/another repository/);
  });

  it("treats a repository name that differs only in case as the same repository", () => {
    const text = chain(1);
    expect(() => appendToLog(text, report({ repo: "owner/repo", measuredAt: "2026-11-30T00:00:00.000Z" }))).not.toThrow();
  });

  it("adds the missing newline of a file that ended without one", () => {
    const text = chain(1).trimEnd();
    const { text: next } = appendToLog(text, report({ measuredAt: "2026-11-30T00:00:00.000Z" }));
    expect(verifyChain(next).ok).toBe(true);
    expect(next.endsWith("\n")).toBe(true);
  });
});

describe("headsFile", () => {
  it("is the same file for the same heads, in any order, with repository names in lower case", () => {
    const a = { repo: "B/two", seq: 2, hash: "b".repeat(64), measuredAt: "2026-10-28T00:00:00.000Z" };
    const b = { repo: "A/one", seq: 5, hash: "a".repeat(64), measuredAt: "2026-10-28T00:00:00.000Z" };
    expect(headsFile([a, b])).toBe(headsFile([b, a]));
    expect(headsFile([a, b])).toBe(`a/one 5 ${"a".repeat(64)}\nb/two 2 ${"b".repeat(64)}\n`);
  });
});
