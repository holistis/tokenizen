// The site must not call the x402#3827 checker "the spec author" or "independent".
// That comment is by the author of an open proposal (no maintainer role), on a test network,
// and buyer and seller were both us. Phrases that said more are kept out of the source and out of
// the generated page text, and the scanner itself is tested with planted phrases.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OVERCLAIMS = [
  "spec author",
  "specification author",
  "wrote the x402",
  "author of the x402 payment specification",
  "author of the x402 specification",
  "author of the specification",
  "specificatieschrijver",
  "x402-specificatie schreef",
  "auteur van de x402-betaalspecificatie",
  "auteur van de x402-specificatie",
  "auteur van de specificatie",
];

/** Returns the overclaim phrases found in a text, case-insensitive, with any run of whitespace as one space. */
export function findOverclaims(text: string): string[] {
  const flat = text.toLowerCase().replace(/\s+/g, " ");
  return OVERCLAIMS.filter((p) => flat.includes(p));
}

const WEBSITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = fileURLToPath(import.meta.url);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json|txt|md|html)$/.test(name)) out.push(p);
  }
  return out;
}

describe("x402#3827 cross-check wording", () => {
  it("finds a planted phrase in every spelling we expect, and nothing in clean text", () => {
    for (const p of OVERCLAIMS) {
      expect(findOverclaims(`Some text ${p} more text`), p).toContain(p);
      expect(findOverclaims(p.toUpperCase()), `${p} in capitals`).toContain(p);
      expect(findOverclaims(p.replace(/ /g, "\n  ")), `${p} across a line break`).toContain(p);
    }
    expect(findOverclaims("The author of an open proposal ran a second checker on test receipts.")).toEqual([]);
    expect(findOverclaims("")).toEqual([]);
  });

  it("keeps the overclaims out of src and public, generated page text included", () => {
    const files = [...walk(join(WEBSITE, "src")), ...walk(join(WEBSITE, "public"))].filter((f) => f !== SELF);
    expect(files.length, "the scan must read files").toBeGreaterThan(20);
    const hits = files.flatMap((f) => findOverclaims(readFileSync(f, "utf8")).map((p) => `${relative(WEBSITE, f)}: ${p}`));
    expect(hits).toEqual([]);
  });
});
