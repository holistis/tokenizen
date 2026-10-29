import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PATTERNS, PHRASES, craToDutch } from "@/components/pages/cra-nl";

// The Dutch phrasebook is only as good as its tie to the server file that writes the English. These tests read that file (the source of
// truth) and fail when a Dutch entry has gone stale or a new English sentence has no Dutch yet.
const SERVER_FILE = fileURLToPath(new URL("../../../../self-check-server/src/cra-repo-check.ts", import.meta.url));
const source = readFileSync(SERVER_FILE, "utf8");
const tree = ts.createSourceFile(SERVER_FILE, source, ts.ScriptTarget.ES2022, true);

const LONG_DASHES = /[–—]/;

/** Literals in assessRepo that are not sentences a reader sees: ids, internal states, a join character, a file extension. */
const NOT_SENTENCES = new Set([
  "\n",
  "owner",
  "none",
  "complete",
  "unknown",
  "partial",
  "visible",
  "not_measured",
  ".csproj",
  "vulnerability-policy",
  "sbom",
  "release-provenance",
  "pinned-dependencies",
  "dependency-updates",
  "security-scanning",
  "maintenance",
  "license",
]);

/** Dutch that is deliberately the same as the English (a technical term). */
const SAME_IN_DUTCH = new Set(["Software bill of materials (SBOM)"]);

const TOP_LEVEL_SENTENCES = ["RULES_BASIS", "ELSEWHERE", "SETTINGS"];

interface Found {
  statics: Set<string>;
  skeletons: string[];
  withTail: Array<{ sentence: string; tail: string }>;
  topLevel: Map<string, string>;
}

function readServerFile(): Found {
  const found: Found = { statics: new Set(), skeletons: [], withTail: [], topLevel: new Map() };
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const name = declaration.name.getText(tree);
      const init = declaration.initializer;
      if (TOP_LEVEL_SENTENCES.includes(name) && init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) found.topLevel.set(name, init.text);
    }
  }
  const visit = (node: ts.Node, inAssess: boolean) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "assessRepo") inAssess = true;
    if (inAssess) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.statics.add(node.text);
      if (ts.isTemplateExpression(node)) found.skeletons.push(node.head.text + node.templateSpans.map((span) => "${}" + span.literal.text).join(""));
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        ts.isStringLiteral(node.left) &&
        ts.isIdentifier(node.right) &&
        found.topLevel.has(node.right.text)
      ) {
        found.withTail.push({ sentence: node.left.text, tail: found.topLevel.get(node.right.text) as string });
      }
    }
    ts.forEachChild(node, (child) => visit(child, inAssess));
  };
  visit(tree, false);
  return found;
}

const server = readServerFile();
const skeletonOf = (en: string) => en.replace(/\$\{n\}/g, "${}");
const piecesOf = (en: string) => en.split(/\$\{n?\}/).filter((piece) => piece.length > 0);

describe("the phrasebook is tied to the server file", () => {
  it("really read the server file (so the checks below are not empty)", () => {
    expect(server.statics.size).toBeGreaterThan(40);
    expect(server.skeletons.length).toBeGreaterThanOrEqual(6);
    expect([...server.topLevel.keys()].sort()).toEqual([...TOP_LEVEL_SENTENCES].sort());
    expect(server.withTail.length).toBeGreaterThanOrEqual(4);
  });

  it("(1) every English key occurs verbatim in cra-repo-check.ts, so a changed sentence cannot keep a stale translation", () => {
    const stale = Object.keys(PHRASES).filter((key) => !source.includes(key));
    expect(stale).toEqual([]);
  });

  it("(1) every fixed piece of every pattern occurs verbatim in cra-repo-check.ts", () => {
    const stale = PATTERNS.flatMap((pattern) => piecesOf(pattern.en)).filter((piece) => !source.includes(piece));
    expect(stale).toEqual([]);
  });

  it("(2) every fixed sentence the server writes has a Dutch entry", () => {
    const missing = [...server.statics, ...server.topLevel.values()].filter((text) => !NOT_SENTENCES.has(text) && !Object.prototype.hasOwnProperty.call(PHRASES, text));
    expect(missing).toEqual([]);
  });

  it("(2) every template sentence of the server has a pattern, and every pattern is still a template of the server", () => {
    const inServer = [...new Set(server.skeletons)].sort();
    const inPhrasebook = PATTERNS.map((pattern) => skeletonOf(pattern.en)).sort();
    expect(inPhrasebook).toEqual(inServer);
  });

  it("(2) the allowlist of non-sentences holds only things the server still contains, and no sentence", () => {
    for (const entry of NOT_SENTENCES) expect(server.statics.has(entry), `"${entry}" is no longer in assessRepo`).toBe(true);
    for (const entry of NOT_SENTENCES) expect(entry.includes(" "), `"${entry}" looks like a sentence`).toBe(false);
  });

  it("has no entry for a sentence the server no longer sends", () => {
    const sent = new Set([...server.statics, ...server.topLevel.values()]);
    const unused = Object.keys(PHRASES).filter((key) => !sent.has(key));
    expect(unused).toEqual([]);
  });
});

describe("the Dutch itself", () => {
  const dutchTexts = Object.values(PHRASES);

  it("has no long dashes, no markdown asterisks, no u-form, and is not empty", () => {
    for (const text of dutchTexts) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(LONG_DASHES);
      expect(text).not.toContain("*");
      expect(text).not.toMatch(/\b[Uu]\b|\b[Uu]w\b/);
    }
  });

  it("differs from the English except for the terms that are deliberately the same", () => {
    const same = Object.entries(PHRASES)
      .filter(([english, dutch]) => english === dutch)
      .map(([english]) => english);
    expect(new Set(same)).toEqual(SAME_IN_DUTCH);
  });

  it("keeps the caveats of the English: nothing is turned into a verdict", () => {
    const all = dutchTexts.join("\n");
    expect(all).not.toMatch(/\bvoldoet\b|\bcompliant\b|\bgecertificeerd\b|\bgegarandeerd\b|\bveilig is\b/i);
    expect(PHRASES["There is recent activity. That is a weak sign: recent commits do not show that vulnerabilities are handled, and a quiet repository does not show that they are not."]).toContain("zwak teken");
    expect(PHRASES["not measured"]).toBe("niet gemeten");
    expect(PHRASES["The repository is archived: no security updates will come from it."]).toContain("gearchiveerd");
  });
});

describe("craToDutch", () => {
  it("translates a fixed sentence by its exact English", () => {
    expect(craToDutch("Provenance of releases")).toBe("Herkomst van releases");
    expect(craToDutch("Add a LICENSE file.")).toBe("Voeg een LICENSE-bestand toe.");
    expect(craToDutch("a security scan")).toBe("een beveiligingsscan");
  });

  it("adds the Dutch tail to a sentence the server appends it to, for every such sentence in the server file", () => {
    expect(server.withTail.length).toBeGreaterThanOrEqual(4);
    for (const { sentence, tail } of server.withTail) {
      const dutch = craToDutch(sentence + tail);
      expect(dutch).toBe(PHRASES[sentence] + PHRASES[tail]);
      expect(dutch).not.toContain(sentence);
    }
  });

  it("leaves a tail alone when the sentence before it is not known (nothing is guessed)", () => {
    const text = "Some new sentence." + [...server.topLevel.values()].find((value) => value.startsWith(" This only looks"));
    expect(craToDutch(text)).toBe(text);
  });

  it("returns anything it does not know exactly as it came", () => {
    for (const text of ["SECURITY.md", "codeql", "MIT", "Apache-2.0", "A new sentence the phrasebook has never seen.", "", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(craToDutch(text)).toBe(text);
    }
  });

  it("does not translate a near miss of a sentence (a changed word is a different sentence)", () => {
    expect(craToDutch("Add a LICENSE file")).toBe("Add a LICENSE file");
    expect(craToDutch("add a LICENSE file.")).toBe("add a LICENSE file.");
    expect(craToDutch(" Add a LICENSE file.")).toBe(" Add a LICENSE file.");
  });

  it("keeps the path of a policy file and the note that it belongs to the owner", () => {
    const owner = " (the policy GitHub shows for every repository of this owner)";
    expect(craToDutch(`docs/SECURITY.md${owner}`)).toBe("docs/SECURITY.md (het beleid dat GitHub toont voor alle repositories van deze eigenaar)");
    expect(craToDutch("A security policy file is there (SECURITY.md), but it could not be examined completely, so we cannot say whether it names a contact address or a way to report.")).toBe(
      "Er staat een bestand met beveiligingsbeleid (SECURITY.md), maar dat kon niet helemaal worden onderzocht, dus we kunnen niet zeggen of het een contactadres noemt of een manier om te melden.",
    );
    expect(
      craToDutch(`A security policy file is there (SECURITY.md${owner}), but it could not be examined completely, so we cannot say whether it names a contact address or a way to report.`),
    ).toContain("(SECURITY.md (het beleid dat GitHub toont voor alle repositories van deze eigenaar)), maar dat kon niet");
    const readNoContact = craToDutch(
      "A security policy file exists (.github/SECURITY.md) and all of it was read, but it names no contact address or reporting link. A link to a general homepage does not count. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports.",
    );
    expect(readNoContact).toBe(
      "Er bestaat een bestand met beveiligingsbeleid (.github/SECURITY.md) en het is helemaal gelezen, maar het noemt geen contactadres of meldlink. Een link naar een algemene homepage telt niet mee. De CRA vraagt om een beleid voor gecoördineerde bekendmaking van kwetsbaarheden en een contactadres voor meldingen.",
    );
  });

  it("turns the age of the last change into Dutch, with singular and plural, and only for the two phrases the server uses", () => {
    expect(craToDutch("last commit on the default branch 12 days ago, last release 30 days ago")).toBe("laatste commit op de standaardbranch 12 dagen geleden, laatste release 30 dagen geleden");
    expect(craToDutch("last push to any branch 1 days ago, no release seen")).toBe("laatste push naar een willekeurige branch 1 dag geleden, geen release gezien");
    expect(craToDutch("last commit on the default branch 0 days ago, last release 1 days ago")).toBe("laatste commit op de standaardbranch 0 dagen geleden, laatste release 1 dag geleden");
    // Not guessed: an unknown start, or an unknown end, leaves the whole line as the server sent it.
    expect(craToDutch("last tag 3 days ago, no release seen")).toBe("last tag 3 days ago, no release seen");
    expect(craToDutch("last commit on the default branch 3 days ago, and something new")).toBe("last commit on the default branch 3 days ago, and something new");
    expect(craToDutch("The last commit on the default branch was 200 days ago. The CRA expects vulnerabilities to be fixed quickly during the support period. Recent activity is only a weak sign of that, and a stable product can be quiet for good reasons.")).toBe(
      "De laatste commit op de standaardbranch was 200 dagen geleden. De CRA verwacht dat kwetsbaarheden tijdens de ondersteuningsperiode snel worden verholpen. Recente activiteit is daar maar een zwak teken van, en een stabiel product kan om goede redenen rustig zijn.",
    );
    expect(craToDutch("The last push to any branch was 1 days ago. The CRA expects vulnerabilities to be fixed quickly during the support period. Recent activity is only a weak sign of that, and a stable product can be quiet for good reasons.")).toContain(
      "De laatste push naar een willekeurige branch was 1 dag geleden.",
    );
    expect(craToDutch("The last release was 200 days ago. The CRA expects vulnerabilities to be fixed quickly during the support period. Recent activity is only a weak sign of that, and a stable product can be quiet for good reasons.")).toContain("The last release was 200 days ago.");
  });

  it("translates the advisories line with its number, in the singular too, and 'not measured'", () => {
    expect(craToDutch("0 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)")).toBe(
      "0 gepubliceerde beveiligingsadviezen in deze repository (een getal zegt niets over kwaliteit: nul betekent niet veilig)",
    );
    expect(craToDutch("1 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)")).toBe(
      "1 gepubliceerd beveiligingsadvies in deze repository (een getal zegt niets over kwaliteit: nul betekent niet veilig)",
    );
    expect(craToDutch("12 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)")).toContain("12 gepubliceerde beveiligingsadviezen");
    expect(craToDutch("not measured")).toBe("niet gemeten");
    // A number that is not a number is not a match.
    expect(craToDutch("many published security advisories in this repository (a number says nothing about quality: zero does not mean safe)")).toBe(
      "many published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
    );
  });

  it("gives every pattern a Dutch result without long dashes, asterisks or leftover English skeleton", () => {
    const samples = [
      "docs/SECURITY.md (the policy GitHub shows for every repository of this owner)",
      "A security policy file is there (SECURITY.md), but it could not be examined completely, so we cannot say whether it names a contact address or a way to report.",
      "A security policy file exists (SECURITY.md) and all of it was read, but it names no contact address or reporting link. A link to a general homepage does not count. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports.",
      "last commit on the default branch 5 days ago, no release seen",
      ", last release 7 days ago",
      "The last commit on the default branch was 91 days ago. The CRA expects vulnerabilities to be fixed quickly during the support period. Recent activity is only a weak sign of that, and a stable product can be quiet for good reasons.",
      "3 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
    ];
    expect(samples.length).toBe(PATTERNS.length);
    for (const sample of samples) {
      const dutch = craToDutch(sample);
      expect(dutch, sample).not.toBe(sample);
      expect(dutch).not.toMatch(LONG_DASHES);
      expect(dutch).not.toContain("*");
      expect(dutch).not.toContain("${");
      expect(dutch).not.toMatch(/\bdays?\b|\bpublished\b|\bthe policy\b/);
    }
  });
});
