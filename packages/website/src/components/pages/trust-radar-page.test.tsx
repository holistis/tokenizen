import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrustRadarPage } from "@/components/pages/trust-radar-page";
import { TRUST_RADAR_ENTRIES } from "@/data/trust-radar-entries";

describe("TrustRadarPage", () => {
  it("renders without crashing and lists every entry's name and domain", () => {
    const html = renderToStaticMarkup(<TrustRadarPage />);

    expect(html).toContain("Trust Radar");
    for (const entry of TRUST_RADAR_ENTRIES) {
      expect(html).toContain(entry.name);
      expect(html).toContain(entry.domain);
    }
  });

  it("renders the not-a-security-audit disclaimer", () => {
    const html = renderToStaticMarkup(<TrustRadarPage />);
    expect(html).toContain("not a general security audit");
  });

  it("offers a badge snippet only for confirmed-safe entries", () => {
    const html = renderToStaticMarkup(<TrustRadarPage />);
    const safeCount = TRUST_RADAR_ENTRIES.filter((entry) => entry.status === "confirmed-safe").length;
    // Each rendered badge snippet's <code> text contains exactly one
    // "/trust-radar#" occurrence (the link href); unlike "Copy badge
    // snippet", which also appears in the CopyButton's aria-label AND title
    // attributes, so counting that string would double-count each button.
    const badgeOccurrences = html.split("/trust-radar#").length - 1;
    expect(badgeOccurrences).toBe(safeCount);
  });

  it("renders the empty state and no fabricated example when there are no real attestations", () => {
    // The real data source (ATTESTED_ENDPOINTS) is empty until the
    // attestation system is live — this is the correct, current state, not
    // a bug. The page must show an honest empty state, never a fictional
    // example that could read as a real, judged company.
    expect(TRUST_RADAR_ENTRIES).toHaveLength(0);

    const html = renderToStaticMarkup(<TrustRadarPage />);
    expect(html).toContain("No confirmed endpoints yet");
    expect(html).toContain("Be the first");
  });
});
