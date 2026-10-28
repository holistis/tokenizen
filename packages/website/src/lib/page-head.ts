// What the <head> of a page says about its own address.
//
// index.html carries the homepage's canonical address, og:url and language alternates. This is a
// single-page app, so the same head is served for every path, and the language provider used to
// write the homepage's title, description, canonical and og:url over whatever a page had set. Measured
// on the live site on 2026-10-28: /en/cra-check, /en/x402-check and every note told a search engine
// that its canonical address was https://tokenizen.nl/en. The decision per path lives here, as plain
// functions, so it can be tested without a browser.

/** Pages that exist in both languages (they are both in sitemap.xml). Every other page is English only. */
export const BILINGUAL_PATHS = ["/", "/notes", "/blog"];

export interface Alternate {
  hreflang: string;
  path: string;
}

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function split(pathname: string): { en: boolean; rest: string } {
  const path = normalizePath(pathname);
  if (path === "/en") return { en: true, rest: "/" };
  if (path.startsWith("/en/")) return { en: true, rest: path.slice(3) };
  return { en: false, rest: path };
}

/**
 * The address a page calls its own. `known` is whether the app has a page of its own for this path;
 * any other path shows the homepage, so its canonical address is the homepage of that language.
 * An English-only page reached under a Dutch path (/cra-check) points at its /en address, the one in sitemap.xml.
 */
export function canonicalPath(pathname: string, known: boolean): string {
  const { en, rest } = split(pathname);
  const home = en ? "/en" : "/";
  if (!known || rest === "/") return home;
  if (BILINGUAL_PATHS.includes(rest)) return en ? `/en${rest}` : rest;
  return `/en${rest}`;
}

/** The language versions of a page. An English-only page has none: it is its own canonical address. */
export function alternatePaths(pathname: string, known: boolean): Alternate[] {
  const { rest } = split(pathname);
  if (!known || rest === "/") {
    return [
      { hreflang: "nl", path: "/" },
      { hreflang: "en", path: "/en" },
      { hreflang: "x-default", path: "/" },
    ];
  }
  if (BILINGUAL_PATHS.includes(rest)) {
    return [
      { hreflang: "nl", path: rest },
      { hreflang: "en", path: `/en${rest}` },
      { hreflang: "x-default", path: rest },
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
