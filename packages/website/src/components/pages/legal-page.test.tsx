import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUSINESS_LINE } from "@/components/footer";
import { LEGAL_PAGES, LegalPage, PrivacyPage, SignalLogPage, TermsPage, linkify, parseLegalText } from "@/components/pages/legal-page";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { readableText } from "@/test-utils/readable-text";

import signalLog from "@/data/legal/signal-log.txt?raw";
import terms from "@/data/legal/terms.txt?raw";
import privacy from "@/data/legal/privacy.txt?raw";
import llms from "../../../public/llms.txt?raw";
import sitemap from "../../../public/sitemap.xml?raw";

const TEXTS = { "signal-log": signalLog, terms, privacy };

interface LinkProps {
  href: string;
  children: string;
}

// Company data the king gave on 28 October 2026 and the Chamber of Commerce number he confirmed.
const KVK = "86816632";
const VAT = "NL004319767B61";
// The street address left the site on the owner's order of 29 October 2026: the place is Eindhoven, the Netherlands, and nothing more precise.
const ADDRESS = "Eindhoven, the Netherlands";

describe("the three shop texts", () => {
  it("name the company, the KvK number and the address where a buyer looks for them", () => {
    for (const [name, text] of [["signal-log", signalLog], ["terms", terms]] as const) {
      expect(text, name).toContain("AO Services");
      expect(text, name).toContain(KVK);
      expect(text, name).toContain(VAT);
      expect(text, name).toContain(ADDRESS);
    }
    expect(privacy).toContain("AO Services");
    expect(privacy).toContain(KVK);
    expect(privacy).toContain(ADDRESS);
  });

  it("contain none of the characters that mark text as machine written, and no markdown", () => {
    for (const [name, text] of Object.entries(TEXTS)) {
      expect(text, name).not.toMatch(/[–—]/);
      expect(text, name).not.toContain("**");
    }
  });

  it("only link to pages that exist on the site", () => {
    const known = new Set(["cra-check", "signal-log", "terms", "privacy", "notes"]);
    for (const [name, text] of Object.entries(TEXTS)) {
      for (const m of text.matchAll(/tokenizen\.nl\/en\/([a-z-]+)/g)) {
        expect(known.has(m[1]), `${name}: tokenizen.nl/en/${m[1]}`).toBe(true);
      }
    }
  });

  it("state the same prices as the payment links in Stripe", () => {
    expect(signalLog).toContain("Solo: 9.95 euro per month or 99 euro per year, up to 3 repositories.");
    expect(signalLog).toContain("Team: 29.95 euro per month or 299 euro per year, up to 25 repositories.");
  });

  it("say plainly what is not included yet", () => {
    expect(signalLog).toContain("What is not included yet");
    expect(signalLog).toMatch(/Email warnings .* are not part of what you buy today/);
    expect(terms).toContain("the email warnings are not included yet");
  });

  it("number the ten clauses of the terms in order", () => {
    const numbers = [...terms.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("parseLegalText", () => {
  it("takes the first paragraph as the title and finds the headings of the offer page", () => {
    const blocks = parseLegalText(signalLog);
    expect(blocks[0]).toEqual({ kind: "title", text: "Signal log, early access" });
    const headings = blocks.filter((b) => b.kind === "heading").map((b) => b.text);
    expect(headings).toEqual([
      "What you get today",
      "What is not included yet",
      "What this is not",
      "Price, VAT included",
      "How it starts",
      "Who we are",
    ]);
  });

  it("keeps every word: the blocks put back together are the file, apart from white space", () => {
    const flat = (s: string) => s.replace(/\s+/g, " ").trim();
    for (const [name, text] of Object.entries(TEXTS)) {
      const joined = parseLegalText(text).map((b) => b.text).join(" ");
      expect(flat(joined), name).toBe(flat(text));
    }
  });

  it("keeps the price lines of the offer on separate lines under their heading", () => {
    const blocks = parseLegalText(signalLog);
    const at = blocks.findIndex((b) => b.text === "Price, VAT included");
    expect(blocks[at].kind).toBe("heading");
    expect(blocks[at + 1].kind).toBe("paragraph");
    expect(blocks[at + 1].text.split("\n").slice(0, 2)).toEqual([
      "Solo: 9.95 euro per month or 99 euro per year, up to 3 repositories.",
      "Team: 29.95 euro per month or 299 euro per year, up to 25 repositories.",
    ]);
  });

  it("never turns a sentence of the terms or the privacy statement into a heading", () => {
    for (const text of [terms, privacy]) {
      const headings = parseLegalText(text).filter((b) => b.kind === "heading");
      for (const h of headings) expect(h.text.length).toBeLessThanOrEqual(48);
    }
  });
});

describe("linkify", () => {
  it("turns site addresses and the email address into links and leaves the words alone", () => {
    const text = "See tokenizen.nl/en/terms or write to info@tokenizen.nl.";
    const parts = linkify(text);
    const links = parts.filter((p): p is ReactElement<LinkProps> => isValidElement(p));
    expect(links.map((l) => l.props.href)).toEqual(["https://tokenizen.nl/en/terms", "mailto:info@tokenizen.nl"]);
    const words = parts.map((p) => (isValidElement(p) ? (p as ReactElement<LinkProps>).props.children : p)).join("");
    expect(words).toBe(text);
  });
});

const PAGES = [
  { name: "signal-log", Page: SignalLogPage, raw: signalLog },
  { name: "terms", Page: TermsPage, raw: terms },
  { name: "privacy", Page: PrivacyPage, raw: privacy },
] as const;

const render = (Page: () => ReactElement, locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <Page />
    </LocaleProvider>,
  );

/** What a reader reads: the markup without its tags (so a link in the middle of a sentence does not split it), the entities React writes turned back. */
const readable = (html: string) => readableText(html, { gap: "", collapse: false });

const NOTICE_NL = "Deze pagina staat voorlopig alleen in het Engels. Een Nederlandse vertaling volgt nog. Vragen? Mail info@tokenizen.nl.";

describe("LegalPage", () => {
  const withProvider = (locale: Locale) =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <LegalPage {...LEGAL_PAGES.privacy} />
      </LocaleProvider>,
    );

  it("renders one h1 and the text of the file", () => {
    const html = withProvider("en");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Privacy statement");
    expect(html).toContain("We set no cookies and use no analytics or tracking.");
  });
});

describe("the three pages in English", () => {
  for (const { name, Page, raw } of PAGES) {
    const html = render(Page, "en");
    const blocks = parseLegalText(raw);

    it(`[${name}] has exactly one h1, the title of the file, and no Dutch notice`, () => {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(readable(html.match(/<h1[^>]*>([^<]*)<\/h1>/)![1])).toBe(blocks[0].text);
      expect(html).not.toContain(NOTICE_NL);
      expect(html).not.toContain("Deze pagina staat voorlopig");
      expect(html).not.toContain('lang="en"');
    });

    it(`[${name}] shows every block of the approved text, unchanged and in order, once`, () => {
      const text = readable(html);
      let from = 0;
      for (const block of blocks) {
        const at = text.indexOf(block.text, from);
        expect(at, `${name}: ${block.text.slice(0, 50)}`).toBeGreaterThanOrEqual(from);
        expect(text.indexOf(block.text, at + block.text.length), `${name} twice: ${block.text.slice(0, 50)}`).toBe(-1);
        from = at;
      }
    });

    it(`[${name}] keeps the links of the text and uses the cinema head with a photograph`, () => {
      expect(html).toContain('href="mailto:info@tokenizen.nl"');
      expect(html).toContain('class="cinema"');
      expect(html).toContain("/media/site/logboek");
    });
  }

  it("names each page with its own chip", () => {
    expect(render(SignalLogPage, "en")).toContain(">early access<");
    expect(render(TermsPage, "en")).toContain(">terms<");
    expect(render(PrivacyPage, "en")).toContain(">privacy<");
  });
});

describe("the three pages in Dutch", () => {
  for (const { name, Page, raw } of PAGES) {
    const html = render(Page, "nl");
    const text = readable(html);
    const blocks = parseLegalText(raw);
    const dutch = LEGAL_PAGES[name].nl;

    it(`[${name}] has exactly one h1, and it is the Dutch title`, () => {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(readable(html.match(/<h1[^>]*>([^<]*)<\/h1>/)![1])).toBe(dutch.title);
      expect(text).toContain(dutch.lead);
      expect(html).toContain(`>${dutch.chip}<`);
    });

    it(`[${name}] says in a visible box that the text is English for now, with the email as a link`, () => {
      expect(text).toContain(NOTICE_NL);
      expect(html).toMatch(
        /<p role="note"[^>]*>Deze pagina staat voorlopig alleen in het Engels\. Een Nederlandse vertaling volgt nog\. Vragen\? Mail <a [^>]*href="mailto:info@tokenizen\.nl"/,
      );
      expect(text.indexOf(NOTICE_NL)).toBeLessThan(text.indexOf(blocks[1].text));
    });

    it(`[${name}] shows the English text below it unchanged, in order and once, marked as English`, () => {
      expect(html).toContain('lang="en"');
      let from = text.indexOf(NOTICE_NL);
      for (const block of blocks) {
        const at = text.indexOf(block.text, from);
        expect(at, `${name}: ${block.text.slice(0, 50)}`).toBeGreaterThanOrEqual(from);
        expect(text.indexOf(block.text, at + block.text.length), `${name} twice: ${block.text.slice(0, 50)}`).toBe(-1);
        from = at;
      }
    });

    it(`[${name}] has no long dashes in the Dutch words and never the formal u or uw`, () => {
      const words = [dutch.chip, dutch.title, dutch.lead, dutch.metaTitle, dutch.metaDescription, NOTICE_NL];
      for (const w of words) {
        expect(w).not.toMatch(/[–—]/);
        expect(w).not.toContain("**");
        expect(w).not.toMatch(/\b(u|uw)\b/i);
      }
      expect(html).not.toMatch(/[–—]/);
    });
  }

  it("names each page with its own Dutch chip", () => {
    expect(render(SignalLogPage, "nl")).toContain(">vroege toegang<");
    expect(render(TermsPage, "nl")).toContain(">voorwaarden<");
    expect(render(PrivacyPage, "nl")).toContain(">privacy<");
  });

  it("gives each page a Dutch title and description for the browser tab, different from the English", () => {
    for (const { name } of PAGES) {
      const { en, nl } = LEGAL_PAGES[name];
      expect(nl.metaTitle, name).not.toBe(en.metaTitle);
      expect(nl.metaDescription, name).not.toBe(en.metaDescription);
      expect(nl.metaDescription, name).toContain("voorlopig alleen in het Engels");
    }
  });
});

describe("the business line in the footer", () => {
  it("carries the same company data as the texts", () => {
    expect(BUSINESS_LINE).toContain("AO Services");
    expect(BUSINESS_LINE).toContain(KVK);
    expect(BUSINESS_LINE).toContain(VAT);
    expect(BUSINESS_LINE).toContain("Eindhoven, Nederland");
    expect(BUSINESS_LINE).not.toMatch(/[–—]/);
  });
});

describe("discoverability", () => {
  it("lists the three pages in the sitemap and in llms.txt", () => {
    for (const slug of ["signal-log", "terms", "privacy"]) {
      const url = `https://tokenizen.nl/${slug}`;
      expect(sitemap, `sitemap: ${url}`).toContain(`<loc>${url}</loc>`);
      expect(llms, `llms.txt: ${url}`).toContain(url);
    }
  });
});
