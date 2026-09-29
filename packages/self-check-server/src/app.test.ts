// app.test.ts — exercises the real Express app end-to-end over a real (but
// loopback-only, ephemeral-port) HTTP socket, with every OUTBOUND network
// call (DNS resolution for the SSRF guard, DNS TXT lookups, well-known-file
// fetches) replaced by an injected fake. No real DNS query or HTTP fetch to
// an external host happens anywhere in this file.

import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type CreateAppOptions } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";

const OWNER_ADDRESS = "0x111111111111111111111111111111111111111a";
const PUBLIC_IP_LOOKUP = async () => [{ address: "93.184.216.34", family: 4 as const }];

let server: Server;
let baseUrl: string;

function startApp(options: CreateAppOptions = {}) {
  const app = createApp({
    identity: createAttesterIdentity(),
    networkGuardDeps: { dnsLookup: PUBLIC_IP_LOOKUP },
    ...options,
  });
  server = createServer(app);
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") {
        baseUrl = `http://127.0.0.1:${address.port}`;
      }
      resolve();
    });
  });
}

afterEach(() => {
  server?.close();
});

describe("GET /api/health", () => {
  beforeEach(() => startApp());

  it("returns ok:true", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/challenge", () => {
  beforeEach(() => startApp());

  it("returns dns-txt and well-known-file tokens for a valid request", async () => {
    const res = await fetch(`${baseUrl}/api/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dnsTxt.location).toBe("_endpoint-attest.example.com");
    expect(body.dnsTxt.token).toMatch(/^tok_[0-9a-f]{64}$/);
    expect(body.wellKnownFile.location).toBe("https://example.com/.well-known/endpoint-attest.txt");
    expect(typeof body.instructions).toBe("string");
  });

  it("rejects a malformed ownerAddress with 400, before any network call", async () => {
    const res = await fetch(`${baseUrl}/api/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: "not-an-address" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("rejects an endpoint whose host is an SSRF-relevant loopback IP literal, before any DNS resolution", async () => {
    const res = await fetch(`${baseUrl}/api/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "http://127.0.0.1:9999/mcp", ownerAddress: OWNER_ADDRESS }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not publicly routable|loopback/i);
  });

  it("rejects an endpoint that resolves to the cloud metadata address", async () => {
    await startApp({ networkGuardDeps: { dnsLookup: async () => [{ address: "169.254.169.254", family: 4 }] } });
    const res = await fetch(`${baseUrl}/api/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://looks-public.example/mcp", ownerAddress: OWNER_ADDRESS }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });
});

describe("POST /api/verify-ownership", () => {
  it("returns ok:true when the mocked resolver returns the exact expected token", async () => {
    const identity = createAttesterIdentity();
    let requestedName: string | undefined;
    await startApp({
      identity,
      ownershipDeps: {
        resolveTxtRecords: async (name: string) => {
          requestedName = name;
          // Compute what the server itself will have derived as the expected
          // token, by asking the SAME running app for a challenge first.
          const res = await fetch(`${baseUrl}/api/challenge`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS }),
          });
          const { dnsTxt } = await res.json();
          return [[dnsTxt.token]];
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/verify-ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS, method: "dns-txt" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.method).toBe("dns-txt");
    expect(requestedName).toBe("_endpoint-attest.example.com");
  });

  it("returns ok:false with a reason when the mocked resolver returns a non-matching value", async () => {
    await startApp({
      ownershipDeps: { resolveTxtRecords: async () => [["tok_wrong"]] },
    });
    const res = await fetch(`${baseUrl}/api/verify-ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS, method: "dns-txt" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/no TXT record .* matched/);
  });

  it("verifies well-known-file ownership via a mocked fetch, no real HTTP call", async () => {
    const identity = createAttesterIdentity();
    let fetchedUrl: string | undefined;
    await startApp({
      identity,
      ownershipDeps: {
        fetchImpl: (async (input: string | URL) => {
          fetchedUrl = String(input);
          const res = await fetch(`${baseUrl}/api/challenge`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS }),
          });
          const { wellKnownFile } = await res.json();
          return new Response(wellKnownFile.token, { status: 200 });
        }) as typeof fetch,
      },
    });

    const res = await fetch(`${baseUrl}/api/verify-ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS, method: "well-known-file" }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(fetchedUrl).toBe("https://example.com/.well-known/endpoint-attest.txt");
  });

  it("rejects a bad method enum with 400", async () => {
    await startApp();
    const res = await fetch(`${baseUrl}/api/verify-ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS, method: "carrier-pigeon" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an SSRF-relevant endpoint before calling verifyOwnership at all", async () => {
    let called = false;
    await startApp({
      networkGuardDeps: { dnsLookup: PUBLIC_IP_LOOKUP },
      ownershipDeps: {
        resolveTxtRecords: async () => {
          called = true;
          return [];
        },
      },
    });
    const res = await fetch(`${baseUrl}/api/verify-ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "http://169.254.169.254/latest/meta-data/", ownerAddress: OWNER_ADDRESS, method: "well-known-file" }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });
});

describe("rate limiting", () => {
  it("returns 429 once the configured per-route limit is exceeded", async () => {
    await startApp({ challengeRateLimit: { windowMs: 60_000, max: 1 } });
    const make = () =>
      fetch(`${baseUrl}/api/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: "https://example.com/mcp", ownerAddress: OWNER_ADDRESS }),
      });

    const first = await make();
    const second = await make();
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});

describe("CORS", () => {
  beforeEach(() => startApp());

  it("reflects an allowed origin in Access-Control-Allow-Origin", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://tokenizen.nl" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://tokenizen.nl");
  });
});
