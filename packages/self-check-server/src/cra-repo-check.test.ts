// cra-repo-check.test.ts — every control must be able to come out both ways, a failed call is "not measured"
// and never "not visible", and the only hosts ever asked for are the two fixed GitHub hosts. Nothing here
// touches the network: GitHub is replaced by a fake that returns real Response objects.

import { describe, expect, it } from "vitest";
import { RULES_VERSION, assessRepo, clean, fetchSignals, parseRepo, type RepoSignals } from "./cra-repo-check.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;

function good(): RepoSignals {
  return {
    repo: "a/b",
    now: NOW,
    unknown: [],
    files: ["README.md", "SECURITY.md", "package.json", "package-lock.json", ".github/", ".github/dependabot.yml", ".github/workflows/"],
    workflows: ["ci.yml"],
    workflowTexts: { "ci.yml": "uses: github/codeql-action/analyze@v3\n- run: npm sbom --sbom-format cyclonedx\nuses: actions/attest-build-provenance@v1" },
    releases: [{ tag: "v1", date: NOW - 10 * DAY, draft: false, assets: ["b.tgz"] }],
    advisories: 2,
    archived: false,
    lastPush: NOW - 3 * DAY,
    license: "MIT",
    requested: [],
  };
}
const statusOf = (s: RepoSignals, id: string) => assessRepo(s).controls.find((c) => c.id === id)?.status;

describe("parseRepo", () => {
  it("accepts owner/repo, a github.com address with .git and a deeper path", () => {
    expect(parseRepo("holistis/tokenizen")).toBe("holistis/tokenizen");
    expect(parseRepo("https://github.com/holistis/tokenizen.git")).toBe("holistis/tokenizen");
    expect(parseRepo("https://github.com/holistis/tokenizen/tree/main/packages")).toBe("holistis/tokenizen");
    expect(parseRepo("  owner/.github  ")).toBe("owner/.github");
  });

  it.each([
    "",
    null,
    undefined,
    42,
    "../etc/passwd",
    "a b/c",
    "a/b c",
    "http://evil.example/x/y",
    "javascript:alert(1)",
    "a",
    "/",
    "a/..",
    "a/.",
    "../..",
    "a/b;rm",
    "a/b?x=1",
    "a/b#frag",
    "-a/b",
    "a_b/c",
    "a/b%2fc",
    "x".repeat(40) + "/r",
    "a/" + "r".repeat(101),
  ])("refuses %j", (bad) => {
    expect(parseRepo(bad)).toBeNull();
  });
});

describe("assessRepo", () => {
  it("a well kept repository is visible on all eight points", () => {
    const r = assessRepo(good());
    expect(r.controls).toHaveLength(8);
    expect(r.summary).toEqual({ measured: 8, visible: 8, notVisible: 0, notMeasured: 0 });
  });

  it("a bare repository is not visible on seven points, each with something to do about it", () => {
    const s = { ...good(), files: ["README.md", "package.json"], workflows: [], workflowTexts: {}, license: null, releases: [{ tag: "v1", date: NOW - DAY, draft: false, assets: [] }], advisories: 0 };
    const r = assessRepo(s);
    for (const id of ["vulnerability-policy", "sbom", "release-provenance", "pinned-dependencies", "dependency-updates", "security-scanning", "license"]) {
      expect(statusOf(s, id), id).toBe("not_visible");
    }
    for (const c of r.controls.filter((x) => x.status === "not_visible")) expect(c.fix && c.fix.length > 15, c.id).toBe(true);
  });

  it("an SBOM in the releases or an SBOM step in a workflow counts, loose text does not", () => {
    const a = { ...good(), workflowTexts: {} };
    a.releases = [{ tag: "v1", date: NOW, draft: false, assets: ["bom.cdx.json"] }];
    expect(statusOf(a, "sbom")).toBe("visible");
    const b = { ...good(), workflowTexts: { "x.yml": "echo sbomb" } };
    b.releases = [{ tag: "v1", date: NOW, draft: false, assets: [] }];
    expect(statusOf(b, "sbom")).toBe("not_visible");
  });

  it("SECURITY.md counts in .github/ and docs/, a file with another name does not", () => {
    expect(statusOf({ ...good(), files: [".github/SECURITY.md"] }, "vulnerability-policy")).toBe("visible");
    expect(statusOf({ ...good(), files: ["docs/security.rst"] }, "vulnerability-policy")).toBe("visible");
    expect(statusOf({ ...good(), files: ["MYSECURITY.md"] }, "vulnerability-policy")).toBe("not_visible");
  });

  it("unreadable parts are not measured, never not visible", () => {
    expect(statusOf({ ...good(), releases: null }, "release-provenance")).toBe("not_measured");
    expect(statusOf({ ...good(), files: ["README.md"] }, "pinned-dependencies")).toBe("not_measured");
    expect(statusOf({ ...good(), lastPush: null }, "maintenance")).toBe("not_measured");
  });

  it("maintenance: 91 days is not visible, 90 is, an archived repository is not", () => {
    expect(statusOf({ ...good(), lastPush: NOW - 91 * DAY }, "maintenance")).toBe("not_visible");
    expect(statusOf({ ...good(), lastPush: NOW - 90 * DAY }, "maintenance")).toBe("visible");
    expect(statusOf({ ...good(), archived: true }, "maintenance")).toBe("not_visible");
  });

  it("carries the rule set version, says what it does not measure, and never claims compliance", () => {
    const r = assessRepo(good());
    expect(r.rules.version).toBe(RULES_VERSION);
    expect(r.rules.basis).toMatch(/not been reviewed by a lawyer/);
    expect(r.whatThisDoesNotMeasure.length).toBeGreaterThanOrEqual(3);
    expect(r.notice).toMatch(/not a conformity assessment and not legal advice/);
    expect(JSON.stringify(r)).not.toMatch(/complies with the CRA|is compliant|\bmissing\b/i);
  });

  it("the two points that are often done outside GitHub say so", () => {
    const s = { ...good(), workflowTexts: {}, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
    for (const id of ["sbom", "release-provenance"]) {
      const c = assessRepo(s).controls.find((x) => x.id === id);
      expect(c?.explanation, id).toMatch(/somewhere else/);
    }
  });

  it("text that came from the repository is cut and stripped of control characters", () => {
    const s = { ...good(), files: ["README.md", "package.json", "cyclonedx\u001b[31m" + "x".repeat(500)], workflowTexts: {} };
    s.releases = [{ tag: "v1", date: NOW, draft: false, assets: [] }];
    const c = assessRepo(s).controls.find((x) => x.id === "sbom");
    expect(c?.status).toBe("visible");
    expect(c?.evidence).not.toMatch(/\u001b/);
    expect((c?.evidence ?? "").length).toBeLessThanOrEqual(120);
    expect(clean("a‮b\u0000c")).toBe("a b c");
  });
});

// ── the fake GitHub ──────────────────────────────────────────────────────────────────────────

type Route = [string, () => Response | Promise<Response>];
function fakeGithub(routes: Route[]) {
  const calls: Array<{ url: string; headers: Record<string, string>; redirect: string | undefined }> = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, redirect: init?.redirect });
    for (const [part, make] of routes) if (url.includes(part)) return make();
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const json = (value: unknown, status = 200) => () => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const repoMeta = (extra: Record<string, unknown> = {}) => ({
  full_name: "Owner/Repo",
  default_branch: "main",
  pushed_at: new Date(NOW - DAY).toISOString(),
  license: { spdx_id: "MIT" },
  private: false,
  archived: false,
  fork: false,
  ...extra,
});

describe("fetchSignals", () => {
  it("a 404 on the repository means not found, and nothing else is asked for", async () => {
    const net = fakeGithub([["/repos/o/r", json({}, 404)]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.notFound).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it("a private repository is treated as not found, whatever the token could see", async () => {
    const net = fakeGithub([["/repos/o/r", json(repoMeta({ private: true }))]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.notFound).toBe(true);
  });

  it("only ever asks for the two GitHub hosts, refuses redirects, and sends the token to the API host only", async () => {
    const net = fakeGithub([
      ["/contents/.github/workflows", json([{ name: "ci.yml", type: "file" }])],
      ["/contents/.github", json([{ name: "workflows", type: "dir" }])],
      ["/contents", json([{ name: ".github", type: "dir" }, { name: "package.json", type: "file" }])],
      ["raw.githubusercontent.com", () => new Response("uses: github/codeql-action/analyze@v3")],
      ["/releases", json([])],
      ["/security-advisories", json([])],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, token: "ghp_test", now: NOW });
    expect(s.workflows).toEqual(["ci.yml"]);
    for (const c of net.calls) {
      expect(c.url).toMatch(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//);
      expect(c.redirect).toBe("error");
      const hasToken = Object.values(c.headers).some((v) => String(v).includes("ghp_test"));
      expect(hasToken, c.url).toBe(c.url.startsWith("https://api.github.com/"));
    }
    expect(s.requested.length).toBe(net.calls.length);
    expect(assessRepo(s).controls.find((x) => x.id === "security-scanning")?.status).toBe("visible");
  });

  it("encodes workflow file names and the branch when it builds the raw address", async () => {
    const net = fakeGithub([
      ["/contents/.github/workflows", json([{ name: "a b.yml", type: "file" }, { name: "ci.yml", type: "file" }])],
      ["/contents/.github", json([{ name: "workflows", type: "dir" }])],
      ["/contents", json([{ name: ".github", type: "dir" }])],
      ["raw.githubusercontent.com", () => new Response("x")],
      ["/repos/o/r", json(repoMeta({ default_branch: "feat/x?y#z" }))],
    ]);
    await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    const raw = net.calls.filter((c) => c.url.startsWith("https://raw.githubusercontent.com/"));
    expect(raw.map((c) => c.url)).toContain("https://raw.githubusercontent.com/o/r/feat%2Fx%3Fy%23z/.github/workflows/a%20b.yml");
  });

  it("a network failure halfway becomes not measured, never an exception or a gap", async () => {
    const net = fakeGithub([
      ["/contents", () => Promise.reject(new Error("boom"))],
      ["/releases", () => Promise.reject(new Error("boom"))],
      ["/security-advisories", json([])],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.unknown).toContain("file list");
    expect(s.releases).toBeNull();
    expect(statusOf(s, "release-provenance")).toBe("not_measured");
  });

  it("GitHub saying slow down is reported as rate limited, not as a report", async () => {
    const net = fakeGithub([["/repos/o/r", () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.rateLimited).toBe(true);
  });

  it("a 403 that is not a rate limit is just unknown", async () => {
    const net = fakeGithub([["/repos/o/r", () => new Response("{}", { status: 403 })]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.rateLimited).toBeUndefined();
    expect(s.unknown[0]).toMatch(/repository/);
  });

  it("a workflow file of many megabytes is read only up to the cap, and the rest is never pulled", async () => {
    let pulled = 0;
    const big = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += 64 * 1024;
            if (pulled > 50 * 1024 * 1024) controller.close();
            else controller.enqueue(new Uint8Array(64 * 1024).fill(97));
          },
        }),
      );
    const net = fakeGithub([
      ["/contents/.github/workflows", json([{ name: "ci.yml", type: "file" }])],
      ["/contents/.github", json([{ name: "workflows", type: "dir" }])],
      ["/contents", json([{ name: ".github", type: "dir" }])],
      ["raw.githubusercontent.com", big],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(pulled).toBeLessThan(2 * 1024 * 1024);
    expect((s.workflowTexts["ci.yml"] ?? "").length).toBeLessThanOrEqual(200_000);
  });

  it("an API answer that is far too large is unknown, not parsed", async () => {
    const huge = () => new Response('[{"name":"' + "a".repeat(3_000_000) + '"}]', { status: 200 });
    const net = fakeGithub([["/contents", huge], ["/repos/o/r", json(repoMeta())]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.unknown).toContain("file list");
  });

  it("reads at most eight workflow files", async () => {
    const names = Array.from({ length: 20 }, (_, i) => ({ name: `w${i}.yml`, type: "file" }));
    const net = fakeGithub([
      ["/contents/.github/workflows", json(names)],
      ["/contents/.github", json([{ name: "workflows", type: "dir" }])],
      ["/contents", json([{ name: ".github", type: "dir" }])],
      ["raw.githubusercontent.com", () => new Response("x")],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.workflows).toHaveLength(20);
    expect(Object.keys(s.workflowTexts)).toHaveLength(8);
  });
});
