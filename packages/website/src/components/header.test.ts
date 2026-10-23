import { describe, expect, it } from "vitest";

import { resolveNavHref } from "@/components/header";

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
