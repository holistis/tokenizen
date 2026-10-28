#!/usr/bin/env node
// cra-check-against-github.mjs: a second opinion on two signals for EVERY repository of a benchmark run (a count, not a sample).
// For each repository the module called "not visible" or "visible" for the security policy and the licence, GitHub itself is asked (GraphQL:
// isSecurityPolicyEnabled, which also looks at the owner's .github repository, and licenseInfo).
//
//   node bench/cra-check-against-github.mjs <raw.json>        (the --raw file of cra-benchmark.mjs; needs the GitHub CLI, gh, logged in)
//
// What this can and cannot say:
// - The policy comparison is independent of the module. A difference is either a miss of the module or our stricter definition (a policy
//   file counts only if it names an address or a reporting link); read each difference.
// - The licence comparison is NOT independent: the module takes GitHub's own licence field as one of its inputs. Agreement is expected.
// Repository names are printed to the terminal only, for the differences. Nothing is written to a file.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const rawFile = process.argv[2];
if (!rawFile) {
  console.error("give the raw file of a benchmark run");
  process.exit(2);
}
const raw = JSON.parse(readFileSync(rawFile, "utf8"));
const unique = [...new Map(raw.results.map((r) => [r.repo.toLowerCase(), r])).values()];
const withStatus = (id, status) => unique.filter((r) => r.controls.find((c) => c.id === id)?.status === status).map((r) => r.repo);

function ask(repos) {
  const query =
    "{" +
    repos
      .map((full, i) => {
        const [owner, name] = full.split("/");
        return `r${i}: repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){isSecurityPolicyEnabled securityPolicyUrl licenseInfo{spdxId}}`;
      })
      .join(" ") +
    "}";
  const data = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], { encoding: "utf8", maxBuffer: 20_000_000 })).data;
  return repos.map((full, i) => ({ full, ...(data[`r${i}`] ?? { missing: true }) }));
}
const askAll = (repos) => {
  const out = [];
  for (let i = 0; i < repos.length; i += 15) out.push(...ask(repos.slice(i, i + 15)));
  return out;
};

const policyGaps = askAll(withStatus("vulnerability-policy", "not_visible"));
const policyHits = askAll(withStatus("vulnerability-policy", "visible"));
console.log(`Security policy, "not visible" by the module: ${policyGaps.length}. GitHub sees a policy at ${policyGaps.filter((x) => x.isSecurityPolicyEnabled).length}, none at ${policyGaps.filter((x) => x.isSecurityPolicyEnabled === false).length}, cannot say at ${policyGaps.filter((x) => x.missing).length}.`);
console.log(`Security policy, "visible" by the module: ${policyHits.length}. GitHub sees none at ${policyHits.filter((x) => x.isSecurityPolicyEnabled === false).length}.`);
for (const d of policyGaps.filter((x) => x.isSecurityPolicyEnabled)) console.log(`  DIFFERENCE (GitHub sees a policy, the module does not): ${d.full} ${d.securityPolicyUrl}`);

const licGaps = askAll(withStatus("license", "not_visible"));
const licHits = askAll(withStatus("license", "visible"));
console.log(`Licence, "not visible" by the module: ${licGaps.length}. GitHub recognises a licence at ${licGaps.filter((x) => x.licenseInfo).length} (not independent, see above).`);
console.log(`Licence, "visible" by the module: ${licHits.length}. GitHub recognises none at ${licHits.filter((x) => !x.licenseInfo).length}.`);
