import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyHead, type ShareHead } from "../../scripts/prerender-heads.mjs";
import { craPageMeta } from "@/components/pages/cra-check-page";
import { BILINGUAL_PATHS } from "@/lib/page-head";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) => readFileSync(`${ROOT}${relative}`, "utf8");

const ORIGIN = "https://tokenizen.nl";
const pages = (JSON.parse(read("src/data/share-heads.json")) as { pages: Record<string, ShareHead> }).pages;
const indexHtml = read("index.html");
const homeTitle = /<title>([^<]*)<\/title>/.exec(indexHtml)![1]!;

const sitemapPaths = [...read("public/sitemap.xml").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => new URL(m[1]!).pathname.replace(/\/+$/, "") || "/")
  .filter((p) => p !== "/");

describe("share-heads.json", () => {
  it("has an entry for every page of the sitemap except the homepage, and no other", () => {
    expect(Object.keys(pages).sort()).toEqual([...sitemapPaths].sort());
  });

  for (const [path, entry] of Object.entries(pages)) {
    it(`${path}: its own head, consistent with itself`, () => {
      const nl = path === "/nl" || path.startsWith("/nl/");
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.title).not.toBe(homeTitle);
      expect(entry.canonical).toBe(ORIGIN + path);
      expect(entry.ogUrl).toBe(entry.canonical);
      expect(entry.ogTitle).toBe(entry.title);
      expect(entry.twitterTitle).toBe(entry.title);
      expect(entry.ogDescription).toBe(entry.description);
      // The Dutch homepage has a shorter text of its own for X, on purpose (i18n/nl.ts, meta.twitterDescription).
      if (path !== "/nl") expect(entry.twitterDescription).toBe(entry.description);
      expect(entry.lang).toBe(nl ? "nl" : "en");
      expect(entry.ogLocale).toBe(nl ? "nl_NL" : "en_US");
      expect(JSON.stringify(entry)).not.toContain("127.0.0.1");
      // A page that exists in both languages names both, and an English-only page names none (page-head.ts).
      const base = path.replace(/^\/nl(?=\/|$)/, "") || "/";
      expect(entry.alternates).toHaveLength(BILINGUAL_PATHS.includes(base) ? 3 : 0);
    });
  }

  it("agrees with the page's own copy where the page exports it", () => {
    expect(pages["/cra-check"]!.title).toBe(craPageMeta("en").title);
    expect(pages["/cra-check"]!.description).toBe(craPageMeta("en").description);
    expect(pages["/nl/cra-check"]!.title).toBe(craPageMeta("nl").title);
    expect(pages["/nl/cra-check"]!.description).toBe(craPageMeta("nl").description);
  });
});

describe("applyHead", () => {
  const cra = pages["/nl/cra-check"]!;
  const once = (html: string, needle: string) => html.split(needle).length - 1;

  it("puts one page's head into the template and leaves the rest alone", () => {
    const html = applyHead(indexHtml, cra);
    expect(html).toContain('<html lang="nl">');
    expect(once(html, `<title>${cra.title}</title>`)).toBe(1);
    expect(html).toContain(`<link rel="canonical" href="${cra.canonical}" />`);
    expect(html).toContain(`<meta property="og:url" content="${cra.ogUrl}" />`);
    expect(html).toContain('<meta property="og:locale" content="nl_NL" />');
    expect(once(html, 'rel="alternate" hreflang=')).toBe(3);
    expect(html).toContain(`hreflang="nl" href="${ORIGIN}/nl/cra-check"`);
    // The homepage's words are gone from every tag that was replaced ...
    expect(html).not.toContain(homeTitle);
    expect(html).not.toContain('<link rel="canonical" href="https://tokenizen.nl/" />');
    // ... and what was not meant to change is untouched.
    expect(html).toContain('<meta property="og:image" content="https://tokenizen.nl/og-image.png" />');
    expect(html).toContain('"@type": "Organization"');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).toContain('<div id="root"></div>');
  });

  it("writes no hreflang links for an English-only page", () => {
    const note = pages["/notes/check-pay-prove"]!;
    const html = applyHead(indexHtml, note);
    expect(once(html, 'rel="alternate" hreflang=')).toBe(0);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/notes/check-pay-prove" />`);
  });

  it("escapes what it writes into attributes and text", () => {
    const html = applyHead(indexHtml, { ...cra, title: 'A & "B" <c>', description: 'x " & < >', ogTitle: 'A & "B"', twitterTitle: 'A & "B"' });
    expect(html).toContain("<title>A &amp; \"B\" &lt;c&gt;</title>");
    expect(html).toContain('<meta name="description" content="x &quot; &amp; &lt; &gt;" />');
    expect(html).toContain('<meta property="og:title" content="A &amp; &quot;B&quot;" />');
  });

  it("fails instead of guessing when a tag it replaces is missing or twice there", () => {
    expect(() => applyHead(indexHtml.replace(/<link rel="canonical"[^>]*>/, ""), cra)).toThrow(/canonical/);
    expect(() => applyHead(indexHtml.replace("<title>", "<title></title><title>"), cra)).toThrow(/<title>/);
    expect(() => applyHead(indexHtml.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, ""), cra)).toThrow(/hreflang/);
  });
});
