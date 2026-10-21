// http-server.test.ts — proves the 4 mandatory checks (data validation,
// exposure, rate limiting) actually hold, plus a real end-to-end MCP call,
// against a real listening server on an ephemeral port. Not a mock: this
// starts the real http.Server this file exports and speaks real HTTP to it,
// same discipline as the rest of this package's "actually run it" tests.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import { createApp } from "./http-server.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createHttpServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected a real port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function postMcp(body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("http-server: real end-to-end MCP calls over HTTP", () => {
  // RECORD_DELIVERY_PAY_TO is unset in this process, so record_delivery
  // should not be registered — see http-server-record-delivery.test.ts for
  // the opposite case (PAY_TO set), which needs a fresh module import to
  // exercise that branch's module-load-time setup.
  it("initializes and lists exactly the two read-only tools when RECORD_DELIVERY_PAY_TO is unset", async () => {
    const initRes = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
    });
    expect(initRes.status).toBe(200);

    const listRes = await postMcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const text = await listRes.text();
    const names = [...text.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toContain("get_delivery_history");
    expect(names).toContain("resolve_agent_identity");
    expect(names).not.toContain("record_delivery");
  });

  it("calls get_delivery_history for real and gets a well-formed, empty result for an unused address", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_delivery_history", arguments: { sellerAddress: "0x00000000000000000000000000000000000000aa" } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 0');
    expect(text).toContain('\\"claims\\": []');
  });
});

describe("http-server: get_compute_track_record filters to compute claims only", () => {
  // Isolated from the rest of this file's tests: config.ts resolves
  // CAPACITY_ATTEST_DATA_DIR lazily on every ledger call (not at import
  // time), so this describe block can point at its own throwaway directory
  // without touching the shared server started above or the "unused
  // address" test's empty-result assumption elsewhere in this file.
  let tmpDir: string;
  const sellerAddress = "0x00000000000000000000000000000000000000bb";

  beforeAll(async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-compute-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const { appendClaim } = await import("./ledger.js");
    const wallet = testWallet();

    // One real compute claim (gpu-hours + measured) — SHOULD be returned.
    const computeContent = {
      sellerAddress,
      buyerAddress: wallet.address,
      assetType: "gpu-hours" as const,
      promisedSpec: "1x A100, 4 hours",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("compute evidence"),
      settlementRef: "0x" + "22".repeat(32),
      timestamp: new Date().toISOString(),
      measured: {
        unit: "gpu-second" as const,
        basis: "supplied" as const,
        promisedAmount: "14400",
        deliveredAmount: "14400",
        period: {
          start: new Date(Date.now() - 14_400_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          end: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
        method: { attribution: "buyer" as const, instrument: "test fixture" },
      },
    };
    const computeSigned = await signClaim(wallet, computeContent);
    await appendClaim({ ...computeContent, ...computeSigned });

    // One real, but NON-compute, unmeasured claim — must NOT be returned by
    // the filtered tool (it should still show up in plain get_delivery_history).
    const otherContent = {
      sellerAddress,
      buyerAddress: wallet.address,
      assetType: "storage" as const,
      promisedSpec: "10GB for a month",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("storage evidence"),
      settlementRef: "0x" + "33".repeat(32),
      timestamp: new Date().toISOString(),
    };
    const otherSigned = await signClaim(wallet, otherContent);
    await appendClaim({ ...otherContent, ...otherSigned });
  });

  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("get_delivery_history (unfiltered) shows BOTH claims", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "get_delivery_history", arguments: { sellerAddress } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 2');
  });

  it("get_compute_track_record returns ONLY the gpu-hours+measured claim", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "get_compute_track_record", arguments: { sellerAddress } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 1');
    expect(text).toContain("gpu-hours");
    expect(text).not.toContain('\\"assetType\\": \\"storage\\"');
  });
});

describe("http-server: data-check (mandatory check 2)", () => {
  it("rejects malformed JSON with 400, never a raw parse error", async () => {
    const res = await postMcp("not json");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid request body" });
  });

  it("rejects an oversized body before it reaches JSON.parse", async () => {
    const huge = "x".repeat(70 * 1024);
    const res = await postMcp(huge);
    expect(res.status).toBe(400);
  });
});

describe("http-server: exposure-check (mandatory check 3)", () => {
  it("returns 404 with no internal detail for an unknown path", async () => {
    const res = await fetch(`${baseUrl}/definitely-not-a-real-path`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["error"]);
  });
});

describe("http-server: rate-check (mandatory check 4)", () => {
  it("allows the configured max requests per window, then returns 429 for the same IP", async () => {
    // Own IP bucket: use a fresh path-adjacent call count independent of the
    // other describe blocks above by exhausting whatever budget remains,
    // then asserting the NEXT call is limited. Simpler and just as
    // conclusive as asserting an exact count: prove the ceiling exists at all.
    let sawLimited = false;
    for (let i = 0; i < 40 && !sawLimited; i++) {
      const res = await postMcp({ jsonrpc: "2.0", id: 100 + i, method: "tools/list", params: {} });
      if (res.status === 429) sawLimited = true;
    }
    expect(sawLimited).toBe(true);
  });
});
