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
import { guardedFetch } from "net-guard";
import type { CheckResult } from "./checks.js";
import { analyzeToolChains, TOOL_CHAIN_CHECK_NAME, MAX_TOOLS, MAX_DESC_CHARS, type McpTool } from "./tool-chain-check.js";

// The tools/list body is attacker-controlled (the endpoint owner serves it).
// Bound how many bytes the MCP SDK will ever buffer while parsing it, so a
// malicious endpoint cannot OOM the shared attester by streaming an enormous
// response: analyzeToolChains' own caps only apply AFTER the SDK has already
// materialized the whole body, which is too late. 4 MiB is far larger than any
// honest tool list and the interaction is connect-list-close, so the cap is on
// a short-lived stream, not a long-running subscription.
const MAX_TOOL_LIST_BYTES = 4 * 1024 * 1024;

/**
 * Wrap a fetch so the Response body it returns errors once it exceeds maxBytes,
 * instead of buffering without limit. The SDK transports read the body via
 * response.json() / an SSE parser with no size cap of their own, so this is the
 * only place the bound can be imposed before memory is spent. Mirrors the
 * readBounded posture in checks.ts and endpoint-attest/ownership.ts.
 */
export function byteCappedFetch(base: typeof fetch, maxBytes: number): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await base(input, init);
    if (!res.body) return res;
    const reader = res.body.getReader();
    let total = 0;
    const capped = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          controller.error(new Error(`response body exceeded ${maxBytes} bytes, refused before buffering further`));
          return;
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        reader.cancel(reason).catch(() => {});
      },
    });
    return new Response(capped, { status: res.status, statusText: res.statusText, headers: res.headers });
  }) as typeof fetch;
}

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

  // Both transports fetch through net-guard's guardedFetch, so the active MCP
  // handshake to an attacker-supplied endpoint is IP-validated and pinned on
  // every connection and redirect, exactly like the passive GET in checks.ts —
  // and wrapped in byteCappedFetch so a malicious endpoint cannot OOM the
  // attester by streaming an unbounded tools/list.
  const guardedCappedFetch = byteCappedFetch(guardedFetch, MAX_TOOL_LIST_BYTES);
  let connected = false;
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { fetch: guardedCappedFetch }), { timeout: timeoutMs });
    connected = true;
  } catch {
    await client.connect(new SSEClientTransport(url, { fetch: guardedCappedFetch }), { timeout: timeoutMs });
    connected = true;
  }

  try {
    const res = await client.listTools({}, { timeout: timeoutMs });
    // Cap count and per-field length at the boundary too (defense in depth
    // alongside the byte cap and analyzeToolChains' own bounds): never build an
    // intermediate array larger than MAX_TOOLS, nor carry a description longer
    // than MAX_DESC_CHARS out of this function.
    return (res.tools ?? []).slice(0, MAX_TOOLS).map((t) => ({
      name: String(t.name).slice(0, MAX_DESC_CHARS),
      description: typeof t.description === "string" ? t.description.slice(0, MAX_DESC_CHARS) : undefined,
    }));
  } finally {
    if (connected) {
      await client.close().catch(() => {});
    }
  }
}
