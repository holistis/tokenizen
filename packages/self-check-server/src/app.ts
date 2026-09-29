// app.ts — the HTTP surface behind tokenizen.nl/check.
//
// WHY THIS PACKAGE EXISTS AT ALL: the ownership-proof logic
// (challengeToken/verifyOwnership in endpoint-attest, getOwnershipChallenge
// in trust-attest-server) uses node:crypto and node:dns, which a browser
// cannot run. This is the thin, real (non-mock) backend a browser page can
// call instead — it does not reimplement any of that logic, only wires it up
// over HTTP, plus the two protections that logic never needed when its only
// caller was an MCP client: an SSRF guard (network-guard.ts) and a per-IP
// rate limit (rate-limit.ts), because this is now reachable by any
// anonymous visitor.
//
// TWO ROUTES ONLY, MATCHING THE FREE/PAID SPLIT IN trust-attest-server:
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
import { getOwnershipChallenge, identity as defaultIdentity, type GetOwnershipChallengeResult } from "trust-attest-server/dist/server.js";
import type { AttesterIdentity } from "trust-attest-server/dist/attester-identity.js";
import { assertPubliclyRoutableHost, UnsafeHostError, type NetworkGuardDeps } from "./network-guard.js";
import { createRateLimiter } from "./rate-limit.js";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "https://tokenizen.nl", "https://www.tokenizen.nl"];

export interface CreateAppOptions {
  /** Signing/HMAC identity to use. Defaults to trust-attest-server's module-level identity so a challenge issued via this server matches what verify-ownership expects, within one process lifetime — same constraint attester-identity.ts documents for the MCP server itself. */
  identity?: AttesterIdentity;
  /** Injected into verifyOwnership — lets tests supply a fake DNS/fetch instead of touching the network. */
  ownershipDeps?: OwnershipCheckDeps;
  /** Injected into the SSRF guard — lets tests supply a fake DNS lookup instead of touching the network. */
  networkGuardDeps?: NetworkGuardDeps;
  /** Origins allowed to call this API. Defaults to the production domains + the local Vite dev server. */
  allowedOrigins?: string[];
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
async function guardEndpointHost(endpoint: string, res: Response, deps?: NetworkGuardDeps): Promise<boolean> {
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
      badRequest(res, e.message);
      return false;
    }
    throw e;
  }
  return true;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const identity = options.identity ?? defaultIdentity;
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
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
    if (!(await guardEndpointHost(endpoint, res, options.networkGuardDeps))) return;

    const result: GetOwnershipChallengeResult = getOwnershipChallenge({ endpoint, ownerAddress }, identity);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    res.status(200).json(result);
  });

  app.post("/api/verify-ownership", verifyLimiter, async (req: Request, res: Response) => {
    const parsed = VerifyBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { endpoint, ownerAddress, method } = parsed.data;
    if (!(await guardEndpointHost(endpoint, res, options.networkGuardDeps))) return;

    const proof = await verifyOwnership(
      method as OwnershipMethod,
      endpoint,
      ownerAddress,
      identity.ownershipSecret,
      options.ownershipDeps,
    );
    res.status(200).json(proof);
  });

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
