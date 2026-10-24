// x402-check.test.ts — the live check, with the network replaced by a fake that plays the part
// of net-guard's guardedFetch. Nothing here touches a real host. The two things a fake cannot
// prove (that net-guard really pins IPs, that a real v2 seller answers like this) are covered by
// net-guard's own tests and by the live probe recorded in the pull request.

import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsafeHostError } from "tokenizen-net-guard";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";
import { createX402Checker, makeSafeFetch, measureEndpoint, normaliseTarget } from "./x402-check.js";

const PUBLIC_DNS = { dnsLookupAll: async () => [{ address: "93.184.216.34", family: 4 as const }] };
const URL_OK = "https://seller.example.com/api/route";

function requirements(overrides: { serviceName?: string; extensions?: unknown } = {}) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: URL_OK, description: "a route", mimeType: "application/json", serviceName: overrides.serviceName ?? "test:route" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "50000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0xF2b3679bE59ADaC8981A2b4095ff772736120339",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
    ...(overrides.extensions ? { extensions: overrides.extensions } : {}),
  };
}

/** A v2 seller: requirements in the Payment-Required header, body {}. The shape the old body-only reading called broken. */
const headerSeller = (obj: unknown = requirements()) =>
  new Response("{}", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(obj)).toString("base64"), "content-type": "application/json" } });
const bodySeller = (obj: unknown) => new Response(JSON.stringify(obj), { status: 402, headers: { "content-type": "application/json" } });

type Call = { url: string; method: string; redirect: string | undefined };
function fakeNetwork(handler: (url: string, init: RequestInit | undefined, calls: Call[]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: String(init?.method ?? "GET"), redirect: init?.redirect });
    return handler(String(input), init, calls);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const limits = { endpointHost: "seller.example.com", maxRequests: 6, maxBodyBytes: 64 * 1024, maxRedirects: 2, deadlineAt: Number.MAX_SAFE_INTEGER, now: () => 0 };

describe("normaliseTarget", () => {
  it("accepts an https URL, drops the fragment, keeps path and query", () => {
    const r = normaliseTarget("https://api.example.com/v1/x?y=1#frag");
    expect(r).toEqual({ ok: true, url: "https://api.example.com/v1/x?y=1", host: "api.example.com" });
  });

  it("adds https to a bare host", () => {
    const r = normaliseTarget("  api.example.com/path ");
    expect(r.ok && r.url).toBe("https://api.example.com/path");
  });

  it.each([
    ["http scheme", "http://api.example.com/x"],
    ["credentials", "https://user:pw@api.example.com/x"],
    ["non-standard port", "https://api.example.com:8443/x"],
    ["ipv4 literal", "https://93.184.216.34/x"],
    ["ipv6 literal", "https://[::1]/x"],
    ["localhost", "https://localhost/x"],
    ["internal suffix", "https://db.internal/x"],
    ["single-word host", "https://intranet/x"],
    ["other scheme", "ftp://api.example.com/x"],
    ["empty", ""],
    ["too long", "https://api.example.com/" + "a".repeat(3000)],
  ])("rejects %s", (_name, input) => {
    expect(normaliseTarget(input).ok).toBe(false);
  });

  it("rejects a value that is not a string", () => {
    expect(normaliseTarget(42).ok).toBe(false);
    expect(normaliseTarget(null).ok).toBe(false);
  });
});

describe("makeSafeFetch", () => {
  it("only lets GET and POST through", async () => {
    const net = fakeNetwork(() => new Response("{}"));
    const { fetchImpl } = makeSafeFetch(net.fetchImpl, limits);
    await expect(fetchImpl(URL_OK, { method: "DELETE" })).rejects.toThrow("only GET and POST");
    await expect(fetchImpl(URL_OK, { method: "PUT" })).rejects.toThrow("only GET and POST");
    expect(net.calls).toHaveLength(0);
  });

  it("always asks the layer below not to follow redirects itself", async () => {
    const net = fakeNetwork(() => new Response("{}"));
    await makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK);
    expect(net.calls[0]?.redirect).toBe("manual");
  });

  it("refuses a body larger than the cap instead of reading it", async () => {
    const net = fakeNetwork(() => new Response(new Uint8Array(100 * 1024)));
    await expect(makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK)).rejects.toThrow("larger than 64 KB");
  });

  it("returns a body that can be read twice", async () => {
    const net = fakeNetwork(() => new Response('{"a":1}', { status: 402 }));
    const res = await makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK);
    expect(res.status).toBe(402);
    expect(await res.clone().text()).toBe('{"a":1}');
    expect(await res.text()).toBe('{"a":1}');
  });

  it("follows a redirect to another https URL and turns POST into GET on a 302", async () => {
    const net = fakeNetwork((url) =>
      url === URL_OK ? new Response(null, { status: 302, headers: { location: "https://www.seller.example.com/api/route" } }) : new Response("ok"),
    );
    const res = await makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK, { method: "POST", body: "{}" });
    expect(await res.text()).toBe("ok");
    expect(net.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${URL_OK}`, "GET https://www.seller.example.com/api/route"]);
  });

  it("keeps POST on a 307", async () => {
    const net = fakeNetwork((url) =>
      url === URL_OK ? new Response(null, { status: 307, headers: { location: "/other" } }) : new Response("ok"),
    );
    await makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK, { method: "POST", body: "{}" });
    expect(net.calls[1]).toMatchObject({ method: "POST", url: "https://seller.example.com/other" });
  });

  it.each([
    ["an http target", "http://seller.example.com/x"],
    ["a non-standard port", "https://seller.example.com:8443/x"],
    ["an internal-looking host", "https://db.internal/x"],
    ["an ip literal", "https://169.254.169.254/latest/meta-data"],
    ["another host, with a path and query of the remote party's choosing", "https://victim.example.org/hook?token=1"],
  ])("refuses a redirect to %s without dialing it", async (_name, target) => {
    const net = fakeNetwork(() => new Response(null, { status: 302, headers: { location: target } }));
    await expect(makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK)).rejects.toThrow("not permitted");
    expect(net.calls).toHaveLength(1);
  });

  it("lets a redirect go from the apex to its www sibling and back", async () => {
    const net = fakeNetwork((url) =>
      url === URL_OK ? new Response(null, { status: 308, headers: { location: "https://www.seller.example.com/api/route" } }) : new Response("ok"),
    );
    await makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK);
    const back = fakeNetwork((url) =>
      url.startsWith("https://www.") ? new Response(null, { status: 308, headers: { location: "https://seller.example.com/api/route" } }) : new Response("ok"),
    );
    await makeSafeFetch(back.fetchImpl, limits).fetchImpl("https://www.seller.example.com/api/route");
    expect(net.calls).toHaveLength(2);
    expect(back.calls).toHaveLength(2);
  });

  describe("another host than the pasted one (the DID document the remote party names)", () => {
    const run = (target: string, init?: RequestInit) => {
      const net = fakeNetwork(() => new Response("{}", { status: 200 }));
      return { net, result: makeSafeFetch(net.fetchImpl, limits).fetchImpl(target, init) };
    };

    it("may be asked for the fixed well-known file and nothing else", async () => {
      const ok = run("https://keys.example.org/.well-known/did.json");
      await ok.result;
      expect(ok.net.calls).toHaveLength(1);
      for (const target of [
        "https://keys.example.org/admin/users/1/delete/did.json",
        "https://keys.example.org/.well-known/did.json?confirm=1",
        "https://keys.example.org/.well-known/other.json",
      ]) {
        const refused = run(target);
        await expect(refused.result).rejects.toThrow("not permitted");
        expect(refused.net.calls).toHaveLength(0);
      }
    });

    it("is never asked with POST", async () => {
      const refused = run("https://keys.example.org/.well-known/did.json", { method: "POST", body: "{}" });
      await expect(refused.result).rejects.toThrow("not permitted");
    });

    it("on the pasted host may use the path a did:web with segments names", async () => {
      const ok = run("https://seller.example.com/keys/1/did.json");
      await ok.result;
      expect(ok.net.calls).toHaveLength(1);
    });
  });

  describe("a DID document", () => {
    const DID = "https://seller.example.com/.well-known/did.json";

    it("is refused with fixed words when it is not JSON, so none of its text reaches the answer", async () => {
      const net = fakeNetwork(() => new Response("SECRET-INTERNAL-BODY not json", { status: 200 }));
      const failure = await makeSafeFetch(net.fetchImpl, limits).fetchImpl(DID).catch((e: Error) => e);
      expect((failure as Error).message).toBe("the DID document is not valid JSON");
    });

    it("is refused above 8 KB, which also bounds the cost of decoding its key", async () => {
      const net = fakeNetwork(() => new Response("{" + " ".repeat(9 * 1024) + "}", { status: 200 }));
      await expect(makeSafeFetch(net.fetchImpl, limits).fetchImpl(DID)).rejects.toThrow("larger than 8 KB");
    });

    it("keeps a 404 as a 404, so the library can say what it found", async () => {
      const net = fakeNetwork(() => new Response("not here", { status: 404 }));
      const res = await makeSafeFetch(net.fetchImpl, limits).fetchImpl(DID);
      expect(res.status).toBe(404);
    });
  });

  it("refuses an HTTP status that is not a real answer instead of failing on constructing it", async () => {
    const odd = { status: 999, statusText: "", headers: new Headers(), body: null } as unknown as Response;
    const net = fakeNetwork(() => odd);
    await expect(makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK)).rejects.toThrow("unusable HTTP status");
  });

  it("hands the layer below a signal that follows the deadline", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const net = fakeNetwork((_url, init) => {
      seen = init?.signal ?? undefined;
      return new Response("{}");
    });
    await makeSafeFetch(net.fetchImpl, { ...limits, signal: controller.signal }).fetchImpl(URL_OK);
    expect(seen?.aborted).toBe(false);
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });

  it("stops after two redirects", async () => {
    const net = fakeNetwork((_url, _init, calls) => new Response(null, { status: 302, headers: { location: `https://seller.example.com/hop${calls.length}` } }));
    await expect(makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK)).rejects.toThrow("too many redirects");
    expect(net.calls).toHaveLength(3);
  });

  it("refuses every redirect when the caller asked for redirect: error", async () => {
    const net = fakeNetwork(() => new Response(null, { status: 302, headers: { location: "https://seller.example.com/x" } }));
    await expect(makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK, { redirect: "error" })).rejects.toThrow("redirect was refused");
    expect(net.calls).toHaveLength(1);
  });

  it("enforces the request budget", async () => {
    const net = fakeNetwork(() => new Response("{}"));
    const { fetchImpl } = makeSafeFetch(net.fetchImpl, { ...limits, maxRequests: 2 });
    await fetchImpl(URL_OK);
    await fetchImpl(URL_OK);
    await expect(fetchImpl(URL_OK)).rejects.toThrow("budget");
    expect(net.calls).toHaveLength(2);
  });

  it("stops once the deadline has passed", async () => {
    let t = 0;
    const net = fakeNetwork(() => new Response("{}"));
    const { fetchImpl } = makeSafeFetch(net.fetchImpl, { ...limits, deadlineAt: 100, now: () => t });
    await fetchImpl(URL_OK);
    t = 101;
    await expect(fetchImpl(URL_OK)).rejects.toThrow("ran out of time");
  });

  it("never lets a resolved address out in an error message", async () => {
    const net = fakeNetwork(() => {
      throw new TypeError("fetch failed", { cause: new UnsafeHostError('"seller.example.com" resolves to 10.0.0.5, a private address', "seller.example.com") });
    });
    const failure = await makeSafeFetch(net.fetchImpl, limits).fetchImpl(URL_OK).catch((e: Error) => e);
    expect((failure as Error).message).toBe("the host is not publicly routable");
    expect((failure as Error).message).not.toContain("10.0.0.5");
  });
});

describe("measureEndpoint", () => {
  const deps = (net: ReturnType<typeof fakeNetwork>) => ({ base: net.fetchImpl, now: () => Date.UTC(2026, 9, 24, 12), deadlineMs: 5000 });

  it("passes a v2 seller that keeps its requirements in the header, with one request", async () => {
    const net = fakeNetwork(() => headerSeller());
    const r = await measureEndpoint(URL_OK, "POST", deps(net));
    expect(r.buyerCheck).toMatchObject({ status: "pass", source: "header", x402Version: 2, httpStatus: 402 });
    expect(r.ladder.levels[0]).toMatchObject({ level: 0, status: "pass" });
    expect(r.ladder.levels[1]).toMatchObject({ level: 1, status: "fail" });
    expect(r.ladder.highestLevel).toBe(0);
    expect(r.requestsMade).toBe(1);
    expect(r.summary).toContain("level 0");
    expect(r.measuredAt).toBe("2026-10-24T12:00:00.000Z");
  });

  it("passes a v1 seller that keeps its requirements in the body", async () => {
    const v1 = {
      x402Version: 1,
      error: "Payment required",
      accepts: [
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: "10000",
          resource: URL_OK,
          description: "a route",
          mimeType: "application/json",
          payTo: "0xF2b3679bE59ADaC8981A2b4095ff772736120339",
          maxTimeoutSeconds: 60,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
      ],
    };
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => bodySeller(v1))));
    expect(r.buyerCheck).toMatchObject({ status: "pass", source: "body", x402Version: 1 });
  });

  it("flags the serviceName that is too long for a real buyer client, while the ladder still sees a 402", async () => {
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => headerSeller(requirements({ serviceName: "x".repeat(53) })))));
    expect(r.buyerCheck.status).toBe("fail");
    expect(r.buyerCheck.problems.join(" ")).toContain("serviceName");
    expect(r.ladder.levels[0]?.status).toBe("pass");
    expect(r.summary).toContain("will not recognise");
  });

  it("says plainly when the URL does not answer 402", async () => {
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => new Response('{"ok":true}', { status: 200 }))));
    expect(r.ladder.levels[0]?.status).toBe("fail");
    expect(r.buyerCheck).toMatchObject({ status: "fail", httpStatus: 200 });
    expect(r.summary).toContain("does not ask for payment");
  });

  it("reports an unreachable host as not measured, not as failed", async () => {
    const net = fakeNetwork(() => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    });
    const r = await measureEndpoint(URL_OK, "POST", deps(net));
    expect(r.ladder.levels[0]?.status).toBe("not_measured");
    expect(r.buyerCheck.status).toBe("not_measured");
    expect(r.summary).toContain("Could not read an answer");
    expect(r.summary).toContain("refused");
  });

  it("retries with the method the endpoint names, and judges the buyer check on that answer", async () => {
    const net = fakeNetwork((_url, init) =>
      String(init?.method) === "POST" ? new Response("", { status: 405, headers: { allow: "GET" } }) : headerSeller(),
    );
    const r = await measureEndpoint(URL_OK, "POST", deps(net));
    expect(r.ladder.methodRetried).toEqual({ from: "POST", to: "GET", firstStatus: 405 });
    expect(r.requestsMade).toBe(2);
    expect(r.buyerCheck.status).toBe("pass");
  });

  it("does not read a response larger than 64 KB", async () => {
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => new Response(new Uint8Array(100 * 1024), { status: 402 }))));
    expect(r.ladder.levels[0]?.status).toBe("not_measured");
    expect(r.ladder.levels[0]?.evidence).toContain("64 KB");
  });

  it("strips control characters and cuts long text that came from the endpoint", async () => {
    const hostile = requirements();
    hostile.accepts[0]!.scheme = "exact\n\u0007" + "y".repeat(500);
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => headerSeller(hostile))));
    for (const level of r.ladder.levels) {
      expect(level.evidence).not.toMatch(/[\u0000-\u001f]/);
      expect(level.evidence.length).toBeLessThanOrEqual(200);
    }
    for (const problem of r.buyerCheck.problems) expect(problem.length).toBeLessThanOrEqual(200);
  });

  it("also strips characters that reorder or hide text, not only control characters", async () => {
    const hostile = requirements();
    hostile.accepts[0]!.scheme = "exact\u202Eevil\u200Bhidden\u2066x\uFEFF";
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => headerSeller(hostile))));
    const evidence = r.ladder.levels[0]!.evidence;
    expect(evidence).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/);
    expect(evidence).toContain("exact");
  });

  it("says the check stopped on our side, not that it timed out, when the library chokes on the answer", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const hostile = requirements();
      (hostile.accepts[0] as Record<string, unknown>).scheme = { toString: "not a function" };
      const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => headerSeller(hostile))));
      expect(r.summary).toContain("stop on our side");
      expect(r.summary).not.toContain("in time");
      for (const call of spy.mock.calls) expect(call.every((part) => typeof part === "string")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("closes its sockets when the deadline passes", async () => {
    let seen: AbortSignal | undefined;
    const net = fakeNetwork(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          seen = init?.signal ?? undefined;
          seen?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const r = await measureEndpoint(URL_OK, "POST", { base: net.fetchImpl, now: () => Date.now(), deadlineMs: 60 });
    expect(r.summary).toContain("did not finish in time");
    expect(seen?.aborted).toBe(true);
  });

  it("returns verdicts only: no raw headers or bodies of the endpoint", async () => {
    const r = await measureEndpoint(URL_OK, "POST", deps(fakeNetwork(() => headerSeller())));
    const json = JSON.stringify(r);
    expect(json).not.toContain("rawPaymentRequired");
    expect(json).not.toContain("content-type");
    expect(json).not.toContain(Buffer.from(JSON.stringify(requirements())).toString("base64"));
  });

  // The hole this closes: the ladder resolves a did:web key from a kid the MEASURED party chose.
  // Before agent-receipt-verify passed its fetchImpl on, that request used the global fetch and
  // skipped every guard above it.
  describe("the did:web lookup that the measured party chooses", () => {
    const jws = (kid: string) => {
      const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
      return `${part({ alg: "EdDSA", kid })}.${part({ version: 1 })}.${Buffer.from("not a real signature").toString("base64url")}`;
    };
    const sellerWith = (kid: string) =>
      headerSeller(requirements({ extensions: { "offer-receipt": { info: { offers: [{ format: "jws", signature: jws(kid) }] } } } }));

    it("goes through the injected fetch, never the global one", async () => {
      const net = fakeNetwork((url) => (url.endsWith("/did.json") ? new Response("{}", { status: 404 }) : sellerWith("did:web:keys.example.org#k1")));
      const realFetch = globalThis.fetch;
      let globalCalls = 0;
      globalThis.fetch = (async () => {
        globalCalls++;
        throw new Error("the global fetch must not be used");
      }) as typeof fetch;
      try {
        await measureEndpoint(URL_OK, "POST", deps(net));
      } finally {
        globalThis.fetch = realFetch;
      }
      expect(globalCalls).toBe(0);
      expect(net.calls.map((c) => c.url)).toContain("https://keys.example.org/.well-known/did.json");
    });

    it("is refused before dialing when the kid points at an internal-looking host", async () => {
      const net = fakeNetwork(() => sellerWith("did:web:db.internal#k1"));
      const r = await measureEndpoint(URL_OK, "POST", deps(net));
      expect(net.calls.map((c) => c.url)).toEqual([URL_OK]);
      expect(r.ladder.levels[2]?.status).toBe("not_measured");
      expect(r.ladder.levels[2]?.evidence).toContain("not permitted");
    });

    it("is refused when the kid names a path of the remote party's choosing on another host", async () => {
      const net = fakeNetwork(() => sellerWith("did:web:victim.example.org:admin:users:1#k1"));
      const r = await measureEndpoint(URL_OK, "POST", deps(net));
      expect(net.calls.map((c) => c.url)).toEqual([URL_OK]);
      expect(r.ladder.levels[2]?.evidence).toContain("not permitted");
    });

    it("never lets text from a DID document into the answer", async () => {
      const net = fakeNetwork((url) =>
        url.endsWith("/did.json") ? new Response("SECRET-INTERNAL-BODY is not json", { status: 200 }) : sellerWith("did:web:keys.example.org#k1"),
      );
      const r = await measureEndpoint(URL_OK, "POST", deps(net));
      expect(JSON.stringify(r)).not.toContain("SECRET-INTERNAL-BODY");
      expect(r.ladder.levels[2]?.evidence).toContain("not valid JSON");
    });

    it("is refused when the kid names a non-standard port", async () => {
      const net = fakeNetwork(() => sellerWith("did:web:keys.example.org%3A8443#k1"));
      await measureEndpoint(URL_OK, "POST", deps(net));
      expect(net.calls.map((c) => c.url)).toEqual([URL_OK]);
    });
  });
});

describe("createX402Checker", () => {
  const make = (extra: Parameters<typeof createX402Checker>[0] = {}) => {
    const net = fakeNetwork(() => headerSeller());
    let t = 1_000_000;
    const checker = createX402Checker({ fetchImpl: net.fetchImpl, routableHostDeps: PUBLIC_DNS, now: () => t, ...extra });
    return { net, checker, advance: (ms: number) => (t += ms) };
  };

  it("answers a repeat within the cache time from memory", async () => {
    const { net, checker } = make();
    const first = await checker.check(URL_OK);
    const second = await checker.check(URL_OK);
    expect(first).toMatchObject({ kind: "done", cached: false });
    expect(second).toMatchObject({ kind: "done", cached: true });
    expect(net.calls).toHaveLength(1);
  });

  it("measures again once the cache time has passed", async () => {
    const { net, checker, advance } = make({ cacheTtlMs: 1000 });
    await checker.check(URL_OK);
    advance(1001);
    expect(await checker.check(URL_OK)).toMatchObject({ cached: false });
    expect(net.calls).toHaveLength(2);
  });

  it("keeps GET and POST measurements apart", async () => {
    const { net, checker } = make();
    await checker.check(URL_OK, "POST");
    await checker.check(URL_OK, "GET");
    expect(net.calls).toHaveLength(2);
  });

  it("lets two identical requests in flight share one measurement", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const net = fakeNetwork(async () => {
      await gate;
      return headerSeller();
    });
    const checker = createX402Checker({ fetchImpl: net.fetchImpl, routableHostDeps: PUBLIC_DNS });
    const a = checker.check(URL_OK);
    const b = checker.check(URL_OK);
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.kind).toBe("done");
    expect(rb.kind).toBe("done");
    expect(net.calls).toHaveLength(1);
  });

  it("limits how often one host can be measured in an hour, per host and not per path", async () => {
    const { checker } = make({ hostMax: 2 });
    expect((await checker.check("https://seller.example.com/a")).kind).toBe("done");
    expect((await checker.check("https://seller.example.com/b")).kind).toBe("done");
    const third = await checker.check("https://seller.example.com/c");
    expect(third.kind).toBe("limited");
    if (third.kind === "limited") expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect((await checker.check("https://other.example.com/a")).kind).toBe("done");
  });

  it("frees a host again after the hour", async () => {
    const { checker, advance } = make({ hostMax: 1 });
    await checker.check("https://seller.example.com/a");
    expect((await checker.check("https://seller.example.com/b")).kind).toBe("limited");
    advance(60 * 60 * 1000 + 1);
    expect((await checker.check("https://seller.example.com/b")).kind).toBe("done");
  });

  it("limits the whole server per hour", async () => {
    const { checker } = make({ globalMax: 2 });
    await checker.check("https://a.example.com/x");
    await checker.check("https://b.example.com/x");
    expect((await checker.check("https://c.example.com/x")).kind).toBe("limited");
  });

  it("rejects a host that resolves to a private address, without saying where it resolves to and without using a slot", async () => {
    const net = fakeNetwork(() => headerSeller());
    const checker = createX402Checker({
      fetchImpl: net.fetchImpl,
      routableHostDeps: { dnsLookupAll: async () => [{ address: "10.0.0.5", family: 4 as const }] },
      hostMax: 1,
    });
    const first = await checker.check(URL_OK);
    const second = await checker.check(URL_OK);
    expect(first).toEqual({ kind: "invalid", error: "that host does not resolve to a public address" });
    expect(JSON.stringify(first)).not.toContain("10.0.0.5");
    expect(second.kind).toBe("invalid");
    expect(net.calls).toHaveLength(0);
  });

  it("turns away new checks while the busy limit is reached, and recovers", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const net = fakeNetwork(async () => {
      await gate;
      return headerSeller();
    });
    const checker = createX402Checker({ fetchImpl: net.fetchImpl, routableHostDeps: PUBLIC_DNS, maxConcurrent: 1 });
    const first = checker.check("https://a.example.com/x");
    const second = await checker.check("https://b.example.com/x");
    expect(second).toMatchObject({ kind: "limited", retryAfterSeconds: 5 });
    release();
    await first;
    expect((await checker.check("https://b.example.com/x")).kind).toBe("done");
  });

  it("rejects what normaliseTarget rejects", async () => {
    const { checker, net } = make();
    expect((await checker.check("http://seller.example.com/x")).kind).toBe("invalid");
    expect(net.calls).toHaveLength(0);
  });
});

describe("POST /api/x402/check", () => {
  let server: Server;
  let baseUrl: string;

  async function start(x402Check: Parameters<typeof createApp>[0] extends infer O ? (O extends { x402Check?: infer X } ? X : never) : never) {
    const app = createApp({ identity: createAttesterIdentity(), seller: null, routableHostDeps: PUBLIC_DNS, x402Check });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
  }
  const post = (body: unknown) =>
    fetch(`${baseUrl}/api/x402/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  afterEach(() => {
    server?.close();
  });

  it("returns the verdict as JSON, not cacheable, and nothing but the verdict", async () => {
    const net = fakeNetwork(() => headerSeller());
    await start({ fetchImpl: net.fetchImpl });
    const res = await post({ url: URL_OK });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, cached: false, method: "POST", buyerCheck: { status: "pass" } });
    expect(Object.keys(body).sort()).toEqual(["buyerCheck", "cached", "ladder", "limits", "measuredAt", "method", "ok", "requestsMade", "summary", "url"]);
  });

  it("answers 400 for a body without a url and for a URL that may not be checked", async () => {
    await start({ fetchImpl: fakeNetwork(() => headerSeller()).fetchImpl });
    expect((await post({})).status).toBe(400);
    expect((await post({ url: "http://seller.example.com/x" })).status).toBe(400);
    expect((await post({ url: URL_OK, method: "DELETE" })).status).toBe(400);
  });

  it("answers a malformed or oversized body as the caller's mistake and logs nothing of it", async () => {
    await start({ fetchImpl: fakeNetwork(() => headerSeller()).fetchImpl });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const broken = await fetch(`${baseUrl}/api/x402/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"url":"https://seller.example.com/?token=SECRET-IN-QUERY',
      });
      expect(broken.status).toBe(400);
      expect(await broken.json()).toEqual({ ok: false, error: "request could not be read" });
      const huge = await fetch(`${baseUrl}/api/x402/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://seller.example.com/" + "a".repeat(20_000) }),
      });
      expect(huge.status).toBe(413);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET-IN-QUERY");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("answers 429 with Retry-After once the per-IP limit is used", async () => {
    await start({ fetchImpl: fakeNetwork(() => headerSeller()).fetchImpl, rateLimit: { windowMs: 60_000, max: 2 } });
    expect((await post({ url: URL_OK })).status).toBe(200);
    expect((await post({ url: URL_OK })).status).toBe(200);
    const limited = await post({ url: URL_OK });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("answers 429 when one host has been measured too often", async () => {
    await start({ fetchImpl: fakeNetwork(() => headerSeller()).fetchImpl, hostMax: 1 });
    expect((await post({ url: "https://seller.example.com/a" })).status).toBe(200);
    const limited = await post({ url: "https://seller.example.com/b" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});
