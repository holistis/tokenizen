// fetch-tools.ts — the consent-gated ACTIVE step. Unlike checks.ts (one plain
// GET, never a protocol handshake), this connects to the endpoint as an MCP
// client and reads its advertised tools/list, then hands the list to
// analyzeToolChains. This is only to be called AFTER the owner has proven they
// control the endpoint AND has consented to active testing; connecting as a
// client and listing tools is a protocol-level action the passive path
// deliberately refuses, so it belongs exclusively on the consented path.
//
// Posture matches checks.ts: it never throws. A connection failure, a listing
// failure, or a malformed response all degrade to an inconclusive CheckResult,
// never an uncaught exception and never a guessed "failed".
//
// The actual tool lister is injected (default: a real MCP client) so the
// wrapper logic is unit-testable without a live server, the same dependency-
// injection seam checks.ts uses for fetchImpl.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { CheckResult } from "./checks.js";
import { analyzeToolChains, TOOL_CHAIN_CHECK_NAME, type McpTool } from "./tool-chain-check.js";

export interface ToolFetchDeps {
  /** Injected in tests. Default connects a real MCP client (Streamable HTTP, then SSE). */
  listTools?: (endpoint: string, timeoutMs: number) => Promise<McpTool[]>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Consent-gated active check: read the endpoint's advertised MCP tool list and
 * classify its capability chains. Returns the same CheckResult shape the
 * passive auth-signal check returns, so the attester records it identically.
 * Degrades to inconclusive on any connection or listing failure.
 */
export async function runActiveToolChainCheck(
  endpoint: string,
  deps: ToolFetchDeps = {},
): Promise<CheckResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const lister = deps.listTools ?? defaultListTools;

  let tools: McpTool[];
  try {
    tools = await lister(endpoint, timeoutMs);
  } catch (e) {
    return {
      checksPerformed: [TOOL_CHAIN_CHECK_NAME],
      outcome: "inconclusive",
      findings: [
        {
          check: TOOL_CHAIN_CHECK_NAME,
          outcome: "inconclusive",
          detail: `could not obtain the endpoint's tool list over MCP (tried Streamable HTTP and SSE): ${
            (e as Error).message
          }`,
        },
      ],
    };
  }

  return analyzeToolChains(tools);
}

/**
 * Real MCP client: connect to the endpoint and call tools/list. Tries the
 * Streamable HTTP transport first and falls back to SSE, since live MCP
 * endpoints use one or the other. Not unit-tested here (it needs a real
 * server); the wrapper above is tested with an injected lister, and this
 * default is exercised by a separate live smoke test.
 */
async function defaultListTools(endpoint: string, timeoutMs: number): Promise<McpTool[]> {
  const url = new URL(endpoint);
  const client = new Client({ name: "tokenizen-trust-attester", version: "0.1.0" });

  let connected = false;
  try {
    await client.connect(new StreamableHTTPClientTransport(url), { timeout: timeoutMs });
    connected = true;
  } catch {
    await client.connect(new SSEClientTransport(url), { timeout: timeoutMs });
    connected = true;
  }

  try {
    const res = await client.listTools({}, { timeout: timeoutMs });
    return (res.tools ?? []).map((t) => ({
      name: String(t.name),
      description: typeof t.description === "string" ? t.description : undefined,
    }));
  } finally {
    if (connected) {
      await client.close().catch(() => {});
    }
  }
}
