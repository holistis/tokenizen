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
    rules: { version: "2026-10-28.3", reviewedOn: "2026-10-28", basis: "Eight selected signals, not one for each legal requirement. Our own reading, not reviewed by a lawyer.", regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj" },
    summary: { measured: 3, visible: 1, notVisible: 2, notMeasured: 1 },
    controls: [
      { id: "vulnerability-policy", topic: "Reporting channel and policy for vulnerabilities", status: "visible", evidence: "SECURITY.md", explanation: "A security policy file is in the repository." },
      { id: "sbom", topic: "Software bill of materials (SBOM)", status: "not_visible", explanation: "No SBOM file is visible.", fix: "Let the build produce a CycloneDX file." },
      { id: "release-provenance", topic: "Provenance of releases", status: "not_visible", explanation: "No signatures visible.", fix: "Sign releases." },
      { id: "pinned-dependencies", topic: "Pinned dependencies", status: "not_measured", explanation: "No known package file." },
    ],
    advisories: "0 published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
    whatThisDoesNotMeasure: ["private repositories"],
    notice: "This is an indication from public data about eight selected signals. It is not a check against the legal requirements, not a conformity assessment and not legal advice.",
    sources: [{ url: "https://api.github.com/repos/Owner/Repo", outcome: "read" }, { url: "https://example.com/not-github", outcome: "failed" }],
    ...overrides,
  };
}

describe("CraCheckPage", () => {
  const html = renderToStaticMarkup(<CraCheckPage />);

  it("says up front that it stores no reports, that the answer sits briefly in memory, and that it only reads public repositories", () => {
    expect(html).toContain("We do not store reports");
    expect(html).toContain("server memory");
    expect(html).toContain("Only public");
  });

  it("says that these are eight selected signals and not one for each legal requirement", () => {
    expect(html).toContain("eight selected signals");
    expect(html).toContain("not one signal for each legal requirement");
    expect(html).toContain("do not tell you whether you comply");
    expect(html).toContain("11 June 2026");
  });

  it("has a heading that promises signals in a repository, not a view on compliance", () => {
    expect(html).toContain("Which security signals can be seen in your GitHub repository?");
    expect(html).not.toContain("CRA vulnerability handling");
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
    expect(html).toContain("1 of the 3 public-repository signals");
    expect(html).toContain("2 are not visible in the places we looked");
    expect(html).toContain("1 could not be checked completely");
    expect(html).toContain("not a compliance score");
    expect(html).toContain("not visible");
    expect(html).toContain("Let the build produce a CycloneDX file.");
    expect(html).toContain("Rule set 2026-10-28.3");
    expect(html).not.toMatch(LONG_DASHES);
  });

  it("renders text from the repository as text, never as markup", () => {
    const hostile = sample({ controls: [{ id: "sbom", topic: "t", status: "visible", evidence: "<img src=x onerror=alert(1)>", explanation: "<script>alert(1)</script>" }], summary: { measured: 1, visible: 1, notVisible: 0, notMeasured: 0 } });
    const html = renderToStaticMarkup(<CraCheckResultView result={hostile} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows what came of each page we asked for, and links only the two GitHub hosts", () => {
    const html = renderToStaticMarkup(<CraCheckResultView result={sample()} />);
    expect(html).toContain('href="https://api.github.com/repos/Owner/Repo"');
    expect(html).not.toContain('href="https://example.com/not-github"');
    expect(html).toContain("https://example.com/not-github");
    expect(html).toContain(">read<");
    expect(html).toContain(">failed<");
  });

  it("says when the answer came from the cache", () => {
    expect(renderToStaticMarkup(<CraCheckResultView result={sample({ cached: true })} />)).toContain("short cache kept in server memory");
    expect(renderToStaticMarkup(<CraCheckResultView result={sample({ cached: false })} />)).not.toContain("short cache");
  });
});
