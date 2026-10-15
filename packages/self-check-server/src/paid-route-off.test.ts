// paid-route-off.test.ts — an unconfigured server is not a shop.
//
// The paid route is mounted only when a seller is configured. If that gate ever
// inverts, the live API would start answering 402 to callers who never agreed to
// pay anything, on a route whose payment could not be settled. So the absence is
// asserted rather than assumed.
//
// Same harness as app.test.ts: a real listening server, no real DNS or outbound
// fetch, and no payment middleware constructed at all.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";

let server: Server;
let baseUrl: string;

beforeEach(
  () =>
    new Promise<void>((resolve) => {
      const app = createApp({ identity: createAttesterIdentity(), seller: null });
      server = createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    }),
);

afterEach(() => {
  server?.close();
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("with no seller configured", () => {
  it("does not mount the paid route at all", async () => {
    const res = await post("/api/paid/verify-ownership", {
      endpoint: "https://mcp.example.com/sse",
      ownerAddress: "0x" + "11".repeat(20),
      method: "dns-txt",
    });
    expect(res.status).toBe(404);
  });

  it("never answers 402 on any route", async () => {
    for (const path of ["/api/challenge", "/api/verify-ownership", "/api/paid/verify-ownership"]) {
      const res = await post(path, {});
      expect(res.status).not.toBe(402);
    }
  });

  it("leaves the free routes exactly as they were", async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    // A bad body still gets our own 400, not a payment error from middleware
    // that should not be mounted.
    const bad = await post("/api/verify-ownership", {});
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { ok: boolean }).ok).toBe(false);
  });
});
