#!/usr/bin/env node
// claims-check.mjs : checks every claim in scripts/claims-register.json.
//
// A claim is a hard number or fact the website states (a price, a score, a version, a company
// number). For each claim two things must hold:
//   1. every page it lists shows every mustContain entry, in the rendered text of that page
//      (packages/website/src/data/share-bodies.json, tags stripped, entities decoded);
//   2. every source it names (a file in this repository) still agrees with the expected value.
// A claim that checks nothing (no mustContain and no source) is a problem, never a pass.
//
// Usage: node scripts/claims-check.mjs [--json]
// Exit code 0 only when every claim is green.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");

const CLAIM_KEYS = new Set(["id", "text", "pages", "mustContain", "source"]);
const SOURCE_KINDS = new Set(["regex-capture", "json-path", "contains"]);
const SOURCE_KEYS = {
  "regex-capture": new Set(["file", "kind", "pattern", "flags", "expected"]),
  "json-path": new Set(["file", "kind", "path", "expected"]),
  contains: new Set(["file", "kind", "expected"]),
};

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Rendered text of one page body: tags removed, entities decoded, whitespace collapsed. */
export function pageText(html) {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

/** Compiles a mustContain entry. A string is literal text, { regex, flags } is a regular expression. */
function matcherFor(entry) {
  if (isNonEmptyString(entry)) return { label: JSON.stringify(entry), test: (t) => t.includes(entry) };
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const keys = Object.keys(entry);
    if (keys.some((k) => k !== "regex" && k !== "flags")) throw new Error(`unknown field in mustContain entry: ${keys.join(", ")}`);
    if (!isNonEmptyString(entry.regex)) throw new Error("mustContain regex is empty or not a string");
    if (entry.flags !== undefined && typeof entry.flags !== "string") throw new Error("mustContain flags is not a string");
    const re = new RegExp(entry.regex, (entry.flags ?? "").replace(/g/g, ""));
    return { label: `/${entry.regex}/`, test: (t) => re.test(t) };
  }
  throw new Error(`mustContain entry is not a non-empty string or { regex }: ${JSON.stringify(entry)}`);
}

function resolveInside(root, file) {
  if (!isNonEmptyString(file)) throw new Error("source.file is empty or not a string");
  if (path.isAbsolute(file)) throw new Error(`source.file must be relative to the repository: ${file}`);
  const full = path.resolve(root, file);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`source.file points outside the repository: ${file}`);
  return full;
}

function getPath(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split(".")) {
    if (cur === null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, part)) return { found: false };
    cur = cur[part];
  }
  return { found: true, value: cur };
}

/** Checks one source against the repository. Returns a list of problems (empty when it agrees). */
function checkSource(src, root) {
  if (!src || typeof src !== "object" || Array.isArray(src)) return ["source is not an object"];
  if (!SOURCE_KINDS.has(src.kind)) return [`unknown source kind: ${JSON.stringify(src.kind)}`];
  const unknown = Object.keys(src).filter((k) => !SOURCE_KEYS[src.kind].has(k));
  if (unknown.length) return [`unknown field in ${src.kind} source: ${unknown.join(", ")}`];

  let full;
  try {
    full = resolveInside(root, src.file);
  } catch (e) {
    return [e.message];
  }
  let content;
  try {
    content = fs.readFileSync(full, "utf8");
  } catch {
    return [`source file not readable: ${src.file}`];
  }

  if (src.kind === "contains") {
    if (!isNonEmptyString(src.expected)) return [`contains source in ${src.file} has no expected text`];
    return content.includes(src.expected) ? [] : [`${src.file} no longer contains ${JSON.stringify(src.expected)}`];
  }

  if (src.kind === "regex-capture") {
    if (!isNonEmptyString(src.pattern)) return [`regex-capture source in ${src.file} has no pattern`];
    const expected = Array.isArray(src.expected) ? src.expected : [src.expected];
    if (expected.length === 0 || expected.some((e) => typeof e !== "string")) return [`regex-capture expected in ${src.file} must be a string or a list of strings`];
    let re;
    try {
      re = new RegExp(src.pattern, (src.flags ?? "").replace(/g/g, ""));
    } catch (e) {
      return [`invalid pattern for ${src.file}: ${e.message}`];
    }
    const m = re.exec(content);
    if (!m) return [`pattern not found in ${src.file}: /${src.pattern}/`];
    const got = m.slice(1);
    if (got.length !== expected.length) return [`pattern in ${src.file} has ${got.length} capture groups, expected ${expected.length}`];
    const problems = [];
    expected.forEach((want, i) => {
      if (got[i] !== want) problems.push(`${src.file} capture ${i + 1} is ${JSON.stringify(got[i] ?? null)}, expected ${JSON.stringify(want)}`);
    });
    return problems;
  }

  // json-path
  if (!isNonEmptyString(src.path)) return [`json-path source in ${src.file} has no path`];
  if (src.expected === undefined) return [`json-path source in ${src.file} has no expected value`];
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return [`${src.file} is not valid JSON`];
  }
  const r = getPath(data, src.path);
  if (!r.found) return [`${src.file} has no value at ${src.path}`];
  return JSON.stringify(r.value) === JSON.stringify(src.expected)
    ? []
    : [`${src.file} ${src.path} is ${JSON.stringify(r.value)}, expected ${JSON.stringify(src.expected)}`];
}

/** Checks one claim. pages is the parsed { path: body } map, or null when it could not be read. */
function checkClaim(claim, pages, root) {
  const problems = [];
  const unknown = Object.keys(claim).filter((k) => !CLAIM_KEYS.has(k));
  if (unknown.length) problems.push(`unknown field: ${unknown.join(", ")}`);
  if (!isNonEmptyString(claim.text)) problems.push("text is missing");

  const pageList = claim.pages ?? [];
  const must = claim.mustContain ?? [];
  const sources = claim.source === undefined ? [] : Array.isArray(claim.source) ? claim.source : [claim.source];
  if (!Array.isArray(pageList) || pageList.some((p) => !isNonEmptyString(p))) problems.push("pages must be a list of page paths");
  if (!Array.isArray(must)) problems.push("mustContain must be a list");
  if (problems.length) return problems;

  if (must.length === 0 && sources.length === 0) problems.push("claim has no mustContain and no source, so it checks nothing");
  if (pageList.length > 0 && must.length === 0) problems.push("claim lists pages but has no mustContain");
  if (must.length > 0 && pageList.length === 0) problems.push("claim has mustContain but lists no pages");

  let matchers = [];
  try {
    matchers = must.map(matcherFor);
  } catch (e) {
    problems.push(e.message);
  }

  if (pageList.length > 0) {
    if (!pages) problems.push("page texts could not be read");
    else {
      for (const p of pageList) {
        if (!Object.prototype.hasOwnProperty.call(pages, p)) {
          problems.push(`page ${p} is missing from share-bodies.json`);
          continue;
        }
        const text = pageText(pages[p]);
        for (const m of matchers) if (!m.test(text)) problems.push(`page ${p} does not show ${m.label}`);
      }
    }
  }

  for (const src of sources) problems.push(...checkSource(src, root));
  return problems;
}

/**
 * Checks the whole register.
 * @returns {{ ok: boolean, results: { id: string, ok: boolean, problems: string[] }[] }}
 */
export function checkClaims({ registerPath, bodiesPath, root } = {}) {
  const base = path.resolve(root ?? DEFAULT_ROOT);
  const regFile = registerPath ?? path.join(base, "scripts", "claims-register.json");
  const bodiesFile = bodiesPath ?? path.join(base, "packages", "website", "src", "data", "share-bodies.json");

  let register;
  try {
    register = JSON.parse(fs.readFileSync(regFile, "utf8"));
  } catch (e) {
    return { ok: false, results: [{ id: "(register)", ok: false, problems: [`register is not readable JSON: ${e.message}`] }] };
  }
  if (!Array.isArray(register) || register.length === 0) {
    return { ok: false, results: [{ id: "(register)", ok: false, problems: ["register must be a non-empty list of claims"] }] };
  }

  let pages = null;
  const globalProblems = [];
  try {
    const bodies = JSON.parse(fs.readFileSync(bodiesFile, "utf8"));
    if (!bodies || typeof bodies.pages !== "object" || bodies.pages === null || Array.isArray(bodies.pages)) {
      globalProblems.push("share-bodies.json has no pages object");
    } else pages = bodies.pages;
  } catch (e) {
    globalProblems.push(`share-bodies.json is not readable JSON: ${e.message}`);
  }

  const results = [];
  const seen = new Set();
  register.forEach((claim, i) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
      results.push({ id: `(entry ${i})`, ok: false, problems: ["claim is not an object"] });
      return;
    }
    const id = isNonEmptyString(claim.id) ? claim.id : `(entry ${i})`;
    const problems = checkClaim(claim, pages, base);
    if (!isNonEmptyString(claim.id)) problems.unshift("id is missing");
    else if (seen.has(id)) problems.unshift("id is used twice");
    seen.add(id);
    results.push({ id, ok: problems.length === 0, problems });
  });
  if (globalProblems.length) results.unshift({ id: "(share-bodies)", ok: false, problems: globalProblems });

  return { ok: results.every((r) => r.ok), results };
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    const a = fs.realpathSync(fileURLToPath(import.meta.url));
    const b = fs.realpathSync(path.resolve(process.argv[1]));
    return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
}

if (isMain()) {
  const out = checkClaims();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    for (const r of out.results) console.log(r.ok ? `GROEN ${r.id}` : `ROOD  ${r.id}: ${r.problems.join("; ")}`);
    const n = out.results.reduce((s, r) => s + r.problems.length, 0);
    console.log(out.ok ? "GROEN" : `ROOD: ${n} problemen`);
  }
  process.exitCode = out.ok ? 0 : 1;
}
