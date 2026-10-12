import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SecondPillar } from "@/components/sections/second-pillar";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { nl } from "@/i18n/nl";
import { en } from "@/i18n/en";

const render = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <SecondPillar />
    </LocaleProvider>,
  );

describe("SecondPillar", () => {
  // The self-check page existed and worked for weeks while nothing on the site
  // linked to it, so the only way to reach it was to already know the URL. That
  // is the failure this test exists to prevent: a visitor must be able to get
  // there from the homepage, in their own language.
  it("links to the self-check page, locale-correct, in both languages", () => {
    expect(render("nl")).toContain('href="/check"');
    expect(render("en")).toContain('href="/en/check"');
  });

  // The section shipped without a nav entry, so it existed on the page while the
  // menu gave no sign of it. Anyone scanning the header concluded it was missing.
  it("is reachable from the main navigation in both languages", () => {
    expect(nl.header.links.some((l) => l.href === "#controle")).toBe(true);
    expect(en.header.links.some((l) => l.href === "#controle")).toBe(true);
  });

  it("explains the second pillar in both languages", () => {
    const nl = render("nl");
    expect(nl).toContain("Pijler 2");
    expect(nl).toContain("Bewijs van controle");

    const en = render("en");
    expect(en).toContain("Pillar 2");
    expect(en).toContain("Proof of inspection");
  });

  // Same promise rule as the Trust Radar page: the attester never signs a safety
  // verdict, so no surface of the site may imply one.
  it("states plainly that it never stamps something safe, in both languages", () => {
    expect(render("nl")).toContain("nooit het stempel veilig");
    expect(render("en")).toContain("never stamp something safe");
  });
});
