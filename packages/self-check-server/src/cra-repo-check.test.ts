// cra-repo-check.test.ts — every control must be able to come out all three ways, a part that could not be read
// is "not measured" and NEVER "not visible", and the only hosts ever asked for are the two fixed GitHub hosts.
// Nothing here touches the network: GitHub is replaced by a fake that returns real Response objects.

import { describe, expect, it } from "vitest";
import { RULES_VERSION, assessRepo, clean, fetchSignals, isComplete, namesContact, parseRepo, type RepoSignals } from "./cra-repo-check.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;

function good(): RepoSignals {
  return {
    repo: "a/b",
    now: NOW,
    unknown: [],
    filesKnown: true,
    orgPolicyKnown: true,
    files: ["README.md", "SECURITY.md", "package.json", "package-lock.json", ".github/", ".github/dependabot.yml", ".github/workflows/"],
    workflows: ["ci.yml"],
    workflowState: "complete",
    workflowTexts: { "ci.yml": "uses: github/codeql-action/analyze@v3\n- run: npm sbom --sbom-format cyclonedx\nuses: actions/attest-build-provenance@v1" },
    policy: { where: "repository", path: "SECURITY.md", hasContact: true },
    releases: [{ tag: "v1", date: NOW - 10 * DAY, draft: false, assets: ["b.tgz"] }],
    advisories: 2,
    archived: false,
    lastCommit: NOW - 3 * DAY,
    lastPush: NOW - 3 * DAY,
    license: "MIT",
    requested: [],
  };
}
/** What a failed file list leaves behind. */
function blind(): RepoSignals {
  return { ...good(), unknown: ["file list"], filesKnown: false, files: [], workflows: [], workflowState: "unknown", workflowTexts: {}, policy: null, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
}
const statusOf = (s: RepoSignals, id: string) => assessRepo(s).controls.find((c) => c.id === id)?.status;
const control = (s: RepoSignals, id: string) => assessRepo(s).controls.find((c) => c.id === id);

describe("parseRepo", () => {
  it("accepts owner/repo, a github.com address with .git and a deeper path", () => {
    expect(parseRepo("holistis/tokenizen")).toBe("holistis/tokenizen");
    expect(parseRepo("https://github.com/holistis/tokenizen.git")).toBe("holistis/tokenizen");
    expect(parseRepo("https://github.com/holistis/tokenizen/tree/main/packages")).toBe("holistis/tokenizen");
    expect(parseRepo("  owner/.github  ")).toBe("owner/.github");
  });

  it.each([
    "", null, undefined, 42, "../etc/passwd", "a b/c", "a/b c", "http://evil.example/x/y", "javascript:alert(1)", "a", "/", "a/..", "a/.", "../..",
    "a/b;rm", "a/b?x=1", "a/b#frag", "-a/b", "a_b/c", "a/b%2fc", "x".repeat(40) + "/r", "a/" + "r".repeat(101),
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
    const s: RepoSignals = { ...good(), files: ["README.md", "package.json"], workflows: [], workflowState: "none", workflowTexts: {}, policy: null, license: null, releases: [{ tag: "v1", date: NOW - DAY, draft: false, assets: [] }], advisories: 0 };
    const r = assessRepo(s);
    for (const id of ["vulnerability-policy", "sbom", "release-provenance", "pinned-dependencies", "dependency-updates", "security-scanning", "license"]) {
      expect(statusOf(s, id), id).toBe("not_visible");
    }
    for (const c of r.controls.filter((x) => x.status === "not_visible")) expect(c.fix && c.fix.length > 15, c.id).toBe(true);
  });

  it("A FAILED FILE LIST NEVER BECOMES A FINDING: every point that depends on it is not measured", () => {
    const s = blind();
    for (const id of ["vulnerability-policy", "sbom", "pinned-dependencies", "dependency-updates", "security-scanning"]) {
      expect(statusOf(s, id), id).toBe("not_measured");
    }
    const r = assessRepo(s);
    expect(r.controls.filter((c) => c.status === "not_visible").map((c) => c.id)).toEqual([]);
  });

  it("a workflow folder that was only partly read cannot prove the absence of a scan, an SBOM step or signing", () => {
    const s: RepoSignals = { ...good(), workflowState: "partial", workflowTexts: { "a.yml": "run: echo hi" }, files: ["README.md", "SECURITY.md"], releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
    for (const id of ["security-scanning", "sbom", "release-provenance"]) expect(statusOf(s, id), id).toBe("not_measured");
    // ...but a match in the part that was read still counts
    const seen: RepoSignals = { ...s, workflowTexts: { "a.yml": "uses: github/codeql-action/analyze@v3" } };
    expect(statusOf(seen, "security-scanning")).toBe("visible");
  });

  it("an SBOM in the releases or an SBOM step in a workflow counts, loose text does not", () => {
    const a = { ...good(), workflowTexts: {} };
    a.releases = [{ tag: "v1", date: NOW, draft: false, assets: ["bom.cdx.json"] }];
    expect(statusOf(a, "sbom")).toBe("visible");
    const b = { ...good(), workflowTexts: { "x.yml": "echo sbomb" } };
    b.releases = [{ tag: "v1", date: NOW, draft: false, assets: [] }];
    expect(statusOf(b, "sbom")).toBe("not_visible");
    const unreadReleases = { ...b, releases: null };
    expect(statusOf(unreadReleases, "sbom")).toBe("not_measured");
  });

  it("the security policy: needs a contact or reporting link, may live at owner level, and an unreadable file is not held against it", () => {
    expect(statusOf(good(), "vulnerability-policy")).toBe("visible");
    const noContact = { ...good(), policy: { where: "repository" as const, path: "SECURITY.md", hasContact: false } };
    expect(control(noContact, "vulnerability-policy")?.status).toBe("not_visible");
    expect(control(noContact, "vulnerability-policy")?.explanation).toMatch(/contact address or a link/);
    expect(statusOf({ ...good(), policy: { where: "repository", path: "SECURITY.md", hasContact: null } }, "vulnerability-policy")).toBe("not_measured");
    const org = control({ ...good(), policy: { where: "owner", path: "o/.github: SECURITY.md", hasContact: true } }, "vulnerability-policy");
    expect(org?.status).toBe("visible");
    expect(org?.evidence).toMatch(/o\/\.github/);
  });

  it("lockfiles: more ecosystems count, and a build file that pins versions itself is not held against the project", () => {
    expect(statusOf({ ...good(), files: ["bun.lock", "package.json"] }, "pinned-dependencies")).toBe("visible");
    expect(statusOf({ ...good(), files: ["Package.resolved"] }, "pinned-dependencies")).toBe("visible");
    expect(statusOf({ ...good(), files: ["package.json"] }, "pinned-dependencies")).toBe("not_visible");
    expect(statusOf({ ...good(), files: ["pom.xml"] }, "pinned-dependencies")).toBe("not_measured");
    expect(statusOf({ ...good(), files: ["go.mod"] }, "pinned-dependencies")).toBe("not_measured");
    expect(statusOf({ ...good(), files: ["go.mod", "go.sum"] }, "pinned-dependencies")).toBe("visible");
  });

  it("provenance: a certificate or the word cosign in an asset name is not proof, a signature file is", () => {
    const base = { ...good(), workflowTexts: {} };
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["cosign-linux-amd64"] }] }, "release-provenance")).toBe("not_visible");
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["ca.pem"] }] }, "release-provenance")).toBe("not_visible");
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["app.tgz.sig"] }] }, "release-provenance")).toBe("visible");
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["app.sigstore.json"] }] }, "release-provenance")).toBe("visible");
  });

  it("scan wording admits that a scan switched on in the settings leaves no file", () => {
    const none: RepoSignals = { ...good(), workflows: [], workflowState: "none", workflowTexts: {}, files: ["README.md"] };
    expect(control(none, "security-scanning")?.explanation).toMatch(/repository settings/);
  });

  it("maintenance goes by the last commit on the default branch, falls back to the push date and says which", () => {
    expect(statusOf({ ...good(), lastCommit: NOW - 91 * DAY, lastPush: NOW - DAY }, "maintenance")).toBe("not_visible");
    expect(statusOf({ ...good(), lastCommit: NOW - 90 * DAY }, "maintenance")).toBe("visible");
    expect(statusOf({ ...good(), archived: true }, "maintenance")).toBe("not_visible");
    const fallback = control({ ...good(), lastCommit: null, lastPush: NOW - 5 * DAY }, "maintenance");
    expect(fallback?.status).toBe("visible");
    expect(fallback?.evidence).toMatch(/last push to any branch/);
    expect(statusOf({ ...good(), lastCommit: null, lastPush: null }, "maintenance")).toBe("not_measured");
  });

  it("carries the rule set version, says what it does not measure, and never claims compliance", () => {
    const r = assessRepo(good());
    expect(r.rules.version).toBe(RULES_VERSION);
    expect(r.rules.basis).toMatch(/official text/);
    expect(r.rules.basis).toMatch(/not been reviewed by a lawyer/);
    expect(r.whatThisDoesNotMeasure.length).toBeGreaterThanOrEqual(3);
    expect(r.notice).toMatch(/not a conformity assessment and not legal advice/);
    expect(JSON.stringify(r)).not.toMatch(/complies with the CRA|is compliant|\bmissing\b/i);
  });

  it("the points that are often done outside GitHub say so", () => {
    const s: RepoSignals = { ...good(), workflowTexts: {}, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
    for (const id of ["sbom", "release-provenance"]) expect(control(s, id)?.explanation, id).toMatch(/somewhere else/);
  });

  it("text that came from the repository is cut and stripped of control characters", () => {
    const s = { ...good(), files: ["README.md", "package.json", "cyclonedx\u001b[31m" + "x".repeat(500)], workflowTexts: {} };
    s.releases = [{ tag: "v1", date: NOW, draft: false, assets: [] }];
    const c = control(s, "sbom");
    expect(c?.status).toBe("visible");
    expect(c?.evidence).not.toMatch(/\u001b/);
    expect((c?.evidence ?? "").length).toBeLessThanOrEqual(120);
    expect(clean("a‮b\u0000c")).toBe("a b c");
  });

  it("a report with something unread is not complete", () => {
    expect(isComplete(good())).toBe(true);
    expect(isComplete(blind())).toBe(false);
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
const text = (value: string) => () => new Response(value);
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
const commit = (daysAgo: number) => json([{ commit: { committer: { date: new Date(NOW - daysAgo * DAY).toISOString() } } }]);
const dirEntry = (name: string, type: "file" | "dir" = "file") => ({ name, type });

describe("fetchSignals", () => {
  it("a 404 on the repository means not found, and nothing else is asked for", async () => {
    const net = fakeGithub([["/repos/o/r", json({}, 404)]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.notFound).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it("a private repository is treated as not found, whatever the token could see", async () => {
    const net = fakeGithub([["/repos/o/r", json(repoMeta({ private: true }))]]);
    expect((await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW })).notFound).toBe(true);
  });

  it("only ever asks for the two GitHub hosts, refuses redirects, reads files at HEAD, and sends the token to the API host only", async () => {
    const net = fakeGithub([
      ["/contents/.github/workflows", json([dirEntry("ci.yml")])],
      ["/contents/.github", json([dirEntry("workflows", "dir")])],
      ["/contents", json([dirEntry(".github", "dir"), dirEntry("package.json")])],
      ["raw.githubusercontent.com", text("uses: github/codeql-action/analyze@v3")],
      ["/commits", commit(2)],
      ["/releases", json([])],
      ["/security-advisories", json([])],
      ["/repos/o/r", json(repoMeta({ default_branch: "feat/x?y#z" }))],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, token: "ghp_test", now: NOW });
    expect(s.workflows).toEqual(["ci.yml"]);
    expect(s.workflowState).toBe("complete");
    for (const c of net.calls) {
      expect(c.url).toMatch(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//);
      expect(c.redirect).toBe("manual");
      expect(c.url).not.toMatch(/feat|%3F|%23/); // no text chosen by the repository owner (the branch name) is in an address
      const hasToken = Object.values(c.headers).some((v) => String(v).includes("ghp_test"));
      expect(hasToken, c.url).toBe(c.url.startsWith("https://api.github.com/"));
    }
    expect(net.calls.some((c) => c.url === "https://raw.githubusercontent.com/o/r/HEAD/.github/workflows/ci.yml")).toBe(true);
    expect(s.requested.length).toBe(net.calls.length);
    expect(assessRepo(s).controls.find((x) => x.id === "security-scanning")?.status).toBe("visible");
  });

  it("an unreadable repository is failed: no report can be made", async () => {
    const net = fakeGithub([["/repos/o/r", () => new Response("oops", { status: 500 })]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.failed).toBe(true);
    const everything = fakeGithub([["/repos/o/r", () => Promise.reject(new Error("boom"))]]);
    expect((await fetchSignals("o/r", { fetchImpl: everything.fetchImpl, now: NOW })).failed).toBe(true);
    const renamed = fakeGithub([["/repos/o/r", () => Promise.reject(new TypeError("redirect mode is set to error"))]]);
    expect((await fetchSignals("o/r", { fetchImpl: renamed.fetchImpl, now: NOW })).failed).toBe(true);
  });

  it("a failure halfway becomes not measured, never a gap", async () => {
    const net = fakeGithub([
      ["/contents", () => Promise.reject(new Error("boom"))],
      ["/releases", () => Promise.reject(new Error("boom"))],
      ["/security-advisories", json([])],
      ["/commits", commit(1)],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.unknown).toContain("file list");
    expect(s.filesKnown).toBe(false);
    expect(s.releases).toBeNull();
    const r = assessRepo(s);
    expect(r.controls.filter((c) => c.status === "not_visible").map((c) => c.id)).toEqual([]);
    expect(isComplete(s)).toBe(false);
  });

  it("GitHub saying slow down is reported as rate limited, not as a report", async () => {
    const net = fakeGithub([["/repos/o/r", () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })]]);
    expect((await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW })).rateLimited).toBe(true);
  });

  it("a 403 that is not a rate limit is a failed read of the repository", async () => {
    const net = fakeGithub([["/repos/o/r", () => new Response("{}", { status: 403 })]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.rateLimited).toBeUndefined();
    expect(s.failed).toBe(true);
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
      ["/contents/.github/workflows", json([dirEntry("ci.yml")])],
      ["/contents/.github", json([dirEntry("workflows", "dir")])],
      ["/contents", json([dirEntry(".github", "dir")])],
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

  it("reads at most twelve workflow files, release and scan files first, and then says the folder was only partly read", async () => {
    const names = [...Array.from({ length: 20 }, (_, i) => `a${String(i).padStart(2, "0")}-misc.yml`), "zz-release.yml"];
    const net = fakeGithub([
      ["/contents/.github/workflows", json(names.map((n) => dirEntry(n)))],
      ["/contents/.github", json([dirEntry("workflows", "dir")])],
      ["/contents", json([dirEntry(".github", "dir")])],
      ["raw.githubusercontent.com", text("run: echo")],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.workflows).toHaveLength(21);
    expect(Object.keys(s.workflowTexts)).toHaveLength(12);
    expect(Object.keys(s.workflowTexts)).toContain("zz-release.yml");
    expect(s.workflowState).toBe("partial");
    expect(statusOf(s, "security-scanning")).toBe("not_measured");
  });

  it("a workflow file that could not be read makes the folder partial", async () => {
    const net = fakeGithub([
      ["/contents/.github/workflows", json([dirEntry("ci.yml")])],
      ["/contents/.github", json([dirEntry("workflows", "dir")])],
      ["/contents", json([dirEntry(".github", "dir")])],
      ["raw.githubusercontent.com", () => new Response("nope", { status: 500 })],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.workflowState).toBe("partial");
  });

  it("comments in a workflow are not steps", async () => {
    const net = fakeGithub([
      ["/contents/.github/workflows", json([dirEntry("ci.yml")])],
      ["/contents/.github", json([dirEntry("workflows", "dir")])],
      ["/contents", json([dirEntry(".github", "dir")])],
      ["raw.githubusercontent.com", text("# uses: github/codeql-action/analyze@v3\nsteps:\n  - run: echo hi # semgrep later\n")],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.workflowState).toBe("complete");
    expect(statusOf(s, "security-scanning")).toBe("not_visible");
  });

  it("reads SECURITY.md and checks for a contact address or a reporting link", async () => {
    const withMail = fakeGithub([["raw.githubusercontent.com", text("Please report to security@example.org")], ["/contents", json([dirEntry("SECURITY.md")])], ["/repos/o/r", json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: withMail.fetchImpl, now: NOW })).policy).toEqual({ where: "repository", path: "SECURITY.md", hasContact: true });
    const withLink = fakeGithub([["raw.githubusercontent.com", text("Use https://github.com/o/r/security/advisories/new")], ["/contents", json([dirEntry("SECURITY.md")])], ["/repos/o/r", json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: withLink.fetchImpl, now: NOW })).policy?.hasContact).toBe(true);
    const empty = fakeGithub([["raw.githubusercontent.com", text("# Security\nWe take security seriously.")], ["/contents", json([dirEntry("SECURITY.md")])], ["/repos/o/r", json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: empty.fetchImpl, now: NOW })).policy?.hasContact).toBe(false);
    const unreadable = fakeGithub([["raw.githubusercontent.com", () => new Response("x", { status: 500 })], ["/contents", json([dirEntry("SECURITY.md")])], ["/repos/o/r", json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: unreadable.fetchImpl, now: NOW })).policy?.hasContact).toBeNull();
  });

  it("looks for the organisation-level policy only when the repository has none, and never for the .github repository itself", async () => {
    const org = fakeGithub([
      ["/repos/o/.github/contents", json([dirEntry("SECURITY.md"), dirEntry("profile", "dir")])],
      ["raw.githubusercontent.com/o/.github/HEAD/SECURITY.md", text("mail security@example.org")],
      ["/contents", json([dirEntry("README.md")])],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: org.fetchImpl, now: NOW });
    expect(s.policy).toEqual({ where: "owner", path: "o/.github: SECURITY.md", hasContact: true });
    const itself = fakeGithub([["/contents", json([dirEntry("README.md")])], ["/repos/o/.github", json(repoMeta())]]);
    const t = await fetchSignals("o/.github", { fetchImpl: itself.fetchImpl, now: NOW });
    expect(t.policy).toBeNull();
    expect(itself.calls.filter((c) => c.url.includes("/repos/o/.github/contents")).length).toBe(1);
    const unreadableFiles = fakeGithub([["/contents", () => Promise.reject(new Error("boom"))], ["/repos/o/r", json(repoMeta())]]);
    const u = await fetchSignals("o/r", { fetchImpl: unreadableFiles.fetchImpl, now: NOW });
    expect(u.policy).toBeNull();
    expect(unreadableFiles.calls.some((c) => c.url.includes("/repos/o/.github"))).toBe(false);
  });

  it("the owner policy is also found in .github/ and docs/ of the owner's .github repository", async () => {
    for (const dir of [".github", "docs"]) {
      const net = fakeGithub([
        [`/repos/o/.github/contents/${dir}`, json([dirEntry("SECURITY.md")])],
        ["/repos/o/.github/contents", json([dirEntry(dir, "dir"), dirEntry("README.md")])],
        [`raw.githubusercontent.com/o/.github/HEAD/${dir}/SECURITY.md`, text("mail security@example.org")],
        ["/contents", json([dirEntry("README.md")])],
        ["/repos/o/r", json(repoMeta())],
      ]);
      const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
      expect(s.policy, dir).toEqual({ where: "owner", path: `o/.github: ${dir}/SECURITY.md`, hasContact: true });
    }
  });

  it("a failed look into the owner's .github repository, or into a folder that can hold the policy, is not measured and never not visible", async () => {
    const ownerBroken = fakeGithub([["/repos/o/.github/contents", () => new Response("oops", { status: 500 })], ["/contents", json([dirEntry("README.md")])], ["/repos/o/r", json(repoMeta())]]);
    const a = await fetchSignals("o/r", { fetchImpl: ownerBroken.fetchImpl, now: NOW });
    expect(a.orgPolicyKnown).toBe(false);
    expect(statusOf(a, "vulnerability-policy")).toBe("not_measured");
    const ownerAbsent = fakeGithub([["/repos/o/.github/contents", json({}, 404)], ["/contents", json([dirEntry("README.md")])], ["/repos/o/r", json(repoMeta())]]);
    const b = await fetchSignals("o/r", { fetchImpl: ownerAbsent.fetchImpl, now: NOW });
    expect(b.orgPolicyKnown).toBe(true);
    expect(statusOf(b, "vulnerability-policy")).toBe("not_visible");
    const dotGithubBroken = fakeGithub([["/contents/.github", () => new Response("oops", { status: 500 })], ["/contents", json([dirEntry(".github", "dir")])], ["/repos/o/.github/contents", json({}, 404)], ["/repos/o/r", json(repoMeta())]]);
    const c = await fetchSignals("o/r", { fetchImpl: dotGithubBroken.fetchImpl, now: NOW });
    expect(statusOf(c, "vulnerability-policy")).toBe("not_measured");
    expect(statusOf(c, "dependency-updates")).toBe("not_measured");
    expect(statusOf(c, "security-scanning")).toBe("not_measured");
  });

  it("a renamed or moved repository is reported as moved, and the redirect is not followed", async () => {
    const net = fakeGithub([["/repos/o/r", () => new Response(null, { status: 301, headers: { location: "https://api.github.com/repositories/1" } })]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.moved).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it("a badge or an image is not a contact, a plain address or a reporting link is", async () => {
    expect(namesContact("[![Security](https://img.shields.io/badge/security-ok-green)](https://example.org)")).toBe(false);
    expect(namesContact("![logo](https://example.org/logo.png)")).toBe(false);
    expect(namesContact("Mail us: security@example.org")).toBe(true);
    expect(namesContact("Use https://github.com/o/r/security/advisories/new to report")).toBe(true);
    expect(namesContact("We take security seriously.")).toBe(false);
  });

  it("HOSTILE TEXT CANNOT FREEZE THE SERVER: long lines in a policy or a workflow are handled in bounded time", async () => {
    const hostile = [
      "a".repeat(200_000),
      "a@".repeat(100_000),
      "a@" + "a.".repeat(100_000),
      "trivy ".repeat(40_000),
      "npm publish ".repeat(20_000),
      "https://".repeat(25_000),
    ];
    for (const body of hostile) {
      const t0 = performance.now();
      namesContact(body);
      expect(performance.now() - t0, body.slice(0, 12)).toBeLessThan(500);
    }
    const net = fakeGithub([
      ["/contents/.github/workflows", json(Array.from({ length: 12 }, (_, i) => dirEntry(`w${i}.yml`)))],
      ["/contents/.github", json([dirEntry("workflows", "dir")])],
      ["/contents", json([dirEntry(".github", "dir")])],
      ["raw.githubusercontent.com", text("trivy ".repeat(40_000))],
      ["/repos/o/r", json(repoMeta())],
    ]);
    const t1 = performance.now();
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    assessRepo(s);
    expect(performance.now() - t1).toBeLessThan(2500);
    expect(s.workflowState).toBe("partial"); // each file is longer than the 64 KB that is looked at
  });

  it("takes the date of the last commit on the default branch", async () => {
    const net = fakeGithub([["/commits", commit(40)], ["/repos/o/r", json(repoMeta({ pushed_at: new Date(NOW - DAY).toISOString() }))]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.lastCommit).toBe(NOW - 40 * DAY);
  });
});
