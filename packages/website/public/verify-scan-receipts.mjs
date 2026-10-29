#!/usr/bin/env node
// verify-scan-receipts.mjs: checks the public list of delivered scan reports from its text alone. No installs, no network, no files except the ones you name.
// Source and licence: https://github.com/holistis/tokenizen (MIT), made by tokenizen.nl.
//
//   node verify-scan-receipts.mjs scan-receipts.jsonl                          is the whole list intact?
//   node verify-scan-receipts.mjs scan-receipts.jsonl <job number> <report.html>   is MY report in it, unchanged?
//
// Every line holds the hash of the line before it. Change, remove or reorder an old line and every hash after it stops matching; this file says
// which line is the first that does not. It is the same check as `verifyReceiptChain` in packages/self-check-server/src/scan-receipts.ts, and a
// test makes sure the two always agree.
//
// What it does NOT prove: that the list was written at the time it says (a chain can be rebuilt from the start; the timestamp of its head is
// what dates it, see `ots verify`), which version of the code was scanned, that the report is right, or that the code is safe.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOG_VERSION = 1;
const GENESIS = "0".repeat(64);
const HEX64 = /^[0-9a-f]{64}$/;
const OUTCOMES = new Set(["hypotheses", "no_hypotheses", "unknown"]);

/** JSON with sorted keys and no spaces: the same value always gives the same bytes. Undefined members are left out. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** The receipt of a line in the form this log writes it, or null when the line is not a valid receipt. */
function receiptOf(r) {
  if (r === null || typeof r !== "object" || Array.isArray(r)) return null;
  if (typeof r.jobKey !== "string" || !HEX64.test(r.jobKey)) return null;
  if (typeof r.reportSha256 !== "string" || !HEX64.test(r.reportSha256)) return null;
  const outcome = r.outcome === undefined || r.outcome === null ? "unknown" : r.outcome;
  if (typeof outcome !== "string" || !OUTCOMES.has(outcome)) return null;
  if (typeof r.completedAt !== "string" || Number.isNaN(Date.parse(r.completedAt))) return null;
  let coveragePct = null;
  if (r.coveragePct !== undefined && r.coveragePct !== null) {
    if (typeof r.coveragePct !== "number" || !Number.isFinite(r.coveragePct) || r.coveragePct < 0 || r.coveragePct > 100) return null;
    coveragePct = Math.round(r.coveragePct * 10) / 10;
  }
  return { jobKey: r.jobKey, reportSha256: r.reportSha256, outcome, coveragePct, completedAt: new Date(r.completedAt).toISOString() };
}

/** Checks a whole list from its text. The first problem stops the check and says on which line. */
export function verifyReceiptChain(text) {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let head = null;
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const fail = (reason) => ({ ok: false, entries: i, head, error: { line, reason } });
    let entry;
    try {
      entry = JSON.parse(lines[i] ?? "");
    } catch {
      return fail("not valid JSON (a line that was only partly written?)");
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return fail("not an object");
    if (entry.v !== LOG_VERSION) return fail(`unknown version ${String(entry.v)}`);
    if (entry.seq !== i + 1) return fail(`line number in the chain is ${String(entry.seq)}, expected ${i + 1} (a line was removed, added or moved)`);
    const receipt = receiptOf(entry);
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
    if (sha256(canonicalJson(body)) !== hash) return fail("the line was changed after it was written (its hash no longer matches)");
    head = { seq: entry.seq, hash, loggedAt: entry.loggedAt };
  }
  return { ok: true, entries: lines.length, head };
}

/** Finds the line of one job: the key is the SHA-256 of the job number. */
export function findJob(text, jobNumber) {
  const key = sha256(jobNumber);
  for (const line of text.split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line);
    if (entry.jobKey === key) return entry;
  }
  return null;
}

function main() {
  const [file, jobNumber, reportFile] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node verify-scan-receipts.mjs scan-receipts.jsonl [<job number> <report.html>]");
    process.exit(2);
  }
  const text = readFileSync(file, "utf8");
  const result = verifyReceiptChain(text);
  if (!result.ok) {
    console.log(`NOT OK at line ${result.error.line}: ${result.error.reason} (${result.entries} lines before it were fine)`);
    process.exit(1);
  }
  console.log(`ok: ${result.entries} lines, head ${result.head ? `${result.head.seq} ${result.head.hash}` : "none (empty list)"}`);
  console.log("This shows the lines belong together and were not changed. When they were written is shown by the timestamp of the head.");
  if (jobNumber) {
    const entry = findJob(text, jobNumber);
    if (!entry) {
      console.log("YOUR JOB: not in this list.");
      process.exit(1);
    }
    console.log(`YOUR JOB: line ${entry.seq}, delivered ${entry.completedAt}, outcome ${entry.outcome}, coverage ${entry.coveragePct === null ? "not stated" : `${entry.coveragePct} percent`}.`);
    if (reportFile) {
      const mine = sha256(readFileSync(reportFile, "utf8"));
      if (mine !== entry.reportSha256) {
        console.log("YOUR REPORT: does NOT match the list (the file differs from the report that was delivered).");
        process.exit(1);
      }
      console.log("YOUR REPORT: matches the list, byte for byte.");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
