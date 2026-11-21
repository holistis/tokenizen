import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

import App from "@/App";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { readableText } from "@/test-utils/readable-text";

// The "Work with us" block on the homepage names three public pages written by other people. Each link and each number is pinned here, inside
// its phrase, so a change that no longer matches the original fails here and not in front of a reader. The originals were opened without a
// login and their wording read on 21 November 2026. Technical work goes through "Contact us": no person is named in the block.
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

const globalWithWindow = globalThis as unknown as { window?: unknown };
const originalWindow = globalWithWindow.window;
afterAll(() => {
  globalWithWindow.window = originalWindow;
});

function home(locale: Locale): string {
  const path = locale === "nl" ? "/nl" : "/";
  globalWithWindow.window = {
    location: { pathname: path, search: "", hash: "", href: `https://tokenizen.nl${path}`, origin: "https://tokenizen.nl" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <App />
    </LocaleProvider>,
  );
}

/** The part of the homepage text from the lead of the block up to the closing words of the box, where "Contact us" follows. */
function block(locale: Locale): string {
  const text = readableText(home(locale));
  const from = text.indexOf(locale === "nl" ? "Wat anderen over ons werk schreven:" : "What others wrote about our work:");
  const to = text.indexOf(locale === "nl" ? "Vertel ons waar je staat" : "Tell us where you stand");
  expect(from, "the lead of the block is on the homepage").toBeGreaterThan(-1);
  expect(to, "the closing words of the box are on the homepage").toBeGreaterThan(from);
  return text.slice(from, to);
}

describe("what others wrote about our work, in the Work with us box on the homepage", () => {
  for (const locale of ["en", "nl"] as const) {
    it(`links the three originals and states their numbers in ${locale}`, () => {
      const html = home(locale);
      const text = block(locale);
      for (const o of ORIGINALS) {
        expect(html).toContain(`href="${o.href}"`);
        for (const phrase of o[locale]) expect(text).toContain(phrase);
      }
      expect(text).toContain(locale === "nl" ? "21 november 2026" : "21 November 2026");
      expect(text).toMatch(locale === "nl" ? /geen aanbevelingen/ : /not recommendations/);
    });

    it(`names no person, has no dash that gives away machine-written text and no praise word of ours in ${locale}`, () => {
      const text = block(locale);
      expect(text).not.toMatch(/Ahmed|Abdellah|holistis|Ouadoudi/i);
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/\*\*/);
      expect(text.toLowerCase()).not.toMatch(/\b(best|leading|trusted|world-class|beste|toonaangevend)\b/);
    });

    it(`keeps the Contact us button after the block in ${locale}`, () => {
      const text = readableText(home(locale));
      const others = text.indexOf(locale === "nl" ? "Wat anderen over ons werk schreven:" : "What others wrote about our work:");
      const button = text.indexOf(locale === "nl" ? "Neem contact op" : "Contact us", others);
      expect(button).toBeGreaterThan(others);
    });
  }
});
