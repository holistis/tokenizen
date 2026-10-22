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
    // ADVERSARIAL PROBE (not a real facilitator): /verify always says the
    // payment is good, /settle always says it failed. A real facilitator
    // would never behave this way for a genuinely bad payment, but THIS
    // exact sequence — verify passes, settlement later fails — is exactly
    // what happens for a real payer with insufficient funds, a reused/
    // already-spent authorization, or a dropped settlement transaction. The
    // question this answers: does record_delivery() run (write to the
    // ledger) before that failure is known?
    if (req.url === "/verify" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ isValid: true }));
      return;
    }
    if (req.url === "/settle" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, errorReason: "insufficient_funds" }));
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
  process.env.CAPACITY_ATTEST_BAZAAR = "1";

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
  delete process.env.CAPACITY_ATTEST_BAZAAR;
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

  it(
    "the payment-required response actually validates against @x402/core's REAL client-side PaymentRequiredSchema",
    async () => {
      // Found 2026-10-22: this file's own serviceName was 53 characters.
      // @x402/core's ResourceInfoSchema caps it at 32, so EVERY spec-
      // compliant client's PaymentRequiredSchema.safeParse() silently
      // failed on our response — paymentMade stayed false, with no error at
      // all, for every real caller, not a flaky edge case. The two tests
      // above only check that OUR OWN server emits a 402-shaped object;
      // they would have passed unchanged with the 53-character string that
      // caused this. This test closes that gap by running our response
      // through the REAL client-side parser, not a hand-rolled shape check.
      const { parsePaymentRequired } = await import("@x402/core/schemas");
      const res = await postMcp({
        jsonrpc: "2.0",
        id: 3,
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
      const match = text.match(/"text":"((?:[^"\\]|\\.)*)"/);
      if (!match) throw new Error(`no text content in MCP response: ${text}`);
      const paymentRequiredObject = JSON.parse(JSON.parse(`"${match[1]}"`));
      const parsed = parsePaymentRequired(paymentRequiredObject);
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues)).toBe(true);
    },
  );

  it(
    "with CAPACITY_ATTEST_BAZAAR=1, the real 402 carries a valid bazaar discovery declaration",
    async () => {
      // Confirms the WIRING, not just the declare function in isolation
      // (bazaar-discovery.test.ts already covers that): this is exactly the
      // failure mode self-check-server's own x402-seller.ts warns about —
      // a declaration that looks right by itself but never reaches the real
      // served response because .registerExtension() was never called.
      const { validateDiscoveryExtension } = await import("@x402/extensions/bazaar");
      const res = await postMcp({
        jsonrpc: "2.0",
        id: 4,
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
      const match = text.match(/"text":"((?:[^"\\]|\\.)*)"/);
      if (!match) throw new Error(`no text content in MCP response: ${text}`);
      const paymentRequiredObject = JSON.parse(JSON.parse(`"${match[1]}"`)) as { extensions?: { bazaar?: unknown } };
      const bazaar = paymentRequiredObject.extensions?.bazaar;
      expect(bazaar, "extensions.bazaar missing from the real served 402 — registerExtension() wiring gap").toBeTruthy();
      const result = validateDiscoveryExtension(bazaar as never);
      expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    },
  );

  it(
    "the pre-payment tool handler must never itself call recordDelivery/appendClaim — only hooks.onAfterSettlement may",
    async () => {
      // WHY A SOURCE-STRUCTURE CHECK, NOT A FULL FACILITATOR ROUND-TRIP: an
      // earlier version of this test tried to adversarially prove the same
      // property end-to-end (build a real EIP-712 payload against a fake
      // facilitator whose /verify passes and /settle fails, then assert the
      // ledger stayed empty). That attempt is what FOUND the real bug this
      // file now fixes — @x402/core's default "authorization" payment flow
      // for EIP-3009/"exact" runs the tool handler BEFORE settlement, so a
      // handler that appended directly wrote to the ledger on a payment that
      // never actually cleared. Getting that adversarial test's hand-built
      // payment payload to pass @x402/core's strict deep-equal requirements
      // matcher proved too brittle to keep as a maintained regression test
      // (three attempts, three different internal-shape mismatches, none of
      // them about the property under test). This check guards the same
      // property a cheaper, more robust way: by construction, the only code
      // path that can reach appendClaim() is the one gated behind a
      // CONFIRMED settlement, because that is literally the only place the
      // source calls it.
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const source = readFileSync(fileURLToPath(new URL("./http-server.ts", import.meta.url)), "utf-8");

      const hooksStart = source.indexOf("onAfterSettlement:");
      expect(hooksStart, "onAfterSettlement hook must exist in http-server.ts").toBeGreaterThan(-1);
      const hooksEnd = source.indexOf("},", hooksStart);
      const hookBody = source.slice(hooksStart, hooksEnd);
      expect(hookBody).toContain("recordDelivery(");

      const handlerStart = source.indexOf("recordDeliveryPaid(async");
      expect(handlerStart, "the record_delivery tool handler must exist").toBeGreaterThan(-1);
      const handlerEnd = source.indexOf("}),", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);
      expect(handlerBody, "the handler must still validate (fail fast before payment)").toContain("verifyClaim(");
      expect(handlerBody, "the handler must NOT itself call recordDelivery — that would write before settlement is confirmed").not.toContain(
        "recordDelivery(",
      );
      expect(handlerBody, "the handler must NOT itself call appendClaim").not.toContain("appendClaim(");
    },
  );
});
