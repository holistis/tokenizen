import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { appendReceipts, jobKeyOf, parseFeed, parseReceipt, receiptHeadFile, verifyReceiptChain, type ScanReceipt } from "./scan-receipts.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function receipt(i: number, patch: Partial<ScanReceipt> = {}): ScanReceipt {
  return {
    jobKey: jobKeyOf(`bi-17900000000${i}-ab${i}c`),
    reportSha256: sha(`report ${i}`),
    outcome: i % 2 ? "hypotheses" : "no_hypotheses",
    coveragePct: 40 + i,
    completedAt: new Date(Date.parse("2026-10-20T10:00:00Z") + i * 3_600_000).toISOString(),
    ...patch,
  };
}

const T0 = "2026-10-30T01:00:00.000Z";

describe("jobKeyOf", () => {
  it("is the SHA-256 of the job number, which a buyer can compute with printf %s <job number> | sha256sum", () => {
    expect(jobKeyOf("bi-1-abcd")).toBe(sha("bi-1-abcd"));
    expect(jobKeyOf("bi-1-abcd")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseReceipt and parseFeed", () => {
  it("takes a valid item and drops members it does not know", () => {
    const parsed = parseReceipt({ ...receipt(1), repo: "secret/owner", contact: "x@y.z" });
    expect(parsed).toEqual(receipt(1));
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("refuses what is not exactly a receipt", () => {
    const bad = [
      null,
      "text",
      [],
      { ...receipt(1), jobKey: "abc" },
      { ...receipt(1), reportSha256: "G".repeat(64) },
      { ...receipt(1), outcome: "safe" },
      { ...receipt(1), completedAt: "yesterday" },
      { ...receipt(1), coveragePct: 101 },
      { ...receipt(1), coveragePct: -1 },
      { ...receipt(1), coveragePct: "40" },
    ];
    for (const item of bad) expect(parseReceipt(item)).toBeNull();
  });

  it("reads a missing outcome as unknown and a missing coverage as null instead of inventing numbers", () => {
    const { outcome: _o, coveragePct: _c, ...rest } = receipt(2);
    expect(parseReceipt(rest)).toMatchObject({ outcome: "unknown", coveragePct: null });
  });

  it("counts the invalid items of a feed, uses the rest, and refuses a feed of another shape", () => {
    expect(parseFeed({ receipts: [receipt(1), { nope: true }, receipt(2)] })).toEqual({ receipts: [receipt(1), receipt(2)], rejected: 1 });
    expect(() => parseFeed([receipt(1)])).toThrow(/receipts/);
    expect(() => parseFeed(null)).toThrow();
  });
});

describe("appendReceipts and verifyReceiptChain", () => {
  const build = (n: number) => appendReceipts("", Array.from({ length: n }, (_, i) => receipt(i + 1)), T0).text;

  it("builds a chain that verifies, oldest delivery first", () => {
    const text = appendReceipts("", [receipt(3), receipt(1), receipt(2)], T0).text;
    const check = verifyReceiptChain(text);
    expect(check).toMatchObject({ ok: true, entries: 3 });
    const keys = text.trimEnd().split("\n").map((l) => (JSON.parse(l) as { jobKey: string }).jobKey);
    expect(keys).toEqual([receipt(1), receipt(2), receipt(3)].map((r) => r.jobKey));
  });

  it("accepts an empty log and gives no head to timestamp", () => {
    expect(verifyReceiptChain("")).toMatchObject({ ok: true, entries: 0, head: null });
    expect(() => receiptHeadFile(null)).toThrow(/empty/);
  });

  it("writes the head as one line", () => {
    const check = verifyReceiptChain(build(2));
    expect(receiptHeadFile(check.head)).toBe(`scan-receipts 2 ${check.head!.hash}\n`);
  });

  it("adds only what is new, and says what it left out", () => {
    const first = appendReceipts("", [receipt(1), receipt(2)], T0);
    const second = appendReceipts(first.text, [receipt(1), receipt(2), receipt(3)], "2026-10-30T02:00:00.000Z");
    expect(second.added.map((e) => e.seq)).toEqual([3]);
    expect(second.alreadyLogged).toBe(2);
    expect(second.changedSinceLogged).toBe(0);
    expect(verifyReceiptChain(second.text)).toMatchObject({ ok: true, entries: 3 });
  });

  it("does not hide a report that changed after it was logged: it is counted and not written again", () => {
    const first = appendReceipts("", [receipt(1)], T0);
    const second = appendReceipts(first.text, [receipt(1, { reportSha256: sha("another report") })], "2026-10-30T02:00:00.000Z");
    expect(second.added).toHaveLength(0);
    expect(second.changedSinceLogged).toBe(1);
    expect(second.text).toBe(first.text);
  });

  it("ignores a job that appears twice in one feed", () => {
    const { added } = appendReceipts("", [receipt(1), receipt(1)], T0);
    expect(added).toHaveLength(1);
  });

  const lines = (n: number) => build(n).trimEnd().split("\n");
  const mutate = (i: number, change: (e: Record<string, unknown>) => void) => {
    const copy = lines(4);
    const entry = JSON.parse(copy[i]!) as Record<string, unknown>;
    change(entry);
    copy[i] = JSON.stringify(entry);
    return copy.join("\n") + "\n";
  };

  it("names the first line that was changed", () => {
    expect(verifyReceiptChain(mutate(1, (e) => (e.coveragePct = 99)))).toMatchObject({ ok: false, error: { line: 2 } });
    expect(verifyReceiptChain(mutate(2, (e) => (e.reportSha256 = sha("x"))))).toMatchObject({ ok: false, error: { line: 3 } });
  });

  it("notices a removed line, a swapped pair, a wrong previous hash, a half written line", () => {
    const l = lines(4);
    expect(verifyReceiptChain([l[0], l[2], l[3]].join("\n") + "\n")).toMatchObject({ ok: false, error: { line: 2 } });
    expect(verifyReceiptChain([l[0], l[2], l[1], l[3]].join("\n") + "\n")).toMatchObject({ ok: false, error: { line: 2 } });
    expect(verifyReceiptChain(mutate(1, (e) => (e.prev = "f".repeat(64))))).toMatchObject({ ok: false, error: { line: 2, reason: expect.stringContaining("does not follow") } });
    expect(verifyReceiptChain(build(2) + '{"v":1,"seq":3,')).toMatchObject({ ok: false, error: { line: 3 } });
  });

  it("notices time going backwards, an unknown version, a missing hash and a job twice", () => {
    expect(verifyReceiptChain(mutate(3, (e) => (e.loggedAt = "2026-01-01T00:00:00.000Z")))).toMatchObject({ ok: false, error: { line: 4 } });
    expect(verifyReceiptChain(mutate(0, (e) => (e.v = 2)))).toMatchObject({ ok: false, error: { line: 1 } });
    expect(verifyReceiptChain(mutate(0, (e) => delete e.hash))).toMatchObject({ ok: false, error: { line: 1 } });
    const twice = appendReceipts("", [receipt(1)], T0).text;
    const doubled = twice + twice.replace('"seq":1', '"seq":2');
    expect(verifyReceiptChain(doubled).ok).toBe(false);
  });

  it("never extends a log that does not verify, and refuses a time older than the log", () => {
    expect(() => appendReceipts(mutate(1, (e) => (e.coveragePct = 1)), [receipt(9)], T0)).toThrow(/does not verify/);
    expect(() => appendReceipts(build(1), [receipt(9)], "2026-10-29T00:00:00.000Z")).toThrow(/older than the last line/);
    expect(() => appendReceipts("", [receipt(1)], "not a time")).toThrow(/not a time/);
  });

  it("holds nothing about the repository, the buyer or the report itself", () => {
    const text = build(3);
    expect(text).not.toMatch(/"repo"|contact|owner|github|http/i);
    expect(Object.keys(JSON.parse(text.split("\n")[0]!) as object).sort()).toEqual(
      ["completedAt", "coveragePct", "hash", "jobKey", "loggedAt", "outcome", "prev", "reportSha256", "seq", "v"],
    );
  });
});
