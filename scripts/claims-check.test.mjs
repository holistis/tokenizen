// claims-check.test.mjs : tests for scripts/claims-check.mjs and the real claims register.
//
// Run: node --test scripts/claims-check.test.mjs
//
// What is tested:
//   (a) the real register passes against the real repository files, and the CLI says GROEN with exit 0;
//   (b) red cases: a temp copy of share-bodies.json, the register and every source file gets ONE change,
//       and the checker must go red for exactly the one claim that change touches (or for the register
//       as a whole when the register itself is broken);
//   (c) mutation tests: copies of claims-check.mjs with one deliberate bug each must fail at least one
//       case of the same suite. Each mutation is asserted to change the source, so none is a no-op.
//
// Mutation results (run on 2026-10-31, 13 of 13 mutants caught, 36 tests pass on the real checker):
//   always-ok                 return ok: true at the end              caught by all 16 claim-level red cases
//   ignore-missing-page       drop the "missing from share-bodies"    caught by: delete page key
//   skip-source-check         never call checkSource                  caught by: version in source, address, llms.txt,
//                                                                     footer KvK, unknown kind, path outside the repo
//   regex-as-plain-text       regex entries use includes()            caught by: green test (real register) and 17 red cases
//   only-first-page           check only the first listed page        caught by: 8 van de 105 on /nl/scoreboard, delete page key
//   only-first-mustContain    check only the first mustContain entry  caught by: 29 of 117 removed
//   empty-claim-passes        drop the "checks nothing" problem       caught by: empty claim, blank mustContain
//   pages-without-must-pass   drop the "pages but no mustContain"     caught by: blank mustContain
//   corrupt-register-ok       a broken register returns ok: true      caught by: corrupt register JSON
//   json-path-always-equal    json-path comparison always true        caught by: payment address in diensten.json
//   capture-never-compared    regex captures never compared           caught by: version in source, footer KvK
//   contains-always-true      contains source always passes           caught by: llms.txt changed
//   empty-string-matches      an empty mustContain string is allowed  caught by: empty mustContain string

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as real from "./claims-check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const REGISTER_REL = "scripts/claims-register.json";
const BODIES_REL = "packages/website/src/data/share-bodies.json";
const CHECKER = path.join(HERE, "claims-check.mjs");

function sourceFiles(register) {
  const files = new Set();
  for (const c of register) {
    const srcs = c.source === undefined ? [] : Array.isArray(c.source) ? c.source : [c.source];
    for (const s of srcs) if (s && typeof s.file === "string") files.add(s.file);
  }
  return [...files];
}

/** Copies the register, share-bodies.json and every source file into a fresh temp root. */
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claims-check-"));
  const register = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTER_REL), "utf8"));
  for (const rel of [REGISTER_REL, BODIES_REL, ...sourceFiles(register)]) {
    const to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), to);
  }
  const f = {
    dir,
    paths: { root: dir, registerPath: path.join(dir, REGISTER_REL), bodiesPath: path.join(dir, BODIES_REL) },
    read: (rel) => fs.readFileSync(path.join(dir, rel), "utf8"),
    write: (rel, text) => fs.writeFileSync(path.join(dir, rel), text),
    /** Replaces in a file and fails loudly when nothing changed. */
    replaceIn(rel, from, to) {
      const before = f.read(rel);
      const after = before.replace(from, to);
      if (after === before) throw new Error(`fixture change did nothing in ${rel}: ${from}`);
      f.write(rel, after);
    },
    editBodies(fn) {
      const b = JSON.parse(f.read(BODIES_REL));
      fn(b.pages);
      f.write(BODIES_REL, JSON.stringify(b));
    },
    replaceOnPage(page, from, to) {
      f.editBodies((pages) => {
        if (!(page in pages)) throw new Error(`no page ${page} in fixture`);
        const after = pages[page].replace(from, to);
        if (after === pages[page]) throw new Error(`fixture change did nothing on ${page}: ${from}`);
        pages[page] = after;
      });
    },
    editRegister(fn) {
      const r = JSON.parse(f.read(REGISTER_REL));
      fn(r);
      f.write(REGISTER_REL, JSON.stringify(r, null, 2));
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
  return f;
}

const failingIds = (out) => out.results.filter((r) => !r.ok).map((r) => r.id).sort();

// Each case: a name, a change to a fresh fixture, and the exact list of ids that must go red.
const RED_CASES = [
  {
    name: "8 of 105 becomes 9 of 105 on /scoreboard",
    change: (f) => f.replaceOnPage("/scoreboard", /\b8 of 105\b/g, "9 of 105"),
    red: ["scoreboard-v31-sealed-eight"],
  },
  {
    name: "8 van de 105 becomes 9 van de 105 on /nl/scoreboard (a page that is not first in the list)",
    change: (f) => f.replaceOnPage("/nl/scoreboard", /\b8 van de 105\b/g, "9 van de 105"),
    red: ["scoreboard-v31-sealed-eight"],
  },
  {
    name: "the full scan price is removed from the /scan page text",
    change: (f) => f.replaceOnPage("/scan", /full scan costs 5 dollars/g, "full scan costs"),
    red: ["scan-full-price"],
  },
  {
    name: "29 of 117 is removed from /scoreboard (a mustContain entry that is not first)",
    change: (f) => f.replaceOnPage("/scoreboard", /\b29 of 117\b/g, "some"),
    red: ["scoreboard-evmbench"],
  },
  {
    name: "the version of the v31-same-eight row changes in scoreboard.ts",
    change: (f) =>
      f.replaceIn("packages/website/src/data/scoreboard.ts", /(id: "v31-same-eight",[^{}]*?version: )"3\.1"/, '$1"3.2"'),
    red: ["scan-page-v31-score"],
  },
  {
    name: "the payment address changes in diensten.json",
    change: (f) => f.replaceIn("scripts/diensten.json", "0x015Eb036560216B3051339061FF68A207E0fe88f", "0x015Eb036560216B3051339061FF68A207E0fe88e"),
    red: ["official-sources-price-address"],
  },
  {
    name: "llms.txt no longer says Slither found 0 of 34",
    change: (f) => f.replaceIn("packages/website/public/llms.txt", "Slither found 0 of 34", "Slither found 1 of 34"),
    red: ["scoreboard-free-tools"],
  },
  {
    name: "the KvK number changes in the footer source",
    change: (f) => f.replaceIn("packages/website/src/components/footer.tsx", "KvK 86816632", "KvK 86816633"),
    red: ["company-kvk-vat"],
  },
  {
    name: "the /nl/checks page key is deleted",
    change: (f) =>
      f.editBodies((pages) => {
        if (!("/nl/checks" in pages)) throw new Error("no /nl/checks in fixture");
        delete pages["/nl/checks"];
      }),
    red: ["free-checks-three"],
  },
  {
    name: "a claim gets a blank mustContain",
    change: (f) =>
      f.editRegister((r) => {
        r.find((c) => c.id === "ruler-note-evmbench").mustContain = [];
      }),
    red: ["ruler-note-evmbench"],
  },
  {
    name: "a mustContain entry is an empty string",
    change: (f) =>
      f.editRegister((r) => {
        r.find((c) => c.id === "ruler-note-evmbench").mustContain = [""];
      }),
    red: ["ruler-note-evmbench"],
  },
  {
    name: "an empty claim (no pages, no mustContain, no source)",
    change: (f) => f.editRegister((r) => r.push({ id: "empty", text: "checks nothing" })),
    red: ["empty"],
  },
  {
    name: "a source has an unknown kind",
    change: (f) =>
      f.editRegister((r) => {
        r.find((c) => c.id === "home-misses-97").source[0].kind = "guess";
      }),
    red: ["home-misses-97"],
  },
  {
    name: "a claim has an unknown field",
    change: (f) =>
      f.editRegister((r) => {
        r.find((c) => c.id === "home-misses-97").mustContian = ["typo"];
      }),
    red: ["home-misses-97"],
  },
  {
    name: "a source points outside the repository",
    change: (f) =>
      f.editRegister((r) => {
        r.find((c) => c.id === "home-misses-97").source[0].file = "../outside.txt";
      }),
    red: ["home-misses-97"],
  },
  {
    name: "the register is not valid JSON",
    change: (f) => f.write(REGISTER_REL, f.read(REGISTER_REL).slice(0, -20)),
    red: ["(register)"],
  },
  {
    name: "share-bodies.json is not valid JSON",
    change: (f) => f.write(BODIES_REL, "{ not json"),
    red: null, // every claim with pages goes red, plus the (share-bodies) entry
  },
];

/** Runs one red case against a checker module. Returns null when it behaves, else a reason. */
function runCase(mod, c) {
  const f = makeFixture();
  try {
    const before = mod.checkClaims(f.paths);
    if (!before.ok) return `fixture copy is not green before the change: ${failingIds(before).join(", ")}`;
    c.change(f);
    const out = mod.checkClaims(f.paths);
    if (out.ok !== false) return "checker said ok";
    const ids = failingIds(out);
    if (c.red === null) {
      if (!ids.includes("(share-bodies)")) return `expected (share-bodies) to be red, got ${ids.join(", ")}`;
      return null;
    }
    const want = [...c.red].sort();
    if (JSON.stringify(ids) !== JSON.stringify(want)) return `red ids ${ids.join(", ") || "(none)"}, expected ${want.join(", ")}`;
    for (const r of out.results) if (!r.ok && r.problems.length === 0) return `${r.id} is red without a problem`;
    return null;
  } catch (e) {
    return `threw: ${e.message}`;
  } finally {
    f.cleanup();
  }
}

function runGreen(mod) {
  const out = mod.checkClaims({
    root: ROOT,
    registerPath: path.join(ROOT, REGISTER_REL),
    bodiesPath: path.join(ROOT, BODIES_REL),
  });
  if (!out.ok) return `real register red: ${out.results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.problems.join("; ")}`).join(" | ")}`;
  return null;
}

/** All failures of a checker module across the green test and every red case. */
function runSuite(mod) {
  const failures = [];
  const g = runGreen(mod);
  if (g) failures.push(`green: ${g}`);
  for (const c of RED_CASES) {
    const r = runCase(mod, c);
    if (r) failures.push(`${c.name}: ${r}`);
  }
  return failures;
}

// (a) green
test("the real register passes against the real repository files", () => {
  assert.equal(runGreen(real), null);
});

test("the real register has 12 to 18 claims, each with pages, mustContain and a source", () => {
  const register = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTER_REL), "utf8"));
  assert.ok(register.length >= 12 && register.length <= 18, `register has ${register.length} claims`);
  for (const c of register) {
    assert.ok(c.pages.length > 0, `${c.id} has no pages`);
    assert.ok(c.mustContain.length > 0, `${c.id} has no mustContain`);
    assert.ok(c.source, `${c.id} has no source`);
  }
});

test("the register text contains no em dash, en dash or double asterisks", () => {
  const text = fs.readFileSync(path.join(ROOT, REGISTER_REL), "utf8");
  assert.ok(!new RegExp("[\\u2013\\u2014]").test(text), "dash found");
  assert.ok(!text.includes("**"), "double asterisks found");
});

test("the CLI prints GROEN and exits 0 on the real repository, and --json parses", () => {
  const plain = spawnSync(process.execPath, [CHECKER], { encoding: "utf8" });
  assert.equal(plain.status, 0, plain.stdout + plain.stderr);
  const lines = plain.stdout.trim().split(/\r?\n/);
  assert.equal(lines.at(-1), "GROEN");
  assert.ok(lines.length > 12, "expected one line per claim");
  const json = spawnSync(process.execPath, [CHECKER, "--json"], { encoding: "utf8" });
  assert.equal(json.status, 0);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.ok, true);
});

test("the CLI exits 1 and prints ROOD: n problemen when a claim is red", () => {
  const f = makeFixture();
  try {
    // The CLI uses the repository it lives in, so run a copy of the checker inside the fixture.
    fs.copyFileSync(CHECKER, path.join(f.dir, "scripts", "claims-check.mjs"));
    f.replaceOnPage("/scoreboard", /\b8 of 105\b/g, "9 of 105");
    const r = spawnSync(process.execPath, [path.join(f.dir, "scripts", "claims-check.mjs")], { encoding: "utf8" });
    assert.equal(r.status, 1);
    const lines = r.stdout.trim().split(/\r?\n/);
    assert.match(lines.at(-1), /^ROOD: \d+ problemen$/);
    assert.ok(lines.some((l) => l.startsWith("ROOD  scoreboard-v31-sealed-eight")));
  } finally {
    f.cleanup();
  }
});

// (b) red cases against the real checker
for (const c of RED_CASES) {
  test(`red: ${c.name}`, () => {
    assert.equal(runCase(real, c), null);
  });
}

// (c) mutation tests
const MUTATIONS = [
  ["always-ok", "return { ok: results.every((r) => r.ok), results };", "return { ok: true, results };"],
  ["ignore-missing-page", "problems.push(`page ${p} is missing from share-bodies.json`);", ""],
  ["skip-source-check", "for (const src of sources) problems.push(...checkSource(src, root));", ""],
  ["regex-as-plain-text", "test: (t) => re.test(t) };", "test: (t) => t.includes(entry.regex) };"],
  ["only-first-page", "for (const p of pageList) {", "for (const p of pageList.slice(0, 1)) {"],
  ["only-first-mustContain", "for (const m of matchers) if", "for (const m of matchers.slice(0, 1)) if"],
  ["empty-claim-passes", 'problems.push("claim has no mustContain and no source, so it checks nothing");', ""],
  ["pages-without-must-pass", 'problems.push("claim lists pages but has no mustContain");', ""],
  ["corrupt-register-ok", 'return { ok: false, results: [{ id: "(register)", ok: false, problems: [`register is not readable JSON', 'return { ok: true, results: [{ id: "(register)", ok: false, problems: [`register is not readable JSON'],
  ["json-path-always-equal", "return JSON.stringify(r.value) === JSON.stringify(src.expected)", "return true"],
  ["capture-never-compared", "if (got[i] !== want)", "if (false)"],
  ["contains-always-true", "return content.includes(src.expected) ? [] :", "return true ? [] :"],
  ["empty-string-matches", "if (isNonEmptyString(entry)) return", 'if (typeof entry === "string") return'],
];

test("the unmutated checker passes the whole suite", () => {
  assert.deepEqual(runSuite(real), []);
});

const mutantDir = fs.mkdtempSync(path.join(os.tmpdir(), "claims-check-mutants-"));
test.after(() => fs.rmSync(mutantDir, { recursive: true, force: true }));
const original = fs.readFileSync(CHECKER, "utf8");

for (const [name, from, to] of MUTATIONS) {
  test(`mutant is caught: ${name}`, async () => {
    assert.ok(original.includes(from), `mutation ${name} does not apply: source text not found`);
    const mutated = original.split(from).join(to);
    assert.notEqual(mutated, original);
    const file = path.join(mutantDir, `mutant-${name}.mjs`);
    fs.writeFileSync(file, mutated);
    const mod = await import(pathToFileURL(file).href);
    const failures = runSuite(mod);
    assert.ok(failures.length > 0, `mutant ${name} survived every case`);
  });
}
