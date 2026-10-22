// check.ts — the actual conformance check.
//
// Built 2026-10-22 after finding, the hard way, that a payment-required
// response can look completely fine to the person who wrote it and still
// silently fail every real caller: @x402/core's own ResourceInfoSchema caps
// `resource.serviceName` at 32 characters, and our own capacity-attest
// server shipped two paid tools with a 53- and a 71-character serviceName.
// No error, no log line, nothing — a spec-compliant client's own
// PaymentRequiredSchema.safeParse() just silently returned success:false,
// so extractPaymentRequiredFromResult() never even recognized the response
// as payment-required at all. Confirmed by temporarily reverting the fix
// and watching parsePaymentRequired() fail with its own exact error.
//
// This tool runs that SAME, real, official schema against a seller's own
// response, so a builder can catch this class of bug themselves in seconds
// instead of debugging a silent paymentMade:false for an hour, the way we
// did. It does not try to re-implement the schema's rules by hand — it
// imports parsePaymentRequired directly from @x402/core, so this tool can
// never drift from whatever the real client libraries actually enforce.
//
// TWO TRANSPORTS, because our own motivating bug lived in the second one.
// Plain x402 (a REST-style route, one URL = one priced action): the 402
// status IS the payment-required signal, and the response body IS the
// PaymentRequired object directly. MCP (one URL serves many named tools,
// e.g. @x402/mcp's createPaymentWrapper, which both of our own bugs lived
// in): the HTTP layer almost always answers 200 regardless of outcome, and
// the payment-required object is nested inside a JSON-RPC tool result's
// `content[0].text`, itself a JSON string, only when `isError:true` AND the
// caller named a specific tool via `mcpToolName` — calling an MCP endpoint
// with no tool named cannot produce a payment-required signal at all, since
// the endpoint does not know which tool's price to quote.
//
// HONEST LIMIT, stated here because it matters: this only sees the HTTP/MCP
// -level response. It cannot see whether the seller's OWN signer can
// actually broadcast a transaction once a real payment settles — that was
// the OTHER bug we found tonight (a signer with no provider attached), and
// it only shows up after a real settlement. No read-only, anonymous check
// can see that from the outside; it would need an actual paid test call
// against the seller's own endpoint, a materially different, bigger thing
// (a funded test wallet spending real money against a THIRD PARTY'S
// service) that this tool deliberately does not attempt. See README.md.

import { guardedFetch } from "tokenizen-net-guard";
import { parsePaymentRequired } from "@x402/core/schemas";

export interface ConformanceIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

export interface ConformanceReport {
  /** True only if the response is schema-valid AND has no error-severity issue. A warning alone does not fail this. */
  ok: boolean;
  testedUrl: string;
  /** The transport this report actually used. */
  transport: "rest" | "mcp";
  /** The raw HTTP status received. For MCP this is usually 200 even on a real payment-required outcome — see the module header. */
  httpStatus: number | null;
  /** Did @x402/core's own parsePaymentRequired() accept the extracted object at all? null means the schema was never reached (network/transport/status/body error before extraction) — never read null as a schema failure. */
  schemaValid: boolean | null;
  /** Raw zod issue messages from parsePaymentRequired(), empty if schemaValid. */
  schemaErrors: string[];
  /** Extra, honest sanity checks the schema itself does not enforce (address shape, resource.url match). Never schema violations themselves. */
  issues: ConformanceIssue[];
  /** The exact payment-required JSON object this report actually validated, for a caller who wants to inspect it directly rather than trust this report alone. Null if none could be extracted. */
  rawPaymentRequired: unknown | null;
}

export interface CheckOptions {
  /**
   * Name of the MCP tool to probe. Required to get any signal at all from
   * an MCP endpoint (one URL, many tools) — without it, there is no way to
   * ask "what would THIS tool cost", so this function falls back to the
   * plain REST transport (a bare POST), which is the right behavior for a
   * single-purpose x402 route and the wrong one for an MCP endpoint tested
   * without naming a tool.
   */
  mcpToolName?: string;
  /** Arguments sent with the MCP tools/call probe. Default {} — UNVERIFIED whether a given paid tool checks payment before its own input validation; {} may hit an input error instead of the payment-required signal. If so, pass real arguments. */
  mcpToolArguments?: Record<string, unknown>;
  /**
   * Overrides the fetch implementation. Defaults to net-guard's own
   * guardedFetch, which is what makes this function safe to point at a
   * caller-supplied URL in the first place — this seam exists ONLY so this
   * package's own tests can reach a local fixture server (itself on
   * 127.0.0.1, which guardedFetch correctly refuses as loopback), never as
   * something a real caller of this package should reach for.
   */
  fetchImpl?: typeof fetch;
}

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function errorReport(
  resourceUrl: string,
  transport: "rest" | "mcp",
  httpStatus: number | null,
  field: string,
  message: string,
): ConformanceReport {
  return {
    ok: false,
    testedUrl: resourceUrl,
    transport,
    httpStatus,
    schemaValid: null,
    schemaErrors: [],
    issues: [{ severity: "error", field, message }],
    rawPaymentRequired: null,
  };
}

/** Extracts the JSON payload from an MCP transport response, which may be plain JSON or SSE-framed ("event: message\ndata: {...}\n\n"). */
function extractMcpEnvelope(rawText: string): unknown {
  const dataLine = rawText.split("\n").find((l) => l.startsWith("data:"));
  const jsonText = dataLine ? dataLine.slice("data:".length).trim() : rawText;
  return JSON.parse(jsonText);
}

async function checkRest(resourceUrl: string, fetchImpl: typeof fetch): Promise<ConformanceReport> {
  let res: Response;
  try {
    res = await fetchImpl(resourceUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
    });
  } catch (e) {
    return errorReport(resourceUrl, "rest", null, "network", `could not reach this URL: ${(e as Error).message}`);
  }

  const rawText = await res.text();
  if (res.status !== 402) {
    let body: unknown = rawText;
    try {
      body = JSON.parse(rawText);
    } catch {
      // keep the raw text if it is not JSON
    }
    const report = errorReport(
      resourceUrl,
      "rest",
      res.status,
      "status",
      `expected HTTP 402 Payment Required, got ${res.status} — this tool only checks a payment-required response, not a free/successful one`,
    );
    report.rawPaymentRequired = body;
    return report;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    return errorReport(resourceUrl, "rest", res.status, "body", "response body is not valid JSON");
  }

  return finishReport(resourceUrl, "rest", res.status, body);
}

async function checkMcp(
  resourceUrl: string,
  toolName: string,
  toolArguments: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<ConformanceReport> {
  let res: Response;
  try {
    res = await fetchImpl(resourceUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: toolArguments } }),
    });
  } catch (e) {
    return errorReport(resourceUrl, "mcp", null, "network", `could not reach this URL: ${(e as Error).message}`);
  }

  const rawText = await res.text();
  let envelope: unknown;
  try {
    envelope = extractMcpEnvelope(rawText);
  } catch {
    return errorReport(resourceUrl, "mcp", res.status, "body", "could not parse this MCP endpoint's response as JSON (plain or SSE-framed)");
  }

  const result = (envelope as { result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> } }).result;
  if (!result) {
    return errorReport(resourceUrl, "mcp", res.status, "body", `response has no "result" field — is "${toolName}" a real tool name on this endpoint?`);
  }
  if (result.isError !== true) {
    return errorReport(
      resourceUrl,
      "mcp",
      res.status,
      "payment",
      `calling "${toolName}" with empty arguments succeeded without ever demanding payment — either it is not actually payment-gated, or {} happened to satisfy it for free`,
    );
  }
  const text = result.content?.[0]?.text;
  if (typeof text !== "string") {
    return errorReport(resourceUrl, "mcp", res.status, "body", "the error result has no text content to parse as a payment-required object");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorReport(
      resourceUrl,
      "mcp",
      res.status,
      "body",
      `the error result's text is not valid JSON — this may just mean "${toolName}" rejected the given arguments before any payment check ran, not a schema problem`,
    );
  }

  return finishReport(resourceUrl, "mcp", res.status, body);
}

/** Shared tail: run the real schema, then the extra, honest sanity checks, for either transport. */
function finishReport(resourceUrl: string, transport: "rest" | "mcp", httpStatus: number, body: unknown): ConformanceReport {
  const parsed = parsePaymentRequired(body);
  const issues: ConformanceIssue[] = [];
  const schemaErrors: string[] = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);

  if (parsed.success) {
    for (const req of parsed.data.accepts) {
      if (!ETH_ADDRESS_RE.test(req.asset)) {
        issues.push({ severity: "warning", field: "accepts[].asset", message: `"${req.asset}" does not look like a 0x-prefixed 20-byte address` });
      }
      if (!ETH_ADDRESS_RE.test(req.payTo)) {
        issues.push({ severity: "warning", field: "accepts[].payTo", message: `"${req.payTo}" does not look like a 0x-prefixed 20-byte address` });
      }
    }
    if (parsed.data.x402Version === 2 && transport === "rest" && parsed.data.resource.url !== resourceUrl) {
      issues.push({
        severity: "warning",
        field: "resource.url",
        message: `declares resource.url "${parsed.data.resource.url}", which does not match the URL actually tested ("${resourceUrl}") — a real client may refuse this as resource-mismatched`,
      });
    }
  }

  return {
    ok: parsed.success && issues.every((i) => i.severity !== "error"),
    testedUrl: resourceUrl,
    transport,
    httpStatus,
    schemaValid: parsed.success,
    schemaErrors,
    issues,
    rawPaymentRequired: body,
  };
}

/**
 * Checks resourceUrl's own payment-required response against the REAL
 * client-side PaymentRequiredSchema from @x402/core. Routes every outbound
 * request through net-guard's guardedFetch: resourceUrl is caller-supplied
 * and this function's whole job is to accept an arbitrary URL from the
 * public, so it is exactly net-guard's own threat model, applied here from
 * the first line rather than retrofitted after a live finding (see this
 * package's README for why that lesson is the direct reason it exists).
 *
 * Pass `mcpToolName` for an MCP endpoint (one URL serving several named
 * tools, e.g. anything built with @x402/mcp's createPaymentWrapper).
 * Without it, this sends a plain, bare POST and expects the payment-required
 * signal to be the HTTP status itself (402) with the object as the body —
 * correct for a single-purpose REST route, and the wrong transport for an
 * MCP endpoint, which will not produce a useful signal without a tool name.
 */
export async function checkX402Conformance(resourceUrl: string, opts: CheckOptions = {}): Promise<ConformanceReport> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(resourceUrl);
  } catch {
    return errorReport(resourceUrl, opts.mcpToolName ? "mcp" : "rest", null, "url", `not a valid URL: ${resourceUrl}`);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return errorReport(resourceUrl, opts.mcpToolName ? "mcp" : "rest", null, "url", `refusing non-http(s) URL scheme "${parsedUrl.protocol}"`);
  }

  const fetchImpl = opts.fetchImpl ?? guardedFetch;
  if (opts.mcpToolName) {
    return checkMcp(resourceUrl, opts.mcpToolName, opts.mcpToolArguments ?? {}, fetchImpl);
  }
  return checkRest(resourceUrl, fetchImpl);
}
