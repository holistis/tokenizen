#!/usr/bin/env node
// scoreboard-regel.mjs: checks the Publication Rule for scan results against the real scoreboard.
// Source and licence: https://github.com/holistis/tokenizen (MIT), made by tokenizen.nl.
// SPDX-License-Identifier: MIT
//
//   node scripts/scoreboard-regel.mjs                              regressions: does every run that scored lower than the run before it say so?
//   node scripts/scoreboard-regel.mjs --results <results folder>   also: is every folder of the results folder of the open repository on the scoreboard in time?
//   node scripts/scoreboard-regel.mjs --today 2026-11-02           pretend it is another day (the window is 7 days)
//
// The rule: https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PUBLICATION-RULE-scan-results.md
// It reads src/data/scoreboard.ts and src/lib/scoreboard-regel.ts as they are, so it needs a Node that runs TypeScript files (22.18 or newer, or 24).
// It reads local files only: no network, no secret, nothing written. Exit 0 = nothing to report, 1 = the rule is not being kept, 2 = could not run.

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const site = resolve(here, "../packages/website/src");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const resultsDir = flag("--results");
const today = flag("--today") ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error("--today must look like 2026-11-02");
  process.exit(2);
}

let data;
let rule;
try {
  data = await import(pathToFileURL(resolve(site, "data/scoreboard.ts")).href);
  rule = await import(pathToFileURL(resolve(site, "lib/scoreboard-regel.ts")).href);
} catch (e) {
  console.error(`Could not load the TypeScript files (${e instanceof Error ? e.message : e}). Use Node 22.18 or newer.`);
  process.exit(2);
}

const { SCORE_RUNS, SCORE_RUNS_NL } = data;
let red = false;

console.log(`Publication Rule check, ${today}`);
for (const [setId, list] of rule.runsPerSet(SCORE_RUNS)) {
  console.log(`\nSet ${setId}:`);
  for (const r of list) console.log(`  ${r.date}  version ${r.version.padEnd(4)}  ${r.found} of ${r.known}  (${r.id})`);
}

const lower = rule.findRegressions(SCORE_RUNS);
const unsaid = rule.regressionsWithoutNote(SCORE_RUNS, SCORE_RUNS_NL);
console.log(`\nRuns that scored lower than the run before them: ${lower.length}`);
for (const r of lower) {
  const open = unsaid.includes(r);
  console.log(`  ${r.next.id} (${r.next.found}) after ${r.prev.id} (${r.prev.found}): ${open ? "the row does NOT say so yet" : "the row says so"}`);
}
if (unsaid.length > 0) {
  red = true;
  console.log("\nPut this in the note of the row, English and Dutch:");
  for (const r of unsaid) {
    console.log(`\n  ${r.next.id}\n  EN: ${rule.regressionBlock(r, "en")}\n  NL: ${rule.regressionBlock(r, "nl")}`);
  }
}

if (resultsDir) {
  let names;
  try {
    names = readdirSync(resolve(resultsDir), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) {
    console.error(`\nCould not read ${resultsDir}: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const { overdue, due } = rule.unlinkedResultDirs(SCORE_RUNS, names, today);
  console.log(`\nResult folders: ${names.length}, not linked from the scoreboard and still inside the ${rule.WINDOW_DAYS} days: ${due.length}, past it: ${overdue.length}`);
  for (const d of due) console.log(`  due soon: ${d.name} (${d.ageDays} days old)`);
  for (const d of overdue) {
    red = true;
    console.log(`  OVERDUE:  ${d.name} (${d.ageDays} days old). Put a row on the scoreboard, or name it as an exception with a reason in scoreboard-regel.ts.`);
  }
}

console.log(red ? "\nRED: the rule is not being kept." : "\nGREEN: nothing to report.");
process.exit(red ? 1 : 0);
