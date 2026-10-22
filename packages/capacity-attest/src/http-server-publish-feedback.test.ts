// http-server-publish-feedback.test.ts — exercises http-server.ts's THIRD
// payment-gated branch: REPUTATION_PUBLISHER_PRIVATE_KEY +
// PUBLISH_FEEDBACK_PAY_TO set, publish_reputation_feedback registered. Same
// "separate file, fresh module instance" reasoning as
// http-server-record-delivery.test.ts: env vars are read once at import
// time, so testing this branch needs its own import, not a shared one.
//
// NO LIVE CHAIN, same discipline as the rest of this package: the fake
// facilitator below never reaches a real network, and this file deliberately
// does NOT attempt to drive a real settled payment through to
// publishReputationFeedback()'s own default contractFactory/identityResolver
// (that would need a fake JSON-RPC provider deep enough to satisfy
// ethers.Contract calls — exactly the kind of brittle, three-attempts-and-
// abandoned adversarial test http-server-record-delivery.test.ts's own
// comment already describes for a simpler case). Instead: real round trips
// for what can be checked WITHOUT ever reaching a chain call (tool listing,
// the unpaid-call refusal), a static source-structure check for the
// write-after-settlement property (same technique, same reasoning), and
// direct unit tests against the exported, pure cap functions — which is the
// exact logic that decides whether a real chain call is even attempted.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let fakeFacilitator: Server;
let facilitatorUrl: string;
let appServer: Server;
let baseUrl: string;

const FAKE_PAY_TO = "0x2222222222222222222222222222222222222222";
// A real, syntactically valid private key (test-only, holds and will ever hold zero funds) —
// new ethers.Wallet(key) at module load must succeed for this branch to even construct.
const TEST_PRIVATE_KEY = "0x" + "7a".repeat(32);

beforeAll(async () => {
  // Same minimal fake facilitator as http-server-record-delivery.test.ts:
  // /supported only. /verify and /settle are never reached by the tests
  // below (they only exercise the NO-payment path).
  fakeFacilitator = createHttpServer((req, res) => {
    if (req.url === "/supported" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }] }));
      return;
    }
    res.writeHead(501, { "content-type": "application/json" }).end(JSON.stringify({ error: "not implemented in fake" }));
  });
  fakeFacilitator.listen(0, "127.0.0.1");
  await once(fakeFacilitator, "listening");
  const facAddr = fakeFacilitator.address();
  if (!facAddr || typeof facAddr === "string") throw new Error("expected a real port");
  facilitatorUrl = `http://127.0.0.1:${facAddr.port}`;

  process.env.REPUTATION_PUBLISHER_PRIVATE_KEY = TEST_PRIVATE_KEY;
  process.env.PUBLISH_FEEDBACK_PAY_TO = FAKE_PAY_TO;
  process.env.PUBLISH_FEEDBACK_PRICE = "$0.05";
  process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR = "3";
  process.env.RECORD_DELIVERY_FACILITATOR_URL = facilitatorUrl;

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
  delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY;
  delete process.env.PUBLISH_FEEDBACK_PAY_TO;
  delete process.env.PUBLISH_FEEDBACK_PRICE;
  delete process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR;
  delete process.env.RECORD_DELIVERY_FACILITATOR_URL;
});

async function postMcp(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
}

const SOME_CLAIM_ARGS = {
  reputationRegistryRef: "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  agentRegistryRef: "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  agentId: "1",
  rpcUrl: "https://example-rpc.invalid/base",
  claim: {
    sellerAddress: "0x" + "00".repeat(20),
    buyerAddress: "0x" + "00".repeat(20),
    assetType: "api-credits",
    promisedSpec: "test",
    delivered: "yes",
    evidenceHash: "0".repeat(64),
    settlementRef: "test-ref",
    timestamp: new Date(0).toISOString(),
    claimId: `0x${"0".repeat(64)}`,
    signature: `0x${"0".repeat(130)}`,
  },
};

describe("http-server: publish_reputation_feedback registered when both env vars are set", () => {
  it("lists publish_reputation_feedback alongside the read-only tools", async () => {
    const listRes = await postMcp({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const text = await listRes.text();
    const names = [...text.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toContain("get_delivery_history");
    expect(names).toContain("publish_reputation_feedback");
  });

  it("refuses an unpaid call with a payment-required result naming PUBLISH_FEEDBACK_PAY_TO, never a silent publish", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "publish_reputation_feedback", arguments: SOME_CLAIM_ARGS },
    });
    const text = await res.text();
    expect(text.toLowerCase()).toContain("payment");
    expect(text).toContain(FAKE_PAY_TO);
  });

  it(
    "the payment-required response actually validates against @x402/core's REAL client-side PaymentRequiredSchema",
    async () => {
      // Same regression as record_delivery's own equivalent test — see its
      // comment for the full root-cause writeup (a too-long serviceName
      // silently failed every real client's own schema validation, which a
      // hand-rolled shape check like the two tests above would never catch).
      const { parsePaymentRequired } = await import("@x402/core/schemas");
      const res = await postMcp({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "publish_reputation_feedback", arguments: SOME_CLAIM_ARGS },
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
    "the pre-payment handler must never itself call publishReputationFeedback — only hooks.onAfterSettlement may",
    async () => {
      // Same reasoning as the equivalent record_delivery test: a hand-built,
      // real settled-payment round trip here would need a fake JSON-RPC
      // provider deep enough to satisfy publishReputationFeedback()'s own
      // contractFactory/identityResolver, which is exactly the kind of
      // brittle test that file's own comment already explains abandoning.
      // This checks the same property a cheaper, more robust way: by
      // construction, the only code path that can reach
      // publishReputationFeedback() is the one gated behind a CONFIRMED
      // settlement, because that is literally the only place the source
      // calls it.
      const source = readFileSync(fileURLToPath(new URL("./http-server.ts", import.meta.url)), "utf-8");

      const hooksStart = source.indexOf("onAfterSettlement: async ({ arguments: rawArgs })");
      expect(hooksStart, "publish_reputation_feedback's onAfterSettlement hook must exist").toBeGreaterThan(-1);
      const hooksEnd = source.indexOf("});\n}", hooksStart);
      const hookBody = source.slice(hooksStart, hooksEnd);
      expect(hookBody).toContain("publishReputationFeedback(");
      expect(hookBody).toContain("consumeFeedbackPublishSlot(");

      const handlerStart = source.indexOf("publishFeedbackPaid(async");
      expect(handlerStart, "the publish_reputation_feedback tool handler must exist").toBeGreaterThan(-1);
      const handlerEnd = source.indexOf("}),", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);
      expect(handlerBody, "the handler must still validate (fail fast before payment)").toContain("verifyClaim(");
      expect(
        handlerBody,
        "the handler must peek the cap (read-only) before payment, never consume it",
      ).toContain("canPublishFeedbackNow(");
      expect(
        handlerBody,
        "the handler must NOT itself call publishReputationFeedback — that would spend real gas before settlement is confirmed",
      ).not.toContain("publishReputationFeedback(");
      expect(handlerBody, "the handler must NOT itself consume an hourly-cap slot").not.toContain("consumeFeedbackPublishSlot(");
    },
  );
});

describe("http-server: the global hourly cap for publish_reputation_feedback (direct unit tests, no chain, no HTTP)", () => {
  it("consumes up to the configured cap, then refuses further slots without over-counting", async () => {
    vi.resetModules();
    process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR = "2";
    delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY; // this describe block never builds the paid tool itself
    delete process.env.PUBLISH_FEEDBACK_PAY_TO;
    const { canPublishFeedbackNow, consumeFeedbackPublishSlot } = await import("./http-server.js");

    expect(canPublishFeedbackNow()).toBe(true);
    expect(consumeFeedbackPublishSlot()).toBe(true); // slot 1/2
    expect(canPublishFeedbackNow()).toBe(true);
    expect(consumeFeedbackPublishSlot()).toBe(true); // slot 2/2
    expect(canPublishFeedbackNow()).toBe(false);
    expect(consumeFeedbackPublishSlot()).toBe(false); // over cap — refused, and does not itself add a timestamp
    expect(consumeFeedbackPublishSlot()).toBe(false); // still refused, proving the previous refusal didn't sneak a slot in

    delete process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR;
  });

  it("peeking (canPublishFeedbackNow) never itself consumes a slot", async () => {
    vi.resetModules();
    process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR = "1";
    const { canPublishFeedbackNow, consumeFeedbackPublishSlot } = await import("./http-server.js");

    for (let i = 0; i < 10; i++) expect(canPublishFeedbackNow()).toBe(true);
    // After ten pure peeks, the single real slot must still be available —
    // if peeking secretly consumed, this would already be false.
    expect(consumeFeedbackPublishSlot()).toBe(true);
    expect(canPublishFeedbackNow()).toBe(false);

    delete process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR;
  });
});
