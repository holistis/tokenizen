import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { alternatePaths, canonicalPath, headPlan, normalizePath } from "@/lib/page-head";

const ORIGIN = "https://tokenizen.nl";

// Every address in sitemap.xml is one we ask search engines to index, so each must be its own canonical address.
// This is the check that would have caught the live defect: every page named the homepage as its canonical address.
function sitemapPaths(): string[] {
  const xml = readFileSync(path.resolve(import.meta.dirname, "../../public/sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>https:\/\/tokenizen\.nl([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
}

describe("canonicalPath", () => {
  it("makes every address in the sitemap its own canonical address", () => {
    const paths = sitemapPaths();
    expect(paths.length).toBeGreaterThan(20);
    for (const p of paths) expect(canonicalPath(p, true), p).toBe(p);
  });

  it("keeps the two homepages apart", () => {
    expect(canonicalPath("/", false)).toBe("/");
    expect(canonicalPath("/en", false)).toBe("/en");
    expect(canonicalPath("/en/", false)).toBe("/en");
  });

  it("points an English-only page under a Dutch path at its /en address", () => {
    expect(canonicalPath("/cra-check", true)).toBe("/en/cra-check");
    expect(canonicalPath("/check", true)).toBe("/en/check");
    expect(canonicalPath("/notes/check-pay-prove", true)).toBe("/en/notes/check-pay-prove");
  });

  it("keeps the pages that exist in both languages in their own language", () => {
    expect(canonicalPath("/notes", true)).toBe("/notes");
    expect(canonicalPath("/en/notes", true)).toBe("/en/notes");
    expect(canonicalPath("/blog", true)).toBe("/blog");
    expect(canonicalPath("/en/blog", true)).toBe("/en/blog");
  });

  it("treats a trailing slash as the same page", () => {
    expect(normalizePath("/en/cra-check/")).toBe("/en/cra-check");
    expect(canonicalPath("/en/cra-check/", true)).toBe("/en/cra-check");
  });

  // An unknown path shows the homepage, so the homepage is what it is a copy of.
  it("names the homepage of the language for a path the app has no page for", () => {
    expect(canonicalPath("/en/does-not-exist", false)).toBe("/en");
    expect(canonicalPath("/does-not-exist", false)).toBe("/");
  });
});

describe("alternatePaths", () => {
  it("gives the homepage its two languages", () => {
    expect(alternatePaths("/en", false)).toEqual([
      { hreflang: "nl", path: "/" },
      { hreflang: "en", path: "/en" },
      { hreflang: "x-default", path: "/" },
    ]);
  });

  it("gives a page that exists in both languages its own pair, not the homepage pair", () => {
    expect(alternatePaths("/en/notes", true)).toEqual([
      { hreflang: "nl", path: "/notes" },
      { hreflang: "en", path: "/en/notes" },
      { hreflang: "x-default", path: "/notes" },
    ]);
  });

  it("gives an English-only page no alternates, so none of them points at the homepage", () => {
    expect(alternatePaths("/en/cra-check", true)).toEqual([]);
    expect(alternatePaths("/en/notes/check-pay-prove", true)).toEqual([]);
  });

  it("never lists an address that is not in the sitemap or the homepage pair", () => {
    const known = new Set(sitemapPaths());
    for (const p of known) for (const a of alternatePaths(p, true)) expect(known.has(a.path), `${p} -> ${a.path}`).toBe(true);
  });
});

describe("headPlan", () => {
  it("gives the address in full, with og:url equal to the canonical address", () => {
    const plan = headPlan(ORIGIN, "/en/cra-check", true);
    expect(plan.canonical).toBe("https://tokenizen.nl/en/cra-check");
    expect(plan.ogUrl).toBe(plan.canonical);
    expect(plan.alternates).toEqual([]);
  });

  it("builds absolute addresses for the alternates", () => {
    expect(headPlan(ORIGIN, "/blog", true).alternates.map((a) => a.href)).toEqual(["https://tokenizen.nl/blog", "https://tokenizen.nl/en/blog", "https://tokenizen.nl/blog"]);
  });
});
