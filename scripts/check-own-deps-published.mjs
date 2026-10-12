// check-own-deps-published.mjs
//
// Refuses a publishable package that depends on one of OUR OWN packages at a
// version range the npm registry cannot satisfy.
//
// This exists because that is not a hypothetical. trust-attest-server@0.1.0 was
// published on 2026-09-29 declaring endpoint-attest@^0.1.0, which is not on the
// registry. Every "npm install trust-attest-server" since has failed with E404.
// Nothing caught it, because inside this monorepo the dependency resolves
// perfectly: npm symlinks the workspace, the build is green, the tests pass. The
// package only breaks for someone who is not us, which is exactly the person we
// are shipping to.
//
// Scope is deliberately narrow: only dependencies whose name matches another
// package in this repo. External dependencies are already proven to resolve by
// "npm ci" on a clean runner; our own are not, and never will be by any step that
// runs inside the workspace.
//
// Exit 0 = every own-dependency resolves. Exit 1 = it would ship broken.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "packages");

/** Minimal caret/tilde/exact range satisfaction, enough for the ranges this repo uses. */
export function satisfies(version, range) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const v = parse(version);
  if (!v) return false;
  const cleaned = range.trim();
  if (cleaned === "*" || cleaned === "latest") return true;
  const op = cleaned.startsWith("^") ? "^" : cleaned.startsWith("~") ? "~" : "=";
  const b = parse(cleaned.replace(/^[\^~]/, ""));
  if (!b) return false;
  const gte = v[0] > b[0] || (v[0] === b[0] && (v[1] > b[1] || (v[1] === b[1] && v[2] >= b[2])));
  if (!gte) return false;
  if (op === "=") return v[0] === b[0] && v[1] === b[1] && v[2] === b[2];
  // npm's caret on a 0.x version pins the MINOR, not just the major: ^0.1.0
  // allows 0.1.9 but never 0.2.0. Getting this wrong would wave through exactly
  // the mismatch this script exists to catch.
  if (op === "^") return b[0] === 0 ? v[0] === 0 && v[1] === b[1] : v[0] === b[0];
  return v[0] === b[0] && v[1] === b[1]; // ~
}

export function readLocalPackages(dir) {
  const out = new Map();
  for (const name of readdirSync(dir)) {
    const pj = join(dir, name, "package.json");
    if (!existsSync(pj)) continue;
    const json = JSON.parse(readFileSync(pj, "utf8"));
    out.set(json.name, { dir: name, private: Boolean(json.private), json });
  }
  return out;
}

async function publishedVersions(name, fetchImpl = fetch) {
  const res = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`registry lookup for ${name} failed: HTTP ${res.status}`);
  const body = await res.json();
  return Object.keys(body.versions ?? {});
}

export async function check(dir = PACKAGES_DIR, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.publishedVersions ?? ((n) => publishedVersions(n, fetchImpl));
  const local = deps.localPackages ?? readLocalPackages(dir);
  const only = deps.only ?? null; // beperk tot EEN pakket: de publicatie-poort
  const problems = [];

  for (const [name, info] of local) {
    if (only && name !== only) continue;
    if (info.private) continue; // never published, so it ships to nobody
    for (const [depName, range] of Object.entries(info.json.dependencies ?? {})) {
      if (!local.has(depName)) continue; // external, proven by npm ci
      const versions = await lookup(depName);
      if (versions.length === 0) {
        problems.push(`${name} depends on ${depName}@${range}, but ${depName} is not on npm at all`);
        continue;
      }
      if (!versions.some((v) => satisfies(v, range))) {
        problems.push(
          `${name} depends on ${depName}@${range}, but npm has only [${versions.join(", ")}]`,
        );
      }
    }
  }
  return problems;
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--package="));
  const only = arg ? arg.slice("--package=".length) : null;
  const problems = await check(undefined, only ? { only } : {});
  if (problems.length === 0) {
    console.log(
      only
        ? `own-dependency check: ${only} resolves on npm`
        : "own-dependency check: every package we publish resolves on npm",
    );
    process.exitCode = 0;
  } else {
    console.error("own-dependency check FAILED. This would be uninstallable outside this repo:");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("Publish the missing dependency first, or correct the range.");
    process.exitCode = 1;
  }
}
