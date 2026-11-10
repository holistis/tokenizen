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
  /** Null when the inputs were rejected as non-comparable BEFORE any network call was made (see reason) — there is no probe to report. */
  reportA: ConformanceReport | null;
  reportB: ConformanceReport | null;
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
 * JSON with the keys of every object sorted, array order kept (it is part of the data). Two argument sets that
 * parse to the same data give the same string whatever order their keys were written in; a changed value, a
 * changed array order or a changed type still gives a different string. (epistemedeus, x402#3776, second replay:
 * comparing JSON.stringify output called {x:1,y:2} and {y:2,x:1} different.)
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

/** What a server receives for this URL: the fragment (#...) is never sent, so it is dropped. The order of query pairs is kept, it is part of the request. Null if not a parseable absolute URL. */
function requestUrl(u: string): string | null {
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return null;
  }
}

/** http://a.example/x and http://a.example/y share an origin; http://a.example and http://b.example do not. Null if either is not a parseable absolute URL. */
function sameOrigin(a: string, b: string): boolean | null {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return null;
  }
}

/**
 * Probes the same payment-gated endpoint/tool twice with two genuinely different inputs, and
 * reports whether the resource.url the seller returns (and, by the source trace above, would
 * send to a remote facilitator) actually tells the two requests apart.
 */
export async function checkResourceBinding(resourceUrl: string, opts: ResourceBindingOptions = {}): Promise<ResourceBindingReport> {
  const isMcp = Boolean(opts.mcpToolName);
  if (isMcp && !opts.variantToolArguments) {
    const single = await checkX402Conformance(resourceUrl, opts);
    return {
      distinguishable: null,
      testedUrl: resourceUrl,
      reportA: single,
      reportB: single,
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

  // Reject non-comparable inputs BEFORE making any network call: a verdict built from two
  // probes that were never actually different inputs in the first place would be a guess
  // wearing a true/false costume, not a measurement. (epistemedeus, x402-foundation/x402#3776,
  // 2026-11-09: a counter bug in his own test fixture, not this function, made two IDENTICAL
  // MCP argument sets look different; a REST variantUrl aimed at a different origin would
  // "differ" for a reason that has nothing to do with whether resource.url tracks the request.)
  if (isMcp) {
    const baseArgs = canonicalJson(opts.mcpToolArguments ?? {});
    const variantArgs = canonicalJson(opts.variantToolArguments);
    if (baseArgs === variantArgs) {
      return {
        distinguishable: null,
        testedUrl: resourceUrl,
        reportA: null,
        reportB: null,
        resourceUrlA: null,
        resourceUrlB: null,
        reason: "variantToolArguments is identical to mcpToolArguments (the same data, whatever order the keys are written in): nothing was actually varied between the two calls, so this cannot test whether resource.url tracks the request",
      };
    }
  } else {
    const sameRequestA = requestUrl(resourceUrl);
    if (sameRequestA !== null && sameRequestA === requestUrl(opts.variantUrl!)) {
      return {
        distinguishable: null,
        testedUrl: resourceUrl,
        reportA: null,
        reportB: null,
        resourceUrlA: null,
        resourceUrlB: null,
        reason: "variantUrl is the same request as resourceUrl (the part after # is never sent to the server): nothing was actually varied between the two calls, so this cannot test whether resource.url tracks the request",
      };
    }
    const origin = sameOrigin(resourceUrl, opts.variantUrl!);
    if (origin === false) {
      return {
        distinguishable: null,
        testedUrl: resourceUrl,
        reportA: null,
        reportB: null,
        resourceUrlA: null,
        resourceUrlB: null,
        reason: `variantUrl targets a different origin than resourceUrl (${new URL(opts.variantUrl!).origin} vs ${new URL(resourceUrl).origin}): a difference there would not isolate whether resource.url tracks the REQUEST rather than just the host`,
      };
    }
  }

  const reportA = await checkX402Conformance(resourceUrl, opts);
  const reportB = isMcp
    ? await checkX402Conformance(resourceUrl, { ...opts, mcpToolArguments: opts.variantToolArguments })
    : await checkX402Conformance(opts.variantUrl!, opts);

  // RELEASE-BLOCKING FIX (epistemedeus, same thread): comparing resource.url is only
  // meaningful once BOTH probes are an actual, schema-valid payment-required response. Before
  // this check, a 402 with resource.url set but no valid `accepts` array, or a plain HTTP 200
  // that happened to contain a JSON object shaped like {resource:{url:...}}, could still have
  // its resource.url read and compared — producing a confident true/false verdict built on at
  // least one response that was never a real x402 challenge in the first place.
  if (reportA.schemaValid !== true || reportB.schemaValid !== true) {
    return {
      distinguishable: null,
      testedUrl: resourceUrl,
      reportA,
      reportB,
      resourceUrlA: extractResourceUrl(reportA),
      resourceUrlB: extractResourceUrl(reportB),
      reason: "one or both probes were not a schema-valid payment-required response (see reportA/reportB.schemaValid and .schemaErrors) — comparing resource.url across an invalid response proves nothing",
    };
  }

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
