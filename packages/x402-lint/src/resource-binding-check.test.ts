// resource-binding-check.test.ts — planted-fault tests: a deliberately collapsing fixture
// AND a deliberately varying fixture, for both transports, proving this check actually
// discriminates between them rather than always reporting the same verdict. A check with no
// test that can make it fail is not a tested check (Test de tester discipline).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { checkResourceBinding } from "./resource-binding-check.js";

let server: Server;
let baseUrl: string;
let mode:
  | "rest-collapsing"
  | "rest-varying"
  | "mcp-collapsing"
  | "mcp-varying"
  | "mcp-unreadable"
  | "rest-b-200-fake-resource"
  | "rest-b-402-no-accepts" = "rest-collapsing";

function paymentRequired(resourceUrl: string) {
  return {
    x402Version: 2,
    error: "Payment required to access this tool",
    resource: { url: resourceUrl, description: "a test tool", mimeType: "application/json", serviceName: "resource-binding-check:test" },
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
    const url = new URL(req.url ?? "/", "http://placeholder");
    if (mode === "rest-collapsing") {
      // The real bug this check exists to catch: resource.url is a FIXED string, same
      // configured value for the client's /rest-route AND /rest-route?x=anything.
      res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify(paymentRequired(`${baseUrl}/rest-route`)));
      return;
    }
    if (mode === "rest-varying") {
      // The safe case: resource.url is derived from the actual request, exactly like
      // @x402/express's adapter.getUrl() (req.originalUrl) does when no fixed resource
      // string is configured.
      res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify(paymentRequired(`${baseUrl}${url.pathname}${url.search}`)));
      return;
    }
    if (mode === "rest-b-200-fake-resource") {
      // epistemedeus, x402-foundation/x402#3776: the second call ("order=bob") is a plain HTTP
      // 200 whose body happens to be shaped like a payment-required object. Its schemaValid is
      // null (checkRest never even reaches the schema, since status !== 402), but the old
      // code still read rawPaymentRequired.resource.url and compared it as if it were real.
      if (url.searchParams.get("order") === "bob") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ resource: { url: "https://example.test/other" } }));
        return;
      }
      res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify(paymentRequired(`${baseUrl}/rest-route`)));
      return;
    }
    if (mode === "rest-b-402-no-accepts") {
      // Same bug, other direction: the second call IS a 402 with a resource.url, but its
      // `accepts` array is missing, so @x402/core's own parsePaymentRequired() rejects it
      // (schemaValid: false). A fixed resource.url that happens to be present is not evidence
      // of anything if the rest of the challenge never validated.
      if (url.searchParams.get("order") === "bob") {
        res.writeHead(402, { "content-type": "application/json" }).end(
          JSON.stringify({ x402Version: 2, error: "Payment required", resource: { url: `${baseUrl}/rest-route` } }),
        );
        return;
      }
      res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify(paymentRequired(`${baseUrl}/rest-route`)));
      return;
    }
    // MCP modes: read the real tools/call body, since the planted fault/safe behavior
    // depends on whether the response reflects the call's own arguments.
    let chunks = "";
    for await (const chunk of req) chunks += chunk;
    const rpc = JSON.parse(chunks) as { id: number; params?: { name?: string; arguments?: Record<string, unknown> } };
    const toolName = rpc.params?.name ?? "unknown_tool";
    const argumentsEcho = JSON.stringify(rpc.params?.arguments ?? {});

    let text: string;
    if (mode === "mcp-collapsing") {
      // The real @x402/mcp pattern this check exists to catch: resource.url is
      // `mcp://tool/<name>`, built from the tool NAME alone, identical no matter what
      // arguments were actually sent.
      text = JSON.stringify(paymentRequired(`mcp://tool/${toolName}`));
    } else if (mode === "mcp-varying") {
      // A hypothetical safer MCP adapter: resource.url incorporates the call's own
      // arguments, so two different calls produce two different values.
      text = JSON.stringify(paymentRequired(`mcp://tool/${toolName}?args=${encodeURIComponent(argumentsEcho)}`));
    } else {
      // mode === "mcp-unreadable": a tool that rejects bad input before any payment
      // signal, so this check should honestly report "could not measure", not guess.
      text = "Error: missing required field 'claim'";
    }
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { isError: true, content: [{ type: "text", text }] } }));
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

describe("checkResourceBinding, REST transport", () => {
  it("PLANTED FAULT: reports distinguishable:false when resource.url is a fixed string regardless of query", async () => {
    mode = "rest-collapsing";
    const report = await checkResourceBinding(`${baseUrl}/rest-route?order=alice`, {
      variantUrl: `${baseUrl}/rest-route?order=bob`,
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBe(false);
    expect(report.resourceUrlA).toBe(report.resourceUrlB);
  });

  it("SAFE CASE: reports distinguishable:true when resource.url reflects the actual request", async () => {
    mode = "rest-varying";
    const report = await checkResourceBinding(`${baseUrl}/rest-route?order=alice`, {
      variantUrl: `${baseUrl}/rest-route?order=bob`,
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBe(true);
    expect(report.resourceUrlA).not.toBe(report.resourceUrlB);
  });

  it("RELEASE-BLOCKING FIX (epistemedeus): reports distinguishable:null, not true, when B is a plain HTTP 200 that merely LOOKS like a payment-required object", async () => {
    mode = "rest-b-200-fake-resource";
    const report = await checkResourceBinding(`${baseUrl}/rest-route?order=alice`, {
      variantUrl: `${baseUrl}/rest-route?order=bob`,
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBeNull();
    expect(report.reportB!.schemaValid).not.toBe(true);
    expect(report.reason).toMatch(/schema-valid/);
  });

  it("RELEASE-BLOCKING FIX (epistemedeus): reports distinguishable:null, not true, when B is a 402 with no valid accepts array", async () => {
    mode = "rest-b-402-no-accepts";
    const report = await checkResourceBinding(`${baseUrl}/rest-route?order=alice`, {
      variantUrl: `${baseUrl}/rest-route?order=bob`,
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBeNull();
    expect(report.reportB!.schemaValid).toBe(false);
    expect(report.reason).toMatch(/schema-valid/);
  });

  it("epistemedeus: rejects a variantUrl pointing at a different origin BEFORE making any probe, since that cannot isolate the request-tracking question", async () => {
    mode = "rest-varying"; // irrelevant: rejected before any network call
    const report = await checkResourceBinding(`${baseUrl}/rest-route?order=alice`, {
      variantUrl: "https://totally-different.example/rest-route?order=bob",
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBeNull();
    expect(report.reportA).toBeNull();
    expect(report.reportB).toBeNull();
    expect(report.reason).toMatch(/different origin/);
  });

  it("epistemedeus (2nd replay): a variantUrl that differs only by a #fragment is the SAME request, rejected BEFORE any probe, because a fragment never reaches the server", async () => {
    mode = "rest-varying"; // irrelevant: rejected before any network call
    for (const variantUrl of [`${baseUrl}/paid#unused`, `${baseUrl}/paid#`]) {
      const report = await checkResourceBinding(`${baseUrl}/paid`, { variantUrl, fetchImpl: fetch });
      expect(report.distinguishable).toBeNull();
      expect(report.reportA).toBeNull();
      expect(report.reportB).toBeNull();
      expect(report.reason).toMatch(/same request/);
    }
  });

  it("positive control for the fragment rule: a fragment on top of a genuinely changed query is still probed and still distinguishable", async () => {
    mode = "rest-varying";
    const report = await checkResourceBinding(`${baseUrl}/rest-route?order=alice`, {
      variantUrl: `${baseUrl}/rest-route?order=bob#frag`,
      fetchImpl: fetch,
    });
    expect(report.reportA).not.toBeNull();
    expect(report.distinguishable).toBe(true);
  });

  it("the order of query pairs is part of the request, so a reordered query is NOT rejected as identical (section 5.5: ?a=1&b=2 and ?b=2&a=1 are two attempts)", async () => {
    mode = "rest-varying";
    const report = await checkResourceBinding(`${baseUrl}/rest-route?a=1&b=2`, { variantUrl: `${baseUrl}/rest-route?b=2&a=1`, fetchImpl: fetch });
    expect(report.reportA).not.toBeNull();
    expect(report.distinguishable).toBe(true);
  });
});

describe("checkResourceBinding, MCP transport", () => {
  it("PLANTED FAULT: reports distinguishable:false for the real @x402/mcp pattern (resource.url = mcp://tool/<name>, ignores arguments)", async () => {
    mode = "mcp-collapsing";
    const report = await checkResourceBinding(baseUrl, {
      mcpToolName: "record_delivery",
      mcpToolArguments: { deliveryId: "order-alice" },
      variantToolArguments: { deliveryId: "order-bob" },
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBe(false);
    expect(report.resourceUrlA).toBe("mcp://tool/record_delivery");
    expect(report.resourceUrlB).toBe("mcp://tool/record_delivery");
  });

  it("SAFE CASE: reports distinguishable:true when the MCP adapter's resource.url incorporates arguments", async () => {
    mode = "mcp-varying";
    const report = await checkResourceBinding(baseUrl, {
      mcpToolName: "record_delivery",
      mcpToolArguments: { deliveryId: "order-alice" },
      variantToolArguments: { deliveryId: "order-bob" },
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBe(true);
    expect(report.resourceUrlA).not.toBe(report.resourceUrlB);
  });

  it("reports distinguishable:null, not a guess, when a probe's resource.url cannot be read at all", async () => {
    mode = "mcp-unreadable";
    const report = await checkResourceBinding(baseUrl, {
      mcpToolName: "record_delivery",
      mcpToolArguments: {},
      variantToolArguments: { deliveryId: "order-bob" },
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBeNull();
    expect(report.reason).toMatch(/resource\.url/);
  });

  it("reports distinguishable:null when called without a variant to compare against (nothing to measure)", async () => {
    mode = "mcp-collapsing";
    const report = await checkResourceBinding(baseUrl, { mcpToolName: "record_delivery", fetchImpl: fetch });
    expect(report.distinguishable).toBeNull();
    expect(report.reason).toMatch(/variantToolArguments/);
    // Fixes "sends the same POST twice" (epistemedeus): with no variant given, this used to
    // probe twice with identical arguments. One real probe is enough to say "nothing to
    // compare against" — reportA and reportB are now the SAME object, not two separate calls.
    expect(report.reportA).toBe(report.reportB);
  });

  it("epistemedeus: rejects IDENTICAL variantToolArguments BEFORE making any probe, since nothing was actually varied (his own test fixture's counter bug, reproduced here as a planted fault instead of relying on his report)", async () => {
    mode = "mcp-collapsing"; // irrelevant: rejected before any network call
    const identicalArgs = { deliveryId: "order-alice" };
    const report = await checkResourceBinding(baseUrl, {
      mcpToolName: "record_delivery",
      mcpToolArguments: identicalArgs,
      variantToolArguments: { ...identicalArgs }, // same content, different object identity
      fetchImpl: fetch,
    });
    expect(report.distinguishable).toBeNull();
    expect(report.reportA).toBeNull();
    expect(report.reportB).toBeNull();
    expect(report.reason).toMatch(/identical/);
  });

  it("epistemedeus (2nd replay): the same arguments with the keys written in another order are identical DATA, rejected BEFORE any probe, at every depth", async () => {
    mode = "mcp-varying"; // irrelevant: rejected before any network call
    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ x: 1, y: 2 }, { y: 2, x: 1 }],
      [{ outer: { a: 1, b: [1, { p: 1, q: 2 }] } }, { outer: { b: [1, { q: 2, p: 1 }], a: 1 } }],
    ];
    for (const [a, b] of cases) {
      const report = await checkResourceBinding(baseUrl, { mcpToolName: "record_delivery", mcpToolArguments: a, variantToolArguments: b, fetchImpl: fetch });
      expect(report.distinguishable).toBeNull();
      expect(report.reportA).toBeNull();
      expect(report.reportB).toBeNull();
      expect(report.reason).toMatch(/identical/);
    }
  });

  it("positive controls for the structural rule: a changed value, a changed ARRAY ORDER and a changed type are real differences and ARE probed", async () => {
    mode = "mcp-varying";
    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ x: 1 }, { x: 2 }],
      [{ items: [1, 2] }, { items: [2, 1] }],
      [{ x: 1 }, { x: "1" }],
    ];
    for (const [a, b] of cases) {
      const report = await checkResourceBinding(baseUrl, { mcpToolName: "record_delivery", mcpToolArguments: a, variantToolArguments: b, fetchImpl: fetch });
      expect(report.reportA).not.toBeNull();
      expect(report.distinguishable).toBe(true);
    }
  });
});
