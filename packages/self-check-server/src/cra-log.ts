// A log of measurements that cannot be changed afterwards without it showing.
//
// Every measurement of a repository becomes one line. A line holds what we saw (the same facts the page shows), the version of
// the rules, the time, and the hash of the line before it. Change, remove or reorder an old line and every hash after it stops
// matching; a stranger can check that with this file alone. What the chain does NOT prove is when it was written: a chain can be
// rebuilt from the start. That is what the weekly anchor outside our control is for (the head hash goes to OpenTimestamps, see
// bench/cra-log.mjs). Until an anchor is confirmed, nothing here may be called "anchored".
//
// Pure functions only: no clock, no network, no files. The caller passes the report and writes the text.

import { createHash } from "node:crypto";

import type { RepoReport } from "./cra-repo-check.js";

export const LOG_VERSION = 1;
/** The "previous hash" of the first line. */
export const GENESIS = "0".repeat(64);

export interface LogControl {
  id: string;
  status: "visible" | "not_visible" | "not_measured";
  evidence?: string;
}

export interface LogEntry {
  v: number;
  seq: number;
  measuredAt: string;
  repo: string;
  rules: string;
  summary: { measured: number; visible: number; notVisible: number; notMeasured: number };
  controls: LogControl[];
  /** The pages that were asked for and what came of each, so a reader can open them and compare. */
  sources: Array<{ url: string; outcome: string }>;
  prev: string;
  hash: string;
}

/** JSON with sorted keys and no spaces: the same value always gives the same bytes. Undefined members are left out. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).filter((k) => object[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(object[k])}`).join(",")}}`;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function entryHash(entry: Omit<LogEntry, "hash">): string {
  return sha256(canonicalJson(entry));
}

export interface ChainHead {
  seq: number;
  hash: string;
  measuredAt: string;
  repo: string;
}

/** Turns a report into the next line of a chain. `head` is the head of the chain so far, or null for a new chain. */
export function nextEntry(head: ChainHead | null, report: RepoReport): LogEntry {
  if (head && Date.parse(report.measuredAt) < Date.parse(head.measuredAt)) throw new Error("the measurement is older than the last line of the log");
  if (head && head.repo.toLowerCase() !== report.repo.toLowerCase()) throw new Error("this log belongs to another repository");
  const body: Omit<LogEntry, "hash"> = {
    v: LOG_VERSION,
    seq: head ? head.seq + 1 : 1,
    measuredAt: report.measuredAt,
    repo: report.repo,
    rules: report.rules.version,
    summary: { ...report.summary },
    controls: report.controls.map((c) => ({ id: c.id, status: c.status, ...(c.evidence ? { evidence: c.evidence } : {}) })),
    sources: report.sources.map((s) => ({ url: s.url, outcome: s.outcome })),
    prev: head ? head.hash : GENESIS,
  };
  return { ...body, hash: entryHash(body) };
}

export interface ChainCheck {
  ok: boolean;
  /** Lines that were fine before the first problem. */
  entries: number;
  head: ChainHead | null;
  error?: { line: number; reason: string };
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Checks a whole log from its text. The first problem stops the check and says on which line. */
export function verifyChain(text: string): ChainCheck {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let head: ChainHead | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const fail = (reason: string): ChainCheck => ({ ok: false, entries: i, head, error: { line, reason } });
    let entry: LogEntry;
    try {
      entry = JSON.parse(lines[i] ?? "") as LogEntry;
    } catch {
      return fail("not valid JSON (a line that was only partly written?)");
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return fail("not an object");
    if (entry.v !== LOG_VERSION) return fail(`unknown version ${String(entry.v)}`);
    if (entry.seq !== i + 1) return fail(`line number in the chain is ${String(entry.seq)}, expected ${i + 1} (a line was removed, added or moved)`);
    if (typeof entry.repo !== "string" || Number.isNaN(Date.parse(entry.measuredAt))) return fail("repository or time is missing");
    if (head && entry.repo.toLowerCase() !== head.repo.toLowerCase()) return fail("a line from another repository");
    if (head && Date.parse(entry.measuredAt) < Date.parse(head.measuredAt)) return fail("time goes backwards");
    if (entry.prev !== (head ? head.hash : GENESIS)) return fail("does not follow the line before it");
    if (typeof entry.hash !== "string" || !HEX64.test(entry.hash)) return fail("hash is missing or malformed");
    const { hash, ...body } = entry;
    if (entryHash(body) !== hash) return fail("the line was changed after it was written (its hash no longer matches)");
    head = { seq: entry.seq, hash, measuredAt: entry.measuredAt, repo: entry.repo };
  }
  return { ok: true, entries: lines.length, head };
}

/**
 * Appends a measurement to the text of an existing log (empty string for a new one). A log that does not verify is never extended:
 * writing a new line behind a broken one would make the break look like history.
 */
export function appendToLog(text: string, report: RepoReport): { text: string; entry: LogEntry } {
  const check = verifyChain(text);
  if (!check.ok) throw new Error(`the log does not verify (line ${check.error?.line}: ${check.error?.reason}); not extending it`);
  const entry = nextEntry(check.head, report);
  const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return { text: `${base}${JSON.stringify(entry)}\n`, entry };
}

/** One line per chain for the weekly anchor: "<repo> <seq> <hash>". Sorted, so the same heads always give the same file. */
export function headsFile(heads: ChainHead[]): string {
  return heads.map((h) => `${h.repo.toLowerCase()} ${h.seq} ${h.hash}`).sort().join("\n") + "\n";
}
