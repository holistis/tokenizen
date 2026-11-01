// deep-scan-api.ts: the calls of the deep scan pages to the scan service (scan.tokenizen.nl). Every call is a POST with a JSON body, also when it only
// reads, so that the private key of a report never appears in an address, a log or a history. fetch can be passed in, which is how the tests run.

import type { OrderState } from "@/lib/deep-scan-logic";

const API_BASE: string =
  (import.meta.env.VITE_SCAN_API_URL as string | undefined) ?? (import.meta.env.PROD ? "https://scan.tokenizen.nl" : "http://localhost:8789");

export interface ApiFailure {
  ok: false;
  status: number;
  error: string;
}

export interface Quote {
  ok: true;
  token: string;
  repo: string;
  regels: number;
  prijsCenten: number;
  valuta: "eur";
  prijsTekst: string;
  voorwaardenVersie: string;
}

export interface OrderStatus {
  ok: true;
  repo: string;
  regels: number;
  prijsCenten: number;
  toestand: OrderState;
  betaald: boolean;
  terugbetaling: boolean;
  terugbetaald: boolean;
  rapportKlaar: boolean;
}

export interface Hypothesis {
  title?: string;
  severity?: string;
  category?: string;
  file?: string;
  function?: string;
  description?: string;
  attackPath?: string;
  impact?: string;
  recommendation?: string;
  confidence?: number;
}

export interface Report {
  versie: number;
  gemaaktOp: string;
  repository: string;
  commit: string;
  inScope: { regels: number; bestanden: number };
  gelezen: { bestanden: number; vanTotaal: number; percentage: number | null; nietGelezen: string[] } | null;
  volledig: boolean;
  hypotheses: Hypothesis[];
  wat: string;
  meting: string;
}

type Fetch = typeof fetch;

async function post<T>(path: string, body: unknown, fetchFn: Fetch, timeoutMs: number): Promise<T | ApiFailure> {
  let response: Response;
  try {
    response = await fetchFn(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    /* not JSON */
  }
  if (response.ok && json && typeof json === "object" && (json as { ok?: unknown }).ok === true) return json as T;
  const error = json && typeof json === "object" && typeof (json as { fout?: unknown }).fout === "string" ? (json as { fout: string }).fout : "unknown";
  return { ok: false, status: response.status, error };
}

/** A price for a repository. The server clones it to count the lines, which can take a minute. */
export const getQuote = (repo: string, fetchFn: Fetch = fetch) => post<Quote>("/v1/quote", { repo }, fetchFn, 150_000);

/** Starts the payment. On success the browser goes to the payment page of Stripe. */
export const startCheckout = (token: string, termsVersion: string, fetchFn: Fetch = fetch) =>
  post<{ ok: true; url: string }>("/v1/checkout", { token, akkoord: true, voorwaardenVersie: termsVersion }, fetchFn, 30_000);

export const getStatus = (token: string, fetchFn: Fetch = fetch) => post<OrderStatus>("/v1/status", { token }, fetchFn, 20_000);

export const getReport = (token: string, fetchFn: Fetch = fetch) => post<{ ok: true; rapport: Report }>("/v1/report", { token }, fetchFn, 30_000);

/** Only an address on stripe.com may be followed after a checkout call; anything else is refused before the browser moves. */
export function isStripeUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "stripe.com" || u.hostname.endsWith(".stripe.com"));
  } catch {
    return false;
  }
}
