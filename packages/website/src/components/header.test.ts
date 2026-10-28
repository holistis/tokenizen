import { describe, expect, it } from "vitest";

import { checkLinks, resolveNavHref } from "@/components/header";
import { en } from "@/i18n/en";
import { nl } from "@/i18n/nl";

describe("resolveNavHref", () => {
  it("keeps homepage anchors as they are on the homepage", () => {
    expect(resolveNavHref("#product", "nl", "/")).toBe("#product");
    expect(resolveNavHref("#product", "en", "/en")).toBe("#product");
  });

  // On the blog a bare "#product" would point at the blog page itself and do
  // nothing, so the menu looked broken from every page except the homepage.
  it("sends homepage anchors back to the homepage from other pages", () => {
    expect(resolveNavHref("#product", "nl", "/notes")).toBe("/#product");
    expect(resolveNavHref("#product", "en", "/en/notes/check-pay-prove")).toBe("/en#product");
  });

  it("keeps English readers on the English site for site paths", () => {
    expect(resolveNavHref("/notes", "en", "/en")).toBe("/en/notes");
    expect(resolveNavHref("/notes", "nl", "/")).toBe("/notes");
  });

  it("leaves absolute urls alone", () => {
    expect(resolveNavHref("https://example.org", "en", "/en")).toBe("https://example.org");
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
    expect(checkLinks(en.header.checks, "en").map((c) => c.href)).toEqual(["/en/cra-check", "/en/x402-check", "/en/check"]);
    expect(checkLinks(nl.header.checks, "nl").map((c) => c.href)).toEqual(["/cra-check", "/x402-check", "/check"]);
  });

  it("does not use long dashes in the labels", () => {
    for (const c of [nl.header.checksLabel, en.header.checksLabel, ...nl.header.checks.map((x) => x.label), ...en.header.checks.map((x) => x.label)]) {
      expect(c).not.toMatch(/[–—]/);
    }
  });
});
