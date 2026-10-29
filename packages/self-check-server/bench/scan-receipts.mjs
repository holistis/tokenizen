#!/usr/bin/env node
// scan-receipts.mjs: keeps the public list of delivered scan reports (see src/scan-receipts.ts for what the chain does and does not prove).
//
//   node bench/scan-receipts.mjs fetch --feed=<url> --log=<file.jsonl>     read the feed, add the reports that are not in the list yet
//   node bench/scan-receipts.mjs verify <file.jsonl>                       check the list from its text alone, exit 1 on a problem
//   node bench/scan-receipts.mjs head --log=<file.jsonl> --out=<head.txt>  verify, then write the one line that gets the timestamp
//
// The timestamp outside our control is a separate step on head.txt:  ots stamp head.txt   (OpenTimestamps, only a hash leaves the machine).
// A stamp is "pending" at first and is confirmed by a Bitcoin block some hours later; until then it is not an anchor.
// Reading only: the feed lists a hash of each job number, the hash of each report, the outcome, the coverage and the delivery time.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import { appendReceipts, parseFeed, receiptHeadFile, verifyReceiptChain } from "../dist/scan-receipts.js";

const [command, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.replace(/^--/, "").split("=")));
const positional = rest.filter((a) => !a.startsWith("--"));

/** Write to a temporary file in the same folder, then rename: a crash cannot leave half a line in the list. */
function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

async function fetchFeed() {
  if (!flags.feed || !flags.log) throw new Error("give --feed=<url> and --log=<file.jsonl>");
  const url = new URL(flags.feed);
  const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !local) throw new Error("the feed must be an https address");
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "tokenizen-scan-receipts/1" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`the feed answered ${response.status}`);
  const { receipts, rejected } = parseFeed(await response.json());
  const before = existsSync(flags.log) ? readFileSync(flags.log, "utf8") : "";
  const { text, added, alreadyLogged, changedSinceLogged } = appendReceipts(before, receipts, new Date().toISOString());
  if (added.length > 0) writeAtomic(flags.log, text);
  console.log(`${added.length} added, ${alreadyLogged} already in the list, ${rejected} items of the feed refused`);
  if (changedSinceLogged > 0) {
    // A report whose hash differs from the one we logged is exactly what the list exists to show. Do not hide it.
    console.error(`WARNING: ${changedSinceLogged} report(s) have a different hash now than when they were logged`);
    process.exit(3);
  }
}

function verify() {
  const file = positional[0];
  if (!file) throw new Error("give the file to check");
  const check = verifyReceiptChain(readFileSync(file, "utf8"));
  if (check.ok) {
    console.log(`ok: ${check.entries} lines, head ${check.head ? `${check.head.seq} ${check.head.hash}` : "(empty)"}`);
    return;
  }
  console.error(`NOT OK at line ${check.error.line}: ${check.error.reason} (${check.entries} lines before it were fine)`);
  process.exit(1);
}

function head() {
  if (!flags.log || !flags.out) throw new Error("give --log=<file.jsonl> and --out=<head.txt>");
  const check = verifyReceiptChain(readFileSync(flags.log, "utf8"));
  if (!check.ok) {
    console.error(`NOT OK at line ${check.error.line}: ${check.error.reason}; no head file written`);
    process.exit(1);
  }
  writeAtomic(flags.out, receiptHeadFile(check.head));
  console.log(`head ${check.head.seq} ${check.head.hash} written to ${flags.out}`);
}

try {
  if (command === "fetch") await fetchFeed();
  else if (command === "verify") verify();
  else if (command === "head") head();
  else throw new Error("use: fetch | verify | head");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
}
