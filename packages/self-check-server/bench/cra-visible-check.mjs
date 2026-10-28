#!/usr/bin/env node
// cra-visible-check.mjs: the other side of the hand check. For EVERY repository the module called "visible" for the security policy, the SBOM,
// release provenance and the security scan, print the line that earned the credit, so each case can be judged by eye (precision, not recall).
//
//   node bench/cra-visible-check.mjs <raw.json>        (needs the GitHub CLI, gh, logged in)
//
// In our runs reading these lines found a workflow that deleted the CodeQL cache (not a scan), a version number counted as an address, and
// an address on a .local domain. Repository names are printed to the terminal only. Nothing is written to a file.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const rawFile = process.argv[2];
if (!rawFile) {
  console.error("give the raw file of a benchmark run");
  process.exit(2);
}
const raw = JSON.parse(readFileSync(rawFile, "utf8"));
const gh = (args) => {
  try {
    return execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 50_000_000 });
  } catch {
    return null;
  }
};
const rawText = (repo, path) => gh([`repos/${repo}/contents/${path}`, "-H", "Accept: application/vnd.github.raw"]);
const unique = [...new Map(raw.results.map((r) => [r.repo.toLowerCase(), r])).values()];
const visible = (id) => unique.filter((r) => r.controls.find((c) => c.id === id)?.status === "visible").map((r) => ({ repo: r.repo, evidence: String(r.controls.find((c) => c.id === id).evidence ?? "") }));
const nonComment = (t) => t.split("\n").filter((l) => !/^\s*#/.test(l));
const patterns = {
  sbom: /sbom|cyclonedx|syft|spdx|cdxgen/i,
  "release-provenance": /attest|provenance|cosign|sigstore|slsa|gpg --detach|minisign/i,
  "security-scanning": /codeql|semgrep|trivy|grype|osv-scanner|snyk|gitleaks|trufflehog|scorecard|npm audit|pip-audit|cargo audit|govulncheck|bandit|brakeman|sonar|dependency-review/i,
};

function workflowLine(repo, id) {
  const tree = gh([`repos/${repo}/git/trees/HEAD?recursive=1`]);
  const workflows = (tree ? JSON.parse(tree).tree : []).map((x) => x.path).filter((f) => /^\.github\/workflows\/.+\.ya?ml$/i.test(f));
  for (const f of workflows.slice(0, 40)) {
    const text = rawText(repo, f);
    const hit = text && nonComment(text).find((l) => patterns[id].test(l));
    if (hit) return `${f}: ${hit.trim().slice(0, 110)}`;
  }
  return null;
}

for (const id of ["vulnerability-policy", "sbom", "release-provenance", "security-scanning"]) {
  const list = visible(id);
  console.log(`\n== ${id}: ${list.length} unique "visible"`);
  for (const { repo, evidence } of list) {
    let shown;
    if (id === "vulnerability-policy") {
      const ownerFile = evidence.includes(".github:");
      const where = ownerFile ? `${evidence.split(".github:")[0].replace(/\/$/, "")}/.github` : repo;
      const path = ownerFile ? evidence.split(".github:")[1].trim().split(" ")[0] : evidence.split(" ")[0];
      const text = rawText(where, path) ?? "";
      const line = text.split("\n").find((l) => /[\w.%+-]+@[\w-]+\.[\w.-]+|https?:\/\/\S*(security|advis|report|disclos|vulnerab|psirt|cert|bounty|hackerone|bugcrowd|intigriti|contact)/i.test(l) && !/badge|shields\.io/i.test(l));
      shown = `${path} | ${line ? line.trim().slice(0, 110) : "NO CONTACT LINE FOUND"}`;
    } else if (id === "security-scanning" || /workflow/.test(evidence) || !/[./]/.test(evidence)) {
      shown = workflowLine(repo, id) ?? `NO LINE FOUND: ${evidence.slice(0, 60)}`;
    } else {
      shown = evidence.slice(0, 100);
    }
    console.log(`  ${repo.padEnd(46)} ${shown}`);
  }
}
