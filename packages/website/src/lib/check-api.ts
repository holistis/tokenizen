// check-api.ts — typed client for the self-check-server backend behind
// /check (see packages/self-check-server). A browser cannot run the
// underlying node:dns/node:crypto ownership-proof logic itself, so this is a
// thin fetch wrapper around the two HTTP routes that logic is exposed
// through. No business logic lives here — both routes just forward to the
// already-tested functions in endpoint-attest/trust-attest-server.
//
// API_BASE: in dev this points at the local server (`npm run dev` in
// packages/self-check-server, default port 8787). A production build uses
// https://api.tokenizen.nl, which is live: self-check-server runs there under
// its own unprivileged user behind Caddy (Let's Encrypt), with the Node port
// reachable only from localhost. Override with VITE_CHECK_API_URL at build
// time to point a build somewhere else.
const API_BASE: string =
  (import.meta.env.VITE_CHECK_API_URL as string | undefined) ??
  (import.meta.env.PROD ? "https://api.tokenizen.nl" : "http://localhost:8787");

export type OwnershipMethod = "dns-txt" | "well-known-file";

export interface ChallengeResult {
  ok: true;
  dnsTxt: { location: string; token: string };
  wellKnownFile: { location: string; token: string };
  instructions: string;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type VerifyResult =
  | { ok: true; method: OwnershipMethod; location: string; verifiedAt: string }
  | { ok: false; method: OwnershipMethod; location: string; reason: string };

class CheckApiError extends Error {}

async function postJson<T>(path: string, body: unknown, options: { keepRateLimitBody?: boolean } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CheckApiError("Could not reach the check service. It may be offline, or your connection dropped.");
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new CheckApiError(`The check service returned an unreadable response (HTTP ${response.status}).`);
  }

  // The x402 check has two different 429s (this connection, or the host being checked) and the server
  // says which one, so that route keeps the server's own sentence instead of the generic one below.
  if (response.status === 429 && options.keepRateLimitBody && (parsed as ApiError).ok === false) {
    return parsed as T;
  }
  if (response.status === 429) {
    throw new CheckApiError("Too many attempts from this connection. Please wait a few minutes and try again.");
  }
  if (!response.ok && (parsed as ApiError).ok !== false) {
    throw new CheckApiError(`The check service returned HTTP ${response.status}.`);
  }
  return parsed as T;
}

export async function getOwnershipChallenge(endpoint: string, ownerAddress: string): Promise<ChallengeResult | ApiError> {
  return postJson<ChallengeResult | ApiError>("/api/challenge", { endpoint, ownerAddress });
}

export async function verifyOwnership(
  endpoint: string,
  ownerAddress: string,
  method: OwnershipMethod,
): Promise<VerifyResult | ApiError> {
  return postJson<VerifyResult | ApiError>("/api/verify-ownership", { endpoint, ownerAddress, method });
}

export type X402Status = "pass" | "fail" | "not_measured";

export interface X402BuyerCheck {
  status: X402Status;
  httpStatus: number | null;
  source: "header" | "body" | null;
  x402Version: number | null;
  problems: string[];
  warnings: string[];
}

export interface X402Level {
  level: number;
  name: string;
  requirement: string;
  status: X402Status | "not_evaluated";
  evidence: string;
}

export interface X402CheckResult {
  ok: true;
  cached: boolean;
  url: string;
  method: "GET" | "POST";
  measuredAt: string;
  summary: string;
  buyerCheck: X402BuyerCheck;
  ladder: {
    highestLevel: number;
    levels: X402Level[];
    methodRetried: { from: string; to: string; firstStatus: number } | null;
    definition: string;
  };
  requestsMade: number;
  limits: string[];
}

/** One live look at an x402 endpoint. Free, never pays, see packages/self-check-server/src/x402-check.ts. */
export async function checkX402Endpoint(url: string, method: "GET" | "POST"): Promise<X402CheckResult | ApiError> {
  return postJson<X402CheckResult | ApiError>("/api/x402/check", { url, method }, { keepRateLimitBody: true });
}

export type CraStatus = "visible" | "not_visible" | "not_measured";

export interface CraControl {
  id: string;
  topic: string;
  status: CraStatus;
  evidence?: string;
  explanation: string;
  fix?: string;
}

export interface CraCheckResult {
  ok: true;
  cached: boolean;
  repo: string;
  measuredAt: string;
  rules: { version: string; reviewedOn: string; basis: string; regulation: string };
  summary: { measured: number; visible: number; notVisible: number; notMeasured: number };
  controls: CraControl[];
  advisories: string;
  whatThisDoesNotMeasure: string[];
  notice: string;
  sourcesRead: string[];
}

/** What is visible, in a public GitHub repository, of eight CRA points. Free, reads only, see packages/self-check-server/src/cra-check.ts. */
export async function checkCraRepo(repo: string): Promise<CraCheckResult | ApiError> {
  return postJson<CraCheckResult | ApiError>("/api/cra/check", { repo }, { keepRateLimitBody: true });
}

export { CheckApiError };
