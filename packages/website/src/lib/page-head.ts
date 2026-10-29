// What the <head> of a page says about its own address.
//
// index.html carries the homepage's canonical address, og:url and language alternates. This is a
// single-page app, so the same head is served for every path, and the language provider used to
// write the homepage's title, description, canonical and og:url over whatever a page had set. Measured
// on the live site on 2026-10-28: /en/cra-check, /en/x402-check and every note told a search engine
// that its canonical address was https://tokenizen.nl/en. The decision per path lives here, as plain
// functions, so it can be tested without a browser.
//
// English is the base: its address has no prefix. The Dutch version of a page lives under /nl.

import { localePath, parsePath } from "@/lib/locale-paths";

/** Pages that exist in both languages (they are both in sitemap.xml). Every other page is English only. */
export const BILINGUAL_PATHS = [
  "/",
  "/notes",
  "/blog",
  "/checks",
  "/security",
  "/scan",
  "/tools",
  "/consultancy",
  "/about",
  "/cra-check",
  "/x402-check",
  "/check",
  "/scoreboard",
];

export interface Alternate {
  hreflang: string;
  path: string;
}

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function split(pathname: string): { nl: boolean; rest: string } {
  const { locale, rest } = parsePath(pathname);
  return { nl: locale === "nl", rest };
}

/**
 * The address a page calls its own. `known` is whether the app has a page of its own for this path;
 * any other path shows the homepage, so its canonical address is the homepage of that language.
 * An English-only page reached under a Dutch path (/nl/notes/x) points at its English address, the one in sitemap.xml.
 */
export function canonicalPath(pathname: string, known: boolean): string {
  const { nl, rest } = split(pathname);
  if (!known || rest === "/") return localePath(nl ? "nl" : "en", "/");
  if (BILINGUAL_PATHS.includes(rest)) return localePath(nl ? "nl" : "en", rest);
  return localePath("en", rest);
}

/** The language versions of a page. An English-only page has none: it is its own canonical address. */
export function alternatePaths(pathname: string, known: boolean): Alternate[] {
  const { rest } = split(pathname);
  const page = !known ? "/" : rest;
  if (page === "/" || BILINGUAL_PATHS.includes(page)) {
    return [
      { hreflang: "en", path: localePath("en", page) },
      { hreflang: "nl", path: localePath("nl", page) },
      { hreflang: "x-default", path: localePath("en", page) },
    ];
  }
  return [];
}

export interface HeadPlan {
  canonical: string;
  ogUrl: string;
  alternates: Array<{ hreflang: string; href: string }>;
}

export function headPlan(origin: string, pathname: string, known: boolean): HeadPlan {
  const canonical = origin + canonicalPath(pathname, known);
  return {
    canonical,
    ogUrl: canonical,
    alternates: alternatePaths(pathname, known).map((a) => ({ hreflang: a.hreflang, href: origin + a.path })),
  };
}

/** Writes the plan into the document. The decisions are in headPlan; this is only the DOM work. */
export function applyHeadPlan(doc: Document, plan: HeadPlan): void {
  let canonical = doc.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = doc.createElement("link");
    canonical.setAttribute("rel", "canonical");
    doc.head.appendChild(canonical);
  }
  canonical.setAttribute("href", plan.canonical);

  doc.head.querySelector('meta[property="og:url"]')?.setAttribute("content", plan.ogUrl);

  doc.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  for (const alt of plan.alternates) {
    const link = doc.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", alt.hreflang);
    link.setAttribute("href", alt.href);
    doc.head.appendChild(link);
  }
}
