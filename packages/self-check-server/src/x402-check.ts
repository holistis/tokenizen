// x402-check.ts — the free, live check behind tokenizen.nl/x402-check: a stranger pastes the URL
// of their x402 endpoint and gets a dated verdict, without installing anything.
//
// THIS REVERSES A DECISION WRITTEN DOWN IN x402-badge.ts, and the reversal is deliberate. That
// file says the server never measures live, because measuring on request would let anyone use
// this server to probe arbitrary hosts from our address. The badge is still that way and stays
// that way. What changed is the value judgement: a seller who wants to know "will a real buyer's
// client accept my payment request" cannot be served by a dated bundle of other people's
// endpoints, only by a look at THEIR endpoint now. So the probe exists, and the probe-from-our-
// address worry is answered by limits instead of by refusing:
//
//   - one request per measurement in the normal case, at most MAX_REQUESTS_PER_CHECK in the worst
//     case (a retry with another method, a did:web document, two redirects), counted and enforced
//   - every outbound request goes through net-guard (IP-validated and pinned on every hop) and
//     then through the wrapper below: https only, port 443 only, GET or POST only, a fixed body of
//     {}, at most two redirects that may only stay on the pasted host or its www sibling, a response
//     cap of 64 KB (8 KB for a DID document), and any other host asked for exactly one thing, the
//     fixed file /.well-known/did.json without a query
//   - at most eight checks busy at once, and every request aborted when the deadline passes
//   - a result is cached for CACHE_TTL_MS, one host gets at most HOST_MAX live measurements per
//     hour and the whole server at most GLOBAL_MAX per hour, on top of the per-IP limit in app.ts
//   - nothing is stored. The cache lives in memory and dies with the process. No URL is logged.
//
// TWO CHECKS FROM ONE RESPONSE. The measurement is agent-receipt-verify's ladder (levels 0 to 2,
// the ones that need no payment), and the buyer check runs @x402/core's real parsePaymentRequired
// on the SAME response the ladder judged. One probe, one set of facts, so the two verdicts can
// never disagree about what the endpoint said.
//
// WHY THE BUYER CHECK IS NOT x402-lint. x402-lint reads only the response body. A v2 seller puts
// its requirements in the Payment-Required HEADER and answers with a body of {}, and measured on
// 2026-10-24 against our own live paid route, x402-lint called that schema-invalid ("x402Version:
// Invalid discriminator value"). A web page that told sellers their working endpoint is broken
// would be worse than no page. The schema is the same one (parsePaymentRequired); only the place
// it is read from differs.
//
// WHAT THIS DOES NOT DO, and the response says so too: it never pays, so levels 3 to 5 stay
// "not measured"; it sees what the endpoint answers to one anonymous request, not whether the
// seller's signer can settle; and it speaks REST-style x402 routes, not an MCP server with paid
// tools.

import { z } from "zod";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { parsePaymentRequired } from "@x402/core/schemas";
import { meetEindpunt, hoogsteTrede } from "agent-receipt-verify/src/x402-conformance-check.mjs";
import { TREDEN } from "agent-receipt-verify/src/x402-conformance-treden.mjs";
import {
  guardedFetch,
  assertPubliclyRoutableHost,
  UnsafeHostError,
  type RoutableHostDeps,
} from "tokenizen-net-guard";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REQUESTS_PER_CHECK = 6;
const MAX_REDIRECTS = 2;
const DEFAULT_DEADLINE_MS = 45_000;
const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_HOST_MAX = 12;
const DEFAULT_GLOBAL_MAX = 200;
const BUDGET_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CONCURRENT = 8;
const MAX_CACHE_ENTRIES = 500;
const MAX_TRACKED_HOSTS = 5000;
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const LADDER_URL = "https://github.com/holistis/agent-receipt-verify/blob/main/CONFORMANCE.md";

const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]", "g");

/** Text that came from the measured party is cut and stripped of control characters before it goes anywhere. */
function clean(value: unknown, max = 200): string {
  return String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .slice(0, max);
}

// ── the target ───────────────────────────────────────────────────────────────────────────────

const HOSTNAME_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const INTERNAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

/** Returns a reason when a hostname may not be dialed from here, otherwise null. IP literals never pass: a real seller has a name. */
function hostnameProblem(hostname: string): string | null {
  if (!HOSTNAME_RE.test(hostname)) return "the host must be a public domain name (no IP addresses, no single-word hosts)";
  if (INTERNAL_SUFFIXES.some((s) => hostname.endsWith(s))) return "the host looks like an internal name";
  return null;
}

export type NormalisedTarget = { ok: true; url: string; host: string } | { ok: false; error: string };

/** Turns what a visitor pasted into the one URL we are willing to measure, or says plainly why not. */
export function normaliseTarget(raw: unknown): NormalisedTarget {
  if (typeof raw !== "string") return { ok: false, error: "url must be a string" };
  let text = raw.trim();
  if (text.length === 0 || text.length > 2048) return { ok: false, error: "url must be between 1 and 2048 characters" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "https://" + text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "that does not look like a URL" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "only https URLs can be checked" };
  if (url.username || url.password) return { ok: false, error: "a URL with a username or password is not accepted" };
  if (url.port !== "") return { ok: false, error: "only the standard https port (443) can be checked" };
  const problem = hostnameProblem(url.hostname);
  if (problem) return { ok: false, error: problem };
  url.hash = "";
  return { ok: true, url: url.href, host: url.hostname };
}

// ── the wrapper around net-guard ─────────────────────────────────────────────────────────────

/** What a failed connection is allowed to tell the visitor. Never an address: the resolved IP would make this an internal-DNS oracle. */
function networkErrorText(error: unknown): string {
  const e = error as { name?: string; code?: string; cause?: { code?: string; name?: string } } | undefined;
  const cause = e?.cause;
  if (error instanceof UnsafeHostError || cause instanceof UnsafeHostError) return "the host is not publicly routable";
  const code = String(cause?.code ?? e?.code ?? "");
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || /TIMEOUT/i.test(code)) return "the connection timed out";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "the host name does not resolve";
  if (code === "ECONNREFUSED") return "the connection was refused";
  if (/^(CERT_|ERR_TLS|DEPTH_ZERO|UNABLE_TO_VERIFY|SELF_SIGNED|HOSTNAME_MISMATCH)/.test(code)) return "the TLS certificate was not accepted";
  return "the connection failed";
}

export interface SafeFetchLimits {
  /** The host that was pasted. Redirects may only stay within it (or its www sibling). */
  endpointHost: string;
  maxRequests: number;
  maxBodyBytes: number;
  maxRedirects: number;
  deadlineAt: number;
  now: () => number;
  /** Aborted when the deadline passes, so sockets are closed and not only ignored. */
  signal?: AbortSignal;
}

/** A DID document is small. A bigger one is refused, which also bounds the cost of decoding its key. */
const MAX_DID_BYTES = 8 * 1024;
const DID_PATH = "/.well-known/did.json";

const sameSite = (a: string, b: string) => a === b || a === "www." + b || b === "www." + a;

/**
 * The only fetch the measurement libraries get. It sits ON TOP of net-guard, which pins the IP on
 * every hop, and adds what net-guard leaves to its callers: a request budget, a body cap, a method
 * allowlist and a redirect policy.
 *
 * WHERE IT MAY GO. The party being measured chooses two things that lead somewhere else: where a
 * redirect points and which did:web document its offer names. Left alone, both turn this server into a
 * relay that sends requests with a path and query of the measured party's choosing to a host that
 * never agreed to be measured (found by the adversarial review of 2026-10-24, reproduced with a
 * fake). So: a redirect may only stay on the pasted host or its www sibling, and any other host may
 * be asked for exactly one thing, the fixed file /.well-known/did.json without a query.
 */
export function makeSafeFetch(base: typeof fetch, limits: SafeFetchLimits): { fetchImpl: typeof fetch; requestsMade: () => number } {
  let made = 0;

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let url = input instanceof URL ? input.href : String(input);
    let method = String(init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") throw new Error("only GET and POST are used");
    let body = init?.body;
    const refuseRedirects = init?.redirect === "error";

    for (let hop = 0; ; hop++) {
      if (limits.now() > limits.deadlineAt) throw new Error("the check ran out of time");
      if (made >= limits.maxRequests) throw new Error("the request budget for one check is used up");
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        throw new Error("the target is not a valid URL");
      }
      // The same rules as for the pasted URL, applied to every later address too: a redirect or a
      // did:web document is chosen by the party being measured, not by the visitor.
      if (target.protocol !== "https:" || target.username || target.password || target.port !== "" || hostnameProblem(target.hostname)) {
        throw new Error("the target is not permitted");
      }
      if (!sameSite(target.hostname, limits.endpointHost)) {
        const onlyTheFixedDidFile = hop === 0 && method === "GET" && target.pathname === DID_PATH && target.search === "";
        if (!onlyTheFixedDidFile) throw new Error("the target is not permitted");
      }
      made++;
      const signals = [limits.signal, init?.signal].filter((x): x is AbortSignal => x instanceof AbortSignal);
      let res: Response;
      try {
        res = await base(target.href, { ...init, method, body, redirect: "manual", ...(signals.length ? { signal: AbortSignal.any(signals) } : {}) });
      } catch (error) {
        throw new Error(networkErrorText(error));
      }
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => undefined);
        if (refuseRedirects) throw new Error("a redirect was refused");
        if (hop >= limits.maxRedirects) throw new Error("too many redirects");
        try {
          url = new URL(location, target).href;
        } catch {
          throw new Error("the redirect target is not a valid URL");
        }
        if (res.status !== 307 && res.status !== 308 && method === "POST") {
          method = "GET";
          body = undefined;
        }
        continue;
      }
      const isDid = target.pathname.endsWith("/did.json");
      const capped = await readCapped(res, isDid ? MAX_DID_BYTES : limits.maxBodyBytes);
      if (isDid && capped.status === 200) {
        // The library puts the parser's own error text, which quotes the start of the body, into
        // its answer. A fixed sentence leaves nothing of a third party's file in the response.
        try {
          JSON.parse(await capped.clone().text());
        } catch {
          throw new Error("the DID document is not valid JSON");
        }
      }
      return capped;
    }
  };

  return { fetchImpl: fetchImpl as unknown as typeof fetch, requestsMade: () => made };
}

/** Reads at most maxBytes and returns a fully buffered Response, so a caller can read it as often as it likes. */
async function readCapped(res: Response, maxBytes: number): Promise<Response> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      let step: Awaited<ReturnType<typeof reader.read>>;
      try {
        step = await reader.read();
      } catch (error) {
        throw new Error(networkErrorText(error));
      }
      if (step.done) break;
      total += step.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`the response body is larger than ${Math.round(maxBytes / 1024)} KB, so it was not read`);
      }
      chunks.push(step.value);
    }
  }
  if (res.status < 200 || res.status > 599) throw new Error("the endpoint answered with an unusable HTTP status");
  const payload = NULL_BODY_STATUSES.has(res.status) ? null : Buffer.concat(chunks);
  return new Response(payload, { status: res.status, statusText: res.statusText, headers: res.headers });
}

// ── what we measure ──────────────────────────────────────────────────────────────────────────

export type Status = "pass" | "fail" | "not_measured";

export interface BuyerCheck {
  status: Status;
  httpStatus: number | null;
  /** Where the payment requirements were read from. */
  source: "header" | "body" | null;
  x402Version: number | null;
  /** Why it did not pass, in the words of the schema or of the HTTP exchange. */
  problems: string[];
  warnings: string[];
}

export interface LevelResult {
  level: number;
  name: string;
  requirement: string;
  status: Status | "not_evaluated";
  evidence: string;
}

export interface CheckResult {
  url: string;
  method: "GET" | "POST";
  measuredAt: string;
  summary: string;
  buyerCheck: BuyerCheck;
  ladder: {
    highestLevel: number;
    levels: LevelResult[];
    methodRetried: { from: string; to: string; firstStatus: number } | null;
    definition: string;
  };
  requestsMade: number;
  limits: string[];
}

const LIMITS = [
  "This check never pays. Levels 3 to 5 of the ladder need a real settlement and are reported as not measured, which is not the same as failed.",
  "It looks at what the endpoint answers to one anonymous request. It cannot see whether the seller's own signer can settle a payment.",
  "REST-style x402 routes only. For an MCP server with paid tools, use the command line tool.",
  "The result is a snapshot with a date. Nothing is stored on our side.",
];

const STATUS_FROM_METER: Record<string, Status> = { HAALT: "pass", HAALT_NIET: "fail", ONGEMETEN: "not_measured" };

interface Recorded {
  url: string;
  status: number;
  headers: Headers;
  text: string;
}

function decodeRequirements(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The buyer-side question, answered from the response the ladder judged. */
function buyerCheckFrom(recorded: Recorded | undefined): BuyerCheck {
  const empty: BuyerCheck = { status: "not_measured", httpStatus: null, source: null, x402Version: null, problems: [], warnings: [] };
  if (!recorded) return { ...empty, problems: ["no response could be read from this URL"] };
  const base: BuyerCheck = { ...empty, httpStatus: recorded.status };
  if (recorded.status !== 402) {
    return { ...base, status: "fail", problems: [`expected HTTP 402 Payment Required, got ${recorded.status}`] };
  }
  const header = decodeRequirements(recorded.headers.get("payment-required"));
  let source: "header" | "body" = "header";
  let found: unknown = header;
  if (found === null || typeof found !== "object") {
    source = "body";
    try {
      found = JSON.parse(recorded.text);
    } catch {
      found = null;
    }
  }
  if (found === null || typeof found !== "object") {
    return { ...base, status: "fail", problems: ["a 402 with no readable payment requirements, neither in the Payment-Required header nor in the body"] };
  }
  const parsed = parsePaymentRequired(found);
  if (!parsed.success) {
    return {
      ...base,
      status: "fail",
      source,
      problems: parsed.error.issues.slice(0, 10).map((i) => clean(`${i.path.join(".") || "(root)"}: ${i.message}`)),
    };
  }
  const warnings: string[] = [];
  for (const accepted of parsed.data.accepts) {
    if (!String(accepted.network).startsWith("eip155:")) continue;
    if (!EVM_ADDRESS_RE.test(accepted.asset)) warnings.push(clean(`accepts[].asset "${accepted.asset}" does not look like a 0x-prefixed 20-byte address`));
    if (!EVM_ADDRESS_RE.test(accepted.payTo)) warnings.push(clean(`accepts[].payTo "${accepted.payTo}" does not look like a 0x-prefixed 20-byte address`));
  }
  return { ...base, status: "pass", source, x402Version: parsed.data.x402Version, warnings: warnings.slice(0, 5) };
}

function summarise(levels: LevelResult[], buyer: BuyerCheck, highest: number): string {
  const first = levels[0];
  if (!first || first.status === "not_measured") {
    return `Could not read an answer from this URL (${first?.evidence ?? "no detail"}).`;
  }
  if (first.status === "fail") {
    return `This URL does not ask for payment the way x402 says: ${first.evidence}.`;
  }
  if (buyer.status === "fail") {
    return `It asks for payment, but a buyer client that validates with the official x402 schema will not recognise the request: ${buyer.problems[0] ?? "schema mismatch"}.`;
  }
  return `It asks for payment in a form a buyer client accepts. On the receipt ladder it reaches level ${highest}; levels 0 to 2 are the ones that can be measured without paying.`;
}

export interface MeasureDeps {
  base: typeof fetch;
  now: () => number;
  deadlineMs: number;
}

/** One live measurement. Never throws for anything the measured party does. */
export async function measureEndpoint(url: string, method: "GET" | "POST", deps: MeasureDeps): Promise<CheckResult> {
  const started = deps.now();
  const controller = new AbortController();
  const safe = makeSafeFetch(deps.base, {
    endpointHost: new URL(url).hostname,
    signal: controller.signal,
    maxRequests: MAX_REQUESTS_PER_CHECK,
    maxBodyBytes: MAX_BODY_BYTES,
    maxRedirects: MAX_REDIRECTS,
    deadlineAt: started + deps.deadlineMs,
    now: deps.now,
  });

  // The last response to the endpoint itself, which is the one the ladder's verdict rests on (the
  // ladder may retry with another method), kept so the buyer check can read the same bytes.
  let lastForEndpoint: Recorded | undefined;
  const recording = (async (input: string | URL | Request, init?: RequestInit) => {
    const res = await safe.fetchImpl(input, init);
    const target = input instanceof URL ? input.href : String(input);
    if (target === url) {
      lastForEndpoint = { url: target, status: res.status, headers: res.headers, text: await res.clone().text() };
    }
    return res;
  }) as unknown as typeof fetch;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), deps.deadlineMs);
  });
  let meting: Awaited<ReturnType<typeof meetEindpunt>> | null = null;
  let stopped: "timeout" | "failed" | null = null;
  try {
    const outcome = await Promise.race([meetEindpunt(url, { fetchImpl: recording, methode: method }), timeout]);
    if (outcome === "timeout") stopped = "timeout";
    else meting = outcome;
  } catch (error) {
    // The library choked on something in the answer (hostile JSON of the measured party, for one). Our
    // log gets the message only: an error object can carry the request that caused it.
    stopped = "failed";
    console.error("[x402-check] the measurement threw:", String((error as Error)?.message ?? "unknown").slice(0, 200));
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }

  const levels: LevelResult[] = TREDEN.map((t) => {
    const raw = meting?.treden[t.sleutel];
    const status: Status | "not_evaluated" = raw ? (STATUS_FROM_METER[raw] ?? "not_measured") : "not_evaluated";
    const evidence = meting?.bewijs[t.sleutel];
    return {
      level: t.nummer,
      name: clean(t.naam, 120),
      requirement: clean(t.eis, 400),
      status,
      evidence: clean(typeof evidence === "string" ? evidence : meting ? "" : "the check did not finish"),
    };
  });
  const highest = meting ? hoogsteTrede(meting) : -1;
  const retried = meting?.bewijs["methode_opnieuw"] as { eerste?: string; tweede?: string; eerste_status?: number } | undefined;
  const buyer = meting ? buyerCheckFrom(lastForEndpoint) : buyerCheckFrom(undefined);

  return {
    url,
    method,
    measuredAt: new Date(deps.now()).toISOString(),
    summary: meting
      ? summarise(levels, buyer, highest)
      : stopped === "failed"
        ? "Something in this endpoint's answer made the check stop on our side, so nothing was measured."
        : "The check did not finish in time, so nothing was measured.",
    buyerCheck: buyer,
    ladder: {
      highestLevel: highest,
      levels,
      methodRetried: retried?.eerste && retried.tweede ? { from: clean(retried.eerste, 10), to: clean(retried.tweede, 10), firstStatus: Number(retried.eerste_status ?? 0) } : null,
      definition: LADDER_URL,
    },
    requestsMade: safe.requestsMade(),
    limits: LIMITS,
  };
}

// ── limits, cache, and the public entry point ────────────────────────────────────────────────

export type CheckOutcome =
  | { kind: "invalid"; error: string }
  | { kind: "limited"; error: string; retryAfterSeconds: number }
  | { kind: "done"; result: CheckResult; cached: boolean };

export interface X402CheckerOptions {
  /** The egress used for every request. Defaults to net-guard's guardedFetch; tests inject a fake. */
  fetchImpl?: typeof fetch;
  /** Injected into the early "is this host public" check, so tests do not need a real DNS lookup. */
  routableHostDeps?: RoutableHostDeps;
  now?: () => number;
  cacheTtlMs?: number;
  hostMax?: number;
  globalMax?: number;
  deadlineMs?: number;
  /** How many checks may be busy at once, DNS lookup included. */
  maxConcurrent?: number;
}

export function createX402Checker(options: X402CheckerOptions = {}) {
  const base = options.fetchImpl ?? guardedFetch;
  const now = options.now ?? (() => Date.now());
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const hostMax = options.hostMax ?? DEFAULT_HOST_MAX;
  const globalMax = options.globalMax ?? DEFAULT_GLOBAL_MAX;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  let active = 0;

  const cache = new Map<string, { at: number; result: CheckResult }>();
  const inFlight = new Map<string, Promise<CheckResult>>();
  const perHost = new Map<string, number[]>();
  let globalStamps: number[] = [];

  const recent = (stamps: number[], t: number) => stamps.filter((s) => t - s < BUDGET_WINDOW_MS);
  const retryAfter = (stamps: number[], t: number) =>
    stamps.length === 0 ? 60 : Math.max(1, Math.ceil((BUDGET_WINDOW_MS - (t - Math.min(...stamps))) / 1000));

  async function check(raw: unknown, methodInput: "GET" | "POST" = "POST"): Promise<CheckOutcome> {
    const target = normaliseTarget(raw);
    if (!target.ok) return { kind: "invalid", error: target.error };
    const key = `${methodInput} ${target.url}`;

    const t0 = now();
    const hit = cache.get(key);
    if (hit && t0 - hit.at < cacheTtlMs) return { kind: "done", result: hit.result, cached: true };

    // The host lookup below runs on the shared thread pool, and a name server that never answers keeps a
    // thread busy after its promise has already given up. Capping how many checks may be busy at once
    // keeps a burst of such names from starving every other lookup, file read and hash in the process.
    if (active >= maxConcurrent) {
      return { kind: "limited", error: "the checker is busy right now, please try again in a few seconds", retryAfterSeconds: 5 };
    }
    active++;
    try {
      return await live(target, key, methodInput);
    } finally {
      active--;
    }
  }

  async function live(target: { url: string; host: string }, key: string, methodInput: "GET" | "POST"): Promise<CheckOutcome> {
    // A rejected host must not cost a budget slot, and its reason must not say what it resolved to.
    try {
      await assertPubliclyRoutableHost(target.host, options.routableHostDeps);
    } catch (error) {
      if (error instanceof UnsafeHostError) return { kind: "invalid", error: "that host does not resolve to a public address" };
      throw error;
    }

    const running = inFlight.get(key);
    if (running) return { kind: "done", result: await running, cached: false };

    const t = now();
    const hostStamps = recent(perHost.get(target.host) ?? [], t);
    if (hostStamps.length >= hostMax) {
      return { kind: "limited", error: "this host was measured several times in the last hour, please try again later", retryAfterSeconds: retryAfter(hostStamps, t) };
    }
    globalStamps = recent(globalStamps, t);
    if (globalStamps.length >= globalMax) {
      return { kind: "limited", error: "the checker is busy, please try again later", retryAfterSeconds: retryAfter(globalStamps, t) };
    }
    hostStamps.push(t);
    if (!perHost.has(target.host) && perHost.size >= MAX_TRACKED_HOSTS) {
      const oldest = perHost.keys().next().value;
      if (oldest !== undefined) perHost.delete(oldest);
    }
    perHost.set(target.host, hostStamps);
    globalStamps.push(t);

    const promise = measureEndpoint(target.url, methodInput, { base, now, deadlineMs });
    inFlight.set(key, promise);
    try {
      const result = await promise;
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { at: now(), result });
      return { kind: "done", result, cached: false };
    } finally {
      inFlight.delete(key);
    }
  }

  return { check };
}

export type X402Checker = ReturnType<typeof createX402Checker>;

const CheckBody = z.object({
  url: z.string().min(1).max(2048),
  method: z.enum(["GET", "POST"]).optional(),
});

/** POST /api/x402/check with { url, method? }. The answer carries verdicts only: never the endpoint's raw headers or body. */
export function handleX402Check(checker: X402Checker) {
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = CheckBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'send a JSON body like {"url":"https://your-service.example/route"}' });
      return;
    }
    const outcome = await checker.check(parsed.data.url, parsed.data.method ?? "POST");
    if (outcome.kind === "invalid") {
      res.status(400).json({ ok: false, error: outcome.error });
      return;
    }
    if (outcome.kind === "limited") {
      res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
      res.status(429).json({ ok: false, error: outcome.error });
      return;
    }
    res.status(200).json({ ok: true, cached: outcome.cached, ...outcome.result });
  };
}
