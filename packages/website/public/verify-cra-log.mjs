#!/usr/bin/env node
// verify-cra-log.mjs: checks a Signal log from its text alone. No installs, no network, no files except the one you name.
//
//   node verify-cra-log.mjs yourlog.jsonl
//
// Every line of the log holds the hash of the line before it. Change, remove or reorder an old line and every hash after it stops
// matching; this file says which line is the first that does not. It is the same check as `verifyChain` in
// packages/self-check-server/src/cra-log.ts, and a test makes sure the two always agree.
//
// What it does NOT prove is when the lines were written: a chain can be rebuilt from the start. That is what the timestamp of the head
// is for (OpenTimestamps, outside our control). Compare the head printed here with the head in the timestamp we sent, with `ots verify`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOG_VERSION = 1;
const GENESIS = "0".repeat(64);
const HEX64 = /^[0-9a-f]{64}$/;

/** JSON with sorted keys and no spaces: the same value always gives the same bytes. Undefined members are left out. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Checks a whole log from its text. The first problem stops the check and says on which line. */
export function verifyChain(text) {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let head = null;
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
    if (typeof entry.repo !== "string" || Number.isNaN(Date.parse(entry.measuredAt))) return fail("repository or time is missing");
    if (head && entry.repo.toLowerCase() !== head.repo.toLowerCase()) return fail("a line from another repository");
    if (head && Date.parse(entry.measuredAt) < Date.parse(head.measuredAt)) return fail("time goes backwards");
    if (entry.prev !== (head ? head.hash : GENESIS)) return fail("does not follow the line before it");
    if (typeof entry.hash !== "string" || !HEX64.test(entry.hash)) return fail("hash is missing or malformed");
    const { hash, ...body } = entry;
    if (sha256(canonicalJson(body)) !== hash) return fail("the line was changed after it was written (its hash no longer matches)");
    head = { seq: entry.seq, hash, measuredAt: entry.measuredAt, repo: entry.repo };
  }
  return { ok: true, entries: lines.length, head };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node verify-cra-log.mjs yourlog.jsonl");
    process.exit(2);
  }
  const result = verifyChain(readFileSync(file, "utf8"));
  if (!result.ok) {
    console.log(`NOT OK at line ${result.error.line}: ${result.error.reason} (${result.entries} lines before it were fine)`);
    process.exit(1);
  }
  console.log(`ok: ${result.entries} lines, head ${result.head ? `${result.head.seq} ${result.head.hash}` : "none (empty log)"}`);
  console.log("This shows the lines belong together and were not changed. When they were written is shown by the timestamp of the head.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
