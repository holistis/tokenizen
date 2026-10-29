import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { localePath, parsePath } from "@/lib/locale-paths";
import { alternatePaths, BILINGUAL_PATHS, canonicalPath, headPlan, normalizePath } from "@/lib/page-head";

const ORIGIN = "https://tokenizen.nl";

// Every address in sitemap.xml is one we ask search engines to index, so each must be its own canonical address.
// This is the check that would have caught the live defect: every page named the homepage as its canonical address.
function sitemapPaths(): string[] {
  const xml = readFileSync(path.resolve(import.meta.dirname, "../../public/sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>https:\/\/tokenizen\.nl([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
}

describe("locale paths", () => {
  it("takes English as the base: no prefix is English, /nl is Dutch, the old /en is English too", () => {
    expect(parsePath("/")).toEqual({ locale: "en", rest: "/" });
    expect(parsePath("/checks")).toEqual({ locale: "en", rest: "/checks" });
    expect(parsePath("/nl")).toEqual({ locale: "nl", rest: "/" });
    expect(parsePath("/nl/")).toEqual({ locale: "nl", rest: "/" });
    expect(parsePath("/nl/notes/x")).toEqual({ locale: "nl", rest: "/notes/x" });
    expect(parsePath("/en")).toEqual({ locale: "en", rest: "/" });
    expect(parsePath("/en/cra-check")).toEqual({ locale: "en", rest: "/cra-check" });
  });

  it("does not mistake a page that merely starts with the letters for a language", () => {
    expect(parsePath("/network")).toEqual({ locale: "en", rest: "/network" });
    expect(parsePath("/nlx/page")).toEqual({ locale: "en", rest: "/nlx/page" });
    expect(parsePath("/entry")).toEqual({ locale: "en", rest: "/entry" });
  });

  it("builds the address of a page in a language, with its anchor", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("nl", "/")).toBe("/nl");
    expect(localePath("en", "/checks")).toBe("/checks");
    expect(localePath("nl", "/checks")).toBe("/nl/checks");
    expect(localePath("nl", "/tools#status")).toBe("/nl/tools#status");
  });
});

describe("canonicalPath", () => {
  it("makes every address in the sitemap its own canonical address", () => {
    const paths = sitemapPaths();
    expect(paths.length).toBeGreaterThan(30);
    for (const p of paths) expect(canonicalPath(p, true), p).toBe(p);
  });

  it("lists the Dutch version of every page that exists in both languages, and only those", () => {
    const paths = new Set(sitemapPaths());
    for (const page of BILINGUAL_PATHS) {
      expect(paths.has(localePath("en", page)), `en ${page}`).toBe(true);
      expect(paths.has(localePath("nl", page)), `nl ${page}`).toBe(true);
    }
    for (const p of paths) {
      if (!p.startsWith("/nl")) continue;
      expect(BILINGUAL_PATHS.includes(parsePath(p).rest), `${p} has no Dutch page`).toBe(true);
    }
  });

  it("keeps the two homepages apart", () => {
    expect(canonicalPath("/", false)).toBe("/");
    expect(canonicalPath("/nl", false)).toBe("/nl");
    expect(canonicalPath("/nl/", false)).toBe("/nl");
  });

  it("sends the old /en addresses to the address without the prefix", () => {
    expect(canonicalPath("/en", false)).toBe("/");
    expect(canonicalPath("/en/cra-check", true)).toBe("/cra-check");
  });

  it("points an English-only page under a Dutch path at its English address", () => {
    expect(canonicalPath("/nl/notes/check-pay-prove", true)).toBe("/notes/check-pay-prove");
    expect(canonicalPath("/nl/trust-radar", true)).toBe("/trust-radar");
    expect(canonicalPath("/notes/check-pay-prove", true)).toBe("/notes/check-pay-prove");
  });

  it("keeps the pages that exist in both languages in their own language", () => {
    expect(canonicalPath("/notes", true)).toBe("/notes");
    expect(canonicalPath("/nl/notes", true)).toBe("/nl/notes");
    expect(canonicalPath("/nl/cra-check", true)).toBe("/nl/cra-check");
    expect(canonicalPath("/cra-check", true)).toBe("/cra-check");
  });

  it("treats a trailing slash as the same page", () => {
    expect(normalizePath("/cra-check/")).toBe("/cra-check");
    expect(canonicalPath("/cra-check/", true)).toBe("/cra-check");
  });

  // An unknown path shows the homepage, so the homepage is what it is a copy of.
  it("names the homepage of the language for a path the app has no page for", () => {
    expect(canonicalPath("/nl/does-not-exist", false)).toBe("/nl");
    expect(canonicalPath("/does-not-exist", false)).toBe("/");
  });
});

describe("alternatePaths", () => {
  it("gives the homepage its two languages, English first and as the default", () => {
    expect(alternatePaths("/", false)).toEqual([
      { hreflang: "en", path: "/" },
      { hreflang: "nl", path: "/nl" },
      { hreflang: "x-default", path: "/" },
    ]);
  });

  it("gives a page that exists in both languages its own pair, not the homepage pair", () => {
    expect(alternatePaths("/nl/notes", true)).toEqual([
      { hreflang: "en", path: "/notes" },
      { hreflang: "nl", path: "/nl/notes" },
      { hreflang: "x-default", path: "/notes" },
    ]);
  });

  it("gives an English-only page no alternates, so none of them points at the homepage", () => {
    expect(alternatePaths("/trust-radar", true)).toEqual([]);
    expect(alternatePaths("/notes/check-pay-prove", true)).toEqual([]);
  });

  it("never lists an address that is not in the sitemap", () => {
    const known = new Set(sitemapPaths());
    for (const p of known) for (const a of alternatePaths(p, true)) expect(known.has(a.path), `${p} -> ${a.path}`).toBe(true);
  });
});

describe("headPlan", () => {
  it("gives the address in full, with og:url equal to the canonical address", () => {
    const plan = headPlan(ORIGIN, "/trust-radar", true);
    expect(plan.canonical).toBe("https://tokenizen.nl/trust-radar");
    expect(plan.ogUrl).toBe(plan.canonical);
    expect(plan.alternates).toEqual([]);
  });

  it("builds absolute addresses for the alternates", () => {
    expect(headPlan(ORIGIN, "/blog", true).alternates.map((a) => a.href)).toEqual(["https://tokenizen.nl/blog", "https://tokenizen.nl/nl/blog", "https://tokenizen.nl/blog"]);
  });
});

// The host sends the old English address to the one without the prefix. The file has to say so, or the links that are already out there break.
describe("the redirect of the old /en addresses", () => {
  const redirects = readFileSync(path.resolve(import.meta.dirname, "../../public/_redirects"), "utf8");

  it("sends /en and everything under it to the address without the prefix, permanently", () => {
    expect(redirects).toMatch(/^\/en\/\* \/:splat 301$/m);
    expect(redirects).toMatch(/^\/en \/ 301$/m);
  });
});
