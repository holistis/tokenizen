#!/usr/bin/env node
// cra-log.mjs: keeps the log of weekly measurements of public repositories (see src/cra-log.ts for what the chain does and does not prove).
//
//   node bench/cra-log.mjs append --repo owner/name --dir <logdir>     measure now (same code as the website) and add one line
//   node bench/cra-log.mjs verify <file.jsonl>                         check one log from its text alone, exit 1 on a problem
//   node bench/cra-log.mjs heads  --dir <logdir> --out <heads.txt>     verify every log, write one line per log: "<repo> <seq> <hash>"
//
// The weekly anchor outside our control is a separate step on heads.txt:  ots stamp heads.txt   (OpenTimestamps, only a hash leaves the
// machine). A stamp is "pending" at first and is confirmed by a Bitcoin block some hours later; until then it is not an anchor.
// Reading only: public GitHub endpoints. GITHUB_TOKEN (no permissions needed) raises the allowance; it is never printed or written.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { appendToLog, headsFile, verifyChain } from "../dist/cra-log.js";
import { assessRepo, fetchSignals, isComplete, parseRepo } from "../dist/cra-repo-check.js";

const [command, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.replace(/^--/, "").split("=")));
const positional = rest.filter((a) => !a.startsWith("--"));
const fileFor = (dir, repo) => join(dir, `${repo.toLowerCase().replace("/", "__")}.jsonl`);

/** Write to a temporary file in the same folder, then rename: a crash cannot leave half a line in the log. */
function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

async function append() {
  const repo = parseRepo(flags.repo);
  if (!repo || !flags.dir) throw new Error("give --repo=owner/name and --dir=<logdir>");
  mkdirSync(flags.dir, { recursive: true });
  const signals = await fetchSignals(repo, { fetchImpl: fetch, token: process.env.GITHUB_TOKEN || undefined, signal: AbortSignal.timeout(30_000) });
  const report = assessRepo(signals);
  const path = fileFor(flags.dir, report.repo);
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const { text, entry } = appendToLog(before, report);
  writeAtomic(path, text);
  console.log(`${report.repo}: line ${entry.seq}, ${report.summary.visible} visible, ${report.summary.notVisible} not visible, ${report.summary.notMeasured} not measured, rules ${entry.rules}, complete=${isComplete(signals)}, head ${entry.hash.slice(0, 12)}`);
}

function verify() {
  const file = positional[0];
  if (!file) throw new Error("give the file to check");
  const check = verifyChain(readFileSync(file, "utf8"));
  if (check.ok) {
    console.log(`ok: ${check.entries} lines, head ${check.head ? `${check.head.seq} ${check.head.hash}` : "(empty)"}`);
    return;
  }
  console.error(`NOT OK at line ${check.error.line}: ${check.error.reason} (${check.entries} lines before it were fine)`);
  process.exit(1);
}

function heads() {
  if (!flags.dir || !flags.out) throw new Error("give --dir=<logdir> and --out=<heads.txt>");
  const found = [];
  for (const name of readdirSync(flags.dir).filter((n) => n.endsWith(".jsonl")).sort()) {
    const check = verifyChain(readFileSync(join(flags.dir, name), "utf8"));
    if (!check.ok) {
      console.error(`${name}: NOT OK at line ${check.error.line}: ${check.error.reason}; no heads file written`);
      process.exit(1);
    }
    if (check.head) found.push(check.head);
  }
  writeAtomic(flags.out, headsFile(found));
  console.log(`${found.length} logs verified, heads written to ${flags.out}`);
}

try {
  if (command === "append") await append();
  else if (command === "verify") verify();
  else if (command === "heads") heads();
  else throw new Error("use: append | verify | heads");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
}
