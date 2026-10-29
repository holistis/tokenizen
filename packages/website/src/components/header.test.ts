import { describe, expect, it } from "vitest";

import { checkLinks, resolveNavHref } from "@/components/header";
import { en } from "@/i18n/en";
import { nl } from "@/i18n/nl";

describe("resolveNavHref", () => {
  it("keeps homepage anchors as they are on the homepage", () => {
    expect(resolveNavHref("#product", "en", "/")).toBe("#product");
    expect(resolveNavHref("#product", "nl", "/nl")).toBe("#product");
  });

  // On the blog a bare "#product" would point at the blog page itself and do
  // nothing, so the menu looked broken from every page except the homepage.
  it("sends homepage anchors back to the homepage from other pages", () => {
    expect(resolveNavHref("#product", "en", "/notes")).toBe("/#product");
    expect(resolveNavHref("#product", "nl", "/nl/notes/check-pay-prove")).toBe("/nl#product");
  });

  it("keeps each reader on the site of their own language for site paths", () => {
    expect(resolveNavHref("/notes", "en", "/")).toBe("/notes");
    expect(resolveNavHref("/notes", "nl", "/nl")).toBe("/nl/notes");
  });

  it("leaves absolute urls alone", () => {
    expect(resolveNavHref("https://example.org", "en", "/")).toBe("https://example.org");
  });
});

// The free checks used to be pages that no menu pointed to. The CRA check was reachable only by its address.
describe("the free checks in the menu", () => {
  it("lists the CRA check, the x402 check and the ownership check", () => {
    expect(nl.header.checks.map((c) => c.href)).toEqual(["/cra-check", "/x402-check", "/check"]);
    expect(en.header.checks.map((c) => c.href)).toEqual(["/cra-check", "/x402-check", "/check"]);
  });

  it("has a heading and a readable label for every check in both languages", () => {
    expect(nl.header.checksLabel.length).toBeGreaterThan(0);
    expect(en.header.checksLabel.length).toBeGreaterThan(0);
    for (const c of [...nl.header.checks, ...en.header.checks]) expect(c.label.trim().length).toBeGreaterThan(8);
  });

  it("keeps an English reader on the English site and a Dutch reader on the Dutch one", () => {
    expect(checkLinks(en.header.checks, "en").map((c) => c.href)).toEqual(["/cra-check", "/x402-check", "/check"]);
    expect(checkLinks(nl.header.checks, "nl").map((c) => c.href)).toEqual(["/nl/cra-check", "/nl/x402-check", "/nl/check"]);
  });

  it("does not use long dashes in the labels", () => {
    for (const c of [nl.header.checksLabel, en.header.checksLabel, ...nl.header.checks.map((x) => x.label), ...en.header.checks.map((x) => x.label)]) {
      expect(c).not.toMatch(/[–—]/);
    }
  });
});
