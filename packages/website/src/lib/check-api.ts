// check-api.ts — typed client for the self-check-server backend behind
// /check (see packages/self-check-server). A browser cannot run the
// underlying node:dns/node:crypto ownership-proof logic itself, so this is a
// thin fetch wrapper around the two HTTP routes that logic is exposed
// through. No business logic lives here — both routes just forward to the
// already-tested functions in endpoint-attest/trust-attest-server.
//
// API_BASE, HONESTLY STATED: self-check-server is not yet deployed anywhere
// public. In dev this points at the local server (`npm run dev` in
// packages/self-check-server, default port 8787). In a production build it
// falls back to an api.tokenizen.nl subdomain that does not exist yet — that
// is a deliberate, visible placeholder for a deployment decision that has
// not been made (where this small Node service actually runs), not a
// silently broken default. Override with VITE_CHECK_API_URL at build time
// once that decision is made.
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

async function postJson<T>(path: string, body: unknown): Promise<T> {
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

export { CheckApiError };
