import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUSINESS_LINE } from "@/components/footer";
import { LegalPage, linkify, parseLegalText } from "@/components/pages/legal-page";

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
const ADDRESS = "Lochemstraat 49, 5651 EL Eindhoven";

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

describe("LegalPage", () => {
  it("renders one h1 and the text of the file", () => {
    const html = renderToStaticMarkup(<LegalPage raw={privacy} title="t" description="d" />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Privacy statement");
    expect(html).toContain("We set no cookies and use no analytics or tracking.");
  });
});

describe("the business line in the footer", () => {
  it("carries the same company data as the texts", () => {
    expect(BUSINESS_LINE).toContain("AO Services");
    expect(BUSINESS_LINE).toContain(KVK);
    expect(BUSINESS_LINE).toContain(VAT);
    expect(BUSINESS_LINE).toContain("Lochemstraat 49");
    expect(BUSINESS_LINE).toContain("5651 EL Eindhoven");
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
