// x402-badge.test.ts — a badge that lies is worse than no badge.
//
// The cases are the four ways this one goes wrong, and none of them is imagined:
//  1. an endpoint nobody measured comes back as level 0 instead of "not measured".
//     Those are different claims and conflating them would invent a grade.
//  2. the caller's url reaches the rendered svg, which is script injection in an
//     image that other people embed in their own pages.
//  3. a missing or corrupt bundle takes the route down, so a badge in someone
//     else's README answers 500.
//  4. the measurement date disappears from the badge, which turns a stale badge from
//     visibly old into quietly wrong.

import { describe, it, expect } from "vitest";
import { maakSvg, zoekMeting, leesBundel } from "./x402-badge.js";

const BUNDEL = {
  gegenereerd: "2026-10-17",
  aantal: 2,
  metingen: [
    { url: "https://api.example.com/paid", host: "api.example.com", trede: 2, editie: "2026-10-17" },
    { url: "https://dood.example.com/weg", host: "dood.example.com", trede: -1, editie: "2026-10-17" },
  ],
};

describe("looking up a measurement", () => {
  it("finds an endpoint that was measured", () => {
    expect(zoekMeting("https://api.example.com/paid", BUNDEL)?.trede).toBe(2);
  });

  it("ignores a trailing slash, because that is the same endpoint", () => {
    expect(zoekMeting("https://api.example.com/paid/", BUNDEL)?.trede).toBe(2);
  });

  it("ignores case in the host", () => {
    expect(zoekMeting("https://API.EXAMPLE.COM/paid", BUNDEL)?.trede).toBe(2);
  });

  it("returns null for an endpoint nobody measured, never a level", () => {
    expect(zoekMeting("https://onbekend.example.com/x", BUNDEL)).toBeNull();
  });

  it("keeps a measured failure distinct from an absent measurement", () => {
    expect(zoekMeting("https://dood.example.com/weg", BUNDEL)?.trede).toBe(-1);
  });

  it("does not crash on an unparseable url", () => {
    expect(zoekMeting("niet eens een url", BUNDEL)).toBeNull();
  });
});

describe("the rendered badge", () => {
  it("contains the level and the edition date", () => {
    const svg = maakSvg("L2 · 2026-10-17", "#2e7d32", "titel");
    expect(svg).toContain("L2 · 2026-10-17");
  });

  it("names who measured it, so the badge carries its source", () => {
    const svg = maakSvg("L2 · 2026-10-17", "#2e7d32", "measured by agent-receipt-verify (github.com/holistis/agent-receipt-verify)");
    expect(svg).toContain("github.com/holistis/agent-receipt-verify");
  });

  it("escapes anything that could close a tag", () => {
    const svg = maakSvg('"><script>alert(1)</script>', "#000", 'titel"><script>');
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("is a well formed svg element", () => {
    const svg = maakSvg("not measured", "#555", "t");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });
});

describe("the bundle itself", () => {
  it("a missing file means nothing measured, not an exception", () => {
    const b = leesBundel("C:/bestaat/echt/niet/x402-metingen.json");
    expect(b.metingen).toEqual([]);
    expect(b.gegenereerd).toBe("onbekend");
  });

  it("the shipped bundle is readable and dated", () => {
    const b = leesBundel();
    expect(Array.isArray(b.metingen)).toBe(true);
    expect(b.gegenereerd).toMatch(/^\d{4}-\d{2}-\d{2}$|^onbekend$/);
  });
});
