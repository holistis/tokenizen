import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyBody } from "../../scripts/prerender-heads.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) => readFileSync(`${ROOT}${relative}`, "utf8");

const bodies = (JSON.parse(read("src/data/share-bodies.json")) as { pages: Record<string, string> }).pages;
const indexHtml = read("index.html");

const sitemapPaths = [...read("public/sitemap.xml").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => new URL(m[1]!).pathname.replace(/\/+$/, "") || "/");

describe("share-bodies.json", () => {
  it("has the text of every page of the sitemap, the homepage included, and no other", () => {
    expect(Object.keys(bodies).sort()).toEqual([...sitemapPaths].sort());
  });

  for (const [path, html] of Object.entries(bodies)) {
    it(`${path}: the page itself, as clean text`, () => {
      expect(html).toContain("<h1>");
      expect(html.length).toBeGreaterThan(800);
      // Plain semantic HTML only: no classes, styles, scripts or leftovers of the capture.
      expect(html).not.toMatch(/\sclass=|\sstyle=|<script|<style|<svg|<button|<input/);
      expect(html).not.toContain("127.0.0.1");
      expect(html).not.toMatch(/undefined|\[object /);
      for (const m of html.matchAll(/<a href="([^"]*)"/g)) expect(m[1]).toMatch(/^(https:\/\/|mailto:)/);
    });
  }
});

describe("applyBody", () => {
  const body = "<main><h1>Title of the page</h1>\n<p>" + "A sentence that says something. ".repeat(12) + "</p></main>";

  it("puts the text inside the root and removes the generic message that needs JavaScript", () => {
    const out = applyBody(indexHtml, body, "/x");
    expect(out).toContain('<div id="root"><div id="prerender">');
    expect(out).toContain("<h1>Title of the page</h1>");
    expect(out).not.toContain("This site needs JavaScript");
    // The stylesheet fallback in the head stays: that is the only noscript left.
    expect(out.match(/<noscript>/g)).toHaveLength(1);
  });

  it("keeps the text exactly as given, even with characters that mean something to a replace", () => {
    const tricky = body.replace("says something", () => "costs $& and $1 and $$");
    expect(applyBody(indexHtml, tricky, "/x")).toContain("costs $& and $1 and $$");
  });

  it("refuses a page without usable text instead of publishing an empty shell", () => {
    expect(() => applyBody(indexHtml, "", "/x")).toThrow(/no usable text for \/x/);
    expect(() => applyBody(indexHtml, "<p>" + "x".repeat(300) + "</p>", "/x")).toThrow(/no usable text/);
  });

  it("is applied to a template that has the markers, and refuses one that has not", () => {
    expect(() => applyBody("<html><body></body></html>", body, "/x")).toThrow(/expected exactly one/);
  });
});

describe("index.html", () => {
  it("marks that JavaScript runs and keeps the prerendered text off screen only then", () => {
    expect(indexHtml).toContain('document.documentElement.className += " js"');
    expect(indexHtml).toMatch(/\.js #prerender\s*\{[^}]*position:\s*absolute/);
  });
});
