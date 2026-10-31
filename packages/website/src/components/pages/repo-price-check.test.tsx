import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPO_CHECK_COPY, RepoCheckResultView, RepoPriceCheck } from "@/components/pages/repo-price-check";
import { ScanPage } from "@/components/pages/offer-pages";
import { LocaleProvider, type Locale } from "@/i18n/context";
import type { RepoCheckErrorCode, RepoCheckOutcome } from "@/lib/repo-price-check";

const LONG_DASHES = /[–—]/;
const NO_QUOTE_EN = "The free check shows size and estimated lines. The price for a deep scan by size will appear here once the deep scan is live.";
const NO_QUOTE_NL = "De gratis check toont grootte en geschatte regels. De prijs voor een diepe scan op grootte verschijnt hier zodra de diepe scan live is.";

const view = (outcome: RepoCheckOutcome, locale: "en" | "nl" = "en") => renderToStaticMarkup(<RepoCheckResultView outcome={outcome} locale={locale} />);

const measured = (over: Partial<Extract<RepoCheckOutcome, { kind: "measured" }>> = {}): RepoCheckOutcome => ({
  kind: "measured",
  repo: "owner/name",
  sizeKb: 1234,
  estimatedLines: null,
  noSolidity: false,
  quote: null,
  ...over,
});

describe("RepoPriceCheck form", () => {
  it.each(["en", "nl"] as const)("renders a field and a button in %s, with no long dashes and no double asterisks", (locale) => {
    const html = renderToStaticMarkup(<RepoPriceCheck locale={locale} />);
    expect(html).toContain('id="repo-price-check"');
    expect(html).toContain('type="submit"');
    expect(html).toContain(REPO_CHECK_COPY[locale].intro);
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("**");
  });

  it.each([
    ["en", "/scan", "Check your repository"],
    ["nl", "/nl/scan", "Check je repository"],
  ] as const)("sits on the scan page in %s", (locale, _path, label) => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale={locale as Locale}>
        <ScanPage />
      </LocaleProvider>,
    );
    expect(html).toContain(label);
    expect(html).toContain('id="repo-price-check"');
  });

  it("uses no long dashes, no double asterisks and no price figure in any of its own sentences", () => {
    for (const locale of ["en", "nl"] as const) {
      const c = REPO_CHECK_COPY[locale];
      const fixed = [c.label, c.intro, c.empty, c.noQuote, c.noSolidity, c.linesMissing, ...Object.values(c.errors)].join("\n");
      expect(fixed).not.toMatch(LONG_DASHES);
      expect(fixed).not.toContain("**");
      expect(fixed).not.toMatch(/\$\s?\d/);
    }
  });
});

describe("RepoCheckResultView", () => {
  it("shows the measurement and the honest sentence when there is no quote", () => {
    const html = view(measured());
    expect(html).toContain("owner/name");
    expect(html).toContain("1,234 KB");
    expect(html).toContain("not in this answer");
    expect(html).toContain(NO_QUOTE_EN);
    expect(html).not.toContain("$");
  });

  it("shows the Dutch sentence and Dutch number format", () => {
    const html = view(measured({ estimatedLines: 34552 }), "nl");
    expect(html).toContain("1.234 KB");
    expect(html).toContain("34.552");
    expect(html).toContain(NO_QUOTE_NL);
  });

  it("shows the price and its basis only when there is a quote", () => {
    const html = view(
      measured({ sizeKb: 42, estimatedLines: 1176, quote: { cents: 500, perMbCents: 2000, minimumCents: 500, minimumApplied: true, validForSeconds: 900 } }),
    );
    expect(html).toContain("Price of a deep scan");
    expect(html).toContain("$5.00");
    expect(html).toContain("Basis: 42 KB at $20.00 per MB, with a minimum of $5.00. The minimum applies here.");
    expect(html).toContain("1,176");
    expect(html).not.toContain(NO_QUOTE_EN);
  });

  it("leaves out basis parts the server did not send", () => {
    const html = view(measured({ sizeKb: 2048, quote: { cents: 4000, perMbCents: null, minimumCents: null, minimumApplied: null, validForSeconds: null } }), "nl");
    expect(html).toContain("$40,00");
    expect(html).toContain("Basis: 2.048 KB.");
    expect(html).not.toContain("minimum");
  });

  it("says when no Solidity was found", () => {
    expect(view(measured({ sizeKb: 0, noSolidity: true }))).toContain("No Solidity of the project&#x27;s own was found.");
  });

  it("renders a hostile repository string as text, never as markup", () => {
    const html = view(measured({ repo: '<script>alert("x")</script><img src=x onerror=alert(1)>' }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows a fixed, friendly sentence for every error, in both languages", () => {
    const codes: RepoCheckErrorCode[] = ["invalid", "not_found", "rate_limited", "busy", "unavailable", "network", "bad_response"];
    for (const locale of ["en", "nl"] as const) {
      for (const code of codes) {
        const html = view({ kind: "error", code }, locale);
        expect(html).toContain('role="alert"');
        expect(html).toContain(REPO_CHECK_COPY[locale].errors[code].replace(/'/g, "&#x27;"));
      }
    }
    expect(view({ kind: "error", code: "rate_limited" })).toContain("Too many checks, try again in a minute.");
    expect(view({ kind: "error", code: "rate_limited" }, "nl")).toContain("Te veel checks, probeer het over een minuut opnieuw.");
  });
});
