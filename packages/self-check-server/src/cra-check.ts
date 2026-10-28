// cra-check.ts — the free, live CRA readiness check behind tokenizen.nl/cra-check: a stranger pastes the
// name of a PUBLIC GitHub repository and gets a dated list of what is visible of eight points the EU Cyber
// Resilience Act asks around vulnerability handling. What each point means is in cra-repo-check.ts.
//
// WHY THIS IS NOT AN SSRF SURFACE LIKE x402-check.ts. The visitor does not choose a host. The only hosts
// this file ever asks for are api.github.com and raw.githubusercontent.com, both fixed in cra-repo-check.ts,
// and the visitor's input is reduced to an "owner/repo" pair that must match a strict pattern before any URL
// is built from it. Even so the egress is net-guard's guardedFetch, like everywhere else in this package,
// and a redirect is refused outright (a public repository read never needs one).
//
// WHAT CAN STILL GO WRONG, and what stands in the way:
//   - the GitHub allowance: one check costs about seven API calls (the raw file reads are not counted by
//     GitHub). Without a token the allowance is 60 calls an hour for this whole server, so the hourly cap
//     below is small; with a token WITHOUT permissions it is 5000. When GitHub says "slow down", the answer
//     is a 429 and nothing is cached, never a report full of "not measured".
//   - a repository owner chooses how big their files are: every response is read with a byte cap (see
//     cra-repo-check.ts), and at most eight workflow files are read.
//   - a flood of different names: a per-IP limit in app.ts, a global hourly budget, at most MAX_CONCURRENT
//     checks busy at once, and a one hour cache per repository (a repository's state does not change by
//     the minute), so repeating the same name costs nothing.
//   - hostile text in a repository (file names, release asset names): cut and stripped of control characters
//     before it goes anywhere, and the page renders it as a text node.
// Nothing is stored. The cache lives in memory and dies with the process. No repository name is logged.

import { z } from "zod";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { guardedFetch } from "tokenizen-net-guard";
import { assessRepo, fetchSignals, parseRepo, type RepoReport } from "./cra-repo-check.js";

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DEADLINE_MS = 30_000;
const DEFAULT_MAX_CONCURRENT = 6;
const BUDGET_WINDOW_MS = 60 * 60 * 1000;
/** Each check is about seven API calls; stay well inside the allowance with and without a token. */
const DEFAULT_GLOBAL_MAX_WITHOUT_TOKEN = 6;
const DEFAULT_GLOBAL_MAX_WITH_TOKEN = 300;
const MAX_CACHE_ENTRIES = 1000;

export interface CraCheckerOptions {
  /** The egress used for every request. Defaults to net-guard's guardedFetch; tests inject a fake. */
  fetchImpl?: typeof fetch;
  /** A GitHub token with NO permissions, only to raise the hourly allowance for public reads. */
  githubToken?: string;
  now?: () => number;
  cacheTtlMs?: number;
  globalMax?: number;
  deadlineMs?: number;
  maxConcurrent?: number;
}

export type CraOutcome =
  | { kind: "invalid"; error: string }
  | { kind: "limited"; error: string; retryAfterSeconds: number }
  | { kind: "not_found" }
  | { kind: "failed" }
  | { kind: "done"; report: RepoReport; cached: boolean };

export function createCraChecker(options: CraCheckerOptions = {}) {
  const base = options.fetchImpl ?? guardedFetch;
  const now = options.now ?? (() => Date.now());
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const token = options.githubToken?.trim() ? options.githubToken.trim() : undefined;
  const globalMax = options.globalMax ?? (token ? DEFAULT_GLOBAL_MAX_WITH_TOKEN : DEFAULT_GLOBAL_MAX_WITHOUT_TOKEN);
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;

  const cache = new Map<string, { at: number; report: RepoReport | null }>();
  const inFlight = new Map<string, Promise<RepoReport | null | "rate_limited">>();
  let stamps: number[] = [];
  let active = 0;

  const retryAfter = (t: number) => (stamps.length === 0 ? 60 : Math.max(1, Math.ceil((BUDGET_WINDOW_MS - (t - Math.min(...stamps))) / 1000)));

  async function measure(repo: string): Promise<RepoReport | null | "rate_limited"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const signals = await fetchSignals(repo, { fetchImpl: base, token, signal: controller.signal, now: now() });
      if (signals.rateLimited) return "rate_limited";
      if (signals.notFound) return null;
      return assessRepo(signals);
    } finally {
      clearTimeout(timer);
    }
  }

  async function check(raw: unknown): Promise<CraOutcome> {
    const repo = parseRepo(raw);
    if (!repo) return { kind: "invalid", error: "use a public GitHub repository as owner/repo, or its github.com address" };
    const key = repo.toLowerCase();
    const t0 = now();

    const hit = cache.get(key);
    if (hit && t0 - hit.at < (hit.report ? cacheTtlMs : DEFAULT_NOT_FOUND_TTL_MS)) {
      return hit.report ? { kind: "done", report: hit.report, cached: true } : { kind: "not_found" };
    }

    const running = inFlight.get(key);
    if (running) {
      let result: RepoReport | null | "rate_limited";
      try {
        result = await running;
      } catch {
        return { kind: "failed" };
      }
      if (result === "rate_limited") return { kind: "limited", error: "our access to GitHub is used up for the moment, please try again later", retryAfterSeconds: 300 };
      return result ? { kind: "done", report: result, cached: false } : { kind: "not_found" };
    }

    if (active >= maxConcurrent) return { kind: "limited", error: "the checker is busy right now, please try again in a few seconds", retryAfterSeconds: 5 };
    stamps = stamps.filter((s) => t0 - s < BUDGET_WINDOW_MS);
    if (stamps.length >= globalMax) {
      return { kind: "limited", error: "the checker is busy, please try again later", retryAfterSeconds: retryAfter(t0) };
    }
    stamps.push(t0);

    active++;
    const promise = measure(repo);
    inFlight.set(key, promise);
    try {
      const result = await promise;
      if (result === "rate_limited") {
        // GitHub's allowance is gone for everybody: say so, give the budget slot back, cache nothing.
        const own = stamps.indexOf(t0);
        if (own >= 0) stamps.splice(own, 1);
        return { kind: "limited", error: "our access to GitHub is used up for the moment, please try again later", retryAfterSeconds: 300 };
      }
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { at: now(), report: result });
      return result ? { kind: "done", report: result, cached: false } : { kind: "not_found" };
    } catch (error) {
      // Our log gets a fixed sentence and the error name only: an error object can carry the request that caused it.
      console.error("[cra-check] the measurement threw:", (error as Error)?.name ?? "unknown");
      return { kind: "failed" };
    } finally {
      inFlight.delete(key);
      active--;
    }
  }

  return { check };
}

export type CraChecker = ReturnType<typeof createCraChecker>;

const CheckBody = z.object({ repo: z.string().min(1).max(300) });

/** POST /api/cra/check with { repo }. The answer carries the dated report only: never raw file contents. */
export function handleCraCheck(checker: CraChecker) {
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = CheckBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'send a JSON body like {"repo":"owner/name"}' });
      return;
    }
    const outcome = await checker.check(parsed.data.repo);
    switch (outcome.kind) {
      case "invalid":
        res.status(400).json({ ok: false, error: outcome.error });
        return;
      case "limited":
        res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
        res.status(429).json({ ok: false, error: outcome.error });
        return;
      case "not_found":
        res.status(404).json({ ok: false, error: "that repository was not found, or it is not public" });
        return;
      case "failed":
        res.status(502).json({ ok: false, error: "the check could not be completed, please try again later" });
        return;
      case "done":
        res.status(200).json({ ok: true, cached: outcome.cached, ...outcome.report });
        return;
    }
  };
}
