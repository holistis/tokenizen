// ledger.ts — append-only JSONL storage for delivery claims.
//
// Same pattern as mcp-paywall/src/ledger.mjs: one append-only file, nothing
// ever rewritten or deleted. There is intentionally no update/delete
// function anywhere in this module — a claim, once written, is permanent
// history. A second claim with the same content-addressed claimId (i.e. an
// attempt to re-record the exact same claim) is rejected rather than
// silently duplicated.

import { existsSync, readFileSync, appendFileSync, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { dataDir, ensureDataDir } from "./config.js";
import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";

function claimsFile(): string {
  return join(dataDir(), "claims.jsonl");
}

// A concurrency benchmark (bench/ledger-concurrency.mjs) found that
// appendClaim()'s original read-then-check-then-write sequence was a real,
// reproducible TOCTOU race: with separate OS processes sharing one
// CAPACITY_ATTEST_DATA_DIR (exactly the multi-agent deployment this ledger
// exists for), 3 of 5 runs at N=8 concurrent submissions of the SAME claim
// produced actual duplicate lines in claims.jsonl — the ledger's one
// documented guarantee, broken 60% of the time under realistic load.
//
// Fix: a lockfile-based mutex around the whole read+check+append sequence,
// using O_EXCL ("wx") as the atomic primitive — only one process can
// successfully create the lock file at a time, so the race window closes.
// This module is deliberately fully synchronous throughout (see the header
// comment above), so the wait loop is a bounded synchronous retry rather
// than an async queue.
const LOCK_RETRY_DELAY_MS = 5;
const LOCK_TIMEOUT_MS = 5_000;
// If a process crashes while holding the lock, the lock file would
// otherwise block every future write forever. Treat a lock older than this
// as abandoned and reclaim it.
const STALE_LOCK_MS = 30_000;

function lockFile(): string {
  return claimsFile() + ".lock";
}

function acquireLock(path: string): void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      closeSync(openSync(path, "wx"));
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(path).mtimeMs > STALE_LOCK_MS) {
          unlinkSync(path);
          continue;
        }
      } catch {
        // Lock file vanished between our failed open() and this stat/unlink
        // — another process released it. Just retry the open immediately.
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`ledger_lock_timeout: could not acquire lock at ${path}`);
      }
      const until = Date.now() + LOCK_RETRY_DELAY_MS;
      while (Date.now() < until) {
        /* bounded synchronous backoff */
      }
    }
  }
}

function releaseLock(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone (e.g. reclaimed as stale by another process) — fine.
  }
}

function readClaims(): DeliveryClaim[] {
  const file = claimsFile();
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [DeliveryClaimSchema.parse(JSON.parse(line))];
      } catch {
        // A corrupt/partial line (e.g. a truncated write) must not take down
        // reads of the rest of the ledger.
        return [];
      }
    });
}

/**
 * Append one already-verified claim to the ledger. Throws if a claim with
 * the same claimId was already recorded.
 */
export function appendClaim(claim: DeliveryClaim): DeliveryClaim {
  ensureDataDir();
  const lock = lockFile();
  acquireLock(lock);
  try {
    const existing = readClaims();
    if (existing.some((c) => c.claimId.toLowerCase() === claim.claimId.toLowerCase())) {
      throw new Error(`claim_already_recorded: ${claim.claimId}`);
    }
    appendFileSync(claimsFile(), JSON.stringify(claim) + "\n");
    return claim;
  } finally {
    releaseLock(lock);
  }
}

/** All claims recorded against one seller, oldest first. */
export function claimsForSeller(sellerAddress: string): DeliveryClaim[] {
  return readClaims()
    .filter((c) => c.sellerAddress.toLowerCase() === sellerAddress.toLowerCase())
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Every claim in the ledger, oldest first. Mainly useful for tests/inspection. */
export function allClaims(): DeliveryClaim[] {
  return readClaims().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
