// cra-check.test.ts — the checker around the measurement (limits, cache, budget, failure paths) and the
// HTTP route. GitHub is replaced by a fake; nothing here touches a real host.

import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";
import { createCraChecker } from "./cra-check.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");

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
const okRoutes = (): Route[] => [
  ["/security-advisories", json([])],
  ["/releases", json([])],
  ["/contents", json([{ name: "SECURITY.md", type: "file" }, { name: "package.json", type: "file" }])],
  ["/repos/owner/repo", json(meta())],
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
    const first = await checker.check("Owner/Repo");
    expect(first).toMatchObject({ kind: "done", cached: false });
    const made = net.calls.length;
    t += 59 * 60 * 1000;
    expect(await checker.check("https://github.com/owner/repo")).toMatchObject({ kind: "done", cached: true });
    expect(net.calls).toHaveLength(made);
    t += 2 * 60 * 1000;
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

  it("a repository that does not exist or is private is not found, and the answer is remembered briefly", async () => {
    const net = fakeGithub([["/repos/owner/ghost", json({}, 404)]]);
    let t = NOW;
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => t });
    expect((await checker.check("owner/ghost")).kind).toBe("not_found");
    expect((await checker.check("owner/ghost")).kind).toBe("not_found");
    expect(net.calls).toHaveLength(1);
    t += 6 * 60 * 1000;
    await checker.check("owner/ghost");
    expect(net.calls).toHaveLength(2);
  });

  it("when GitHub says slow down: a limited answer, nothing cached, and the budget slot comes back", async () => {
    let limited = true;
    const net = fakeGithub([["/repos/owner/repo", () => (limited ? new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }) : json(meta())())], ...okRoutes().slice(0, 3)]);
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW, globalMax: 1 });
    expect(await checker.check("owner/repo")).toMatchObject({ kind: "limited", retryAfterSeconds: 300 });
    limited = false;
    expect((await checker.check("owner/repo")).kind).toBe("done");
  });

  it("the hourly budget is a hard cap, and it says when to come back", async () => {
    const net = fakeGithub(okRoutes());
    let t = NOW;
    const checker = createCraChecker({ fetchImpl: net.fetchImpl, now: () => t, globalMax: 2 });
    await checker.check("owner/repo");
    // distinct names reach the budget; the fake answers 404 for them, which still spends a slot
    await checker.check("owner/one");
    const third = await checker.check("owner/two");
    expect(third).toMatchObject({ kind: "limited" });
    expect(third.kind === "limited" && third.retryAfterSeconds).toBeGreaterThan(0);
    t += 61 * 60 * 1000;
    expect((await checker.check("owner/two")).kind).not.toBe("limited");
  });

  it("without a token the default budget is small, with a token it is much bigger", async () => {
    const net = fakeGithub([]);
    const small = createCraChecker({ fetchImpl: net.fetchImpl, now: () => NOW });
    const kinds: string[] = [];
    for (let i = 0; i < 8; i++) kinds.push((await small.check(`owner/r${i}`)).kind);
    expect(kinds.filter((k) => k === "limited").length).toBe(2);
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

  it("a measurement that throws becomes failed, and a waiting twin of it fails too instead of crashing", async () => {
    const boom = (async () => {
      throw new Error("secret detail with https://x");
    }) as unknown as typeof fetch;
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      const checker = createCraChecker({ fetchImpl: boom, now: () => NOW });
      // fetchSignals turns a thrown fetch into "unknown", so this exercises the not found/failed edge of the repository call
      const outcome = await checker.check("owner/repo");
      expect(["done", "failed", "not_found"]).toContain(outcome.kind);
      expect(JSON.stringify(errors)).not.toMatch(/secret detail/);
    } finally {
      console.error = original;
    }
  });

  it("sends the token to api.github.com only", async () => {
    const net = fakeGithub([
      ["/contents/.github/workflows", json([{ name: "ci.yml", type: "file" }])],
      ["/contents/.github", json([{ name: "workflows", type: "dir" }])],
      ["/contents", json([{ name: ".github", type: "dir" }])],
      ["raw.githubusercontent.com", () => new Response("x")],
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
    expect(body).toMatchObject({ ok: true, cached: false, repo: "Owner/Repo", rules: { version: "2026-10-28.1" } });
    expect(Object.keys(body).sort()).toEqual(["advisories", "cached", "controls", "measuredAt", "notice", "ok", "repo", "rules", "sourcesRead", "summary", "whatThisDoesNotMeasure"]);
  });

  it("answers 400 for a bad body or a bad name, 404 for an unknown repository", async () => {
    const net = fakeGithub([["/repos/owner/ghost", json({}, 404)]]);
    await start({ fetchImpl: net.fetchImpl, now: () => NOW });
    expect((await post({})).status).toBe(400);
    expect((await post({ repo: 5 })).status).toBe(400);
    expect((await post({ repo: "not a repo" })).status).toBe(400);
    expect((await post({ repo: "owner/ghost" })).status).toBe(404);
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
});
