// http-server-record-delivery.test.ts — exercises http-server.ts's OTHER
// branch: RECORD_DELIVERY_PAY_TO set, record_delivery registered. Separate
// file, not a second describe block in http-server.test.ts, because that
// module reads its env vars once at import time (the facilitator handshake
// is built ONCE, not per-request — see http-server.ts's own comment on
// `recordDeliveryPaid`), so testing both branches needs two fresh module
// instances, not one shared import.
//
// No live network call: a tiny local HTTP server stands in for the x402
// facilitator, just enough of its contract (GET /supported) for
// resourceServer.initialize() to succeed — same "injectable fake, no network
// dependency in CI" discipline as this package's ERC-8004 tests
// (ReputationContractFactory) and discovery.fuzz.test.ts's seeded PRNG.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";

let fakeFacilitator: Server;
let facilitatorUrl: string;
let appServer: Server;
let baseUrl: string;

const FAKE_PAY_TO = "0x1111111111111111111111111111111111111111";

beforeAll(async () => {
  // Minimal facilitator: /supported must list our scheme+network for
  // resourceServer.initialize() to accept it. /verify and /settle are never
  // reached by the tests below (both only exercise the NO-payment path,
  // which createPaymentWrapper short-circuits before calling the
  // facilitator at all), so they stay unimplemented on purpose — reaching
  // them would itself be a test failure, not something to stub around.
  fakeFacilitator = createHttpServer((req, res) => {
    if (req.url === "/supported" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
        }),
      );
      return;
    }
    res.writeHead(501, { "content-type": "application/json" }).end(JSON.stringify({ error: "not implemented in fake" }));
  });
  fakeFacilitator.listen(0, "127.0.0.1");
  await once(fakeFacilitator, "listening");
  const facAddr = fakeFacilitator.address();
  if (!facAddr || typeof facAddr === "string") throw new Error("expected a real port");
  facilitatorUrl = `http://127.0.0.1:${facAddr.port}`;

  process.env.RECORD_DELIVERY_PAY_TO = FAKE_PAY_TO;
  process.env.RECORD_DELIVERY_FACILITATOR_URL = facilitatorUrl;
  process.env.RECORD_DELIVERY_PRICE = "$0.01";

  vi.resetModules();
  const { createApp } = await import("./http-server.js");
  appServer = createHttpServer(createApp());
  appServer.listen(0, "127.0.0.1");
  await once(appServer, "listening");
  const appAddr = appServer.address();
  if (!appAddr || typeof appAddr === "string") throw new Error("expected a real port");
  baseUrl = `http://127.0.0.1:${appAddr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => appServer.close(() => resolve()));
  await new Promise<void>((resolve) => fakeFacilitator.close(() => resolve()));
  delete process.env.RECORD_DELIVERY_PAY_TO;
  delete process.env.RECORD_DELIVERY_FACILITATOR_URL;
  delete process.env.RECORD_DELIVERY_PRICE;
});

async function postMcp(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
}

describe("http-server: record_delivery registered when RECORD_DELIVERY_PAY_TO is set", () => {
  it("lists record_delivery alongside the two read-only tools", async () => {
    const listRes = await postMcp({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const text = await listRes.text();
    const names = [...text.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toContain("get_delivery_history");
    expect(names).toContain("resolve_agent_identity");
    expect(names).toContain("record_delivery");
  });

  it("refuses an unpaid record_delivery call with a payment-required result, not a silent write", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "record_delivery",
        arguments: {
          sellerAddress: "0x0000000000000000000000000000000000000000",
          buyerAddress: "0x0000000000000000000000000000000000000000",
          assetType: "api-credits",
          promisedSpec: "test",
          delivered: "yes",
          evidenceHash: "0".repeat(64),
          settlementRef: "test-ref",
          timestamp: new Date(0).toISOString(),
          claimId: `0x${"0".repeat(64)}`,
          signature: `0x${"0".repeat(130)}`,
        },
      },
    });
    const text = await res.text();
    // The exact wording isn't the contract here, only that payment is
    // demanded and FAKE_PAY_TO — the configured recipient — appears in the
    // demand, proving this call reached the real payment wrapper this file
    // wires up rather than, say, falling through to a generic 404/500.
    expect(text.toLowerCase()).toContain("payment");
    expect(text).toContain(FAKE_PAY_TO);
  });
});
