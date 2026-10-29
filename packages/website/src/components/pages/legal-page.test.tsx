import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUSINESS_LINE } from "@/components/footer";
import { LEGAL_PAGES, LegalPage, NOTE_NL, NOTE_NL_LINK, PrivacyPage, SignalLogPage, TermsPage, linkify, parseLegalText } from "@/components/pages/legal-page";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { readableText } from "@/test-utils/readable-text";

import signalLog from "@/data/legal/signal-log.txt?raw";
import terms from "@/data/legal/terms.txt?raw";
import privacy from "@/data/legal/privacy.txt?raw";
import signalLogNl from "@/data/legal/signal-log.nl.txt?raw";
import termsNl from "@/data/legal/terms.nl.txt?raw";
import privacyNl from "@/data/legal/privacy.nl.txt?raw";
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
      expect(html).not.toContain(NOTE_NL);
      expect(html).not.toContain("Dit is de Nederlandse tekst");
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

const TEXTS_NL = { "signal-log": signalLogNl, terms: termsNl, privacy: privacyNl };

describe("the three pages in Dutch", () => {
  for (const { name, Page } of PAGES) {
    const html = render(Page, "nl");
    const text = readable(html);
    const blocks = parseLegalText(TEXTS_NL[name]);
    const dutch = LEGAL_PAGES[name].nl;

    it(`[${name}] has exactly one h1, and it is the title of the Dutch file`, () => {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(readable(html.match(/<h1[^>]*>([^<]*)<\/h1>/)![1])).toBe(blocks[0].text);
      expect(html).toContain(`>${dutch.chip}<`);
    });

    it(`[${name}] says in a visible box that the English text counts, with a link to it`, () => {
      expect(text).toContain(NOTE_NL);
      expect(html).toContain(`href="/${LEGAL_PAGES[name].slug}"`);
      expect(html).toContain(`>${NOTE_NL_LINK}<`);
      expect(html).toMatch(/<p role="note"/);
    });

    it(`[${name}] shows the Dutch text unchanged, in order and once, and none of the English text`, () => {
      let from = 0;
      for (const block of parseLegalText(TEXTS_NL[name]).slice(1)) {
        const at = text.indexOf(block.text, from);
        expect(at, `${name}: ${block.text.slice(0, 50)}`).toBeGreaterThanOrEqual(from);
        from = at;
      }
      const english = parseLegalText(TEXTS[name]);
      expect(text).not.toContain(english[1].text);
      expect(html).not.toContain('lang="en"');
    });

    it(`[${name}] has no long dashes, no markdown and never the formal u or uw`, () => {
      const words = [TEXTS_NL[name], dutch.chip, dutch.metaTitle, dutch.metaDescription, NOTE_NL, NOTE_NL_LINK];
      for (const w of words) {
        expect(w).not.toMatch(/[–—]/);
        expect(w).not.toContain("**");
        expect(w).not.toMatch(/\b(u|uw|uzelf)\b/i);
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
    }
  });
});

// "The Dutch says the same as the English" is a claim, so its basis is written down here. The basis is a count of what can be counted: the same
// number of blocks, the same numbers, the same company data, the same addresses of other pages (in the Dutch language), the same email address.
// What this does not prove is that every sentence means the same: that is for a reader of both languages (done once by our own review and by the
// owner), and the Dutch page says that the English text counts where they differ.
describe("the Dutch texts say the same as the English ones", () => {
  const numbersIn = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
  const withoutDate = (t: string) => t.replace(/Last changed:[^\n]*/, "").replace(/Laatst gewijzigd:[^\n]*/, "");

  for (const name of ["signal-log", "terms", "privacy"] as const) {
    it(`[${name}] has the same number of blocks, with the same kind of block in the same place`, () => {
      const en = parseLegalText(TEXTS[name]);
      const nl = parseLegalText(TEXTS_NL[name]);
      expect(nl.map((b) => b.kind)).toEqual(en.map((b) => b.kind));
    });

    it(`[${name}] has the same numbers in the same order`, () => {
      expect(numbersIn(withoutDate(TEXTS_NL[name]))).toEqual(numbersIn(withoutDate(TEXTS[name])));
    });

    it(`[${name}] names the same company data and the same email address`, () => {
      for (const fact of [KVK, "info@tokenizen.nl", "AO Services", "Eindhoven"]) {
        expect(TEXTS[name].includes(fact), `en ${fact}`).toBe(TEXTS_NL[name].includes(fact));
      }
      expect(TEXTS_NL[name].includes(VAT)).toBe(TEXTS[name].includes(VAT));
    });

    it(`[${name}] links to the same pages, in the Dutch language`, () => {
      const pages = (t: string, prefix: string) => [...t.matchAll(new RegExp(`tokenizen\\.nl/${prefix}/([a-z-]+)`, "g"))].map((m) => m[1]);
      expect(pages(TEXTS_NL[name], "nl")).toEqual(pages(TEXTS[name], "en"));
      expect(TEXTS_NL[name]).not.toMatch(/tokenizen\.nl\/en\//);
    });
  }

  it("keeps the ten clauses of the Dutch terms in order", () => {
    const clauses = parseLegalText(termsNl).filter((b) => /^\d+\. /.test(b.text));
    expect(clauses.map((b) => b.text.match(/^(\d+)\./)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });

  it("states the same prices as the English offer", () => {
    for (const price of ["9,95", "99", "29,95", "299"]) expect(signalLogNl).toContain(price);
    expect(signalLogNl).toContain("14 dagen");
  });
});

// The review of 29 October 2026 found sentences in the terms that promised more than the log can show, left a refund unclear, let a consumer's
// yearly subscription renew for another year, and said nothing about which language counts. They are corrected in both languages, and stay so.
describe("the terms are correct in both languages", () => {
  const both = [
    ["en", terms, signalLog, privacy],
    ["nl", termsNl, signalLogNl, privacyNl],
  ] as const;

  it("no longer says that the log shows a measurement was not changed after it was written", () => {
    expect(terms).not.toContain("shows that a measurement was not changed after it was written");
    expect(termsNl).not.toContain("niet is veranderd nadat hij is geschreven");
    expect(terms).toContain("Once a line of the log is covered by a confirmed timestamp");
    expect(termsNl).toContain("Zodra een regel van het logboek is gedekt door een bevestigde tijdstempel");
  });

  it("says that a change of an old line shows when you compare with an earlier copy or a confirmed timestamp", () => {
    expect(signalLog).toContain("when you compare the log with a copy you received earlier or with a confirmed timestamp");
    expect(signalLogNl).toContain("wanneer je het logboek vergelijkt met een kopie die je eerder kreeg of met een bevestigde tijdstempel");
  });

  it("says in plain words what is refunded when a weekly run is missed, and not that you get a period back", () => {
    for (const [taal, t, s] of both) {
      expect(t, `${taal} terms`).not.toMatch(/you get that period back|krijg je die periode terug/);
      expect(s, `${taal} offer`).not.toMatch(/you get that period back|krijg je die periode terug/);
    }
    expect(terms).toContain("we refund the share of the price for that month");
    expect(termsNl).toContain("betalen we het aandeel van de prijs voor die maand terug");
    expect(signalLog).toContain("we refund the share of the price for that month");
    expect(signalLogNl).toContain("betalen we het aandeel van de prijs voor die maand terug");
  });

  it("lets a consumer's yearly subscription continue for an indefinite period instead of renewing for another year", () => {
    expect(terms).toContain("it continues after the first year for an indefinite period");
    expect(termsNl).toContain("loopt het na het eerste jaar door voor onbepaalde tijd");
  });

  it("gives a consumer the right to end the subscription when a change is to their disadvantage", () => {
    expect(terms).toContain("If a change is to your disadvantage, you can end the subscription within 30 days");
    expect(termsNl).toContain("Is een wijziging in je nadeel, dan kun je het abonnement binnen 30 dagen");
  });

  it("says which language counts, and what counts for a consumer", () => {
    expect(terms).toContain("If the texts differ, the English text applies; if you are a consumer, the reading that is most favourable to you applies.");
    expect(termsNl).toContain("Verschillen de teksten, dan geldt de Engelse tekst; ben je consument, dan geldt de lezing die voor jou het gunstigst is.");
  });

  it("starts the 14 days when you subscribe, in the terms and in the offer, in both languages", () => {
    for (const [taal, t, s] of both) {
      expect(t, `${taal} terms`).toMatch(/14 (days after you subscribe|dagen nadat je je hebt geabonneerd)/);
      expect(s, `${taal} offer`).toMatch(/14 (days after you subscribe|dagen nadat je je hebt geabonneerd)/);
    }
  });

  it("names the legal ground for the IP address, the cookies of the payment page and the transfer outside the EEA", () => {
    expect(privacy).toContain("our legitimate interest in keeping the service safe");
    expect(privacyNl).toContain("ons gerechtvaardigd belang bij een veilige dienst");
    expect(privacy).toContain("The payment page is run by Stripe, which sets its own cookies there.");
    expect(privacyNl).toContain("De betaalpagina wordt beheerd door Stripe, die daar eigen cookies plaatst.");
    expect(privacy).toContain("outside the European Economic Area");
    expect(privacyNl).toContain("buiten de Europese Economische Ruimte");
  });

  it("carries the same date of the last change in both languages", () => {
    expect(privacy).toContain("Last changed: 29 October 2026.");
    expect(privacyNl).toContain("Laatst gewijzigd: 29 oktober 2026.");
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
