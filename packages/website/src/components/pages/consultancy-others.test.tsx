import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConsultancyPage } from "@/components/pages/offer-pages";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { readableText } from "@/test-utils/readable-text";

// The block "what others wrote about our work" names three public pages written by other people. Each link and each number is pinned here, so
// a change of the page that no longer matches the original fails here and not in front of a reader. The originals were opened without a login
// and their wording read on 21 November 2026.
// The numbers are pinned inside their phrase, never alone: the date on the page also contains "21".
const ORIGINALS: { href: string; en: string[]; nl: string[] }[] = [
  {
    href: "https://github.com/nirium-protocol/nirium/pull/398",
    en: ["merged our 21 outside test vectors", "(pull request 398)"],
    nl: ["nam onze 21 testgevallen van buitenaf op", "(pull request 398)"],
  },
  {
    href: "https://github.com/jrosgren/x402-decision-record/blob/main/CHANGELOG.md",
    en: ["passed all 70 cases"],
    nl: ["alle 70 gevallen haalde"],
  },
  {
    href: "https://github.com/x402-foundation/x402/pull/4215#issuecomment-7046859777",
    en: ["on x402 pull request 4215 with Python"],
    nl: ["op x402 pull request 4215 zelfstandig na met Python"],
  },
];

function markup(locale: Locale): string {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <ConsultancyPage />
    </LocaleProvider>,
  );
}

describe("what others wrote about our work, on the consultancy page", () => {
  for (const locale of ["en", "nl"] as const) {
    it(`links the three originals and states their numbers in ${locale}`, () => {
      const html = markup(locale);
      const text = readableText(html);
      for (const o of ORIGINALS) {
        expect(html).toContain(`href="${o.href}"`);
        for (const phrase of o[locale]) expect(text).toContain(phrase);
      }
      expect(text).toContain(locale === "nl" ? "21 november 2026" : "21 November 2026");
    });

    it(`says it is facts and not recommendations, and puts the block before "where it stops" in ${locale}`, () => {
      const text = readableText(markup(locale));
      expect(text).toMatch(locale === "nl" ? /geen aanbevelingen/ : /not recommendations/);
      const own = text.indexOf(locale === "nl" ? "Wat anderen over ons werk schreven" : "What others wrote about our work");
      const stop = text.indexOf(locale === "nl" ? "Waar het ophoudt" : "Where it stops");
      expect(own).toBeGreaterThan(-1);
      expect(stop).toBeGreaterThan(own);
    });

    it(`has no dash that gives away machine-written text and no praise word of ours in ${locale}`, () => {
      const text = readableText(markup(locale));
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/\*\*/);
      expect(text.toLowerCase()).not.toMatch(/\b(best|leading|trusted|world-class|beste|toonaangevend)\b/);
    });
  }
});
