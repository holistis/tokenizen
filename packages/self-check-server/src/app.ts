// app.ts — the HTTP surface behind tokenizen.nl/check.
//
// WHY THIS PACKAGE EXISTS AT ALL: the ownership-proof logic
// (challengeToken/verifyOwnership in endpoint-attest, getOwnershipChallenge
// in trust-attest-server) uses node:crypto and node:dns, which a browser
// cannot run. This is the thin, real (non-mock) backend a browser page can
// call instead — it does not reimplement any of that logic, only wires it up
// over HTTP, plus the two protections that logic never needed when its only
// caller was an MCP client: the net-guard egress choke-point (every real
// DNS/HTTP call goes through net-guard's IP-validating, IP-pinning guarded
// fetch/resolver) and a per-IP rate limit (rate-limit.ts), because this is
// now reachable by any anonymous visitor.
//
// THREE ROUTES, MATCHING THE FREE/PAID SPLIT IN trust-attest-server:
//   POST /api/challenge        — free, no network call, derives the token.
//   POST /api/verify-ownership — free, ONE real DNS/HTTP check of whatever
//                                 the visitor already published. This is the
//                                 ownership proof only — it does not run
//                                 trust-attest-server's paid checks and does
//                                 not sign an attestation. That is
//                                 deliberate: requestTrustAttestation is the
//                                 PAID tool (checks + signed attestation),
//                                 and this page must not trigger a paid
//                                 action from a free "verify" button. Wiring
//                                 request_trust_attestation behind real
//                                 payment (mcp-paywall / x402) is left for a
//                                 later, separate change — see the website's
//                                 /check page copy, which says so plainly
//                                 rather than hiding a stub behind a working
//                                 button.
//   POST /api/paid/verify-ownership — the same ownership proof, settled over
//                                 x402 first, answering with a signed
//                                 offer-receipt alongside the proof. The
//                                 receipt IS the product here: the answer
//                                 itself stays free above. Present only when a
//                                 seller is configured; see x402-seller.ts for
//                                 why a price we cannot settle must never be
//                                 advertised, and why this still does not
//                                 trigger trust-attest-server's paid checks or
//                                 sign an attestation.

import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  ETH_ADDRESS_RE,
  OWNERSHIP_METHODS,
  endpointHost,
  verifyOwnership,
  type OwnershipCheckDeps,
  type OwnershipMethod,
} from "endpoint-attest";
import { getOwnershipChallenge, type GetOwnershipChallengeResult } from "trust-attest-server/dist/server.js";
import { loadOwnershipSecret, type OwnershipContext } from "trust-attest-server/dist/attester-identity.js";
import {
  assertPubliclyRoutableHost,
  assertHostnameLiteralSafe,
  UnsafeHostError,
  guardedFetch,
  resolveTxtGuarded,
  type RoutableHostDeps,
} from "tokenizen-net-guard";
import { readSellerConfig, buildPaymentMiddleware, type SellerConfig } from "./x402-seller.js";
import { createRateLimiter } from "./rate-limit.js";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "https://tokenizen.nl", "https://www.tokenizen.nl"];

export interface CreateAppOptions {
  /**
   * x402 seller configuration. Omit to read it from the environment, which is
   * what production does. Pass null in a test to keep the paid route off even
   * when the environment happens to carry a key.
   */
  seller?: SellerConfig | null | undefined;

  /**
   * The ownership-challenge secret (HMAC) to use — NOT a full signing identity.
   * This edge issues and verifies ownership challenges but never signs an
   * attestation, so it deliberately holds only the secret, never the
   * attestation signing key (that key would be pure attack surface on the one
   * component any anonymous visitor can reach). Defaults to loadOwnershipSecret(),
   * which reads TRUST_ATTEST_OWNERSHIP_SECRET — set it to the SAME value the
   * signing server uses, so challenges issued here match what that server
   * expects. A full AttesterIdentity also satisfies this type (tests pass one).
   */
  identity?: OwnershipContext;
  /** Injected into verifyOwnership — lets tests supply a fake DNS/fetch instead of touching the network. In production this defaults to net-guard's guardedFetch + resolveTxtGuarded, so the real ownership fetch is IP-validated and pinned, not just pre-checked. */
  ownershipDeps?: OwnershipCheckDeps;
  /** Injected into the early host pre-check — lets tests supply a fake DNS lookup instead of touching the network. */
  routableHostDeps?: RoutableHostDeps;
  /** Origins allowed to call this API. Defaults to the production domains + the local Vite dev server. */
  allowedOrigins?: string[];
  /**
   * Express `trust proxy` setting, which decides how req.ip is resolved and
   * therefore what the per-IP rate limiter keys on. Default false (req.ip is
   * the direct socket address). Behind a proxy/CDN this MUST be set to the
   * exact number of trusted proxy hops (e.g. 1), NEVER `true`: `true` trusts a
   * client-supplied X-Forwarded-For end to end, so a caller could spoof it to
   * get a fresh rate-limit bucket per request. Left false, a proxied
   * deployment keys everyone on the proxy's IP (over-limiting, not bypass) —
   * fail-safe, but set the hop count for correct per-client limits.
   */
  trustProxy?: boolean | number | string;
  /** Rate limit for the (real network I/O) verify-ownership route. Defaults to 10 requests / 5 minutes per IP. */
  verifyRateLimit?: { windowMs: number; max: number };
  /** Rate limit for the (no network I/O) challenge route. Defaults to 30 requests / 5 minutes per IP — looser, since it is pure local HMAC, same posture trust-attest-server's own comments describe for get_ownership_challenge. */
  challengeRateLimit?: { windowMs: number; max: number };
}

const ChallengeBody = z.object({
  endpoint: z.string().min(1).max(2048),
  ownerAddress: z.string().regex(ETH_ADDRESS_RE, "ownerAddress must be a 0x-prefixed 20-byte address"),
});

const VerifyBody = z.object({
  endpoint: z.string().min(1).max(2048),
  ownerAddress: z.string().regex(ETH_ADDRESS_RE, "ownerAddress must be a 0x-prefixed 20-byte address"),
  method: z.enum(OWNERSHIP_METHODS),
});

function badRequest(res: Response, message: string): void {
  res.status(400).json({ ok: false, error: message });
}

/** Resolves the host out of `endpoint` and rejects it if it is not publicly routable. Returns null (and has already responded) on failure, so callers can `if (!(await guard(...))) return;`. */
async function guardEndpointHost(endpoint: string, res: Response, deps?: RoutableHostDeps): Promise<boolean> {
  let host: string;
  try {
    host = endpointHost(endpoint);
  } catch (e) {
    badRequest(res, (e as Error).message);
    return false;
  }
  try {
    await assertPubliclyRoutableHost(host, deps);
  } catch (e) {
    if (e instanceof UnsafeHostError) {
      // Do NOT echo e.message: it embeds the RESOLVED address (e.g. "resolves
      // to 10.1.2.3, a private address"), which would turn this endpoint into
      // an internal-DNS recon oracle for an anonymous caller. A generic
      // rejection is enough for the legitimate user.
      badRequest(res, "endpoint host is not publicly routable");
      return false;
    }
    throw e;
  }
  return true;
}

/**
 * A NON-RESOLVING host guard for the challenge route: rejects an obviously
 * internal host LITERAL (loopback/private/metadata/.internal) cheaply, without
 * any DNS query. The challenge route opens no connection, so there is nothing
 * to SSRF-pre-filter by resolution — running a lookup there would be a
 * gratuitous internal-DNS recon oracle (and would leak the resolved IP). The
 * literal is caller-supplied, so refusing it leaks nothing.
 */
function guardEndpointLiteralOnly(endpoint: string, res: Response): boolean {
  let host: string;
  try {
    host = endpointHost(endpoint);
  } catch (e) {
    badRequest(res, (e as Error).message);
    return false;
  }
  try {
    assertHostnameLiteralSafe(host);
  } catch (e) {
    if (e instanceof UnsafeHostError) {
      badRequest(res, "endpoint host is not permitted");
      return false;
    }
    throw e;
  }
  return true;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const identity = options.identity ?? loadOwnershipSecret();
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  // Production egress for the one real network call this server makes goes
  // through net-guard: the fetch is IP-validated and pinned, closing the gap
  // where the old code pre-checked the host but then fetched with a raw,
  // re-resolving global fetch. Tests inject their own stubs.
  const ownershipDeps: OwnershipCheckDeps =
    options.ownershipDeps ?? { fetchImpl: guardedFetch, resolveTxtRecords: (name) => resolveTxtGuarded(name) };
  const challengeLimiter = createRateLimiter({
    windowMs: options.challengeRateLimit?.windowMs ?? 5 * 60 * 1000,
    max: options.challengeRateLimit?.max ?? 30,
  });
  const verifyLimiter = createRateLimiter({
    windowMs: options.verifyRateLimit?.windowMs ?? 5 * 60 * 1000,
    max: options.verifyRateLimit?.max ?? 10,
  });

  const app = express();
  app.disable("x-powered-by");
  // Decides how req.ip (the rate-limit key) is resolved. Default false; behind
  // a proxy set options.trustProxy to the exact hop count, never true (see the
  // option's doc — true lets a client spoof X-Forwarded-For past the limiter).
  app.set("trust proxy", options.trustProxy ?? false);
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    }),
  );
  // Small body limit: every field here is short (a URL, an address, a
  // method name) — nothing about this API legitimately needs a large body.
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/api/challenge", challengeLimiter, async (req: Request, res: Response) => {
    const parsed = ChallengeBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { endpoint, ownerAddress } = parsed.data;
    // Literal-only guard: reject an obviously-internal host LITERAL cheaply, but
    // do NOT resolve. This route opens no connection (pure local HMAC), so the
    // old resolving check was a gratuitous internal-DNS recon oracle on the
    // loose-limit tier; a name that merely RESOLVES to an internal address is
    // harmless to derive a token for and is blocked for real at verify time by
    // guardedFetch. getOwnershipChallenge also validates the URL shape.
    if (!guardEndpointLiteralOnly(endpoint, res)) return;

    const result: GetOwnershipChallengeResult = getOwnershipChallenge({ endpoint, ownerAddress }, identity);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    res.status(200).json(result);
  });

  // One implementation, two routes. The paid route differs only in that a
  // payment is settled first and a signed receipt comes back with the answer;
  // a second copy of this logic would be a second thing to keep correct.
  const handleVerifyOwnership = async (req: Request, res: Response): Promise<void> => {
    const parsed = VerifyBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { endpoint, ownerAddress, method } = parsed.data;
    if (!(await guardEndpointHost(endpoint, res, options.routableHostDeps))) return;

    const proof = await verifyOwnership(
      method as OwnershipMethod,
      endpoint,
      ownerAddress,
      identity.ownershipSecret,
      ownershipDeps,
    );
    res.status(200).json(proof);
  };

  app.post("/api/verify-ownership", verifyLimiter, handleVerifyOwnership);

  // The paid twin, and only when a seller is actually configured. Unconfigured
  // means no 402 and no route at all, because advertising a price we cannot
  // settle would be a false promise. See x402-seller.ts for why this exists:
  // the buyer's half of a delivery record has nothing to name while no seller
  // emits receipts.
  const seller = options.seller === undefined ? readSellerConfig(process.env) : options.seller;
  if (seller) {
    app.use(buildPaymentMiddleware(seller));
    app.post("/api/paid/verify-ownership", verifyLimiter, handleVerifyOwnership);
  }

  // Last resort: a route handler throwing (a bug, an unexpected rejection)
  // must never leak a stack trace to the caller (exposure-check) — respond
  // with a flat 500 and let the process's own logging capture the detail.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("self-check-server: unhandled route error:", err);
    res.status(500).json({ ok: false, error: "internal error" });
  });

  return app;
}
