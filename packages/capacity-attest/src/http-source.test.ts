import { describe, it, expect } from "vitest";
import { httpClaimSource, HttpSourceError } from "./http-source.js";
import { discoverDeliveryHistory } from "./discovery.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";
import type { DeliveryClaim } from "./schema.js";

const SELLER = "0x00000000000000000000000000000000000000aa";

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, statusText: init.statusText ?? "OK" });
}

describe("httpClaimSource + discovery (offline, injected fetch)", () => {
  it("surfaces a genuine claim from a real HTTP response and rejects a tampered one, same as any other source", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "10".repeat(32) });
    const tampered = { ...genuine, delivered: "no" as const }; // claimId no longer matches content

    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => jsonResponse([genuine, tampered]),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);

    expect(r.count).toBe(1);
    expect(r.claims[0]?.claimId).toBe(genuine.claimId);
    expect(r.sources[0]?.accepted).toBe(1);
    expect(r.sources[0]?.rejected).toBe(1);
  });

  it("builds the request URL with the seller address as a query parameter", async () => {
    let seenUrl: string | undefined;
    const source = httpClaimSource("https://example.invalid/claims?existing=1", {
      fetchImpl: async (input) => {
        seenUrl = String(input);
        return jsonResponse([]);
      },
    });
    await source.fetchForSeller(SELLER);
    expect(seenUrl).toContain("existing=1");
    expect(seenUrl).toContain(`seller=${SELLER}`);
  });

  it("a non-2xx status becomes a per-source error via discoverDeliveryHistory, not a crash", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => jsonResponse({ error: "nope" }, { status: 503, statusText: "Service Unavailable" }),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);
    expect(r.sources[0]?.error).toMatch(/503/);
    expect(r.count).toBe(0);
  });

  it("a body that is not valid JSON becomes a per-source error", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => new Response("not json{{{", { status: 200 }),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);
    expect(r.sources[0]?.error).toMatch(/not valid JSON/);
  });

  it("valid JSON that is not an array becomes a per-source error", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => jsonResponse({ claims: [] }),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);
    expect(r.sources[0]?.error).toMatch(/not an array/);
  });

  it("a response over the byte cap is refused BEFORE JSON.parse, not after (message check)", async () => {
    const hostile = "[" + "1,".repeat(100) + "1]"; // valid JSON array, > 50 bytes
    const source = httpClaimSource("https://example.invalid/claims", {
      maxResponseBytes: 50,
      fetchImpl: async () => new Response(hostile, { status: 200 }),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);
    expect(r.sources[0]?.error).toMatch(/exceeded 50 bytes/);
  });

  it("refuses an over-cap response WITHOUT draining the stream, and cancels it (proves the streaming mechanism, not just the error text)", async () => {
    // A stream that enqueues one over-cap chunk and then never closes or
    // enqueues again. A naive "buffer the whole body first" implementation
    // (e.g. `await response.text()`) would hang past the timing bound below
    // waiting for the stream to end; only a genuinely streaming, checks-as-
    // it-goes reader can reject promptly without ever seeing `done: true`.
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1,".repeat(30))); // 60 bytes > 50
      },
      cancel() {
        cancelled = true;
      },
    });
    const source = httpClaimSource("https://example.invalid/claims", {
      maxResponseBytes: 50,
      fetchImpl: async () => new Response(stream, { status: 200 }),
    });

    const t0 = performance.now();
    await expect(source.fetchForSeller(SELLER)).rejects.toThrow(/exceeded 50 bytes/);
    expect(performance.now() - t0).toBeLessThan(2_000); // did not wait for the stream to finish/hang
    expect(cancelled).toBe(true); // the promised reader.cancel() actually ran
  });

  it("a response of exactly maxResponseBytes is accepted, not refused (boundary is > , not >=)", async () => {
    const body = "[]"; // 2 bytes, valid empty JSON array
    const source = httpClaimSource("https://example.invalid/claims", {
      maxResponseBytes: Buffer.byteLength(body),
      fetchImpl: async () => new Response(body, { status: 200 }),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);
    expect(r.sources[0]?.error).toBeUndefined();
    expect(r.count).toBe(0);
  });

  it("a response with a null body (e.g. a 204-style empty response) hits the empty-string fallback and becomes a clean per-source JSON error", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => new Response(null, { status: 200 }),
    });
    const r = await discoverDeliveryHistory(SELLER, [source]);
    expect(r.sources[0]?.error).toMatch(/not valid JSON/);
  });

  it("a request that never resolves is bounded by the source's own timeoutMs, not left hanging", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      timeoutMs: 30,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const t0 = performance.now();
    await expect(source.fetchForSeller(SELLER)).rejects.toThrow(HttpSourceError);
    expect(performance.now() - t0).toBeLessThan(2_000);
  });

  it("a stall DURING body streaming (headers already arrived) also becomes HttpSourceError, not a raw abort exception", async () => {
    // Distinct code path from the test above: there the fetch() call itself
    // never resolves. Here fetch() resolves normally with a 200 and headers,
    // but the body stream then never closes -- in REAL fetch/undici, the same
    // AbortSignal that was passed to fetchImpl also governs the body read
    // (per the Fetch Standard), so a pending reader.read() rejects once the
    // signal fires. A plain hand-built Response/ReadableStream has no such
    // wiring by itself, so this fixture wires it explicitly (controller.error
    // on abort) to faithfully reproduce what a real fetch does, rather than
    // accidentally testing an unrelated "stream just never resolves" case.
    const source = httpClaimSource("https://example.invalid/claims", {
      timeoutMs: 30,
      fetchImpl: async (_input, init) => {
        const signal = (init as RequestInit).signal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener("abort", () => controller.error(signal.reason));
          },
        });
        return new Response(stream, { status: 200 });
      },
    });
    const t0 = performance.now();
    await expect(source.fetchForSeller(SELLER)).rejects.toThrow(HttpSourceError);
    expect(performance.now() - t0).toBeLessThan(2_000);
  });

  it("a generic (non-timeout) network failure is wrapped into an informative HttpSourceError", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND example.invalid");
      },
    });
    await expect(source.fetchForSeller(SELLER)).rejects.toThrow(/failed: getaddrinfo ENOTFOUND/);
  });

  it("refuses to build a URL from a malformed sellerAddress, without making a network call", async () => {
    let called = false;
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: async () => {
        called = true;
        return jsonResponse([]);
      },
    });
    await expect(source.fetchForSeller("not-an-address; DROP TABLE claims")).rejects.toThrow(HttpSourceError);
    expect(called).toBe(false);
  });

  it("composes with a second, different-type source in one discoverDeliveryHistory call (the whole point of this source)", async () => {
    const buyer = testWallet();
    const fromHttp = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "11".repeat(32) });
    const fromStatic: DeliveryClaim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "12".repeat(32) });

    const http = httpClaimSource("https://example.invalid/claims", { name: "custom-http", fetchImpl: async () => jsonResponse([fromHttp]) });
    const { staticSource } = await import("./discovery.js");
    const r = await discoverDeliveryHistory(SELLER, [http, staticSource("static", [fromStatic])]);

    expect(r.count).toBe(2);
    // Assert by name, not just array index, so a name-drop regression (opts.name
    // silently ignored) or a source-ordering change would both be caught.
    expect(r.sources.find((s) => s.name === "custom-http")?.accepted).toBe(1);
    expect(r.sources.find((s) => s.name === "static")?.accepted).toBe(1);
  });

  it("a custom name propagates to the SourceReport; the default is 'http' when omitted", async () => {
    const named = httpClaimSource("https://example.invalid/claims", { name: "custom-http", fetchImpl: async () => jsonResponse([]) });
    expect(named.name).toBe("custom-http");
    const r = await discoverDeliveryHistory(SELLER, [named]);
    expect(r.sources[0]?.name).toBe("custom-http");

    const defaultNamed = httpClaimSource("https://example.invalid/claims", { fetchImpl: async () => jsonResponse([]) });
    expect(defaultNamed.name).toBe("http");
  });
});
