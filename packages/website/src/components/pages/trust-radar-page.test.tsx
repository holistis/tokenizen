import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrustRadarPage } from "@/components/pages/trust-radar-page";
import { TRUST_RADAR_ENTRIES } from "@/data/trust-radar-entries";
import { LocaleProvider, type Locale } from "@/i18n/context";

const render = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <TrustRadarPage />
    </LocaleProvider>,
  );

const LOCALES: Locale[] = ["nl", "en"];

describe("TrustRadarPage", () => {
  for (const locale of LOCALES) {
    it(`[${locale}] renders without crashing and lists every entry's name and domain`, () => {
      const html = render(locale);

      expect(html).toContain("Trust Radar");
      for (const entry of TRUST_RADAR_ENTRIES) {
        expect(html).toContain(entry.name);
        expect(html).toContain(entry.domain);
      }
    });
  }

  it("carries the not-a-security-audit disclaimer in both languages", () => {
    expect(render("en")).toContain("not a general security audit");
    expect(render("nl")).toContain("geen algemene beveiligingsaudit");
  });

  // The attester was deliberately changed to never sign a safety verdict: it
  // records what it observed and marks the rest inconclusive. A page that still
  // says "safe" would make the honest backend a dishonest product, so this is a
  // regression test on the promise itself, in BOTH languages. If someone ever
  // reintroduces safety language, this fails before anyone ships it.
  it("never claims a listed server is safe, and says so explicitly, in both languages", () => {
    const en = render("en");
    expect(en).not.toContain("Confirmed safe");
    expect(en).toContain("not a guarantee that the server is safe");

    const nl = render("nl");
    expect(nl).not.toContain("Gegarandeerd veilig");
    expect(nl).toContain("geen garantie dat de server veilig is");
  });

  it("offers a badge snippet only for confirmed-safe entries", () => {
    const html = render("nl");
    const safeCount = TRUST_RADAR_ENTRIES.filter((entry) => entry.status === "confirmed-safe").length;
    // Each rendered badge snippet's <code> text contains exactly one
    // "/trust-radar#" occurrence (the link href); unlike "Copy badge
    // snippet", which also appears in the CopyButton's aria-label AND title
    // attributes, so counting that string would double-count each button.
    const badgeOccurrences = html.split("/trust-radar#").length - 1;
    expect(badgeOccurrences).toBe(safeCount);
  });

  it("renders an honest empty state in both languages, never a fabricated example", () => {
    // The real data source (ATTESTED_ENDPOINTS) is empty until the
    // attestation system is live — this is the correct, current state, not
    // a bug. The page must show an honest empty state, never a fictional
    // example that could read as a real, judged company.
    expect(TRUST_RADAR_ENTRIES).toHaveLength(0);

    const en = render("en");
    expect(en).toContain("No confirmed endpoints yet");
    expect(en).toContain("Be the first");

    const nl = render("nl");
    expect(nl).toContain("Nog geen bevestigde endpoints");
    expect(nl).toContain("Wees de eerste");
  });
});
