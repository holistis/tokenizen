// repo-price-check.ts: the pure logic behind the "Check your repository" block on /scan.
//
// It calls the free precheck of the scan server (GET /api/bug-intel/precheck?repo=owner/name on https://x402.tokenizen.nl) and turns the
// answer into a small typed outcome that the page shows as plain text. The server decides the size; this file only reads it.
// A price is shown only when the server itself sends a usable quote: with the price switch off (or the deep scan not live) the
// answer has no quote, and nothing here makes one up.
//
// Security: only owner/name leaves the browser (no cookies, no credentials, no referrer, no extra headers, so no preflight either);
// every value is checked here before the page sees it, and the page renders it as text. Server sentences are never shown.

const PRECHECK_BASE: string = (import.meta.env?.VITE_PRECHECK_API_URL as string | undefined) ?? "https://x402.tokenizen.nl";

/** How long one check may take. The server clones the repository, which can take a while for a large one. */
const TIMEOUT_MS = 45_000;

const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/(.+)$/i;

/**
 * What the visitor typed, reduced to "owner/name", or null when it is not a public GitHub repository name.
 * Rule: owner 1 to 39 of [A-Za-z0-9-], name 1 to 100 of [A-Za-z0-9_.-], exactly one slash, name not "." or "..", no whitespace, no URL.
 * A pasted https://github.com/owner/name (optionally with a trailing slash or .git) is reduced to owner/name first, then the rule applies.
 */
export function parseRepoInput(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (s.length === 0 || s.length > 300) return null;
  const url = GITHUB_URL_RE.exec(s);
  if (url) {
    s = url[1]!;
    if (s.endsWith("/")) s = s.slice(0, -1);
    if (s.toLowerCase().endsWith(".git")) s = s.slice(0, -4);
  }
  if (/\s/.test(s)) return null;
  const parts = s.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts as [string, string];
  if (!OWNER_RE.test(owner) || !NAME_RE.test(name)) return null;
  if (name === "." || name === "..") return null;
  return `${owner}/${name}`;
}

/** The address of the free check for one repository that already passed parseRepoInput. */
export function buildPrecheckUrl(repo: string, base: string = PRECHECK_BASE): string {
  return `${base.replace(/\/+$/, "")}/api/bug-intel/precheck?repo=${encodeURIComponent(repo)}`;
}

export interface RepoQuote {
  /** Whole cents, from the server's usd string. */
  cents: number;
  perMbCents: number | null;
  minimumCents: number | null;
  minimumApplied: boolean | null;
  validForSeconds: number | null;
}

export type RepoCheckErrorCode = "invalid" | "not_found" | "rate_limited" | "busy" | "unavailable" | "network" | "bad_response";

export type RepoCheckOutcome =
  | {
      kind: "measured";
      repo: string;
      sizeKb: number;
      /** Only when the server sends it. Never computed here. */
      estimatedLines: number | null;
      /** True when the server counted no Solidity of the project's own. */
      noSolidity: boolean;
      /** Only when the server sends a usable quote. */
      quote: RepoQuote | null;
    }
  | { kind: "error"; code: RepoCheckErrorCode };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A whole number from 0 up to the largest safe integer, or null. */
function count(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** "5", "5.5" or "5.00" (at most 7 digits before the point) to whole cents, or null. */
export function usdToCents(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

function readQuote(v: unknown): RepoQuote | null {
  if (!isObject(v) || v.available === false) return null;
  const cents = usdToCents(v.usd);
  if (cents === null || cents === 0 || !isObject(v.basis)) return null;
  const b = v.basis;
  return {
    cents,
    perMbCents: usdToCents(b.perMbUsd),
    minimumCents: usdToCents(b.minimumUsd),
    minimumApplied: typeof b.minimumApplied === "boolean" ? b.minimumApplied : null,
    validForSeconds: count(v.validForSeconds),
  };
}

/** The server's answer (status and raw body text) as an outcome. `repo` is the name the visitor asked for, already checked. */
export function interpretPrecheck(status: number, bodyText: string, repo: string): RepoCheckOutcome {
  if (status === 429) return { kind: "error", code: "rate_limited" };
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { kind: "error", code: "bad_response" };
  }
  if (!isObject(body)) return { kind: "error", code: "bad_response" };
  if (status === 400) return { kind: "error", code: "invalid" };
  if (status !== 200) return { kind: "error", code: "unavailable" };

  const measured = body.ok === true || (body.ok === false && body.reason === "no_in_scope_solidity");
  if (measured) {
    const sizeKb = count(body.inScopeKb);
    if (sizeKb === null) return { kind: "error", code: "bad_response" };
    return {
      kind: "measured",
      repo,
      sizeKb,
      estimatedLines: count(body.estimatedLines),
      noSolidity: body.ok === false,
      quote: body.ok === true ? readQuote(body.quote) : null,
    };
  }
  if (body.ok === false && body.reason === "not_found_or_private") return { kind: "error", code: "not_found" };
  if (body.ok === false && body.reason === "invalid_repo") return { kind: "error", code: "invalid" };
  if (body.ok === null && body.reason === "busy") return { kind: "error", code: "busy" };
  if (body.ok === null) return { kind: "error", code: "unavailable" };
  return { kind: "error", code: "bad_response" };
}

type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, "status" | "text">>;

/** The whole submit path: check the input, ask the server once, read the answer. Never throws. */
export async function runRepoCheck(input: string, fetchImpl: FetchLike = fetch, base: string = PRECHECK_BASE): Promise<RepoCheckOutcome> {
  const repo = parseRepoInput(input);
  if (repo === null) return { kind: "error", code: "invalid" };
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl(buildPrecheckUrl(repo, base), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      ...(controller ? { signal: controller.signal } : {}),
    });
    let text: string;
    try {
      text = await response.text();
    } catch {
      return { kind: "error", code: "bad_response" };
    }
    return interpretPrecheck(response.status, text, repo);
  } catch {
    return { kind: "error", code: "network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type RepoCheckLocale = "en" | "nl";

/** A whole number with thousands separators, done here so the result does not depend on the browser's locale data. */
export function formatCount(n: number, locale: RepoCheckLocale): string {
  const sep = locale === "nl" ? "." : ",";
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Cents as dollars with two decimals: "$5.00" in English, "$5,00" in Dutch. */
export function formatUsd(cents: number, locale: RepoCheckLocale): string {
  const whole = formatCount(Math.floor(cents / 100), locale);
  const rest = String(cents % 100).padStart(2, "0");
  return `$${whole}${locale === "nl" ? "," : "."}${rest}`;
}

/** A size in KB, as a whole number: "1,234 KB" or "1.234 KB". */
export function formatKb(kb: number, locale: RepoCheckLocale): string {
  return `${formatCount(kb, locale)} KB`;
}
