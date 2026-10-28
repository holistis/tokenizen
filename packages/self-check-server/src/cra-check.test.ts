// cra-check.test.ts — the checker around the measurement (limits, cache, budget, failure paths) and the
// HTTP route. GitHub is replaced by a fake; nothing here touches a real host.

import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";
import { createCraChecker } from "./cra-check.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const MINUTE = 60 * 1000;

type Route = [string, () => Response | Promise<Response>];
function fakeGithub(routes: Route[]) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    // GitHub treats owner and repository names case-insensitively, so the fake does too.
    for (const [part, make] of routes) if (url.toLowerCase().includes(part)) return make();
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const json = (value: unknown, status = 200) => () => new Response(JSON.stringify(value), { status });
const meta = () => ({ full_name: "Owner/Repo", default_branch: "main", pushed_at: new Date(NOW - 86_400_000).toISOString(), license: { spdx_id: "MIT" }, private: false });
const commit = json([{ commit: { committer: { date: new Date(NOW - 86_400_000).toISOString() } } }]);
/** Any repository of "owner" is found and reads cleanly. */
const okRoutes = (): Route[] => [
  ["raw.githubusercontent.com", () => new Response("report to security@example.org")],
  ["/git/trees/", json({ truncated: false, tree: [{ path: "SECURITY.md", type: "blob" }, { path: "package.json", type: "blob" }] })],
  ["/commits", commit],
  ["/security-advisories", json([])],
  ["/releases", json([])],
  ["/repos/owner/", json(meta())],
];

describe("createCraChecker", () => {
  it("refuses anything that is not an owner/repo pair, without a request", async () => {
    const net = fakeGithub(okRoutes());
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW });
    for (const bad of ["", "../x", "a b/c", "https://evil.example/a/b", null, 5]) {
      expect((await checker.check(bad)).kind).toBe("invalid");
    }
    expect(net.calls).toHaveLength(0);
  });

  it("measures once and answers the same repository from the cache for an hour, whatever the spelling", async () => {
    const net = fakeGithub(okRoutes());
    let t = NOW;
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => t });
    expect(await checker.check("Owner/Repo")).toMatchObject({ kind: "done", cached: false });
    const made = net.calls.length;
    t += 59 * MINUTE;
    expect(await checker.check("https://github.com/owner/repo")).toMatchObject({ kind: "done", cached: true });
    expect(net.calls).toHaveLength(made);
    t += 2 * MINUTE;
    expect(await checker.check("owner/repo")).toMatchObject({ kind: "done", cached: false });
    expect(net.calls.length).toBeGreaterThan(made);
  });

  it("two checks of the same repository at once make one set of requests", async () => {
    const net = fakeGithub(okRoutes());
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW });
    const [a, b] = await Promise.all([checker.check("owner/repo"), checker.check("owner/repo")]);
    expect(a.kind).toBe("done");
    expect(b.kind).toBe("done");
    expect(net.calls.filter((c) => c.url.endsWith("/repos/owner/repo"))).toHaveLength(1);
  });

  it("a repository that does not exist or is private is not found, remembered briefly", async () => {
    const net = fakeGithub([["/repos/owner/ghost", json({}, 404)]]);
    let t = NOW;
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => t });
    expect((await checker.check("owner/ghost")).kind).toBe("not_found");
    expect((await checker.check("owner/ghost")).kind).toBe("not_found");
    expect(net.calls).toHaveLength(1);
    t += 6 * MINUTE;
    await checker.check("owner/ghost");
    expect(net.calls).toHaveLength(2);
  });

  it("a name that does not exist costs no check slot but draws on a larger budget of its own", async () => {
    const net = fakeGithub([["/repos/owner/real", json(meta())], ...okRoutes().slice(0, 5)]);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    expect((await checker.check("owner/ghost1")).kind).toBe("not_found");
    expect((await checker.check("owner/ghost2")).kind).toBe("not_found");
    expect((await checker.check("owner/real")).kind).toBe("done");
    // four times the check budget in unknown names per hour, then no more new names until it passes
    const other = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    const kinds: string[] = [];
    for (let i = 1; i <= 5; i++) kinds.push((await other.check(`owner/ghost${i}`)).kind);
    expect(kinds).toEqual(["not_found", "not_found", "not_found", "not_found", "limited"]);
  });

  it("when GitHub says slow down: a limited answer, nothing cached, and the budget slot comes back", async () => {
    let limited = true;
    const net = fakeGithub([["/repos/owner/repo", () => (limited ? new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }) : json(meta())())], ...okRoutes().slice(0, 5)]);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    expect(await checker.check("owner/repo")).toMatchObject({ kind: "limited", retryAfterSeconds: 300 });
    limited = false;
    expect((await checker.check("owner/repo")).kind).toBe("done");
  });

  it("A READ THAT FAILS IS NOT A REPORT: the repository unreadable gives failed, nothing is cached, the slot comes back", async () => {
    let broken = true;
    const net = fakeGithub([["/repos/owner/repo", () => (broken ? new Response("oops", { status: 500 }) : json(meta())())], ...okRoutes().slice(0, 5)]);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    expect((await checker.check("owner/repo")).kind).toBe("failed");
    broken = false;
    expect((await checker.check("owner/repo")).kind).toBe("done");
    const everything = fakeGithub([]);
    const dead = createCraChecker({ fetchImpl: (async () => Promise.reject(new Error("secret detail with https://x"))) as unknown as typeof fetch, now: () => NOW });
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      expect((await dead.check("owner/repo")).kind).toBe("failed");
      expect((await dead.check("owner/repo")).kind).toBe("failed");
      expect(JSON.stringify(errors)).not.toMatch(/secret detail/);
    } finally {
      console.error = original;
    }
    expect(everything.calls).toHaveLength(0);
  });

  it("a report with a part that could not be read says so and is kept only a few minutes", async () => {
    let t = NOW;
    const routes: Route[] = [["/git/trees/", () => Promise.reject(new Error("boom"))], ...okRoutes().filter(([p]) => p !== "/git/trees/")];
    const net = fakeGithub(routes);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => t });
    const first = await checker.check("owner/repo");
    expect(first.kind).toBe("done");
    if (first.kind === "done") {
      expect(first.report.summary.notMeasured).toBeGreaterThan(0);
      expect(first.report.controls.filter((c) => c.status === "not_visible" && c.id !== "license").map((c) => c.id)).toEqual([]);
    }
    const made = net.calls.length;
    t += 4 * MINUTE;
    expect(await checker.check("owner/repo")).toMatchObject({ kind: "done", cached: true });
    expect(net.calls).toHaveLength(made);
    t += 2 * MINUTE;
    expect(await checker.check("owner/repo")).toMatchObject({ kind: "done", cached: false });
  });

  it("the hourly budget is a hard cap, and it says when to come back", async () => {
    const net = fakeGithub(okRoutes());
    let t = NOW;
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => t, globalMax: 2 });
    await checker.check("owner/a");
    await checker.check("owner/b");
    const third = await checker.check("owner/c");
    expect(third).toMatchObject({ kind: "limited" });
    expect(third.kind === "limited" && third.retryAfterSeconds).toBeGreaterThan(0);
    t += 61 * MINUTE;
    expect((await checker.check("owner/c")).kind).toBe("done");
  });

  it("without a token the default budget is small, with a token it is much bigger", async () => {
    const net = fakeGithub(okRoutes());
    const small = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW });
    const kinds: string[] = [];
    for (let i = 0; i < 8; i++) kinds.push((await small.check(`owner/r${i}`)).kind);
    expect(kinds.filter((k) => k === "limited").length).toBe(3);
    const big = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, githubToken: "ghp_x" });
    const bigKinds: string[] = [];
    for (let i = 0; i < 8; i++) bigKinds.push((await big.check(`owner/r${i}`)).kind);
    expect(bigKinds.filter((k) => k === "limited").length).toBe(0);
  });

  it("at most maxConcurrent checks are busy at once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = (async () => {
      await gate;
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const checker = createCraChecker({ fetchImpl: slow, now: () => NOW, maxConcurrent: 2, globalMax: 50 });
    const busy = [checker.check("owner/a"), checker.check("owner/b")];
    await new Promise((r) => setTimeout(r, 10));
    expect(await checker.check("owner/c")).toMatchObject({ kind: "limited", retryAfterSeconds: 5 });
    release();
    await Promise.all(busy);
  });

  it("sends the token to api.github.com only", async () => {
    const net = fakeGithub([
      ["/git/trees/", json({ truncated: false, tree: [{ path: ".github", type: "tree" }, { path: ".github/workflows", type: "tree" }, { path: ".github/workflows/ci.yml", type: "blob" }, { path: "package.json", type: "blob" }] })],
      ["raw.githubusercontent.com", () => new Response("x")],
      ["/commits", commit],
      ["/security-advisories", json([])],
      ["/releases", json([])],
      ["/repos/owner/repo", json(meta())],
    ]);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, githubToken: "ghp_secret" });
    await checker.check("owner/repo");
    for (const c of net.calls) {
      const sent = Object.values(c.headers).some((v) => String(v).includes("ghp_secret"));
      expect(sent, c.url).toBe(c.url.startsWith("https://api.github.com/"));
    }
  });

  it("a repository that has moved is its own answer, nothing is cached, and the slot comes back", async () => {
    const net = fakeGithub([["/repos/owner/old", () => new Response(null, { status: 301, headers: { location: "https://api.github.com/repositories/1" } })]]);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    expect((await checker.check("owner/old")).kind).toBe("moved");
    expect((await checker.check("owner/old")).kind).toBe("moved");
    expect(net.calls).toHaveLength(2);
  });

  it("a checker that is switched off does nothing", async () => {
    const net = fakeGithub(okRoutes());
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, enabled: false });
    expect(checker.enabled).toBe(false);
    expect((await checker.check("owner/repo")).kind).toBe("failed");
    expect(net.calls).toHaveLength(0);
  });
});

describe("POST /api/cra/check", () => {
  let server: Server;
  let baseUrl: string;

  async function start(craCheck: NonNullable<Parameters<typeof createApp>[0]>["craCheck"]) {
    const app = createApp({ identity: createAttesterIdentity(), seller: null, craCheck });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
  }
  const post = (body: unknown) => fetch(`${baseUrl}/api/cra/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  afterEach(() => {
    server?.close();
  });

  it("returns the dated report as JSON, not cacheable, with the keys we promise and nothing else", async () => {
    const net = fakeGithub(okRoutes());
    await start({ fetchImpl: net.fetchImpl, now: () => NOW });
    const res = await post({ repo: "owner/repo" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, cached: false, repo: "Owner/Repo", rules: { version: "2026-10-28.5" } });
    expect(Object.keys(body).sort()).toEqual(["advisories", "cached", "controls", "measuredAt", "notice", "ok", "repo", "rules", "sources", "summary", "whatThisDoesNotMeasure"]);
  });

  it("answers 400 for a bad body or a bad name, 404 for an unknown repository, 502 when GitHub cannot be read", async () => {
    const net = fakeGithub([["/repos/owner/ghost", json({}, 404)], ["/repos/owner/sick", () => new Response("oops", { status: 500 })]]);
    await start({ fetchImpl: net.fetchImpl, now: () => NOW });
    expect((await post({})).status).toBe(400);
    expect((await post({ repo: 5 })).status).toBe(400);
    expect((await post({ repo: "not a repo" })).status).toBe(400);
    expect((await post({ repo: "owner/ghost" })).status).toBe(404);
    expect((await post({ repo: "owner/sick" })).status).toBe(502);
  });

  it("answers 404 with a clear sentence for a moved repository", async () => {
    const net = fakeGithub([["/repos/owner/old", () => new Response(null, { status: 301, headers: { location: "https://api.github.com/repositories/1" } })]]);
    await start({ fetchImpl: net.fetchImpl, now: () => NOW });
    const res = await post({ repo: "owner/old" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/renamed or moved/);
  });

  it("answers 429 with Retry-After when the budget is used up", async () => {
    const net = fakeGithub(okRoutes());
    await start({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    expect((await post({ repo: "owner/repo" })).status).toBe(200);
    const res = await post({ repo: "owner/other" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits one address, on top of the global budget", async () => {
    const net = fakeGithub(okRoutes());
    await start({ fetchImpl: net.fetchImpl, now: () => NOW, rateLimit: { windowMs: 60_000, max: 2 } });
    expect((await post({ repo: "owner/repo" })).status).toBe(200);
    expect((await post({ repo: "owner/repo" })).status).toBe(200);
    expect((await post({ repo: "owner/repo" })).status).toBe(429);
  });

  it("answers 503 and makes no request when the route is switched off", async () => {
    const net = fakeGithub(okRoutes());
    await start({ fetchImpl: net.fetchImpl, now: () => NOW, enabled: false });
    const res = await post({ repo: "owner/repo" });
    expect(res.status).toBe(503);
    expect(net.calls).toHaveLength(0);
  });
});
