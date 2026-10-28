#!/usr/bin/env node
// cra-benchmark.mjs — measures the eight CRA points on a sample of public repositories with EXACTLY the code the
// website uses (dist/cra-repo-check.js), so the totals we publish cannot differ from what a visitor gets.
//
// The sample rule is written down before the run (wazir-al-ghanima knowledge/mamlaka/raad/2026-10-28-cra-benchmark-voorspelling.md):
//   1. countries: NL, DE, FR, BE, SE, FI, IE, ES, IT, DK
//   2. per country the first 20 organisations of the GitHub search  type:org location:<country>  sorted by public repo count, descending
//   3. per organisation the most recently pushed repository (looking at the first 10) that is no fork, not archived, no template and has
//      at least one published release. No such repository: the organisation drops out, no replacement.
//   4. at most 200 repositories
//
// Usage:  CRA_BENCH_TOKEN=... node bench/cra-benchmark.mjs --raw=raw.json --totals=totals.json [--limit=200] [--per-country=20]
// The raw file holds repository names and stays on the machine that ran this. Only the totals file is meant to leave it.
// Reading only: public GitHub endpoints. The token raises the allowance and is never printed or written.

import { writeFileSync } from "node:fs";
import { assessRepo, fetchSignals, RULES_VERSION } from "../dist/cra-repo-check.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const TOKEN = process.env.CRA_BENCH_TOKEN || undefined;
const LIMIT = Number(args.limit ?? 200);
const PER_COUNTRY = Number(args["per-country"] ?? 20);
const COUNTRIES = ["Netherlands", "Germany", "France", "Belgium", "Sweden", "Finland", "Ireland", "Spain", "Italy", "Denmark"];
if (!args.raw || !args.totals) {
  console.error("give --raw=<file> and --totals=<file>");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path) {
  const headers = { "user-agent": "tokenizen-cra-benchmark", accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.status === 403 || res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 30) * 1000;
      console.error(`rate limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(Math.min(wait, 120_000));
      continue;
    }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

const picked = [];
let orgsSeen = 0;
let orgsDropped = 0;

for (const country of COUNTRIES) {
  if (picked.length >= LIMIT) break;
  const q = encodeURIComponent(`type:org location:${country}`);
  const found = await api(`/search/users?q=${q}&sort=repositories&order=desc&per_page=${PER_COUNTRY}`);
  await sleep(2200);
  const orgs = (found?.items ?? []).slice(0, PER_COUNTRY);
  for (const org of orgs) {
    if (picked.length >= LIMIT) break;
    orgsSeen++;
    const repos = await api(`/orgs/${encodeURIComponent(org.login)}/repos?type=public&sort=pushed&direction=desc&per_page=10`);
    let chosen = null;
    for (const r of repos ?? []) {
      if (r.fork || r.archived || r.is_template) continue;
      const rel = await api(`/repos/${r.full_name}/releases?per_page=3`);
      if (Array.isArray(rel) && rel.some((x) => !x.draft)) {
        chosen = r.full_name;
        break;
      }
    }
    if (chosen) picked.push({ country, org: org.login, repo: chosen });
    else orgsDropped++;
  }
  console.error(`${country}: ${picked.length} repositories so far`);
}

const results = [];
let next = 0;
async function worker() {
  while (next < picked.length) {
    const item = picked[next++];
    const signals = await fetchSignals(item.repo, { fetchImpl: fetch, token: TOKEN, signal: AbortSignal.timeout(60_000) });
    if (signals.rateLimited) {
      console.error("rate limited during a measurement, waiting 60s");
      await sleep(60_000);
      next--;
      continue;
    }
    if (signals.notFound) continue;
    results.push({ ...item, report: assessRepo(signals) });
    if (results.length % 20 === 0) console.error(`measured ${results.length}`);
  }
}
await Promise.all([worker(), worker(), worker()]);

const ids = results[0]?.report.controls.map((c) => c.id) ?? [];
const perControl = {};
for (const id of ids) {
  const counts = { visible: 0, not_visible: 0, not_measured: 0 };
  for (const r of results) counts[r.report.controls.find((c) => c.id === id)?.status ?? "not_measured"]++;
  const measured = counts.visible + counts.not_visible;
  perControl[id] = { ...counts, measured, shareVisibleOfMeasured: measured ? Math.round((1000 * counts.visible) / measured) / 10 : null };
}
const perCountry = {};
for (const r of results) perCountry[r.country] = (perCountry[r.country] ?? 0) + 1;

// ten random "not visible" findings, to be checked by hand against the repository itself before any total goes out
const notVisible = results.flatMap((r) => r.report.controls.filter((c) => c.status === "not_visible").map((c) => ({ repo: r.repo, control: c.id })));
const handCheck = [];
const pool = [...notVisible];
while (handCheck.length < 10 && pool.length) handCheck.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

const totals = {
  measuredOn: new Date().toISOString(),
  rulesVersion: RULES_VERSION,
  sampleRule: "see 2026-10-28-cra-benchmark-voorspelling.md",
  organisationsExamined: orgsSeen,
  organisationsWithoutQualifyingRepository: orgsDropped,
  repositoriesMeasured: results.length,
  repositoriesPerCountry: perCountry,
  controls: perControl,
};
writeFileSync(args.totals, JSON.stringify(totals, null, 2));
writeFileSync(args.raw, JSON.stringify({ totals, handCheck, results: results.map((r) => ({ country: r.country, org: r.org, repo: r.repo, controls: r.report.controls.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence })) })) }, null, 2));
console.error(`done: ${results.length} repositories measured`);
