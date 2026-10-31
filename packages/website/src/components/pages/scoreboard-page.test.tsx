import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScoreboardPage, resultText } from "@/components/pages/scoreboard-page";
import { SCORE_RUNS, SCORE_RUNS_NL, SEALED_SET_HASH, TUNED_LABEL, TUNED_LABEL_NL, runText, tunedLabel } from "@/data/scoreboard";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { readableText } from "@/test-utils/readable-text";

const render = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <ScoreboardPage />
    </LocaleProvider>,
  );

/** What a reader sees: the markup without its tags, with the few entities React writes turned back into characters. */
const textOf = (html: string) => readableText(html);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

describe("ScoreboardPage", () => {
  const html = render("en");

  it("shows every row with its title and its result in words a reader can check", () => {
    for (const run of SCORE_RUNS) {
      expect(html).toContain(escapeHtml(run.title));
    }
    expect(html).toContain("0 of 31");
    expect(html).toContain("0 of 40");
    expect(html).toContain("7 of 85");
    expect(html).toContain("1 of 85");
    expect(html).toContain("4 of 105");
    expect(html).toContain("1 of 105");
  });

  it("says Not measured yet for the rows that have no result, and never invents one", () => {
    const pending = SCORE_RUNS.filter((r) => r.status === "pending");
    expect(pending.length).toBeGreaterThanOrEqual(1);
    for (const run of pending) expect(resultText(run)).toBe("Not measured yet");
    expect(html.split("Not measured yet").length - 1).toBe(pending.length);
  });

  it("labels the rows on a set we tuned on as not evidence", () => {
    expect(html).toContain(TUNED_LABEL.yes);
  });

  it("states what it is not, what would count as proof, and how to cite it", () => {
    expect(html).toContain("not an audit, an approval or a certification");
    expect(html).toContain("What would count as proof");
    expect(html).toContain("https://tokenizen.nl/en/scoreboard");
    expect(html).toContain(SEALED_SET_HASH);
  });

  it("opens every outside link in a new tab without leaking the referrer and uses only https", () => {
    expect(html).not.toMatch(/href="http:\/\//);
    const outside = html.match(/<a [^>]*href="https:\/\/github\.com[^>]*>/g) ?? [];
    expect(outside.length).toBeGreaterThan(3);
    for (const tag of outside) expect(tag).toContain('rel="noreferrer noopener"');
  });

  it("uses no long dashes", () => {
    expect(html).not.toMatch(/[–—]/);
  });

  it("has exactly one h1, the one in the head of the page, and it is Scoreboard", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Scoreboard<\/h1>/);
  });

  it("keeps the English wording of the head, the intro and the notes as they were", () => {
    const text = textOf(html);
    expect(text).toContain(
      "How many of the findings that human auditors already found in closed contests does our smart contract scan find? Rows link to their results and, where one exists, to the pre-registration written before the run. A row without that link has no public rule from before the run: for version 3.1 the rule is only in our own notes, and the row says so. A row without a result is empty on purpose.",
    );
    expect(text).toContain("Last updated 2026-10-31. Newest and still open rows first.");
    expect(text).toContain("Bug Bounty Intelligence · open scoreboard");
    expect(text).toContain("It reported 120 hypotheses in total.");
    expect(text).toContain("Found a mistake in how we count? Open an issue in the repository . We correct it in public.");
    for (const run of SCORE_RUNS) expect(text, run.id).toContain(run.note);
    expect(html).not.toContain("Nog niet gemeten");
  });
});

describe("ScoreboardPage in Dutch", () => {
  const html = render("nl");
  const text = textOf(html);

  it("shows every row with its Dutch title and the result in Dutch words", () => {
    for (const run of SCORE_RUNS) {
      expect(html, run.id).toContain(escapeHtml(SCORE_RUNS_NL[run.id].title));
      expect(html, run.id).not.toContain(escapeHtml(run.title));
    }
    expect(html).toContain("0 van de 31");
    expect(html).toContain("0 van de 40");
    expect(html).toContain("7 van de 85");
    expect(html).toContain("1 van de 85");
    expect(html).toContain("4 van de 105");
    expect(html).toContain("1 van de 105");
    for (const english of ["0 of 31", "7 of 85", "4 of 105"]) expect(html).not.toContain(english);
  });

  it("says Nog niet gemeten for the rows that have no result, and never invents one", () => {
    const pending = SCORE_RUNS.filter((r) => r.status === "pending");
    for (const run of pending) expect(resultText(run, "nl")).toBe("Nog niet gemeten");
    expect(html.split("Nog niet gemeten").length - 1).toBe(pending.length);
    expect(html).not.toContain("Not measured yet");
  });

  it("has exactly one h1, from the head of the page, and the head and chip are Dutch", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Scorebord<\/h1>/);
    expect(html).toContain(">openbaar<");
    expect(text).toContain("Hoeveel van de bevindingen die menselijke auditors al vonden in afgesloten wedstrijden vindt onze smart-contractscan?");
    expect(text).toContain("Een rij zonder uitslag is met opzet leeg.");
    expect(text).toContain("Bug Bounty Intelligence · open scorebord");
    expect(text).toContain("Laatst bijgewerkt op 2026-10-31.");
  });

  it("labels the rows on a set we tuned on as not evidence, in Dutch", () => {
    expect(html).toContain(TUNED_LABEL_NL.yes);
    expect(TUNED_LABEL_NL.yes).toContain("geen bewijs");
    expect(html).not.toContain(TUNED_LABEL.yes);
  });

  it("states what it is not, what would count as proof, what is open and how to cite it", () => {
    expect(text).toContain("Het is geen audit, geen goedkeuring en geen certificering.");
    expect(text).toContain("Een scan die niets vindt, maakt code niet veilig.");
    expect(text).toContain("Wat als bewijs zou tellen");
    expect(text).toContain("Wat open is en wat privé blijft");
    expect(text).toContain("Zo lees je een getal");
    expect(text).toContain("de lat is niet gehaald");
    expect(text).toContain("Citeer deze pagina");
    expect(html).toContain("https://tokenizen.nl/nl/scoreboard");
    expect(html).toContain(SEALED_SET_HASH);
    expect(html).toContain('aria-label="Kopieer de verwijzing"');
  });

  it("keeps the caveats of the English page: the tuning, the training data, the judges and the sealed result", () => {
    expect(text).toContain("geen bewijs");
    expect(text).toContain("trainingsdata");
    expect(text).toContain("De rechters zijn taalmodellen en wij hebben zelf belang bij de uitslag.");
    expect(text).toContain("dus die is niet gehaald en de draaiende scan bleef in productie");
    expect(text).toContain("deze rij is minder goed te controleren dan de verzegelde run");
  });

  it("opens every outside link in a new tab without leaking the referrer and uses only https", () => {
    expect(html).not.toMatch(/href="http:\/\//);
    const outside = html.match(/<a [^>]*href="https:\/\/github\.com[^>]*>/g) ?? [];
    expect(outside.length).toBeGreaterThan(3);
    for (const tag of outside) expect(tag).toContain('rel="noreferrer noopener"');
  });

  it("uses no long dashes, no markdown stars and never the formal u or uw", () => {
    expect(html).not.toMatch(/[–—]/);
    expect(text).not.toContain("**");
    expect(text).not.toMatch(/\b(u|uw|U|Uw)\b/);
  });

  it("leaves none of the English interface words on the page", () => {
    for (const english of ["Last updated", "How to read a number", "What this is not", "Cite this page", "Copy citation", "pending", "measured", "It reported"]) {
      expect(text, english).not.toContain(english);
    }
  });
});

describe("the Dutch version of the rows", () => {
  /** Every number of a text, sorted, with decimals written the same way: "7,6" counts as "7.6". */
  const numbersOf = (value: string) => (value.replace(/(\d),(\d)/g, "$1.$2").match(/\d+(?:\.\d+)*/g) ?? []).slice().sort();
  const FORMAL_YOU = /\b(u|uw)\b/i;
  const LONG_DASHES = /[–—]/;

  it("has a Dutch text for every row and for nothing else, with the links in the same order", () => {
    expect(Object.keys(SCORE_RUNS_NL).sort()).toEqual(SCORE_RUNS.map((r) => r.id).sort());
    for (const run of SCORE_RUNS) {
      expect(SCORE_RUNS_NL[run.id].links.length, run.id).toBe(run.links.length);
      expect(runText(run, "nl").links.map((l) => l.href), run.id).toEqual(run.links.map((l) => l.href));
    }
  });

  it("carries every number of the English row, so Dutch states no more and no less than English does", () => {
    for (const run of SCORE_RUNS) {
      const nl = SCORE_RUNS_NL[run.id];
      expect(numbersOf(nl.note), `${run.id} note`).toEqual(numbersOf(run.note));
      expect(numbersOf(nl.set), `${run.id} set`).toEqual(numbersOf(run.set));
      expect(numbersOf(nl.title), `${run.id} title`).toEqual(numbersOf(run.title));
      expect(numbersOf(nl.system), `${run.id} system`).toEqual(numbersOf(run.system));
    }
  });

  it("keeps the caveats of the English notes", () => {
    expect(SCORE_RUNS_NL["sealed-v3"].note).toContain("niet gehaald");
    expect(SCORE_RUNS_NL["v31-same-eight"].note).toContain("De modellen kunnen deze wedstrijden hebben gezien");
    expect(SCORE_RUNS_NL["v31-same-eight"].note).toContain("minder goed te controleren");
    expect(SCORE_RUNS_NL["c4-fresh-nine"].note).toContain("trainingsdata");
    expect(SCORE_RUNS_NL["exploration-a"].note).toContain("geen bewijs");
    expect(SCORE_RUNS_NL["baseline-dev-set"].note).toContain("geen bewijs");
    expect(SCORE_RUNS_NL.v2.note).toContain("miste");
  });

  it("has a Dutch label for every kind of tuning, and the one that matters says not evidence", () => {
    expect(Object.keys(TUNED_LABEL_NL).sort()).toEqual(Object.keys(TUNED_LABEL).sort());
    expect(tunedLabel("yes", "nl")).toBe(TUNED_LABEL_NL.yes);
    expect(tunedLabel("yes", "en")).toBe(TUNED_LABEL.yes);
  });

  it("falls back to the English row when a language has no text for it", () => {
    const run = { ...SCORE_RUNS[0], id: "a-row-without-dutch" };
    expect(runText(run, "nl").title).toBe(run.title);
    expect(runText(SCORE_RUNS[0], "en").note).toBe(SCORE_RUNS[0].note);
  });

  it("uses no long dashes, no markdown stars and never the formal u or uw", () => {
    const all = [...Object.values(SCORE_RUNS_NL).flatMap((r) => [r.title, r.system, r.set, r.note, ...r.links]), ...Object.values(TUNED_LABEL_NL)];
    for (const value of all) {
      expect(value).not.toMatch(LONG_DASHES);
      expect(value).not.toContain("**");
      expect(value).not.toMatch(FORMAL_YOU);
    }
  });

  it("never describes how the scan finds things, only how it is measured", () => {
    const forbidden = /\b(lens|lenzen|long-context|long context|deepseek|prompt|prompts|one pass|cheap model|temperature|few-shot)\b/i;
    for (const [id, r] of Object.entries(SCORE_RUNS_NL)) {
      for (const value of [r.title, r.system, r.set, r.note]) expect(value, id).not.toMatch(forbidden);
    }
  });
});
