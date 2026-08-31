#!/usr/bin/env node
// index.ts — MCP server wiring. All actual logic lives in tools.ts; this
// file only translates MCP tool calls into calls on that logic and formats
// the result as MCP content blocks (same pattern as
// al-yad-mcp-server/packages/mcp-server/src/index.ts).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { ASSET_TYPES, DELIVERED_VALUES, ClaimContentSchema, DeliveryClaimSchema } from "./schema.js";
import { recordDelivery, getDeliveryHistory } from "./tools.js";

const server = new McpServer({
  name: "capacity-attest",
  version: "0.1.0",
});

function textResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

server.registerTool(
  "record_delivery",
  {
    title: "Record a delivery claim",
    description:
      "Record a signed delivery claim after an x402 capacity settlement (gpu-hours, storage, api-credits, or bandwidth). " +
      "The buyer agent calls this AFTER paying, once it knows whether what was promised actually arrived. " +
      "The claim's schema and signature (must recover to buyerAddress) are validated before it is written to the " +
      "append-only ledger. This is a factual receipt, not a reputation score — see get_delivery_history for how " +
      "other agents read it back.",
    inputSchema: DeliveryClaimSchema.shape,
  },
  async (args) => {
    const result = await recordDelivery(args);
    if (!result.ok) return errorResult(result.reason);
    return textResult({ ok: true, claimId: result.claimId });
  },
);

server.registerTool(
  "get_delivery_history",
  {
    title: "Get a seller's delivery history",
    description:
      "Return every known, signature-verified delivery claim recorded against a given sellerAddress, oldest first. " +
      "Purely factual — no aggregate score, rating, or reputation judgment is computed. A buying agent can call this " +
      "BEFORE paying a seller to see that seller's raw delivery history for gpu-hours, storage, api-credits, and " +
      "bandwidth claims.",
    inputSchema: {
      sellerAddress: ClaimContentSchema.shape.sellerAddress,
    },
  },
  async ({ sellerAddress }) => {
    return textResult(await getDeliveryHistory(sellerAddress));
  },
);

// Re-exported so callers embedding this package can reference the same enums
// / schema the tools validate against without duplicating them.
export { ASSET_TYPES, DELIVERED_VALUES };

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("capacity-attest MCP server failed to start:", e);
  process.exit(1);
});
