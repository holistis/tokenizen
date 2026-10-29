// A public log of the scan reports we delivered, that cannot be changed afterwards without it showing.
//
// Every delivered report becomes one line: a key made from the job number, the SHA-256 of the report, whether it found hypotheses, how much of
// the code it read, when it was delivered, when we wrote the line, and the hash of the line before it. The repository, the buyer and the report
// itself are NOT in the log: the buyer holds the report and the job number, and shows them with a hash.
//
// WHAT A LINE PROVES: a report with exactly this hash existed, and was delivered with this outcome and this coverage, no later than the moment
// the head of the chain was timestamped outside our control (OpenTimestamps, see bench/scan-receipts.mjs). WHAT IT DOES NOT PROVE: which version
// of the code was scanned (the job record holds no commit), that the report is right, or that the code is safe. Until a timestamp is confirmed,
// nothing here may be called "anchored".
//
// Pure functions only: no clock, no network, no files. The caller passes the time and writes the text.

import { createHash } from "node:crypto";

import { GENESIS, canonicalJson } from "./cra-log.js";

export const RECEIPT_LOG_VERSION = 1;
export { GENESIS };

export type ScanOutcome = "hypotheses" | "no_hypotheses" | "unknown";
const OUTCOMES: ReadonlySet<string> = new Set(["hypotheses", "no_hypotheses", "unknown"]);
const HEX64 = /^[0-9a-f]{64}$/;

export interface ScanReceipt {
  /** SHA-256 (hex) of the job number, so the list never shows the number itself. */
  jobKey: string;
  /** SHA-256 (hex) of the delivered report, as the report endpoint states in X-Report-Sha256. */
  reportSha256: string;
  outcome: ScanOutcome;
  /** Percentage of the code in scope that the scan read, or null when the job does not state it. */
  coveragePct: number | null;
  completedAt: string;
}

export interface ReceiptEntry extends ScanReceipt {
  v: number;
  seq: number;
  /** When we wrote this line. */
  loggedAt: string;
  prev: string;
  hash: string;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The key a job number gets in the list: the buyer computes it with `printf %s <job number> | sha256sum`. */
export const jobKeyOf = (jobId: string): string => sha256(jobId);

/** One item of the feed, or null when it is not exactly what a receipt should be. Unknown members are dropped, not copied. */
export function parseReceipt(raw: unknown): ScanReceipt | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.jobKey !== "string" || !HEX64.test(r.jobKey)) return null;
  if (typeof r.reportSha256 !== "string" || !HEX64.test(r.reportSha256)) return null;
  const outcome = r.outcome === undefined || r.outcome === null ? "unknown" : r.outcome;
  if (typeof outcome !== "string" || !OUTCOMES.has(outcome)) return null;
  if (typeof r.completedAt !== "string" || Number.isNaN(Date.parse(r.completedAt))) return null;
  let coveragePct: number | null = null;
  if (r.coveragePct !== undefined && r.coveragePct !== null) {
    if (typeof r.coveragePct !== "number" || !Number.isFinite(r.coveragePct) || r.coveragePct < 0 || r.coveragePct > 100) return null;
    coveragePct = Math.round(r.coveragePct * 10) / 10;
  }
  return { jobKey: r.jobKey, reportSha256: r.reportSha256, outcome: outcome as ScanOutcome, coveragePct, completedAt: new Date(r.completedAt).toISOString() };
}

/** The feed is `{ "receipts": [...] }`. Items that are not valid are counted and left out; the rest is used. */
export function parseFeed(json: unknown): { receipts: ScanReceipt[]; rejected: number } {
  const list = json !== null && typeof json === "object" && Array.isArray((json as { receipts?: unknown }).receipts) ? (json as { receipts: unknown[] }).receipts : null;
  if (!list) throw new Error('the feed is not {"receipts": [...]}');
  const receipts: ScanReceipt[] = [];
  let rejected = 0;
  for (const item of list) {
    const parsed = parseReceipt(item);
    if (parsed) receipts.push(parsed);
    else rejected++;
  }
  return { receipts, rejected };
}

export function entryHash(entry: Omit<ReceiptEntry, "hash">): string {
  return sha256(canonicalJson(entry));
}

export interface ReceiptHead {
  seq: number;
  hash: string;
  loggedAt: string;
}

export interface ReceiptCheck {
  ok: boolean;
  /** Lines that were fine before the first problem. */
  entries: number;
  head: ReceiptHead | null;
  error?: { line: number; reason: string };
}

/** Checks a whole log from its text. The first problem stops the check and says on which line. */
export function verifyReceiptChain(text: string): ReceiptCheck {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let head: ReceiptHead | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const fail = (reason: string): ReceiptCheck => ({ ok: false, entries: i, head, error: { line, reason } });
    let entry: ReceiptEntry;
    try {
      entry = JSON.parse(lines[i] ?? "") as ReceiptEntry;
    } catch {
      return fail("not valid JSON (a line that was only partly written?)");
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return fail("not an object");
    if (entry.v !== RECEIPT_LOG_VERSION) return fail(`unknown version ${String(entry.v)}`);
    if (entry.seq !== i + 1) return fail(`line number in the chain is ${String(entry.seq)}, expected ${i + 1} (a line was removed, added or moved)`);
    const receipt = parseReceipt(entry);
    if (!receipt) return fail("the receipt in this line is not valid");
    if (receipt.completedAt !== entry.completedAt || receipt.coveragePct !== entry.coveragePct || receipt.outcome !== entry.outcome) {
      return fail("the receipt in this line is not written the way this log writes it");
    }
    if (typeof entry.loggedAt !== "string" || Number.isNaN(Date.parse(entry.loggedAt))) return fail("the time the line was written is missing");
    if (head && Date.parse(entry.loggedAt) < Date.parse(head.loggedAt)) return fail("time goes backwards");
    if (seen.has(entry.jobKey)) return fail("this job is in the log twice");
    seen.add(entry.jobKey);
    if (entry.prev !== (head ? head.hash : GENESIS)) return fail("does not follow the line before it");
    if (typeof entry.hash !== "string" || !HEX64.test(entry.hash)) return fail("hash is missing or malformed");
    const { hash, ...body } = entry;
    if (entryHash(body) !== hash) return fail("the line was changed after it was written (its hash no longer matches)");
    head = { seq: entry.seq, hash, loggedAt: entry.loggedAt };
  }
  return { ok: true, entries: lines.length, head };
}

/**
 * Adds the receipts that are not in the log yet, oldest delivery first, each stamped with `loggedAt`. A log that does not verify is never
 * extended: writing a new line behind a broken one would make the break look like history. A job that is in the log is never added again,
 * also not when its report changed afterwards (that difference is the thing the log exists to show, so it is counted, not hidden).
 */
export function appendReceipts(
  text: string,
  receipts: ScanReceipt[],
  loggedAt: string,
): { text: string; added: ReceiptEntry[]; alreadyLogged: number; changedSinceLogged: number } {
  const check = verifyReceiptChain(text);
  if (!check.ok) throw new Error(`the log does not verify (line ${check.error?.line}: ${check.error?.reason}); not extending it`);
  if (Number.isNaN(Date.parse(loggedAt))) throw new Error("loggedAt is not a time");
  if (check.head && Date.parse(loggedAt) < Date.parse(check.head.loggedAt)) throw new Error("loggedAt is older than the last line of the log");

  const existing = new Map<string, string>();
  for (const l of text.split("\n").filter(Boolean)) {
    const e = JSON.parse(l) as ReceiptEntry;
    existing.set(e.jobKey, e.reportSha256);
  }
  const fresh: ScanReceipt[] = [];
  let alreadyLogged = 0;
  let changedSinceLogged = 0;
  const batchSeen = new Set<string>();
  for (const r of receipts) {
    const before = existing.get(r.jobKey);
    if (before !== undefined) {
      alreadyLogged++;
      if (before !== r.reportSha256) changedSinceLogged++;
      continue;
    }
    if (batchSeen.has(r.jobKey)) continue;
    batchSeen.add(r.jobKey);
    fresh.push(r);
  }
  fresh.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.jobKey.localeCompare(b.jobKey));

  let head = check.head;
  let out = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  const added: ReceiptEntry[] = [];
  for (const r of fresh) {
    const body: Omit<ReceiptEntry, "hash"> = {
      v: RECEIPT_LOG_VERSION,
      seq: head ? head.seq + 1 : 1,
      jobKey: r.jobKey,
      reportSha256: r.reportSha256,
      outcome: r.outcome,
      coveragePct: r.coveragePct,
      completedAt: r.completedAt,
      loggedAt: new Date(loggedAt).toISOString(),
      prev: head ? head.hash : GENESIS,
    };
    const entry: ReceiptEntry = { ...body, hash: entryHash(body) };
    out += `${JSON.stringify(entry)}\n`;
    added.push(entry);
    head = { seq: entry.seq, hash: entry.hash, loggedAt: entry.loggedAt };
  }
  return { text: out, added, alreadyLogged, changedSinceLogged };
}

/** The file that gets the timestamp: one line with the head of the chain. */
export function receiptHeadFile(head: ReceiptHead | null): string {
  if (!head) throw new Error("an empty log has no head to timestamp");
  return `scan-receipts ${head.seq} ${head.hash}\n`;
}
