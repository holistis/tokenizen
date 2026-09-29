import { describe, expect, it } from "vitest";

import type { TrustRadarEntry } from "@/data/trust-radar-entries";
import { buildTrustBadgeSvg, generateTrustBadgeSnippet } from "@/lib/trust-badge";

const SAFE_ENTRY: TrustRadarEntry = {
  name: "Example Docs MCP",
  domain: "docs.example.com",
  endpoint: "https://docs.example.com/mcp",
  status: "confirmed-safe",
  checkedAt: "2026-09-28",
  note: "test fixture",
};

const UNCLEAR_ENTRY: TrustRadarEntry = { ...SAFE_ENTRY, status: "open-unclear" };
const UNSAFE_ENTRY: TrustRadarEntry = { ...SAFE_ENTRY, status: "self-declared-unsafe" };

describe("buildTrustBadgeSvg", () => {
  it("produces self-contained SVG markup carrying the fixed badge text", () => {
    const svg = buildTrustBadgeSvg();
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Trust checked by tokenizen.nl");
  });
});

describe("generateTrustBadgeSnippet", () => {
  it("returns an embeddable anchor+img snippet for a confirmed-safe entry", () => {
    const snippet = generateTrustBadgeSnippet(SAFE_ENTRY);
    expect(snippet).toContain('<a href="https://tokenizen.nl/trust-radar#docs.example.com"');
    expect(snippet).toContain('target="_blank"');
    expect(snippet).toContain('rel="noopener noreferrer"');
    expect(snippet).toContain('<img src="data:image/svg+xml;base64,');
    expect(snippet).toContain('alt="Trust checked by tokenizen.nl"');
  });

  it("the embedded data URI decodes back to valid SVG markup", () => {
    const snippet = generateTrustBadgeSnippet(SAFE_ENTRY);
    const match = snippet.match(/base64,([^"]+)"/);
    expect(match).not.toBeNull();
    const decoded = Buffer.from(match![1], "base64").toString("utf-8");
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("Trust checked by tokenizen.nl");
  });

  it("respects a custom base URL", () => {
    const snippet = generateTrustBadgeSnippet(SAFE_ENTRY, { baseUrl: "https://staging.tokenizen.nl" });
    expect(snippet).toContain("https://staging.tokenizen.nl/trust-radar#docs.example.com");
  });

  it("refuses to issue a badge for an open-unclear entry", () => {
    expect(() => generateTrustBadgeSnippet(UNCLEAR_ENTRY)).toThrow(/confirmed-safe/);
  });

  it("refuses to issue a badge for a self-declared-unsafe entry", () => {
    expect(() => generateTrustBadgeSnippet(UNSAFE_ENTRY)).toThrow(/confirmed-safe/);
  });
});
