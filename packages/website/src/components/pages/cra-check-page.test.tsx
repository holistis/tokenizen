import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CraCheckPage, CraCheckResultView } from "@/components/pages/cra-check-page";
import type { CraCheckResult } from "@/lib/check-api";

const LONG_DASHES = /[–—]/;

function sample(overrides: Partial<CraCheckResult> = {}): CraCheckResult {
  return {
    ok: true,
    cached: false,
    repo: "Owner/Repo",
    measuredAt: "2026-10-28T12:00:00.000Z",
    rules: { version: "2026-10-28.1", reviewedOn: "2026-10-28", basis: "Our own reading, not reviewed by a lawyer.", regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj" },
    summary: { measured: 3, visible: 1, notVisible: 2, notMeasured: 1 },
    controls: [
      { id: "vulnerability-policy", topic: "Reporting channel and policy for vulnerabilities", status: "visible", evidence: "SECURITY.md", explanation: "A security policy file is in the repository." },
      { id: "sbom", topic: "Software bill of materials (SBOM)", status: "not_visible", explanation: "No SBOM file is visible.", fix: "Let the build produce a CycloneDX file." },
      { id: "release-provenance", topic: "Provenance of releases", status: "not_visible", explanation: "No signatures visible.", fix: "Sign releases." },
      { id: "pinned-dependencies", topic: "Pinned dependencies", status: "not_measured", explanation: "No known package file." },
    ],
    advisories: "0 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
    whatThisDoesNotMeasure: ["private repositories"],
    notice: "This is an indication from public data. It is not a conformity assessment and not legal advice.",
    sourcesRead: ["https://api.github.com/repos/Owner/Repo", "https://example.com/not-github"],
    ...overrides,
  };
}

describe("CraCheckPage", () => {
  const html = renderToStaticMarkup(<CraCheckPage />);

  it("says up front that it stores nothing and only reads public repositories", () => {
    expect(html).toContain("We store nothing");
    expect(html).toContain("Only public");
  });

  it("offers a repository field", () => {
    expect(html).toContain('id="cra-repo"');
    expect(html).toContain("Check this repository");
  });

  it("claims no more than an indication, and uses no long dashes", () => {
    expect(html).toContain("not a conformity assessment");
    expect(html).toContain("not legal advice");
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toMatch(/\bcompliant\b|\bcertified\b|complies with the CRA/i);
  });
});

describe("CraCheckResultView", () => {
  it("shows the counts, every point with its status, and what to do about the ones not visible", () => {
    const html = renderToStaticMarkup(<CraCheckResultView result={sample()} />);
    expect(html).toContain("1 of the 3 points");
    expect(html).toContain("2 are not");
    expect(html).toContain("1 could not be measured");
    expect(html).toContain("not visible");
    expect(html).toContain("Let the build produce a CycloneDX file.");
    expect(html).toContain("Rule set 2026-10-28.1");
    expect(html).not.toMatch(LONG_DASHES);
  });

  it("renders text from the repository as text, never as markup", () => {
    const hostile = sample({ controls: [{ id: "sbom", topic: "t", status: "visible", evidence: "<img src=x onerror=alert(1)>", explanation: "<script>alert(1)</script>" }], summary: { measured: 1, visible: 1, notVisible: 0, notMeasured: 0 } });
    const html = renderToStaticMarkup(<CraCheckResultView result={hostile} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links only the two GitHub hosts and shows any other address as plain text", () => {
    const html = renderToStaticMarkup(<CraCheckResultView result={sample()} />);
    expect(html).toContain('href="https://api.github.com/repos/Owner/Repo"');
    expect(html).not.toContain('href="https://example.com/not-github"');
    expect(html).toContain("https://example.com/not-github");
  });

  it("says when the answer came from the cache", () => {
    expect(renderToStaticMarkup(<CraCheckResultView result={sample({ cached: true })} />)).toContain("one hour cache");
    expect(renderToStaticMarkup(<CraCheckResultView result={sample({ cached: false })} />)).not.toContain("one hour cache");
  });
});
