// publish-workflows-deps.test.mjs
//
// A publish workflow runs `npm ci` and then typechecks the one package it ships.
// Inside the workspace a dependency such as net-guard is only a symlink to a
// folder whose `dist` does not exist until somebody builds it. CI builds in the
// right order, the publish workflows used to repeat that order by hand, and
// when capacity-attest started to import net-guard the capacity-attest publish
// failed at Typecheck (run 41691941596, 3 Nov 2026) while CI stayed green.
//
// This test reads the workspace, works out which sibling packages each published
// package needs (directly or through another package), and requires the workflow
// to build every one of them, each after the ones it needs, before Typecheck.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function workspacePackages(root = ROOT) {
  const dir = join(root, "packages");
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "package.json")))
    .map((d) => ({ dir: d, ...JSON.parse(readFileSync(join(dir, d, "package.json"), "utf8")) }));
}

function siblingDeps(pkg, byName) {
  const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  return Object.keys(all).filter((n) => byName.has(n)).map((n) => byName.get(n));
}

/** Every workspace package `pkg` needs built before it can be typechecked, including indirect ones. */
export function neededBuilds(pkg, packages) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const seen = new Set();
  (function walk(p) {
    for (const d of siblingDeps(p, byName)) {
      if (!seen.has(d.dir)) { seen.add(d.dir); walk(d); }
    }
  })(pkg);
  return [...seen].map((dir) => packages.find((p) => p.dir === dir));
}

/** Problems found in one workflow text for one published package. Empty means fine. */
export function workflowProblems(text, pkg, packages) {
  const yml = text.replace(/\r\n/g, "\n");
  const byName = new Map(packages.map((p) => [p.name, p]));
  const typecheckAt = yml.indexOf("npm run typecheck");
  const buildAt = (dir) => yml.indexOf(`working-directory: packages/${dir}\n        run: npm run build`);
  const problems = [];
  const needed = neededBuilds(pkg, packages);
  for (const dep of needed) {
    const at = buildAt(dep.dir);
    if (at === -1) { problems.push(`${dep.dir} is needed (${pkg.name} depends on it) but the workflow never builds it`); continue; }
    if (typecheckAt !== -1 && at > typecheckAt) problems.push(`${dep.dir} is built after the typecheck, which is too late`);
    for (const inner of siblingDeps(dep, byName)) {
      const innerAt = buildAt(inner.dir);
      if (innerAt !== -1 && innerAt > at) problems.push(`${inner.dir} must be built before ${dep.dir}, which needs it`);
    }
  }
  return problems;
}

const packages = workspacePackages();
const workflowDir = join(ROOT, ".github", "workflows");
const publishing = readdirSync(workflowDir)
  .filter((f) => /^publish-.*\.yml$/.test(f))
  .map((f) => ({ f, text: readFileSync(join(workflowDir, f), "utf8") }))
  .map((w) => ({ ...w, name: (w.text.match(/--package=([^\s]+)/) || [])[1] }))
  .filter((w) => w.name);

test("there are publish workflows to check, so an empty list cannot pass silently", () => {
  assert.ok(publishing.length >= 3, `expected at least 3 publish workflows with --package, found ${publishing.length}`);
});

for (const w of publishing) {
  test(`${w.f} builds every sibling package ${w.name} needs, in dependency order, before the typecheck`, () => {
    const pkg = packages.find((p) => p.name === w.name);
    assert.ok(pkg, `${w.name} is not a package in this workspace`);
    assert.deepEqual(workflowProblems(w.text, pkg, packages), []);
  });
}

test("the check is able to fail: a workflow without the net-guard build is reported", () => {
  const cap = packages.find((p) => p.name === "capacity-attest");
  const text = "steps:\n      - name: Typecheck\n        run: npm run typecheck\n";
  const problems = workflowProblems(text, cap, packages);
  assert.ok(problems.some((p) => p.startsWith("net-guard is needed")), problems.join("; "));
});

test("the check is able to fail: a wrong build order is reported", () => {
  const ea = packages.find((p) => p.name === "endpoint-attest");
  const step = (d) => `      - name: Build ${d}\n        working-directory: packages/${d}\n        run: npm run build\n`;
  const text = "steps:\n" + step("capacity-attest") + step("net-guard") + "      - name: Typecheck\n        run: npm run typecheck\n";
  const problems = workflowProblems(text, ea, packages);
  assert.ok(problems.some((p) => p.includes("net-guard must be built before capacity-attest")), problems.join("; "));
});
