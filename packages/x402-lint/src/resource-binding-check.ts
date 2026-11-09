// resource-binding-check.ts — detects whether a seller's resource.url (and therefore what a
// remote facilitator receives at /verify and /settle) actually varies with the request, or
// collapses to one fixed value regardless of what was asked for.
//
// WHY THIS EXISTS. x402-foundation/x402#3776 (epistemedeus, 2026-11-09) found that
// @x402/core, @x402/express and @x402/mcp 2.30.0 send only
// {x402Version, paymentPayload, paymentRequirements} to a remote facilitator's /verify and
// /settle. paymentPayload.resource.url is EITHER the real request's own URL (varies with
// every call) OR a fixed, configured string (never varies), depending on how the seller set
// up its route — confirmed by source trace: @x402/core builds it as
// `routeConfig.resource || adapter.getUrl()`, and @x402/mcp always passes a fixed
// `mcp://tool/<name>` string, never the call's own arguments.
//
// The same resource.url value a seller returns in its own PaymentRequired challenge (which
// checkX402Conformance already reads into rawPaymentRequired) is exactly the value that would
// reach the facilitator — so a black-box client can detect the collapsing case without ever
// seeing the seller's source code: ask the same endpoint/tool twice, with two genuinely
// different inputs, and see whether resource.url moves. See the independent conformance
// vectors at github.com/holistis/agent-receipt-verify, branch
// feat/facilitator-request-binding, for the source-level proof this check's inference rests on.
//
// HONEST LIMIT: this cannot see the facilitator's wire traffic itself (no outside caller can,
// that is the whole finding). It infers the collapse from the one field known, by source
// trace, to feed both the client-facing challenge and the facilitator payload. A seller on a
// transport that does NOT build resource.url this way would not be meaningfully checked by
// this; today's known-affected transports (@x402/core, @x402/express, @x402/mcp) are exactly
// the ones this applies to. A collapse is reported as a WARNING, not an error: an unvarying
// resource.url is not itself proof of an exploitable bug (the resource server may bind payment
// to operation some other way, e.g. a signed, content-addressed claim id) — it is a signal
// that the facilitator cannot be the one enforcing that binding, which is worth knowing either way.

import { checkX402Conformance, type CheckOptions, type ConformanceReport } from "./check.js";

export interface ResourceBindingReport {
  /** True if resource.url differed between the two probes (the facilitator-visible value DOES track the request). False if it collapsed to one value despite different input. Null if it could not be measured at all (see reason). */
  distinguishable: boolean | null;
  testedUrl: string;
  reportA: ConformanceReport;
  reportB: ConformanceReport;
  resourceUrlA: string | null;
  resourceUrlB: string | null;
  reason?: string;
}

export interface ResourceBindingOptions extends CheckOptions {
  /** REST transport: a second, genuinely different full URL (e.g. a different query string) to compare against `resourceUrl`. Required for REST; ignored for MCP. */
  variantUrl?: string;
  /** MCP transport: a second, genuinely different argument set to compare against `mcpToolArguments`. Required for MCP; ignored for REST. */
  variantToolArguments?: Record<string, unknown>;
}

function extractResourceUrl(report: ConformanceReport): string | null {
  const raw = report.rawPaymentRequired as { resource?: { url?: unknown } } | null;
  const url = raw?.resource?.url;
  return typeof url === "string" ? url : null;
}

/**
 * Probes the same payment-gated endpoint/tool twice with two genuinely different inputs, and
 * reports whether the resource.url the seller returns (and, by the source trace above, would
 * send to a remote facilitator) actually tells the two requests apart.
 */
export async function checkResourceBinding(resourceUrl: string, opts: ResourceBindingOptions = {}): Promise<ResourceBindingReport> {
  const isMcp = Boolean(opts.mcpToolName);
  if (isMcp && !opts.variantToolArguments) {
    return {
      distinguishable: null,
      testedUrl: resourceUrl,
      reportA: await checkX402Conformance(resourceUrl, opts),
      reportB: await checkX402Conformance(resourceUrl, opts),
      resourceUrlA: null,
      resourceUrlB: null,
      reason: "mcpToolName given without variantToolArguments: nothing to compare against",
    };
  }
  if (!isMcp && !opts.variantUrl) {
    const single = await checkX402Conformance(resourceUrl, opts);
    return {
      distinguishable: null,
      testedUrl: resourceUrl,
      reportA: single,
      reportB: single,
      resourceUrlA: extractResourceUrl(single),
      resourceUrlB: extractResourceUrl(single),
      reason: "REST transport given without variantUrl: nothing to compare against",
    };
  }

  const reportA = await checkX402Conformance(resourceUrl, opts);
  const reportB = isMcp
    ? await checkX402Conformance(resourceUrl, { ...opts, mcpToolArguments: opts.variantToolArguments })
    : await checkX402Conformance(opts.variantUrl!, opts);

  const resourceUrlA = extractResourceUrl(reportA);
  const resourceUrlB = extractResourceUrl(reportB);

  if (resourceUrlA === null || resourceUrlB === null) {
    return {
      distinguishable: null,
      testedUrl: resourceUrl,
      reportA,
      reportB,
      resourceUrlA,
      resourceUrlB,
      reason: "one or both probes did not yield a readable resource.url (see reportA/reportB.schemaErrors or .issues)",
    };
  }

  return {
    distinguishable: resourceUrlA !== resourceUrlB,
    testedUrl: resourceUrl,
    reportA,
    reportB,
    resourceUrlA,
    resourceUrlB,
  };
}
