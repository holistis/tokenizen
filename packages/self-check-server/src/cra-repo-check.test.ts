// cra-repo-check.test.ts — every signal must be able to come out all three ways, a part that could not be read or was only
// partly examined is "not measured" and NEVER "not visible", and the only hosts ever asked for are the two fixed GitHub hosts.
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
    files: ["README.md", "LICENSE", "SECURITY.md", "package.json", "package-lock.json", ".github/", ".github/dependabot.yml", ".github/workflows/", ".github/workflows/ci.yml"],
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
/** What a failed file tree leaves behind. */
function blind(): RepoSignals {
  return { ...good(), unknown: ["file tree"], filesKnown: false, files: [], workflows: [], workflowState: "unknown", workflowTexts: {}, policy: null, license: null, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
}
const statusOf = (s: RepoSignals, id: string) => assessRepo(s).controls.find((c) => c.id === id)?.status;
const control = (s: RepoSignals, id: string) => assessRepo(s).controls.find((c) => c.id === id);
const withFiles = (files: string[], extra: Partial<RepoSignals> = {}): RepoSignals => ({ ...good(), files, ...extra });

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

describe("namesContact", () => {
  it("a plain address or a reporting link counts, a badge or a project homepage does not", () => {
    expect(namesContact("Mail us: security@example.org")).toBe(true);
    expect(namesContact("Use https://github.com/o/r/security/advisories/new to report")).toBe(true);
    expect(namesContact("Report it at https://example.org/psirt")).toBe(true);
    expect(namesContact("Our bounty runs on https://hackerone.com/example")).toBe(true);
    expect(namesContact("[![Security](https://img.shields.io/badge/security-ok-green)](https://example.org)")).toBe(false);
    expect(namesContact("![logo](https://example.org/logo.png)")).toBe(false);
    expect(namesContact("Homepage: https://example.org")).toBe(false);
    expect(namesContact("We take security seriously.")).toBe(false);
  });

  it("A CONTACT THAT WAS NOT EXAMINED IS NOT 'NO CONTACT': past 16 KB, on a very long line, or beyond the read cap the answer is unknown", () => {
    const pad = "Nothing to see here.\n".repeat(900); // about 19 KB, no contact
    expect(namesContact(pad)).toBeNull();
    expect(namesContact(pad + "security@example.org")).toBeNull(); // the address is past the part that is examined
    expect(namesContact("x".repeat(1500) + "\nno contact in the short lines")).toBeNull();
    expect(namesContact("x".repeat(1500) + "\nreport to security@example.org")).toBe(true);
    expect(namesContact("short and clean, but the read was cut off", true)).toBeNull();
    expect(namesContact("security@example.org first, then cut off", true)).toBe(true);
  });

  it("HOSTILE TEXT CANNOT FREEZE THE SERVER: long lines are handled in bounded time", () => {
    for (const body of ["a".repeat(200_000), "a@".repeat(100_000), "a@" + "a.".repeat(100_000), "https://".repeat(25_000), ("https://" + "a".repeat(140) + "security").repeat(100)]) {
      const t0 = performance.now();
      namesContact(body);
      expect(performance.now() - t0, body.slice(0, 12)).toBeLessThan(500);
    }
  });
});

describe("assessRepo", () => {
  it("a well kept repository is visible on all eight signals", () => {
    const r = assessRepo(good());
    expect(r.controls).toHaveLength(8);
    expect(r.summary).toEqual({ measured: 8, visible: 8, notVisible: 0, notMeasured: 0 });
  });

  it("a bare repository is not visible on seven signals, each with something to do about it", () => {
    const s: RepoSignals = { ...good(), files: ["README.md", "package.json"], workflows: [], workflowState: "none", workflowTexts: {}, policy: null, license: null, releases: [{ tag: "v1", date: NOW - DAY, draft: false, assets: [] }], advisories: 0 };
    const r = assessRepo(s);
    for (const id of ["vulnerability-policy", "sbom", "release-provenance", "pinned-dependencies", "dependency-updates", "security-scanning", "license"]) {
      expect(statusOf(s, id), id).toBe("not_visible");
    }
    for (const c of r.controls.filter((x) => x.status === "not_visible")) expect(c.fix && c.fix.length > 15, c.id).toBe(true);
  });

  it("A FAILED FILE TREE NEVER BECOMES A FINDING: every signal that depends on it is not measured", () => {
    const s = blind();
    for (const id of ["vulnerability-policy", "sbom", "pinned-dependencies", "dependency-updates", "security-scanning", "license"]) {
      expect(statusOf(s, id), id).toBe("not_measured");
    }
    expect(assessRepo(s).controls.filter((c) => c.status === "not_visible").map((c) => c.id)).toEqual([]);
  });

  it("a workflow folder that was only partly read cannot prove the absence of a scan, an SBOM step or signing", () => {
    const s: RepoSignals = { ...good(), workflowState: "partial", workflowTexts: { "a.yml": "run: echo hi" }, files: ["README.md", "SECURITY.md"], releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
    for (const id of ["security-scanning", "sbom", "release-provenance"]) expect(statusOf(s, id), id).toBe("not_measured");
    expect(statusOf({ ...s, workflowTexts: { "a.yml": "uses: github/codeql-action/analyze@v3" } }, "security-scanning")).toBe("visible");
  });

  it("an SBOM anywhere in the repository, in the releases or as a workflow step counts; loose text does not", () => {
    const nothing = { workflowTexts: {}, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
    expect(statusOf(withFiles(["docs/sbom.cdx.json"], nothing), "sbom")).toBe("visible");
    expect(statusOf(withFiles(["packages/x/bom.json"], nothing), "sbom")).toBe("visible");
    expect(statusOf(withFiles(["README.md"], { workflowTexts: {}, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["bom.cdx.json"] }] }), "sbom")).toBe("visible");
    expect(statusOf(withFiles(["README.md"], { ...nothing, workflowTexts: { "x.yml": "echo sbomb" } }), "sbom")).toBe("not_visible");
    expect(statusOf(withFiles(["README.md"], { ...nothing, releases: null }), "sbom")).toBe("not_measured");
    expect(statusOf(withFiles(["vendor/cyclonedx-lib/README.md"], nothing), "sbom")).toBe("not_visible");
  });

  it("the security policy: needs a contact or reporting link, may live at owner level, and an unreadable or partly examined file is not held against it", () => {
    expect(statusOf(good(), "vulnerability-policy")).toBe("visible");
    const noContact = { ...good(), policy: { where: "repository" as const, path: "SECURITY.md", hasContact: false } };
    expect(control(noContact, "vulnerability-policy")?.status).toBe("not_visible");
    expect(control(noContact, "vulnerability-policy")?.explanation).toMatch(/names no contact address or reporting link/);
    expect(statusOf({ ...good(), policy: { where: "repository", path: "SECURITY.md", hasContact: null } }, "vulnerability-policy")).toBe("not_measured");
    const owner = control({ ...good(), policy: { where: "owner", path: "o/.github: SECURITY.md", hasContact: true } }, "vulnerability-policy");
    expect(owner?.status).toBe("visible");
    expect(owner?.evidence).toMatch(/o\/\.github/);
    expect(statusOf({ ...good(), policy: null, orgPolicyKnown: false }, "vulnerability-policy")).toBe("not_measured");
  });

  it("lockfiles anywhere in the repository count (monorepos); a project with package files and no lockfile at all is not visible", () => {
    expect(statusOf(withFiles(["bun.lock", "package.json"]), "pinned-dependencies")).toBe("visible");
    expect(statusOf(withFiles(["Package.resolved"]), "pinned-dependencies")).toBe("visible");
    expect(control(withFiles(["package.json", "services/api/package-lock.json"]), "pinned-dependencies")?.evidence).toBe("services/api/package-lock.json");
    expect(statusOf(withFiles(["package.json"]), "pinned-dependencies")).toBe("not_visible");
    expect(statusOf(withFiles(["apps/web/package.json", "apps/api/package.json"]), "pinned-dependencies")).toBe("not_visible");
    expect(statusOf(withFiles(["pom.xml"]), "pinned-dependencies")).toBe("not_measured");
    expect(statusOf(withFiles(["go.mod"]), "pinned-dependencies")).toBe("not_measured");
    expect(statusOf(withFiles(["go.mod", "go.sum"]), "pinned-dependencies")).toBe("visible");
    expect(statusOf(withFiles(["src/App.csproj"]), "pinned-dependencies")).toBe("not_measured");
  });

  it("automatic updates: Dependabot, Renovate files in the usual places, and Renovate settings inside package.json all count", () => {
    for (const file of [".github/dependabot.yml", ".github/dependabot.yaml", "renovate.json", "renovate.json5", ".github/renovate.json", ".gitlab/renovate.json", ".renovaterc.json"]) {
      expect(statusOf(withFiles([file, "package.json"]), "dependency-updates"), file).toBe("visible");
    }
    expect(statusOf(withFiles(["package.json"], { renovateInline: true }), "dependency-updates")).toBe("visible");
    expect(statusOf(withFiles(["package.json"], { renovateInline: null }), "dependency-updates")).toBe("not_measured");
    expect(statusOf(withFiles(["package.json"], { renovateInline: false }), "dependency-updates")).toBe("not_visible");
    expect(statusOf(withFiles(["go.mod"]), "dependency-updates")).toBe("not_visible");
  });

  it("provenance: a certificate or the word cosign in an asset name is not proof, a signature file is", () => {
    const base = { ...good(), workflowTexts: {} };
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["cosign-linux-amd64"] }] }, "release-provenance")).toBe("not_visible");
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["ca.pem"] }] }, "release-provenance")).toBe("not_visible");
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["app.tgz.sig"] }] }, "release-provenance")).toBe("visible");
    expect(statusOf({ ...base, releases: [{ tag: "v1", date: NOW, draft: false, assets: ["app.sigstore.json"] }] }, "release-provenance")).toBe("visible");
    expect(statusOf({ ...base, releases: null }, "release-provenance")).toBe("not_measured");
  });

  it("scan wording admits that a scan switched on in the settings leaves no file", () => {
    const none: RepoSignals = { ...good(), workflows: [], workflowState: "none", workflowTexts: {}, files: ["README.md"] };
    expect(control(none, "security-scanning")?.explanation).toMatch(/repository settings/);
  });

  it("maintenance goes by the last commit on the default branch, falls back to the push date, says which, and calls itself a weak sign", () => {
    expect(statusOf({ ...good(), lastCommit: NOW - 91 * DAY, lastPush: NOW - DAY }, "maintenance")).toBe("not_visible");
    expect(statusOf({ ...good(), lastCommit: NOW - 90 * DAY }, "maintenance")).toBe("visible");
    expect(statusOf({ ...good(), archived: true }, "maintenance")).toBe("not_visible");
    const fallback = control({ ...good(), lastCommit: null, lastPush: NOW - 5 * DAY }, "maintenance");
    expect(fallback?.status).toBe("visible");
    expect(fallback?.evidence).toMatch(/last push to any branch/);
    expect(fallback?.explanation).toMatch(/weak sign/);
    expect(statusOf({ ...good(), lastCommit: null, lastPush: null }, "maintenance")).toBe("not_measured");
  });

  it("a commit or release dated a little after our own clock is shown as 0 days ago, never as a negative number", () => {
    const c = control({ ...good(), lastCommit: NOW + 20 * 60 * 60 * 1000, releases: [{ tag: "v1", date: NOW + DAY, draft: false, assets: [] }] }, "maintenance");
    expect(c?.status).toBe("visible");
    expect(c?.evidence).toBe("last commit on the default branch 0 days ago, last release 0 days ago");
  });

  it("licence: GitHub's name counts, so does a licence file GitHub does not recognise, and an unreadable tree is not held against it", () => {
    expect(statusOf(good(), "license")).toBe("visible");
    const unrecognised = control(withFiles(["LICENSE.md", "README.md"], { license: null }), "license");
    expect(unrecognised?.status).toBe("visible");
    expect(unrecognised?.evidence).toBe("LICENSE.md");
    expect(statusOf(withFiles(["COPYING"], { license: null }), "license")).toBe("visible");
    expect(statusOf(withFiles(["README.md"], { license: null }), "license")).toBe("not_visible");
    expect(statusOf({ ...blind(), license: null }, "license")).toBe("not_measured");
    expect(statusOf(withFiles(["docs/LICENSE.md"], { license: null }), "license")).toBe("not_visible");
  });

  it("says plainly that these are eight selected signals and not the eight legal requirements, and never claims compliance", () => {
    const r = assessRepo(good());
    expect(r.rules.version).toBe(RULES_VERSION);
    expect(r.rules.basis).toMatch(/not one signal for each of the eight legal requirements/);
    expect(r.rules.basis).toMatch(/official text/);
    expect(r.rules.basis).toMatch(/not been reviewed by a lawyer/);
    expect(r.whatThisDoesNotMeasure.length).toBeGreaterThanOrEqual(4);
    expect(r.notice).toMatch(/not a check against the legal requirements/);
    expect(r.notice).toMatch(/not legal advice/);
    expect(JSON.stringify(r)).not.toMatch(/complies with the CRA|is compliant|\bmissing\b/i);
  });

  it("the signals that are often done outside GitHub say so", () => {
    const s: RepoSignals = { ...good(), workflowTexts: {}, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] };
    for (const id of ["sbom", "release-provenance"]) expect(control(s, id)?.explanation, id).toMatch(/somewhere else/);
  });

  it("text that came from the repository is cut and stripped of control characters", () => {
    const s = withFiles(["README.md", "package.json", "sbom/cyclonedx\u001b[31m" + "x".repeat(500) + ".json"], { workflowTexts: {}, releases: [{ tag: "v1", date: NOW, draft: false, assets: [] }] });
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

  it("carries the pages we asked for with what came of each", () => {
    const s = { ...good(), requested: [{ url: "https://api.github.com/repos/a/b", outcome: "read" as const }, { url: "https://api.github.com/repos/a/.github/git/trees/HEAD?recursive=1", outcome: "not_found" as const }] };
    expect(assessRepo(s).sources).toEqual(s.requested);
  });
});

// ── the fake GitHub ──────────────────────────────────────────────────────────────────────────

type Route = [string, () => Response | Promise<Response>];
function fakeGithub(routes: Route[]) {
  const calls: Array<{ url: string; headers: Record<string, string>; redirect: string | undefined }> = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, redirect: init?.redirect });
    // GitHub treats owner and repository names case-insensitively, so the fake does too.
    for (const [part, make] of routes) if (url.toLowerCase().includes(part)) return make();
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
/** A file tree as GitHub's recursive tree call answers: a path ending in a slash is a folder. */
const tree = (paths: string[], truncated = false) =>
  json({ sha: "x", truncated, tree: paths.map((p) => ({ path: p.replace(/\/$/, ""), type: p.endsWith("/") ? "tree" : "blob" })) });
const TREE = "/repos/o/r/git/trees/head";
const OWNER_TREE = "/repos/o/.github/git/trees/head";
const META = "/repos/o/r";
const ciTree = [".github/", ".github/workflows/", ".github/workflows/ci.yml", "package.json"];

describe("fetchSignals", () => {
  it("a 404 on the repository means not found, and nothing else is asked for", async () => {
    const net = fakeGithub([[META, json({}, 404)]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.notFound).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it("a private repository is treated as not found, whatever the token could see", async () => {
    const net = fakeGithub([[META, json(repoMeta({ private: true }))]]);
    expect((await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW })).notFound).toBe(true);
  });

  it("the whole file tree is ONE call; only the two GitHub hosts are asked, redirects are not followed, files are read at HEAD, the token goes to the API host only", async () => {
    const net = fakeGithub([
      [TREE, tree(ciTree)],
      ["raw.githubusercontent.com", text("uses: github/codeql-action/analyze@v3")],
      ["/commits", commit(2)],
      ["/releases", json([])],
      ["/security-advisories", json([])],
      [OWNER_TREE, json({}, 404)],
      [META, json(repoMeta({ default_branch: "feat/x?y#z" }))],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, token: "ghp_test", now: NOW });
    expect(s.filesKnown).toBe(true);
    expect(s.files).toContain(".github/workflows/ci.yml");
    expect(s.workflows).toEqual(["ci.yml"]);
    expect(s.workflowState).toBe("complete");
    for (const c of net.calls) {
      expect(c.url).toMatch(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//);
      expect(c.redirect).toBe("manual");
      expect(c.url).not.toMatch(/feat|%3F|%23/); // no text chosen by the repository owner (the branch name) is in an address
      const hasToken = Object.values(c.headers).some((v) => String(v).includes("ghp_test"));
      expect(hasToken, c.url).toBe(c.url.startsWith("https://api.github.com/"));
    }
    expect(net.calls.filter((c) => c.url.includes("/git/trees/") && c.url.includes("/o/r/"))).toHaveLength(1);
    expect(net.calls.some((c) => c.url === "https://raw.githubusercontent.com/o/r/HEAD/.github/workflows/ci.yml")).toBe(true);
    expect(assessRepo(s).controls.find((x) => x.id === "security-scanning")?.status).toBe("visible");
  });

  it("an unreadable repository is failed: no report can be made", async () => {
    expect((await fetchSignals("o/r", { fetchImpl: fakeGithub([[META, () => new Response("oops", { status: 500 })]]).fetchImpl, now: NOW })).failed).toBe(true);
    expect((await fetchSignals("o/r", { fetchImpl: fakeGithub([[META, () => Promise.reject(new Error("boom"))]]).fetchImpl, now: NOW })).failed).toBe(true);
  });

  it("a renamed or moved repository is reported as moved, and the redirect is not followed", async () => {
    const net = fakeGithub([[META, () => new Response(null, { status: 301, headers: { location: "https://api.github.com/repositories/1" } })]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.moved).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it("A FILE TREE THAT FAILS, WAS CUT OFF BY GITHUB OR IS TOO BIG LEAVES EVERY FILE-BASED SIGNAL NOT MEASURED, NEVER A GAP", async () => {
    const huge = () => new Response('{"tree":[{"path":"' + "a".repeat(3_500_000) + '","type":"blob"}]}', { status: 200 });
    const cases: Array<[string, Route]> = [
      ["failed call", [TREE, () => Promise.reject(new Error("boom"))]],
      ["server error", [TREE, () => new Response("oops", { status: 500 })]],
      ["cut off by GitHub", [TREE, tree(["README.md"], true)]],
      ["far too large", [TREE, huge]],
    ];
    for (const [label, route] of cases) {
      const net = fakeGithub([route, ["/commits", commit(1)], ["/releases", json([])], ["/security-advisories", json([])], [META, json(repoMeta({ license: null }))]]);
      const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
      expect(s.filesKnown, label).toBe(false);
      expect(s.unknown, label).toContain("file tree");
      const r = assessRepo(s);
      expect(r.controls.filter((c) => c.status === "not_visible").map((c) => c.id), label).toEqual([]);
      expect(isComplete(s), label).toBe(false);
    }
  });

  it("an empty repository (GitHub answers 409 for its tree) is a repository with nothing in it, not an unreadable one", async () => {
    const net = fakeGithub([[TREE, json({ message: "Git Repository is empty." }, 409)], [OWNER_TREE, json({}, 404)], ["/commits", json({}, 409)], ["/releases", json([])], ["/security-advisories", json([])], [META, json(repoMeta())]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.filesKnown).toBe(true);
    expect(s.files).toEqual([]);
  });

  it("GitHub saying slow down is reported as rate limited, not as a report", async () => {
    const net = fakeGithub([[META, () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })]]);
    expect((await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW })).rateLimited).toBe(true);
  });

  it("a 403 that is not a rate limit is a failed read of the repository", async () => {
    const s = await fetchSignals("o/r", { fetchImpl: fakeGithub([[META, () => new Response("{}", { status: 403 })]]).fetchImpl, now: NOW });
    expect(s.rateLimited).toBeUndefined();
    expect(s.failed).toBe(true);
  });

  it("a nested lockfile and a nested SBOM in a monorepo are seen", async () => {
    const net = fakeGithub([
      [TREE, tree(["packages/", "packages/api/", "packages/api/package.json", "packages/api/package-lock.json", "docs/", "docs/sbom.cdx.json"])],
      ["/commits", commit(1)], ["/releases", json([])], ["/security-advisories", json([])], [OWNER_TREE, json({}, 404)], [META, json(repoMeta())],
    ]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(assessRepo(s).controls.find((c) => c.id === "pinned-dependencies")).toMatchObject({ status: "visible", evidence: "packages/api/package-lock.json" });
    expect(assessRepo(s).controls.find((c) => c.id === "sbom")).toMatchObject({ status: "visible", evidence: "docs/sbom.cdx.json" });
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
    const net = fakeGithub([[TREE, tree(ciTree)], ["raw.githubusercontent.com", big], [OWNER_TREE, json({}, 404)], [META, json(repoMeta())]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(pulled).toBeLessThan(2 * 1024 * 1024);
    expect((s.workflowTexts["ci.yml"] ?? "").length).toBeLessThanOrEqual(65_536);
    expect(s.workflowState).toBe("partial");
  });

  it("reads at most twelve workflow files, release and scan files first, and then says the folder was only partly read", async () => {
    const names = [...Array.from({ length: 20 }, (_, i) => `a${String(i).padStart(2, "0")}-misc.yml`), "zz-release.yml"];
    const net = fakeGithub([[TREE, tree([".github/", ".github/workflows/", ...names.map((n) => `.github/workflows/${n}`)])], ["raw.githubusercontent.com", text("run: echo")], [OWNER_TREE, json({}, 404)], [META, json(repoMeta())]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.workflows).toHaveLength(21);
    expect(Object.keys(s.workflowTexts)).toHaveLength(12);
    expect(Object.keys(s.workflowTexts)).toContain("zz-release.yml");
    expect(s.workflowState).toBe("partial");
    expect(statusOf(s, "security-scanning")).toBe("not_measured");
  });

  it("a workflow file that could not be read makes the folder partial", async () => {
    const net = fakeGithub([[TREE, tree(ciTree)], ["raw.githubusercontent.com", () => new Response("nope", { status: 500 })], [OWNER_TREE, json({}, 404)], [META, json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW })).workflowState).toBe("partial");
  });

  it("comments in a workflow are not steps", async () => {
    const net = fakeGithub([[TREE, tree(ciTree)], ["raw.githubusercontent.com", text("# uses: github/codeql-action/analyze@v3\nsteps:\n  - run: echo hi # semgrep later\n")], [OWNER_TREE, json({}, 404)], [META, json(repoMeta())]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.workflowState).toBe("complete");
    expect(statusOf(s, "security-scanning")).toBe("not_visible");
  });

  it("HOSTILE WORKFLOW TEXT CANNOT FREEZE THE SERVER", async () => {
    const net = fakeGithub([[TREE, tree([".github/", ".github/workflows/", ...Array.from({ length: 12 }, (_, i) => `.github/workflows/w${i}.yml`)])], ["raw.githubusercontent.com", text("trivy ".repeat(40_000))], [OWNER_TREE, json({}, 404)], [META, json(repoMeta())]]);
    const t1 = performance.now();
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    assessRepo(s);
    expect(performance.now() - t1).toBeLessThan(2500);
    expect(s.workflowState).toBe("partial"); // each file is longer than the 64 KB that is looked at
  });

  it("reads SECURITY.md in full and checks for a contact address or a reporting link", async () => {
    const run = async (body: () => Response) => {
      const net = fakeGithub([[TREE, tree(["SECURITY.md"])], ["raw.githubusercontent.com", body], [META, json(repoMeta())]]);
      return (await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW })).policy;
    };
    expect(await run(text("Please report to security@example.org"))).toEqual({ where: "repository", path: "SECURITY.md", hasContact: true });
    expect((await run(text("Use https://github.com/o/r/security/advisories/new")))?.hasContact).toBe(true);
    expect((await run(text("# Security\nWe take security seriously. See https://example.org")))?.hasContact).toBe(false);
    expect((await run(() => new Response("x", { status: 500 })))?.hasContact).toBeNull();
    // THE CASE THE OUTSIDE REVIEW FOUND: the address is there, but past the part that is examined
    expect((await run(text("Nothing to see here.\n".repeat(900) + "security@example.org")))?.hasContact).toBeNull();
    // ...or on a line that is far too long to examine
    expect((await run(text("x".repeat(2000) + "\nno contact here")))?.hasContact).toBeNull();
    // ...or the read itself was cut off at the cap
    expect((await run(text("a short, clean start\n" + "x ".repeat(150_000))))?.hasContact).toBeNull();
  });

  it("looks in .github/ and docs/ of the repository, and in the root, .github/ and docs/ of the owner's .github repository, in ONE call", async () => {
    for (const where of ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"]) {
      const net = fakeGithub([
        [OWNER_TREE, tree([where, "README.md"])],
        [`raw.githubusercontent.com/o/.github/head/${where.toLowerCase()}`, text("mail security@example.org")],
        [TREE, tree(["README.md"])],
        [META, json(repoMeta())],
      ]);
      const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
      expect(s.policy, where).toEqual({ where: "owner", path: `o/.github: ${where}`, hasContact: true });
      expect(net.calls.filter((c) => c.url.includes("/o/.github/git/trees/"))).toHaveLength(1);
    }
    const inRepo = fakeGithub([[TREE, tree([".github/", ".github/SECURITY.md"])], ["raw.githubusercontent.com/o/r/head/.github/security.md", text("mail security@example.org")], [META, json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: inRepo.fetchImpl, now: NOW })).policy?.where).toBe("repository");
    expect(inRepo.calls.some((c) => c.url.includes("/o/.github/"))).toBe(false); // the owner is only asked when the repository has none
  });

  it("a failed look at the owner's .github repository is not measured and never not visible; a missing or empty one is clean; the .github repository itself is not asked twice", async () => {
    const broken = fakeGithub([[OWNER_TREE, () => new Response("oops", { status: 500 })], [TREE, tree(["README.md"])], [META, json(repoMeta())]]);
    const a = await fetchSignals("o/r", { fetchImpl: broken.fetchImpl, now: NOW });
    expect(a.orgPolicyKnown).toBe(false);
    expect(statusOf(a, "vulnerability-policy")).toBe("not_measured");
    const cut = fakeGithub([[OWNER_TREE, tree(["README.md"], true)], [TREE, tree(["README.md"])], [META, json(repoMeta())]]);
    expect((await fetchSignals("o/r", { fetchImpl: cut.fetchImpl, now: NOW })).orgPolicyKnown).toBe(false);
    for (const status of [404, 409]) {
      const absent = fakeGithub([[OWNER_TREE, json({}, status)], [TREE, tree(["README.md"])], [META, json(repoMeta())]]);
      const b = await fetchSignals("o/r", { fetchImpl: absent.fetchImpl, now: NOW });
      expect(b.orgPolicyKnown, String(status)).toBe(true);
      expect(statusOf(b, "vulnerability-policy"), String(status)).toBe("not_visible");
    }
    const itself = fakeGithub([[TREE.replace("/o/r/", "/o/.github/"), tree(["README.md"])], ["/repos/o/.github", json(repoMeta())]]);
    const c = await fetchSignals("o/.github", { fetchImpl: itself.fetchImpl, now: NOW });
    expect(c.policy).toBeNull();
    expect(itself.calls.filter((x) => x.url.includes("/git/trees/"))).toHaveLength(1);
    const noTree = fakeGithub([[TREE, () => Promise.reject(new Error("boom"))], [META, json(repoMeta())]]);
    await fetchSignals("o/r", { fetchImpl: noTree.fetchImpl, now: NOW });
    expect(noTree.calls.some((x) => x.url.includes("/o/.github/"))).toBe(false); // no point asking about the owner when this repository's own tree is unknown
  });

  it("Renovate settings inside the root package.json are read, but only when no configuration file shows them", async () => {
    const run = async (body: (() => Response) | null, files = ["package.json"]) => {
      const net = fakeGithub([[TREE, tree(files)], ...(body ? ([["raw.githubusercontent.com/o/r/head/package.json", body]] as Route[]) : []), [OWNER_TREE, json({}, 404)], [META, json(repoMeta())]]);
      const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
      return { s, net };
    };
    expect((await run(text('{"name":"x","renovate":{"extends":["config:base"]}}'))).s.renovateInline).toBe(true);
    expect((await run(text('{"name":"x"}'))).s.renovateInline).toBe(false);
    expect((await run(() => new Response("x", { status: 500 }))).s.renovateInline).toBeNull();
    expect((await run(text('{"name":"x"} ' + " ".repeat(250_000)))).s.renovateInline).toBeNull(); // cut off, no match: unknown
    const withFile = await run(null, [".github/", ".github/dependabot.yml", "package.json"]);
    expect(withFile.s.renovateInline).toBeUndefined();
    expect(withFile.net.calls.some((c) => c.url.endsWith("/package.json"))).toBe(false);
    expect((await run(null, ["go.mod"])).s.renovateInline).toBeUndefined();
  });

  it("every page we asked for is listed with what came of it", async () => {
    const net = fakeGithub([[TREE, tree(ciTree)], ["raw.githubusercontent.com", () => new Response("nope", { status: 500 })], [OWNER_TREE, json({}, 404)], ["/releases", json([])], ["/security-advisories", json({}, 404)], [META, json(repoMeta())]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    const outcome = (part: string) => s.requested.find((r) => r.url.includes(part))?.outcome;
    expect(outcome("/repos/o/r")).toBe("read");
    expect(outcome("/o/.github/git/trees/")).toBe("not_found");
    expect(outcome("raw.githubusercontent.com")).toBe("failed");
    expect(outcome("/releases")).toBe("read");
    expect(outcome("/security-advisories")).toBe("not_found");
  });

  it("takes the date of the last commit on the default branch", async () => {
    const net = fakeGithub([["/commits", commit(40)], [TREE, tree(["README.md"])], [OWNER_TREE, json({}, 404)], [META, json(repoMeta({ pushed_at: new Date(NOW - DAY).toISOString() }))]]);
    const s = await fetchSignals("o/r", { fetchImpl: net.fetchImpl, now: NOW });
    expect(s.lastCommit).toBe(NOW - 40 * DAY);
  });
});
