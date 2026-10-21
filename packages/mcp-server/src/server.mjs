// tokenizen-mcp-server.mjs v2: paid MCP tool, now with a bazaar discovery
// declaration (so a catalog can actually index it as type=mcp) and settling
// through Coinbase's CDP facilitator instead of payai, so the IP-allowlist
// that was added to the "x402-facilitator" key is the one actually used.
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { z } from "zod";
import { importJWK, SignJWT } from "jose";
import { getRandomValues } from "uncrypto";

const PORT = Number(process.env.MCP_PORT || 4100);
const NETWORK = "eip155:8453";
const PAY_TO = process.env.X402_PAY_TO;
const FREE_CHECK_URL = process.env.FREE_CHECK_URL || "http://127.0.0.1:8787/api/verify-ownership";
const PUBLIC_URL = process.env.MCP_PUBLIC_URL || "https://x402-mcp.tokenizen.nl/mcp";

if (!PAY_TO) {
  console.error("X402_PAY_TO ontbreekt in de omgeving, zonder payTo kan deze dienst geen betaling eisen.");
  process.exit(1);
}

// --- CDP-facilitator: zelfde JWT-opbouw als de bestaande x402-server.mjs op VPS1 ---
async function buildCdpJwt(method, path) {
  const keyId = process.env.CDP_KEY_ID || "";
  const keySecret = process.env.CDP_KEY_SECRET || "";
  if (!keyId || !keySecret) throw new Error("CDP_KEY_ID / CDP_KEY_SECRET ontbreekt in de omgeving");
  const decoded = Buffer.from(keySecret, "base64");
  const jwk = { kty: "OKP", crv: "Ed25519", d: decoded.subarray(0, 32).toString("base64url"), x: decoded.subarray(32).toString("base64url") };
  const key = await importJWK(jwk, "EdDSA");
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  const nonce = Buffer.from(bytes).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  const host = "api.cdp.coinbase.com";
  return new SignJWT({ sub: keyId, iss: "cdp", uris: [`${method} ${host}${path}`] })
    .setProtectedHeader({ alg: "EdDSA", kid: keyId, typ: "JWT", nonce })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

// CDP geprobeerd (2026-10-21): verify/settle werken met deze sleutel, maar
// GET /supported geeft 401 (bevestigd met een losse, handmatige JWT-test,
// geen codefout). x402ResourceServer.initialize() EIST een geslaagde
// getSupported()-aanroep, dus de hele dienst start niet op met alleen
// verify/settle-rechten. Terug naar payai tot de sleutel in het Coinbase-
// portaal bredere leesrechten heeft, of een eigen FacilitatorClient die
// getSupported() niet hard vereist.
const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.MCP_FACILITATOR_URL || "https://facilitator.payai.network",
});
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register(NETWORK, new ExactEvmScheme());
await resourceServer.initialize();

const accepts = await resourceServer.buildPaymentRequirements({
  scheme: "exact",
  network: NETWORK,
  payTo: PAY_TO,
  price: "$0.001",
});

// --- Bazaar-aankondiging, vorm bevestigd tegen een echte, al werkende payai type=mcp-vermelding ---
const TOOL_INPUT_SCHEMA = {
  type: "object",
  required: ["endpoint", "ownerAddress", "method"],
  properties: {
    endpoint: { type: "string", description: "The endpoint whose ownership is being proven." },
    ownerAddress: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
    method: { type: "string", enum: ["dns-txt", "well-known-file"] },
  },
};
const bazaarExtension = {
  bazaar: {
    info: {
      input: {
        type: "mcp",
        toolName: "verify_ownership",
        transport: "streamable-http",
        description: "Verify that an operator controls a given HTTP endpoint.",
        inputSchema: TOOL_INPUT_SCHEMA,
      },
      output: { type: "json", example: { ok: true, method: "dns-txt", token: "...", location: "..." } },
    },
    // Dit valideert de DECLARATIE zelf (info.input hierboven), niet de
    // argumenten van een aanroep (die zitten genest in inputSchema).
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["input"],
      properties: {
        input: {
          type: "object",
          required: ["type", "toolName", "transport"],
          properties: {
            type: { type: "string", const: "mcp" },
            toolName: { type: "string" },
            transport: { type: "string" },
            description: { type: "string" },
            inputSchema: { type: "object" },
          },
        },
      },
    },
  },
};

const paid = createPaymentWrapper(resourceServer, {
  accepts,
  resource: {
    url: PUBLIC_URL,
    name: "tokenizen ownership receipts (mcp)",
    description:
      "Ownership verification over MCP for AI agents. The same check is free at https://api.tokenizen.nl/api/verify-ownership; this is the agent-native, discoverable version.",
  },
  extensions: bazaarExtension,
});

function buildServer() {
  const server = new McpServer({ name: "tokenizen-mcp", version: "0.2.0" });
  server.tool(
    "verify_ownership",
    "Verify that an operator controls a given HTTP endpoint, via DNS TXT or a well-known file. Costs $0.001.",
    {
      endpoint: z.string().describe("The endpoint whose ownership is being proven. Must be publicly routable."),
      ownerAddress: z.string().describe("The operator address claiming control of that endpoint (0x...)."),
      method: z.enum(["dns-txt", "well-known-file"]).describe("How control is proven."),
    },
    paid(async (args) => {
      const res = await fetch(FREE_CHECK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
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
    res.on("close", () => { transport.close(); server.close(); });
  } catch (e) {
    console.error("MCP-fout:", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
  }
});
app.get("/mcp", (_req, res) => res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null })));

app.listen(PORT, "127.0.0.1", () => console.log(`tokenizen-mcp v2 luistert op poort ${PORT}, pad /mcp, facilitator=CDP`));
