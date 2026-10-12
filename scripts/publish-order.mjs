// publish-order.mjs
//
// Publishes the packages that are not yet on npm, in dependency order, and after
// each one waits until the registry actually serves that exact version before
// starting the next.
//
// That waiting is the whole point. A publish workflow reporting success proves
// only that a step exited zero. endpoint-attest was published on 2026-09-29 by a
// workflow whose every step went green, and it is not on the registry today.
// trust-attest-server shipped depending on it and has failed to install for every
// user since. The registry is the only witness that counts, so this asks it.
//
// It compares the EXACT version this repo intends to publish, not just whether
// the name exists. The first version of this script asked only about the name,
// and would therefore have skipped trust-attest-server entirely, because 0.1.0 is
// on npm. 0.1.0 is the broken one. 0.1.1 is the fix. Skipping it would have been
// the single most expensive thing this script could do.
//
//   node scripts/publish-order.mjs --dry-run   plan only, touches nothing
//   node scripts/publish-order.mjs             really publishes
//
// Requires gh, authenticated, with the repo NPM_TOKEN secret in place.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STEPS = [
  { dir: "net-guard", workflow: "publish-net-guard.yml", why: "depends on no other workspace" },
  { dir: "endpoint-attest", workflow: "publish-endpoint-attest.yml", why: "needs capacity-attest, already on npm" },
  { dir: "trust-attest-server", workflow: "publish-trust-attest-server.yml", why: "needs both packages above" },
];

const REGISTRY = "https://registry.npmjs.org";
const POLL_MS = 15000;
const MAX_POLLS = 40; // ten minutes per package
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

/** The name and version this repo intends to publish. A different question from "is this name on npm". */
function intended(dir) {
  const json = JSON.parse(readFileSync(join(ROOT, "packages", dir, "package.json"), "utf8"));
  return { pkg: json.name, version: json.version };
}

async function versionOnNpm(pkg, version) {
  const res = await fetch(REGISTRY + "/" + encodeURIComponent(pkg), { headers: { accept: "application/json" } });
  if (res.status === 404) return { nameExists: false, hasVersion: false, latest: null };
  if (!res.ok) throw new Error("registry lookup for " + pkg + " failed: HTTP " + res.status);
  const body = await res.json();
  return {
    nameExists: true,
    hasVersion: Boolean(body.versions && body.versions[version]),
    latest: (body["dist-tags"] && body["dist-tags"].latest) || null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(dryRun ? "DRY RUN, nothing will be published." : "Publishing for real.");
  console.log("");

  for (const step of STEPS) {
    const { pkg, version } = intended(step.dir);
    const state = await versionOnNpm(pkg, version);

    if (state.hasVersion) {
      console.log(pkg + "@" + version + ": already on npm, skipping");
      continue;
    }
    const where = state.nameExists
      ? "name exists at " + state.latest + ", but " + version + " is not published"
      : "name not on npm at all";
    console.log(pkg + "@" + version + ": " + where + " (" + step.why + ")");

    if (dryRun) {
      console.log("  would run: gh workflow run " + step.workflow + " -f confirm=publish");
      continue;
    }

    execFileSync("gh", ["workflow", "run", step.workflow, "-f", "confirm=publish"], { stdio: "inherit" });
    console.log("  dispatched " + step.workflow + ", waiting for the registry to serve it");

    let served = false;
    for (let i = 0; i < MAX_POLLS && !served; i++) {
      await sleep(POLL_MS);
      served = (await versionOnNpm(pkg, version)).hasVersion;
      if (!served && i % 4 === 3) console.log("  still waiting (" + (i + 1) * (POLL_MS / 1000) + "s)");
    }

    if (!served) {
      console.error("");
      console.error(pkg + "@" + version + " never appeared on npm. Read the workflow run before retrying:");
      console.error("  gh run list --workflow " + step.workflow + " --limit 1");
      console.error("A green workflow does not mean the package is there. That gap is why this script exists.");
      process.exitCode = 1;
      return;
    }
    console.log("  " + pkg + "@" + version + " is live on npm");
  }

  console.log("");
  console.log("Final check: can an outsider actually install what we ship?");
  console.log("  In an empty directory, outside this repo:");
  console.log("    npm init -y && npm install trust-attest-server");
  console.log("  Until that succeeds, nothing has actually shipped.");
}

await main();
