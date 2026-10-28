#!/usr/bin/env node
// cra-hand-check.mjs: a seeded random sample of "not visible" findings, looked at again with a method that is NOT the module's:
// the whole file tree, EVERY workflow file (up to 40, comments left out), other CI systems, the latest releases, dependency-bot files.
//
//   node bench/cra-hand-check.mjs <raw.json> <seed> [perSignal=5]     (needs the GitHub CLI, gh, logged in)
//
// It prints one line per case: CONFIRMED (nothing found anywhere) or POSSIBLE MISS (with what was found). The patterns here are
// deliberately broader than the module's, so a POSSIBLE MISS is a reason to read the repository, not a verdict: in our runs a flagged case
// was a real miss of the module, a false alarm of this script (the word "bearer" in a file name), or a definition we keep (a scanner
// only configured in another tool's file). Read every one. The same seed on the same raw file gives the same sample.
// Repository names are printed to the terminal only. Nothing is written to a file.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [rawFile, seedArg, perArg] = process.argv.slice(2);
if (!rawFile || !seedArg) {
  console.error("usage: node bench/cra-hand-check.mjs <raw.json> <seed> [perSignal]");
  process.exit(2);
}
const raw = JSON.parse(readFileSync(rawFile, "utf8"));
const PER = Number(perArg ?? 5);

function rng(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(Number(seedArg));
const gh = (args) => {
  try {
    return execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 50_000_000 });
  } catch {
    return null;
  }
};
const ghJson = (path) => {
  const out = gh([path]);
  return out === null ? null : JSON.parse(out);
};
const rawText = (repo, path) => gh([`repos/${repo}/contents/${path}`, "-H", "Accept: application/vnd.github.raw"]);
const noComments = (t) => t.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

const patterns = {
  sbom: /sbom|cyclonedx|\.spdx|\.cdx|bom\.(json|xml)|syft|anchore\/sbom|spdx/i,
  "release-provenance": /\.(sig|asc|minisig|sigstore|intoto\.jsonl|attestation)$|sigstore|cosign|attest|provenance|slsa|gpg --detach|minisign|goreleaser/i,
  "security-scanning": /codeql|semgrep|trivy|grype|osv-scanner|snyk|gitleaks|trufflehog|scorecard|npm audit|pip-audit|cargo audit|cargo-audit|cargo deny|govulncheck|bandit|brakeman|sonar|dependency-review|safety check|checkov|tfsec|kics|bearer|devskim|hadolint|zizmor|clair|veracode|fossa|whitesource|mend|dependabot-alerts/i,
};
const botFiles = /^(\.github\/dependabot\.ya?ml|(\.github\/|\.gitlab\/)?renovate\.json5?|\.renovaterc(\.json5?)?|\.dependabot\/config\.ya?ml|\.pyup\.ya?ml|greenkeeper\.json|\.snyk|\.whitesource)$/i;

const unique = [...new Map(raw.results.map((r) => [r.repo.toLowerCase(), r])).values()];
const gapsOf = (control) => unique.filter((r) => r.controls.find((c) => c.id === control)?.status === "not_visible");
function pick(list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

function check(repo, control) {
  if (control === "maintenance") {
    const commits = ghJson(`repos/${repo}/commits?per_page=1`);
    const last = commits?.[0]?.commit?.committer?.date;
    const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
    return { verdict: days !== null && days > 90 ? "CONFIRMED" : "POSSIBLE MISS", detail: `last commit ${last} (${days} days)` };
  }
  const tree = ghJson(`repos/${repo}/git/trees/HEAD?recursive=1`);
  const files = (tree?.tree ?? []).filter((x) => x.type === "blob").map((x) => x.path);
  const found = [];
  if (tree?.truncated) found.push("(tree cut off)");
  if (control === "dependency-updates") {
    found.push(...files.filter((f) => botFiles.test(f)).slice(0, 4));
    const pkg = rawText(repo, "package.json");
    if (pkg && /"renovate"\s*:/.test(pkg)) found.push("package.json has a renovate key");
  } else {
    found.push(...files.filter((f) => patterns[control].test(f)).slice(0, 4));
  }
  const workflows = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/i.test(f));
  const rx = control === "dependency-updates" ? /renovate|dependabot/i : patterns[control];
  const hits = [];
  for (const f of workflows.slice(0, 40)) {
    const text = rawText(repo, f);
    if (text && rx.test(noComments(text))) hits.push(f);
  }
  if (hits.length) found.push(`workflows: ${hits.slice(0, 3).join(", ")}`);
  for (const f of files.filter((x) => /^(Jenkinsfile|\.gitlab-ci\.yml|azure-pipelines\.yml|\.circleci\/config\.yml|\.travis\.yml|bitbucket-pipelines\.yml|\.drone\.yml)$/.test(x))) {
    const text = rawText(repo, f);
    if (text && rx.test(noComments(text))) found.push(`other CI: ${f}`);
  }
  if (control === "release-provenance") {
    const releases = ghJson(`repos/${repo}/releases?per_page=3`);
    const assets = (releases ?? []).flatMap((r) => (r.assets ?? []).map((a) => a.name)).filter((a) => patterns[control].test(a));
    if (assets.length) found.push(`release files: ${assets.slice(0, 3).join(", ")}`);
  }
  return { verdict: found.length ? "POSSIBLE MISS" : "CONFIRMED", detail: found.join(" | ") || `${files.length} files, ${workflows.length} workflows, nothing found` };
}

let confirmed = 0;
let possible = 0;
for (const control of ["sbom", "release-provenance", "security-scanning", "dependency-updates", "maintenance"]) {
  const gaps = gapsOf(control);
  const sample = pick(gaps, control === "maintenance" ? 3 : PER);
  console.log(`\n== ${control}: ${gaps.length} unique gaps, ${sample.length} checked`);
  for (const r of sample) {
    const out = check(r.repo, control);
    if (out.verdict === "CONFIRMED") confirmed++;
    else possible++;
    console.log(`  ${out.verdict.padEnd(13)} ${r.repo}  ${out.detail}`.slice(0, 260));
  }
}
console.log(`\nTOTAL: ${confirmed} confirmed, ${possible} possible miss(es), of ${confirmed + possible} gaps checked`);
