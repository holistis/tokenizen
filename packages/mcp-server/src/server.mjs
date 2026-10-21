// server.mjs — paid MCP tool wrapping the existing, already-live
// ownership-verification check (self-check-server), so AI agents can find
// and pay for it through the MCP shelf of a discovery catalog (type=mcp),
// not just the plain HTTP route they already had.
//
// The tool itself does NOT reimplement verification: it calls self-check-
// server's own already-tested free endpoint and returns the same answer.
// The MCP layer is what's new here, charging via x402 for convenient,
// agent-native access.
//
// DEPLOYED, LIVE, VERIFIED (2026-10-21): runs on the same host as
// self-check-server, reachable at https://x402-mcp.tokenizen.nl/mcp. A real
// mainnet payment was made end to end (tool call -> payment required ->
// client signs and pays -> tool executes -> settled receipt returned):
//   settlement tx 0x044100b016ea7836b436ea38af57b24987bae01cc4268a97b9119d66f5c26e02
// Deployed under a standalone systemd unit (same hardening as self-check-
// server: NoNewPrivileges, ProtectSystem=strict, ProtectHome=read-only), not
// folded into self-check-server's own process, so a mistake here can never
// take the paid HTTP route down.
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { z } from "zod";

const PORT = Number(process.env.MCP_PORT || 4100);
const NETWORK = "eip155:8453"; // Base mainnet, same network the existing route already settles on.
const PAY_TO = process.env.X402_PAY_TO; // same payTo the live HTTP route already uses
const FACILITATOR_URL = process.env.MCP_FACILITATOR_URL || "https://facilitator.payai.network";
// Points at self-check-server's own free endpoint, same host, loopback only.
const FREE_CHECK_URL = process.env.FREE_CHECK_URL || "http://127.0.0.1:8787/api/verify-ownership";

if (!PAY_TO) {
  console.error("X402_PAY_TO ontbreekt in de omgeving — zonder payTo kan deze dienst geen betaling eisen.");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register(NETWORK, new ExactEvmScheme());
await resourceServer.initialize();

const accepts = await resourceServer.buildPaymentRequirements({
  scheme: "exact",
  network: NETWORK,
  payTo: PAY_TO,
  price: "$0.001",
});

const paid = createPaymentWrapper(resourceServer, {
  accepts,
  resource: {
    name: "tokenizen ownership receipts (mcp)",
    description:
      "Ownership verification over MCP for AI agents. The same check is free at https://api.tokenizen.nl/api/verify-ownership; this is the agent-native, discoverable version.",
  },
});

function buildServer() {
  const server = new McpServer({ name: "tokenizen-mcp", version: "0.1.0" });

  server.tool(
    "verify_ownership",
    "Verify that an operator controls a given HTTP endpoint, via DNS TXT or a well-known file. Costs $0.001.",
    {
      endpoint: z.string().describe("The endpoint whose ownership is being proven. Must be publicly routable."),
      ownerAddress: z.string().describe("The operator address claiming control of that endpoint (0x...)."),
      method: z.enum(["dns-txt", "well-known-file"]).describe("How control is proven."),
    },
    paid(async (args) => {
      const res = await fetch(FREE_CHECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const body = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(body) }] };
    })
  );

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (e) {
    console.error("MCP-fout:", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
  }
});

app.get("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
});

app.listen(PORT, () => console.log(`tokenizen-mcp luistert op poort ${PORT}, pad /mcp`));
