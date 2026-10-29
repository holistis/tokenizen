import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CraCheckPage, CraCheckResultView, clientErrorText, craPageMeta } from "@/components/pages/cra-check-page";
import { PHRASES } from "@/components/pages/cra-nl";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { CheckApiError, checkCraRepo, type CraCheckResult, type CraControl, type CraStatus } from "@/lib/check-api";

const LONG_DASHES = /[–—]/;

function sample(overrides: Partial<CraCheckResult> = {}): CraCheckResult {
  return {
    ok: true,
    cached: false,
    repo: "Owner/Repo",
    measuredAt: "2026-10-28T12:00:00.000Z",
    rules: { version: "2026-10-28.3", reviewedOn: "2026-10-28", basis: "Eight selected signals, not one for each legal requirement. Our own reading, not reviewed by a lawyer.", regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj" },
    summary: { measured: 3, visible: 1, notVisible: 2, notMeasured: 1 },
    controls: [
      { id: "vulnerability-policy", topic: "Reporting channel and policy for vulnerabilities", status: "visible", evidence: "SECURITY.md", explanation: "A security policy file is in the repository." },
      { id: "sbom", topic: "Software bill of materials (SBOM)", status: "not_visible", explanation: "No SBOM file is visible.", fix: "Let the build produce a CycloneDX file." },
      { id: "release-provenance", topic: "Provenance of releases", status: "not_visible", explanation: "No signatures visible.", fix: "Sign releases." },
      { id: "pinned-dependencies", topic: "Pinned dependencies", status: "not_measured", explanation: "No known package file." },
    ],
    advisories: "0 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
    whatThisDoesNotMeasure: ["private repositories"],
    notice: "This is an indication from public data about eight selected signals. It is not a check against the legal requirements, not a conformity assessment and not legal advice.",
    sources: [{ url: "https://api.github.com/repos/Owner/Repo", outcome: "read" }, { url: "https://example.com/not-github", outcome: "failed" }],
    ...overrides,
  };
}

const renderPage = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <CraCheckPage />
    </LocaleProvider>,
  );

const renderResult = (locale: Locale, result: CraCheckResult) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <CraCheckResultView result={result} />
    </LocaleProvider>,
  );

const countOf = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

describe("CraCheckPage", () => {
  const html = renderPage("en");

  it("says up front that it stores no reports, that the answer sits briefly in memory, and that it only reads public repositories", () => {
    expect(html).toContain("We do not store reports");
    expect(html).toContain("server memory");
    expect(html).toContain("Only public");
  });

  it("says that these are eight selected signals and not one for each legal requirement", () => {
    expect(html).toContain("eight selected signals");
    expect(html).toContain("not one signal for each legal requirement");
    expect(html).toContain("do not tell you whether you comply");
    expect(html).toContain("11 June 2026");
  });

  it("has a heading that promises signals in a repository, not a view on compliance", () => {
    expect(html).toContain("Which security signals can be seen in your GitHub repository?");
    expect(html).not.toContain("CRA vulnerability handling");
  });

  it("offers a repository field", () => {
    expect(html).toContain('id="cra-repo"');
    expect(html).toContain("Check this repository");
  });

  it("claims no more than an indication, and uses no long dashes", () => {
    expect(html).toContain("not a conformity assessment");
    expect(html).toContain("not legal advice");
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toMatch(/\bcompliant\b|\bcertified\b|complies with the CRA/i);
  });

  it("is a cinema page with exactly one h1, the chip 'free' and the home link in English", () => {
    expect(countOf(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('class="cinema"');
    expect(html).toContain("/media/site/signalen");
    expect(html).toContain(">free<");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/en"');
    expect(html).not.toContain('href="/nl');
  });
});

describe("CraCheckPage in Dutch", () => {
  const html = renderPage("nl");

  it("says up front that it stores no reports, that the answer sits briefly in memory, and that it only reads public repositories", () => {
    expect(html).toContain("We slaan geen rapporten op");
    expect(html).toContain("geheugen van de server");
    expect(html).toContain("Alleen openbare repositories");
  });

  it("keeps the caveats: eight selected signals, not one per legal requirement, no verdict on compliance", () => {
    expect(html).toContain("acht gekozen signalen");
    expect(html).toContain("niet één signaal per wettelijke eis");
    expect(html).toContain("vertellen je niet of je aan de verordening voldoet");
    expect(html).toContain("11 juni 2026");
    expect(html).toContain("11 september 2026");
    expect(html).toContain("11 december 2027");
    expect(html).toContain("geen conformiteitsbeoordeling");
    expect(html).toContain("geen juridisch advies");
    expect(html).toContain("geen certificaat");
    expect(html).toContain("nooit als gat");
  });

  it("has a heading that promises signals in a repository, in Dutch, on a cinema page with one h1", () => {
    expect(html).toContain("Welke beveiligingssignalen zijn te zien in jouw GitHub-repository?");
    expect(countOf(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('class="cinema"');
    expect(html).toContain("/media/site/signalen");
    expect(html).toContain(">gratis<");
    expect(html).not.toContain(">free<");
  });

  it("offers the repository field with Dutch labels", () => {
    expect(html).toContain('id="cra-repo"');
    expect(html).toContain("Check deze repository");
    expect(html).toContain("Jouw repository");
    expect(html).toContain('placeholder="owner/name"');
  });

  it("links home in Dutch and not to an English address", () => {
    expect(html).toContain('href="/nl"');
    expect(html).not.toContain('href="/en"');
    expect(html).not.toContain('href="/"');
  });

  it("shows none of the English page text", () => {
    for (const english of [
      "We do not store reports",
      "Check this repository",
      "Your repository",
      "Which security signals",
      "eight selected signals",
      "not a conformity assessment",
      "not legal advice",
      "Why this exists",
      "Name a public GitHub repository",
      "licence",
    ]) {
      expect(html).not.toContain(english);
    }
  });

  it("claims no more than an indication, and uses no long dashes or markdown asterisks", () => {
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("*");
    expect(html).not.toMatch(/\bcompliant\b|\bcertified\b/i);
    // Always "je": no "u" or "uw" in the words a reader sees.
    const visibleText = html.replace(/<[^>]+>/g, " ");
    expect(visibleText).not.toMatch(/\b[Uu]\b|\b[Uu]w\b/);
  });
});

describe("craPageMeta", () => {
  it("has a title and a description in each language, without long dashes", () => {
    const en = craPageMeta("en");
    const nl = craPageMeta("nl");
    expect(en.title).toContain("Free check of eight security signals");
    expect(nl.title).toContain("Gratis check van acht beveiligingssignalen");
    expect(nl.description).toContain("geen toets op naleving");
    expect(nl.description).not.toBe(en.description);
    for (const text of [en.title, en.description, nl.title, nl.description]) {
      expect(text).not.toMatch(LONG_DASHES);
      expect(text).not.toContain("*");
    }
  });
});

describe("clientErrorText", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The sentences are produced by the real check-api.ts through a stubbed fetch, so a change of its wording fails here.
  async function messageFor(respond: () => Promise<Response>): Promise<string> {
    vi.stubGlobal("fetch", vi.fn(respond));
    try {
      await checkCraRepo("owner/name");
    } catch (err) {
      expect(err).toBeInstanceOf(CheckApiError);
      return (err as CheckApiError).message;
    }
    throw new Error("checkCraRepo did not fail");
  }

  const cases: Array<[string, () => Promise<Response>, string]> = [
    ["the service cannot be reached", () => Promise.reject(new TypeError("network down")), "De checkservice is niet bereikbaar. Misschien is hij offline, of is je verbinding weggevallen."],
    ["the answer is not readable", () => Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 })), "De checkservice gaf een onleesbaar antwoord (HTTP 502)."],
    ["the answer is JSON that says nothing", () => Promise.resolve(new Response("{}", { status: 500 })), "De checkservice antwoordde met HTTP 500."],
    ["too many attempts", () => Promise.resolve(new Response("{}", { status: 429 })), "Te veel pogingen vanaf deze verbinding. Wacht een paar minuten en probeer het opnieuw."],
  ];

  for (const [name, respond, dutch] of cases) {
    it(`turns the client's own sentence into Dutch when ${name}, and leaves English alone`, async () => {
      const message = await messageFor(respond);
      expect(clientErrorText("en", message)).toBe(message);
      const nl = clientErrorText("nl", message);
      expect(nl).toBe(dutch);
      expect(nl).not.toMatch(LONG_DASHES);
      expect(nl).not.toContain("*");
    });
  }

  it("falls back to the generic Dutch sentence for a message it does not know", () => {
    expect(clientErrorText("nl", "Something unexpected")).toBe("Er ging iets mis. Probeer het opnieuw.");
    expect(clientErrorText("en", "Something unexpected")).toBe("Something unexpected");
  });
});

describe("CraCheckResultView", () => {
  it("shows the counts, every point with its status, and what to do about the ones not visible", () => {
    const html = renderResult("en", sample());
    expect(html).toContain("1 of the 3 public-repository signals");
    expect(html).toContain("2 are not visible in the places we looked");
    expect(html).toContain("1 could not be checked completely");
    expect(html).toContain("not a compliance score");
    expect(html).toContain("not visible");
    expect(html).toContain("Let the build produce a CycloneDX file.");
    expect(html).toContain("Rule set 2026-10-28.3");
    expect(html).not.toMatch(LONG_DASHES);
  });

  it("says it in the same words as before, sentence for sentence", () => {
    const html = renderResult("en", sample());
    expect(html).toContain(
      "For Owner/Repo, 1 of the 3 public-repository signals we could check are visible, and 2 are not visible in the places we looked. 1 could not be checked completely. This is not a compliance score.",
    );
    expect(html).toContain("Measured 2026-10-28 12:00 UTC. Rule set 2026-10-28.3, reviewed on 2026-10-28.");
    expect(html).toContain("The Regulation itself is <a");
    expect(html).toContain(">on EUR-Lex</a>.");
    expect(html).toContain("To make it visible </span>Let the build produce a CycloneDX file.");
  });

  it("renders text from the repository as text, never as markup", () => {
    const hostile = sample({ controls: [{ id: "sbom", topic: "t", status: "visible", evidence: "<img src=x onerror=alert(1)>", explanation: "<script>alert(1)</script>" }], summary: { measured: 1, visible: 1, notVisible: 0, notMeasured: 0 } });
    for (const locale of ["en", "nl"] as const) {
      const html = renderResult(locale, hostile);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("shows what came of each page we asked for, and links only the two GitHub hosts", () => {
    const html = renderResult("en", sample());
    expect(html).toContain('href="https://api.github.com/repos/Owner/Repo"');
    expect(html).not.toContain('href="https://example.com/not-github"');
    expect(html).toContain("https://example.com/not-github");
    expect(html).toContain(">read<");
    expect(html).toContain(">failed<");
  });

  it("says when the answer came from the cache", () => {
    expect(renderResult("en", sample({ cached: true }))).toContain("short cache kept in server memory");
    expect(renderResult("en", sample({ cached: false }))).not.toContain("short cache");
  });

  it("speaks Dutch around the numbers: counts, statuses, outcomes, dates, labels", () => {
    const html = renderResult("nl", sample());
    expect(html).toContain(
      "Voor Owner/Repo is 1 van de 3 signalen die we in de openbare repository konden controleren zichtbaar, en zijn er 2 niet zichtbaar op de plekken waar we keken. 1 signaal kon niet volledig worden gecontroleerd. Dit is geen compliancescore.",
    );
    expect(html).toContain(">zichtbaar<");
    expect(html).toContain(">niet zichtbaar<");
    expect(html).toContain(">niet gemeten<");
    expect(html).toContain("Zo maak je het zichtbaar </span>Let the build produce a CycloneDX file.");
    expect(html).toContain("Gemeten op 2026-10-28 12:00 UTC. Regelversie 2026-10-28.3, beoordeeld op 2026-10-28.");
    expect(html).toContain("De verordening zelf staat <a");
    expect(html).toContain(">op EUR-Lex</a>.");
    expect(html).toContain("De acht signalen");
    expect(html).toContain("Wat dit je niet vertelt");
    expect(html).toContain("Controleer onze feiten zelf");
    expect(html).toContain("met per pagina de uitkomst");
    expect(html).toContain(">gelezen<");
    expect(html).toContain(">mislukt<");
    expect(html).toContain('href="https://api.github.com/repos/Owner/Repo"');
    expect(html).not.toContain('href="https://example.com/not-github"');
  });

  it("shows none of the English chrome in Dutch (only the server's own sentences stay as sent)", () => {
    const html = renderResult("nl", sample({ cached: true }));
    for (const english of ["Measured", "Rule set", "To make it visible", "What this does not tell you", "Check our facts yourself", "The eight signals", "This is not a compliance score", "short cache", ">read<", ">failed<"]) {
      expect(html).not.toContain(english);
    }
    expect(html).toContain("Dit antwoord komt uit een korte cache in het geheugen van de server");
    // A sentence the phrasebook does not know comes through untouched (this fixture's sentences are not the server's real ones).
    expect(html).toContain("Let the build produce a CycloneDX file.");
    expect(html).toContain("private repositories");
  });

  it("gets singular and plural right in both languages", () => {
    const one = sample({ summary: { measured: 2, visible: 1, notVisible: 1, notMeasured: 0 } });
    expect(renderResult("en", one)).toContain("1 of the 2 public-repository signals we could check are visible, and 1 is not visible in the places we looked. This is not a compliance score.");
    expect(renderResult("nl", one)).toContain("is 1 van de 2 signalen die we in de openbare repository konden controleren zichtbaar, en is er 1 niet zichtbaar op de plekken waar we keken. Dit is geen compliancescore.");

    const many = sample({ summary: { measured: 5, visible: 3, notVisible: 0, notMeasured: 3 } });
    expect(renderResult("nl", many)).toContain("zijn 3 van de 5 signalen die we in de openbare repository konden controleren zichtbaar. 3 signalen konden niet volledig worden gecontroleerd.");
    expect(renderResult("nl", many)).not.toContain("niet zichtbaar op de plekken");
  });

  it("uses no long dashes or asterisks in the labels, in either language", () => {
    for (const locale of ["en", "nl"] as const) {
      const html = renderResult(locale, sample({ cached: true }));
      expect(html).not.toMatch(LONG_DASHES);
      expect(html).not.toContain("*");
    }
  });
});

// React escapes these five characters in text, and the English sentences contain apostrophes.
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("CraCheckResultView in Dutch: the fixed sentences of the server", () => {
  const ELSEWHERE = " This only looks at the public repository and its GitHub releases; if you do this somewhere else, it is not visible here.";
  const OWNER = " (the policy GitHub shows for every repository of this owner)";

  it("leaves no English sentence of the phrasebook in the Dutch HTML, in any field and for every status", () => {
    const keys = Object.keys(PHRASES).filter((key) => PHRASES[key] !== key);
    expect(keys.length).toBeGreaterThan(60);
    const statuses: CraStatus[] = ["visible", "not_visible", "not_measured"];
    const controls: CraControl[] = keys.map((key, i) => ({ id: `c${i}`, topic: key, status: statuses[i % statuses.length], evidence: key, explanation: key, fix: key }));
    const notice = keys.find((key) => key.startsWith("This is an indication"));
    const basis = keys.find((key) => key.startsWith("These are eight selected signals"));
    expect(notice).toBeDefined();
    expect(basis).toBeDefined();
    const result = sample({
      controls,
      advisories: "not measured",
      whatThisDoesNotMeasure: keys,
      notice: notice as string,
      rules: { version: "v", reviewedOn: "d", basis: basis as string, regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj" },
    });
    const html = renderResult("nl", result);
    expect(keys.filter((key) => html.includes(escapeHtml(key)))).toEqual([]);
    // The same fixture in English still shows every sentence as the server wrote it.
    const english = renderResult("en", result);
    expect(keys.filter((key) => !english.includes(escapeHtml(key)))).toEqual([]);
  });

  it("translates a realistic report with all three statuses and keeps the varying parts as the server sent them", () => {
    const result = sample({
      cached: false,
      summary: { measured: 5, visible: 3, notVisible: 1, notMeasured: 1 },
      controls: [
        { id: "vulnerability-policy", topic: "Reporting channel and policy for vulnerabilities", status: "visible", evidence: "SECURITY.md" + OWNER, explanation: "A security policy file is there and names a contact address or a reporting link." },
        {
          id: "sbom",
          topic: "Software bill of materials (SBOM)",
          status: "not_visible",
          explanation:
            "No SBOM file anywhere in the repository (every file was listed), none attached to the latest releases and no workflow step that produces one. The CRA asks for a machine-readable list of components, at least the top-level dependencies." + ELSEWHERE,
          fix: "Let the build produce a CycloneDX or SPDX file and attach it to each release.",
        },
        { id: "pinned-dependencies", topic: "Pinned dependencies", status: "not_measured", explanation: "The file tree of the repository could not be read completely." },
        {
          id: "maintenance",
          topic: "Maintenance and updates",
          status: "visible",
          evidence: "last commit on the default branch 3 days ago, last release 12 days ago",
          explanation: "There is recent activity. That is a weak sign: recent commits do not show that vulnerabilities are handled, and a quiet repository does not show that they are not.",
        },
        { id: "security-scanning", topic: "Automated security tests", status: "visible", evidence: "codeql", explanation: "A security scan runs in CI." },
        { id: "license", topic: "Licence", status: "visible", evidence: "Apache-2.0", explanation: "A licence is declared." },
      ],
      advisories: "2 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
      whatThisDoesNotMeasure: ["private repositories, hosting other than GitHub, and anything that is not public"],
      notice: "This is an indication from public data about eight selected signals. It is not a check against the legal requirements, not a conformity assessment and not legal advice.",
      rules: { version: "2026-10-28.7", reviewedOn: "2026-10-28", basis: Object.keys(PHRASES).find((key) => key.startsWith("These are eight selected signals")) as string, regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj" },
    });
    const html = renderResult("nl", result);
    for (const dutch of [
      "Meldkanaal en beleid voor kwetsbaarheden",
      "SECURITY.md (het beleid dat GitHub toont voor alle repositories van deze eigenaar)",
      "Er staat een bestand met beveiligingsbeleid en dat noemt een contactadres of een meldlink.",
      "Nergens in de repository staat een SBOM-bestand",
      "Dit kijkt alleen naar de openbare repository en de GitHub-releases; als je dit ergens anders doet, is het hier niet zichtbaar.",
      "Laat de build een CycloneDX- of SPDX-bestand maken en hang dat aan elke release.",
      "Vastgezette afhankelijkheden",
      "De lijst met bestanden van de repository kon niet helemaal worden gelezen.",
      "laatste commit op de standaardbranch 3 dagen geleden, laatste release 12 dagen geleden",
      "Er is recente activiteit. Dat is een zwak teken",
      "Er draait een beveiligingsscan in CI.",
      "Er is een licentie opgegeven.",
      "2 gepubliceerde beveiligingsadviezen in deze repository",
      "privérepositories, hosting anders dan GitHub, en alles wat niet openbaar is",
      "Dit is een indicatie op basis van openbare gegevens over acht gekozen signalen.",
      "Dit zijn acht gekozen signalen die zichtbaar zijn in een openbare repository",
    ]) {
      expect(html, dutch).toContain(escapeHtml(dutch));
    }
    for (const badge of [">zichtbaar<", ">niet zichtbaar<", ">niet gemeten<"]) expect(html).toContain(badge);
    // What varies is shown exactly as the server sent it.
    expect(html).toContain(">codeql</p>");
    expect(html).toContain(">Apache-2.0</p>");
    // No English sentence of the server is left.
    for (const english of ["Reporting channel", "workflow step", "was listed", "recent activity", "A security scan runs", "A licence is declared", "published security advisories", "not a conformity assessment", "private repositories", "This only looks at"]) {
      expect(html).not.toContain(english);
    }
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("*");
  });

  it("never guesses: a sentence the phrasebook does not know stays exactly as the server sent it", () => {
    const result = sample({
      controls: [{ id: "sbom", topic: "A new topic the server added", status: "not_visible", evidence: "a new kind of evidence", explanation: "A brand new sentence, not in the phrasebook.", fix: "Add a brand new thing." }],
      summary: { measured: 1, visible: 0, notVisible: 1, notMeasured: 0 },
      advisories: "a different advisories sentence",
      notice: "A different notice.",
      whatThisDoesNotMeasure: ["something new"],
    });
    const html = renderResult("nl", result);
    for (const text of ["A new topic the server added", "a new kind of evidence", "A brand new sentence, not in the phrasebook.", "Add a brand new thing.", "a different advisories sentence", "A different notice.", "something new"]) {
      expect(html).toContain(text);
    }
  });
});
