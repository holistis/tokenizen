// rate-limit.ts — a minimal, in-memory per-IP fixed-window limiter.
//
// WHY THIS EXISTS: both routes behind this server trigger a real outbound
// DNS query and/or HTTP fetch to an attacker-chosen host (guarded by
// network-guard.ts, but still real network I/O against a public endpoint).
// wazir-al-ghanima's "rate-check" (4 veiligheidschecks) requires a limit per
// caller on anything that does real work per request, and this route is
// unauthenticated by design (the whole point of /check is that a stranger
// can use it without an account). A single in-memory, per-process window is
// intentionally simple for a first version — it resets on restart and does
// not share state across multiple processes/instances. That is a stated
// scaling limit, not a hidden one: if this server is ever run as more than
// one instance behind a load balancer, this needs a shared store (e.g.
// Redis) instead.
//
// DI SEAM: `now` is injectable so tests can move time forward deterministically
// instead of using real timers/sleeps.

import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  /** How to key a request — defaults to req.ip. Injectable so tests don't depend on a real socket's remote address. */
  keyFn?: (req: Request) => string;
}

interface Bucket {
  windowStart: number;
  count: number;
}

/** Creates an isolated limiter (its own bucket map) — call once per route/purpose, not once globally, so one route's abuse never exhausts another's budget. */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const now = options.now ?? (() => Date.now());
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? "unknown");
  const buckets = new Map<string, Bucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = keyFn(req);
    const t = now();
    const existing = buckets.get(key);

    if (!existing || t - existing.windowStart >= windowMs) {
      buckets.set(key, { windowStart: t, count: 1 });
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterMs = windowMs - (t - existing.windowStart);
      res.setHeader("Retry-After", Math.max(1, Math.ceil(retryAfterMs / 1000)).toString());
      res.status(429).json({
        ok: false,
        error: `rate limit exceeded: max ${max} requests per ${Math.round(windowMs / 1000)}s`,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
