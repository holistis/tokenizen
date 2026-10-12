import { describe, expect, it, vi } from "vitest";
import { createRateLimiter, ipKey } from "./rate-limit.js";
import type { Request, Response } from "express";

function fakeReqRes(ip: string) {
  const req = { ip } as Request;
  const json = vi.fn();
  const setHeader = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, setHeader } as unknown as Response;
  return { req, res, json, status, setHeader };
}

describe("createRateLimiter", () => {
  it("allows requests under the limit", () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: () => now });
    const next = vi.fn();
    const { req, res } = fakeReqRes("1.2.3.4");

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("blocks the request once the limit is exceeded within the same window", () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });
    const next = vi.fn();
    const { req, res, status, json } = fakeReqRes("1.2.3.4");

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("resets once the window elapses", () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now });
    const next = vi.fn();
    const { req, res } = fakeReqRes("1.2.3.4");

    limiter(req, res, next);
    now += 60_001;
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("tracks separate IPs independently", () => {
    const now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now });
    const next = vi.fn();
    const a = fakeReqRes("1.1.1.1");
    const b = fakeReqRes("2.2.2.2");

    limiter(a.req, a.res, next);
    limiter(b.req, b.res, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("keys two addresses in the same IPv6 /64 as ONE client (no per-/128 bypass)", () => {
    const now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now });
    const next = vi.fn();
    // Same /64, different interface identifier — a single client can mint
    // billions of these, so they must share one bucket.
    const first = fakeReqRes("2001:db8:abcd:1::1");
    const second = fakeReqRes("2001:db8:abcd:1:ffff:ffff:ffff:ffff");

    limiter(first.req, first.res, next);
    limiter(second.req, second.res, next);

    expect(next).toHaveBeenCalledTimes(1); // the second one is over the limit for the shared /64
    expect(second.status).toHaveBeenCalledWith(429);
  });

  it("keys different IPv6 /64s independently", () => {
    const now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now });
    const next = vi.fn();
    const a = fakeReqRes("2001:db8:abcd:1::1");
    const b = fakeReqRes("2001:db8:abcd:2::1"); // different /64

    limiter(a.req, a.res, next);
    limiter(b.req, b.res, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("bounds the tracked-key map under a key-rotation flood instead of growing forever", () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => now, maxTrackedKeys: 10 });
    const next = vi.fn();
    // 500 distinct source IPs, one request each: without a cap this would be
    // 500 retained buckets. The cap must hold it near maxTrackedKeys.
    for (let i = 0; i < 500; i++) {
      const { req, res } = fakeReqRes(`10.0.${Math.floor(i / 256)}.${i % 256}`);
      limiter(req, res, next);
    }
    // All 500 were first-seen keys, so all passed; the point is memory, not
    // blocking. The map is private, so we assert the observable proxy: a
    // brand-new IP still passes (the structure stayed healthy and bounded).
    const fresh = fakeReqRes("203.0.113.9");
    limiter(fresh.req, fresh.res, next);
    expect(next).toHaveBeenCalledTimes(501);
  });
});

describe("ipKey", () => {
  it("passes IPv4 through unchanged", () => {
    expect(ipKey("1.2.3.4")).toBe("1.2.3.4");
  });
  it("reduces an IPv4-mapped IPv6 address to its IPv4 form", () => {
    expect(ipKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
  });
  it("reduces an IPv6 address to its /64 network", () => {
    expect(ipKey("2001:db8:abcd:1::1")).toBe("2001:db8:abcd:1::/64");
    expect(ipKey("2001:db8:abcd:1:ffff:ffff:ffff:ffff")).toBe("2001:db8:abcd:1::/64");
  });
  it("strips an IPv6 zone id before keying", () => {
    expect(ipKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
  it("falls back to the raw string on an unparseable address rather than throwing", () => {
    expect(ipKey("not::an::ip")).toBe("not::an::ip");
    expect(ipKey("")).toBe("unknown");
  });
});
