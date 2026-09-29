import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit.js";
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
});
