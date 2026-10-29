// The free CRA readiness check as an MCP tool, so an AI agent (and the person who uses it) can ask for the check without a browser.
//
// It is the same check as POST /api/cra/check, through the same checker: the visitor names a public GitHub repository, never a host, and
// the checker's own limits stand behind it (a strict owner/repo pattern, a one hour cache, at most MAX_CONCURRENT checks at once and a
// global hourly budget). Nothing is stored and no repository name is logged here; app.ts counts the answers with usage-log.ts like the other
// free checks. The tool only reads: it cannot pay, write or change anything, and it says what it cannot see in every answer.
//
// Stateless on purpose: every request gets its own small server and transport and nothing is kept between requests, so there is no session
// to hold open or to exhaust.

import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { CraChecker } from "./cra-check.js";

export const CRA_MCP_TOOL = "check_github_repo";

const DESCRIPTION =
  "Reads up to about thirty public pages of a public GitHub repository and reports which of eight security signals are visible: a security policy that names a contact or a reporting link, a software bill of materials, proof of where releases come from, a lockfile, automatic updates of dependencies, security scans in CI, recent maintenance and a licence. For each signal that is not visible the answer says what would make it visible; a signal that could not be read completely is marked not measured, never as a gap. " +
  "The eight signals are a selection related to topics in the EU Cyber Resilience Act. This is an indication from public data, not a compliance check, not a certificate and not legal advice; private repositories and hosts other than GitHub cannot be checked. Read only. Limited to a few checks per ten minutes per address.";

const jsonRpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

const asText = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

export function createCraMcpServer(checker: CraChecker): McpServer {
  const server = new McpServer({ name: "tokenizen-cra-check", version: "0.1.0" });
  server.registerTool(
    CRA_MCP_TOOL,
    {
      title: "Check a public GitHub repository for eight CRA-related security signals",
      description: DESCRIPTION,
      inputSchema: {
        repo: z.string().min(1).max(300).describe("A public GitHub repository as owner/name, or its https://github.com/owner/name address"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ repo }) => {
      const outcome = await checker.check(repo);
      switch (outcome.kind) {
        case "done":
          return asText({ ok: true, cached: outcome.cached, ...outcome.report });
        case "invalid":
          return asText(outcome.error, true);
        case "limited":
          return asText(`${outcome.error} (retry after about ${outcome.retryAfterSeconds} seconds)`, true);
        case "not_found":
          return asText("that repository was not found, or it is not public", true);
        case "moved":
          return asText("that repository has been renamed or moved, please use its current name", true);
        default:
          return asText("the check could not be completed, please try again later", true);
      }
    },
  );
  return server;
}

/** POST /mcp: one JSON-RPC request in, the answer out. */
export function handleCraMcp(checker: CraChecker) {
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    if (!checker.enabled) {
      res.status(503).json(jsonRpcError(-32000, "this check is not switched on on this server"));
      return;
    }
    const server = createCraMcpServer(checker);
    // Plain JSON answers: nothing here streams, and a proxy in front has nothing to hold open.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    transport.onerror = (err) => console.error(`cra-mcp: transport error (${err instanceof Error ? err.name : "unknown"})`);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error(`cra-mcp: request failed (${err instanceof Error ? err.name : "unknown"})`);
      if (!res.headersSent) res.status(500).json(jsonRpcError(-32603, "internal error"));
    }
  };
}

/** GET and DELETE /mcp: there are no sessions and no server-initiated streams, so only POST is allowed. */
export function craMcpMethodNotAllowed(_req: ExpressRequest, res: ExpressResponse): void {
  res.setHeader("Allow", "POST");
  res.status(405).json(jsonRpcError(-32000, "Method not allowed: use POST"));
}

/**
 * One message per request. A batch could hold dozens of tool calls and would cost the limiter one request, so a batch is refused before
 * anything else (the current MCP transport does not use batches; an older client that does gets a clear error).
 */
export function craMcpRejectBatch(req: ExpressRequest, res: ExpressResponse, next: () => void): void {
  if (Array.isArray(req.body)) {
    res.status(400).json(jsonRpcError(-32600, "Batch requests are not supported: send one message per request"));
    return;
  }
  next();
}

/**
 * A tool call that the limiter turns away is answered as a tool result with isError and the wait in words, not as a bare HTTP 429: an MCP
 * client turns a 429 into a thrown transport error and the agent never sees why or for how long. Everything else the limiter refuses keeps
 * its plain 429. Must sit before the limiter.
 */
export function craMcpLimitedAsToolResult(req: ExpressRequest, res: ExpressResponse, next: () => void): void {
  if (bodyCallsATool(req.body)) {
    res.locals.onRateLimited = (info: { max: number; windowSeconds: number; retryAfterSeconds: number }) => {
      const id = (req.body as { id?: unknown } | null)?.id ?? null;
      res.status(200).json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `rate limit exceeded: at most ${info.max} checks per ${Math.round(info.windowSeconds / 60)} minutes from one address; retry after about ${info.retryAfterSeconds} seconds` }],
          isError: true,
        },
      });
    };
  }
  next();
}

/** True when a request body holds at least one tools/call, which is the only message that costs a check. */
export function bodyCallsATool(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((m) => m !== null && typeof m === "object" && (m as { method?: unknown }).method === "tools/call");
}
