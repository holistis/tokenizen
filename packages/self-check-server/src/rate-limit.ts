// rate-limit.ts — a minimal, in-memory per-IP fixed-window limiter.
//
// WHY THIS EXISTS: both routes behind this server trigger a real outbound
// DNS query and/or HTTP fetch to an attacker-chosen host (routed through the
// net-guard egress choke-point, but still real network I/O against a public
// endpoint).
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
// THREE HARDENINGS over the first version, because the key IS the client's IP
// and an attacker chooses their own source address:
//   1. IPv6 is keyed on the /64 network, not the full /128. A single client
//      typically controls an entire /64, so keying on the full address would
//      let them rotate to a fresh bucket for every request and never be
//      limited. IPv4 keeps its full /32. (See ipKey.)
//   2. The real client IP depends on `trust proxy` being set correctly in
//      app.ts — behind a proxy/CDN, req.ip is otherwise the proxy's address
//      (one shared bucket for everyone). app.ts exposes that as a configurable,
//      never-blindly-`true` option; this file just keys on whatever req.ip the
//      framework resolved.
//   3. The bucket map is bounded (sweep-expired-then-cap), so an IP-rotation
//      flood cannot grow it without limit into a memory DoS. Eviction only
//      RESETS a key's counter, so it can forgive but never punish — an attacker
//      cannot use it to deny service to a specific victim.
//
// DI SEAM: `now` is injectable so tests can move time forward deterministically
// instead of using real timers/sleeps.

import type { NextFunction, Request, Response } from "express";

/** What a route that answers a refusal itself gets to know. */
export interface RateLimitInfo {
  max: number;
  windowSeconds: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  /** How to key a request — defaults to the normalized req.ip (see ipKey). Injectable so tests don't depend on a real socket's remote address. */
  keyFn?: (req: Request) => string;
  /** Hard cap on how many distinct keys are tracked at once — a memory backstop against key-rotation flooding. Default 100_000. */
  maxTrackedKeys?: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 100_000;

/**
 * Reduce a client IP to its rate-limit key. IPv4 (and hostnames) key on the
 * full value; IPv6 keys on the /64 network prefix, because a single client
 * usually controls a whole /64 and keying on the full /128 would hand them an
 * unlimited supply of fresh buckets. An IPv4-mapped IPv6 address
 * (::ffff:a.b.c.d) is reduced to its IPv4 form first so it keys the same as a
 * native IPv4 connection from that host.
 */
export function ipKey(ip: string): string {
  if (!ip) return "unknown";
  let addr = ip.trim().toLowerCase();
  const pct = addr.indexOf("%"); // strip a zone id, e.g. fe80::1%eth0
  if (pct !== -1) addr = addr.slice(0, pct);
  if (addr === "") return "unknown";

  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return mapped[1]!;

  if (!addr.includes(":")) return addr; // IPv4 or a hostname: key as-is

  const net = ipv6Network64(addr);
  return net ?? addr; // unparseable IPv6: fall back to the full string (never throws)
}

/** Expand an IPv6 address to 8 hextets and return its /64 network ("h0:h1:h2:h3::/64"), or null if it does not parse as plain IPv6. */
function ipv6Network64(addr: string): string | null {
  const halves = addr.split("::");
  if (halves.length > 2) return null; // more than one "::" is invalid
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;

  let hextets: string[];
  if (tail === null) {
    hextets = head; // no "::": must already be all 8
    if (hextets.length !== 8) return null;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // "::" must stand for at least one zero group
    hextets = [...head, ...Array(missing).fill("0"), ...tail];
  }
  if (hextets.length !== 8) return null;

  const prefix: string[] = [];
  for (let i = 0; i < 4; i++) {
    const h = hextets[i] ?? "0";
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null; // a dotted-quad tail or junk: give up, caller falls back
    prefix.push(parseInt(h, 16).toString(16));
  }
  return `${prefix.join(":")}::/64`;
}

interface Bucket {
  windowStart: number;
  count: number;
}

/** Creates an isolated limiter (its own bucket map) — call once per route/purpose, not once globally, so one route's abuse never exhausts another's budget. */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const now = options.now ?? (() => Date.now());
  const keyFn = options.keyFn ?? ((req: Request) => ipKey(req.ip ?? "unknown"));
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;

  /**
   * Bound the map before inserting a genuinely new key. The full expired-sweep
   * is AMORTIZED — run at most once per window, not on every insert — so a
   * key-rotation flood sitting at the cap cannot force an O(n) scan per request
   * (new keys are not rate-limited, so without this each flood request paid an
   * O(maxTrackedKeys) scan). Between sweeps, if still at the cap, evict a
   * single oldest-inserted bucket, which is O(1). Eviction only resets a key's
   * counter, so it can forgive but never punish a specific victim.
   */
  function boundBeforeInsert(t: number): void {
    if (buckets.size < maxTrackedKeys) return;
    if (t - lastSweep >= windowMs) {
      for (const [k, b] of buckets) {
        if (t - b.windowStart >= windowMs) buckets.delete(k);
      }
      lastSweep = t;
    }
    if (buckets.size >= maxTrackedKeys) {
      let toDrop = buckets.size - maxTrackedKeys + 1;
      for (const k of buckets.keys()) {
        if (toDrop-- <= 0) break;
        buckets.delete(k);
      }
    }
  }

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = keyFn(req);
    const t = now();
    const existing = buckets.get(key);

    if (!existing || t - existing.windowStart >= windowMs) {
      if (!existing) boundBeforeInsert(t); // only a brand-new key can grow the map
      buckets.set(key, { windowStart: t, count: 1 });
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterMs = windowMs - (t - existing.windowStart);
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      // A route that wants to answer in its own protocol (the MCP route answers with a tool result) sets res.locals.onRateLimited.
      const custom = res.locals?.onRateLimited as ((info: RateLimitInfo) => void) | undefined;
      if (typeof custom === "function") {
        custom({ max, windowSeconds: Math.round(windowMs / 1000), retryAfterSeconds });
        return;
      }
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
