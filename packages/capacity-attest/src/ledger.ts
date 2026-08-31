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
//
// SECOND FIX (2026-08-31, same day): the mutex's first version retried a
// contended lock with a synchronous `while (Date.now() < until) {}` spin
// loop. That busy-wait blocks the entire Node.js event loop for however
// long it spins (up to LOCK_TIMEOUT_MS = 5000ms) — in a live server this
// package is designed to run inside (a buyer agent recording a delivery
// claim right after a paid x402 call), that stalls every other in-flight
// request on the process, not just the caller. The retry now awaits a real
// `setTimeout`-based delay instead, which yields control back to the event
// loop between attempts. This makes acquireLock() / appendClaim() (and,
// for a consistent async surface across the module, readClaims() /
// claimsForSeller() / allClaims()) Promise-returning. Every call site
// (tools.ts, index.ts's tool handlers, examples/demo.ts, the test suite,
// the bench/ scripts) was updated to await them — a half-converted fix
// (async internals with a caller that forgot to await) would silently
// reorder the read-check-write sequence and could reintroduce the exact
// duplicate-claim race the lock exists to prevent. Verified after the fix:
// bench/ledger-concurrency.mjs still shows 0% duplicates under real
// multi-process contention (same as right after the first fix), and a new
// bench/event-loop-non-blocking.mjs proves a concurrent setInterval no
// longer stalls while the lock is contended.
const LOCK_RETRY_DELAY_MS = 5;
const LOCK_TIMEOUT_MS = 5_000;
// If a process crashes while holding the lock, the lock file would
// otherwise block every future write forever. Treat a lock older than this
// as abandoned and reclaim it.
const STALE_LOCK_MS = 30_000;

function lockFile(): string {
  return claimsFile() + ".lock";
}

/** Resolves after `ms` real milliseconds — yields control back to the event loop, unlike a spin loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Errno codes that mean "could not create the lock file right now because
// someone else is touching it" and are therefore worth retrying, rather
// than "something is actually wrong" and worth throwing immediately.
// EEXIST is the expected, documented case (another process holds the
// lock). EPERM is included too: on Windows/NTFS, deleting a file (as
// releaseLock() does) can leave it briefly in a "pending delete" state, and
// a `wx`-mode open racing against that transition can surface as EPERM
// rather than either a clean success or a clean EEXIST. Found empirically
// (2026-08-31) while writing bench/event-loop-non-blocking.mjs: 25
// concurrent in-process callers all racing to re-acquire a just-released
// lock intermittently hit this, and — before this was added — it threw
// past the retry loop entirely, turning ordinary contention into a hard
// failure instead of a bounded wait. Reproduces identically on the
// pre-async-fix synchronous code too, so this is not something the
// busy-wait -> async change introduced; it is a pre-existing Windows-only
// gap in what counted as "retryable" that this same fix pass closed.
function isRetryableLockError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "EPERM";
}

async function acquireLock(path: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      closeSync(openSync(path, "wx"));
      return;
    } catch (e) {
      if (!isRetryableLockError(e)) throw e;
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
      // Non-blocking backoff: await a real timer instead of spinning, so the
      // event loop stays free to process other work (timers, other
      // requests) while this call is waiting for the lock.
      await delay(LOCK_RETRY_DELAY_MS);
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

// Synchronous on purpose: reading + parsing claims.jsonl never waits on the
// lock (only appendClaim()'s write path does), so there is no event-loop
// -blocking concern here — a fast synchronous file read, same as before.
// The exported functions that call this (claimsForSeller/allClaims) are
// still declared async, purely so the module presents one consistent
// Promise-returning surface rather than mixing sync and async exports —
// same reasoning as appendClaim(), which genuinely does need to be async.
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
export async function appendClaim(claim: DeliveryClaim): Promise<DeliveryClaim> {
  ensureDataDir();
  const lock = lockFile();
  await acquireLock(lock);
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
export async function claimsForSeller(sellerAddress: string): Promise<DeliveryClaim[]> {
  return readClaims()
    .filter((c) => c.sellerAddress.toLowerCase() === sellerAddress.toLowerCase())
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Every claim in the ledger, oldest first. Mainly useful for tests/inspection. */
export async function allClaims(): Promise<DeliveryClaim[]> {
  return readClaims().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
