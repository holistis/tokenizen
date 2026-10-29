import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PrivacyPage, SignalLogPage, TermsPage } from "@/components/pages/legal-page";
import { SIGNAL_LOG_LINKS } from "@/data/signal-log-links";
import { LocaleProvider, type Locale } from "@/i18n/context";

import signalLogText from "@/data/legal/signal-log.txt?raw";

const render = (Page: () => JSX.Element, locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <Page />
    </LocaleProvider>,
  );

const LONG_DASH = /[–—]/;
const hrefs = (html: string) => [...html.matchAll(/href="(https:\/\/buy\.stripe\.com\/[^"]+)"/g)].map((m) => m[1]);

describe("the way to subscribe to the Signal log", () => {
  it("links to the four Stripe payment links, in both languages", () => {
    const four = [SIGNAL_LOG_LINKS.solo.month, SIGNAL_LOG_LINKS.solo.year, SIGNAL_LOG_LINKS.team.month, SIGNAL_LOG_LINKS.team.year];
    for (const url of four) expect(url).toMatch(/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/);
    expect(new Set(four).size).toBe(4);
    for (const locale of ["en", "nl"] as const) expect(hrefs(render(SignalLogPage, locale)), locale).toEqual(four);
  });

  // The buttons repeat the prices of the approved text and nothing else. If the text changes its prices, this fails until the buttons follow.
  it("shows the prices of the approved offer text", () => {
    const solo = signalLogText.match(/Solo: ([\d.]+) euro per month or (\d+) euro per year/);
    const team = signalLogText.match(/Team: ([\d.]+) euro per month or (\d+) euro per year/);
    expect(solo && team).toBeTruthy();
    const en = render(SignalLogPage, "en");
    expect(en).toContain(`${solo![1]} euro per month`);
    expect(en).toContain(`${solo![2]} euro per year`);
    expect(en).toContain(`${team![1]} euro per month`);
    expect(en).toContain(`${team![2]} euro per year`);
    const nl = render(SignalLogPage, "nl");
    expect(nl).toContain(`${solo![1].replace(".", ",")} euro per maand`);
    expect(nl).toContain(`${solo![2]} euro per jaar`);
    expect(nl).toContain(`${team![1].replace(".", ",")} euro per maand`);
    expect(nl).toContain(`${team![2]} euro per jaar`);
  });

  it("says it in the language of the reader, with no long dashes", () => {
    const en = render(SignalLogPage, "en");
    const nl = render(SignalLogPage, "nl");
    expect(en).toContain("Subscribe monthly");
    expect(en).not.toContain("Abonneer");
    expect(nl).toContain("Abonneer per maand");
    expect(nl).not.toContain("Subscribe monthly");
    expect(en).not.toMatch(LONG_DASH);
    expect(nl).not.toMatch(LONG_DASH);
  });

  it("is only on the Signal log page, not on the terms or the privacy statement", () => {
    for (const locale of ["en", "nl"] as const) {
      expect(hrefs(render(TermsPage, locale)), `terms ${locale}`).toEqual([]);
      expect(hrefs(render(PrivacyPage, locale)), `privacy ${locale}`).toEqual([]);
    }
  });
});
