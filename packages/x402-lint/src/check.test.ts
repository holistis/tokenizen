// check.test.ts — a local fake server for fast, deterministic checks of both
// transports, plus a few real, live network tests proving the SSRF guard
// and the real, deployed example tool are actually wired in (same "no live
// dependency for the bulk, one real check for what a fake cannot prove"
// discipline as net-guard's own guarded-ethers.test.ts).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { checkX402Conformance } from "./check.js";

let server: Server;
let baseUrl: string;
let mode: "rest" | "mcp-payment-required" | "mcp-no-payment-required" | "mcp-input-error" | "non-402" | "bad-json" = "rest";
let restBody: unknown = null;
let mcpPaymentRequiredBody: unknown = null;

function validV2Response(overrides: { serviceName?: string; resourceUrl?: string } = {}) {
  return {
    x402Version: 2,
    error: "Payment required to access this tool",
    resource: {
      url: overrides.resourceUrl ?? `${baseUrl}/rest-route`,
      description: "a test tool",
      mimeType: "application/json",
      serviceName: overrides.serviceName ?? "x402-lint:test",
    },
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
  };
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (mode === "rest") {
      res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify(restBody));
      return;
    }
    if (mode === "non-402") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }
    if (mode === "bad-json") {
      res.writeHead(402, { "content-type": "application/json" }).end("not json at all");
      return;
    }
    // Both MCP modes: read the real tools/call body so a test could assert
    // on it later if needed, then answer as an MCP JSON-RPC result.
    let chunks = "";
    for await (const chunk of req) chunks += chunk;
    const rpc = JSON.parse(chunks) as { id: number };
    const payload =
      mode === "mcp-payment-required"
        ? { isError: true, content: [{ type: "text", text: JSON.stringify(mcpPaymentRequiredBody) }] }
        : mode === "mcp-input-error"
          ? { isError: true, content: [{ type: "text", text: "Error: missing required field 'claim'" }] } // plain text, NOT JSON — a real tool's own input-validation error
          : { isError: false, content: [{ type: "text", text: "{\"ok\":true}" }] };
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: payload }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("expected a real port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("checkX402Conformance, REST transport, against a local fake server", () => {
  it("reports ok:true for a genuinely valid v2 payment-required response", async () => {
    mode = "rest";
    restBody = validV2Response();
    const report = await checkX402Conformance(`${baseUrl}/rest-route`, { fetchImpl: fetch });
    expect(report.transport).toBe("rest");
    expect(report.schemaValid).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("catches tonight's EXACT real bug: a serviceName over the schema's 32-character limit", async () => {
    mode = "rest";
    // The real, original string from http-server.ts before it was fixed —
    // not a synthetic example, the actual bug.
    restBody = validV2Response({ serviceName: "capacity-attest publish_reputation_feedback (paid, real on-chain write)" });
    const report = await checkX402Conformance(`${baseUrl}/rest-route`, { fetchImpl: fetch });
    expect(report.schemaValid).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.schemaErrors.join(" ")).toContain("serviceName");
    expect(report.schemaErrors.join(" ")).toMatch(/32|too_big|at most/i);
  });

  it("flags a payTo/asset that does not look like a real address, as a warning, not a schema error", async () => {
    mode = "rest";
    const bad = validV2Response();
    bad.accepts[0]!.payTo = "not-an-address";
    restBody = bad;
    const report = await checkX402Conformance(`${baseUrl}/rest-route`, { fetchImpl: fetch });
    expect(report.schemaValid).toBe(true); // the schema itself only requires a non-empty string
    expect(report.issues.some((i) => i.severity === "warning" && i.field.includes("payTo"))).toBe(true);
  });

  it("flags a resource.url that does not match the URL actually tested", async () => {
    mode = "rest";
    restBody = validV2Response({ resourceUrl: "https://a-completely-different-host.example/other-tool" });
    const report = await checkX402Conformance(`${baseUrl}/rest-route`, { fetchImpl: fetch });
    expect(report.schemaValid).toBe(true);
    expect(report.issues.some((i) => i.field === "resource.url")).toBe(true);
  });

  it("reports a clean error, not a crash, when the body is not valid JSON", async () => {
    mode = "bad-json";
    const report = await checkX402Conformance(`${baseUrl}/rest-route`, { fetchImpl: fetch });
    expect(report.ok).toBe(false);
    expect(report.issues[0]!.field).toBe("body");
  });

  it("reports a clean error when the status is not 402 at all", async () => {
    mode = "non-402";
    const report = await checkX402Conformance(`${baseUrl}/rest-route`, { fetchImpl: fetch });
    expect(report.ok).toBe(false);
    expect(report.issues[0]!.field).toBe("status");
    expect(report.httpStatus).toBe(200);
  });

  it("refuses a non-http(s) URL before ever touching the network", async () => {
    const report = await checkX402Conformance("ftp://example.com/x");
    expect(report.ok).toBe(false);
    expect(report.issues[0]!.field).toBe("url");
  });
});

describe("checkX402Conformance, MCP transport (one URL, many named tools)", () => {
  it("reports ok:true for a tool that correctly demands payment via isError + embedded JSON", async () => {
    mode = "mcp-payment-required";
    mcpPaymentRequiredBody = validV2Response({ resourceUrl: "mcp://tool/paid_tool" });
    const report = await checkX402Conformance(`${baseUrl}/mcp`, { mcpToolName: "some_paid_tool", fetchImpl: fetch });
    expect(report.transport).toBe("mcp");
    expect(report.schemaValid).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("catches the exact same serviceName bug when it lives inside an MCP tool result", async () => {
    mode = "mcp-payment-required";
    mcpPaymentRequiredBody = validV2Response({
      resourceUrl: "mcp://tool/paid_tool",
      serviceName: "capacity-attest record_delivery (paid, shared ledger)",
    });
    const report = await checkX402Conformance(`${baseUrl}/mcp`, { mcpToolName: "record_delivery", fetchImpl: fetch });
    expect(report.schemaValid).toBe(false);
    expect(report.schemaErrors.join(" ")).toContain("serviceName");
  });

  it("never claims a schema failure when the schema was never reached (e.g. a plain-text input-validation error)", async () => {
    mode = "mcp-input-error";
    const report = await checkX402Conformance(`${baseUrl}/mcp`, { mcpToolName: "some_paid_tool", fetchImpl: fetch });
    expect(report.ok).toBe(false);
    expect(report.schemaValid).toBeNull(); // NOT false — the schema never ran, this is not a schema verdict
    expect(report.schemaErrors).toEqual([]);
  });

  it("reports an honest error when the named tool is not payment-gated at all (never demanded payment)", async () => {
    mode = "mcp-no-payment-required";
    const report = await checkX402Conformance(`${baseUrl}/mcp`, { mcpToolName: "a_free_tool", fetchImpl: fetch });
    expect(report.ok).toBe(false);
    expect(report.issues[0]!.field).toBe("payment");
  });

  it("without mcpToolName, falls back to the REST transport, which cannot get a useful signal from an MCP endpoint", async () => {
    mode = "mcp-no-payment-required"; // the fake server's bare-POST path is never hit without a tool name probe
    const report = await checkX402Conformance(`${baseUrl}/mcp`, { fetchImpl: fetch });
    expect(report.transport).toBe("rest");
    expect(report.ok).toBe(false); // a bare POST to a JSON-RPC endpoint is not a valid 402, honestly reported as such
  });
});

describe("checkX402Conformance routes through the real SSRF guard (live network, no fake)", () => {
  it("refuses a loopback-port probe as a network error, never silently succeeding", async () => {
    const report = await checkX402Conformance("http://127.0.0.1:1/");
    expect(report.ok).toBe(false);
    expect(report.issues[0]!.field).toBe("network");
  });

  it("refuses a cloud-metadata address outright", async () => {
    const report = await checkX402Conformance("http://169.254.169.254/");
    expect(report.ok).toBe(false);
    expect(report.issues[0]!.message.toLowerCase()).toContain("link-local");
  });
});

describe("checkX402Conformance against our OWN, now-fixed, real live service", () => {
  it("reports ok:true for the real, deployed publish_reputation_feedback tool, proving tonight's fix actually landed", async () => {
    // Real, live network call against capacity-attest.tokenizen.nl's actual
    // publish_reputation_feedback tool -- the exact endpoint whose
    // 53/71-character serviceName started this whole package. A gentle
    // try/catch, not a hard assertion the host is always reachable: this
    // test's job is a bonus, real-world confirmation, not a dependency on
    // our own production uptime for every CI run.
    const claim = {
      sellerAddress: "0x0000000000000000000000000000000000000000",
      buyerAddress: "0x0000000000000000000000000000000000000000",
      assetType: "api-credits",
      promisedSpec: "x402-lint self-check",
      delivered: "yes",
      evidenceHash: "0".repeat(64),
      settlementRef: "x402-lint-self-check",
      timestamp: new Date(0).toISOString(),
      claimId: `0x${"0".repeat(64)}`,
      signature: `0x${"0".repeat(130)}`,
    };
    let report;
    try {
      report = await checkX402Conformance("https://capacity-attest.tokenizen.nl/mcp", {
        mcpToolName: "publish_reputation_feedback",
        mcpToolArguments: {
          reputationRegistryRef: "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
          agentRegistryRef: "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
          agentId: "1",
          rpcUrl: "https://mainnet.base.org",
          claim,
        },
      });
    } catch {
      return;
    }
    if (report.issues[0]?.field === "network") return;
    expect(report.schemaValid).toBe(true);
    expect(report.schemaErrors).toEqual([]);
  });
});
