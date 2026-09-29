import { describe, it, expect } from "vitest";
import { runChecks } from "./checks.js";

const ENDPOINT = "https://mcp.example.com/sse";

describe("runChecks: auth-signal-on-plain-get", () => {
  it("passes when the endpoint challenges a bare GET with 401", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response("unauthorized", { status: 401 })) as typeof fetch,
    });
    expect(result.checksPerformed).toEqual(["auth-signal-on-plain-get"]);
    expect(result.outcome).toBe("passed");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ outcome: "passed", status: 401 });
  });

  it("passes when the endpoint challenges a bare GET with 403", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response("forbidden", { status: 403 })) as typeof fetch,
    });
    expect(result.outcome).toBe("passed");
    expect(result.findings[0]?.status).toBe(403);
  });

  it("fails when the endpoint's own body explicitly admits no authentication is required", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () =>
        new Response("Welcome! No authentication required to use this endpoint.", { status: 200 })) as typeof fetch,
    });
    expect(result.outcome).toBe("failed");
    expect(result.findings[0]?.detail).toContain("no authentication required");
  });

  it("matches an explicit no-auth admission case-insensitively", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response("NO AUTH REQUIRED", { status: 200 })) as typeof fetch,
    });
    expect(result.outcome).toBe("failed");
  });

  it("is inconclusive on an ordinary 200 with no challenge and no explicit admission", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response("<html>Hello, world</html>", { status: 200 })) as typeof fetch,
    });
    expect(result.outcome).toBe("inconclusive");
    expect(result.findings[0]?.status).toBe(200);
  });

  it("is inconclusive, never failed, on an unrelated non-2xx status such as 500", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response("internal error", { status: 500 })) as typeof fetch,
    });
    expect(result.outcome).toBe("inconclusive");
  });

  it("is inconclusive with a clear reason on a network failure, and never throws", async () => {
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }) as typeof fetch,
    });
    expect(result.outcome).toBe("inconclusive");
    expect(result.findings[0]?.detail).toContain("GET failed before any response was received");
    expect(result.findings[0]?.detail).toContain("ENOTFOUND");
  });

  it("is inconclusive with a clear reason when the body cannot be read, and never throws", async () => {
    const brokenStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("stream exploded"));
      },
    });
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response(brokenStream, { status: 200 })) as typeof fetch,
    });
    expect(result.outcome).toBe("inconclusive");
    expect(result.findings[0]?.detail).toContain("body could not be read");
  });

  it("never sends anything but a plain GET, and never sends credentials", async () => {
    let seenMethod = "";
    let seenHasBody = false;
    await runChecks(ENDPOINT, {
      fetchImpl: (async (_input: unknown, init?: RequestInit) => {
        seenMethod = init?.method ?? "";
        seenHasBody = init?.body !== undefined;
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    expect(seenMethod).toBe("GET");
    expect(seenHasBody).toBe(false);
  });

  it("truncates an oversized body instead of throwing or hanging", async () => {
    const huge = "x".repeat(50_000) + "no authentication required";
    const result = await runChecks(ENDPOINT, {
      fetchImpl: (async () => new Response(huge, { status: 200 })) as typeof fetch,
    });
    // The admission phrase sits past the truncation bound, so it must NOT be found — proves the bound is real, not just documented.
    expect(result.outcome).toBe("inconclusive");
  });

  it("respects an injected timeout instead of hanging on a stalled response", async () => {
    const result = await runChecks(ENDPOINT, {
      timeoutMs: 30,
      fetchImpl: (async (_input: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }) as typeof fetch,
    });
    expect(result.outcome).toBe("inconclusive");
  });
});
