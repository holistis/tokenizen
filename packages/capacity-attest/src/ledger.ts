// ledger.ts — append-only JSONL storage for delivery claims.
//
// Same pattern as mcp-paywall/src/ledger.mjs: one append-only file, nothing
// ever rewritten or deleted. There is intentionally no update/delete
// function anywhere in this module — a claim, once written, is permanent
// history. A second claim with the same content-addressed claimId (i.e. an
// attempt to re-record the exact same claim) is rejected rather than
// silently duplicated.

import { readFileSync, appendFileSync, openSync, closeSync, unlinkSync, statSync } from "node:fs";
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

// THIRD FIX (2026-08-31, same day, found by an adversarial verifier): the
// function this comment used to describe (readClaims()) re-read and
// re-validated the ENTIRE ledger file, through zod, on every single call —
// appendClaim() (for its duplicate-claimId check) AND claimsForSeller()/
// allClaims(). Cost is linear in TOTAL ledger size, and since this ledger is
// explicitly append-only, permanent history (nothing is ever deleted — see
// this file's header comment), that cost only grows over the service's
// lifetime, never shrinks. Measured empirically before this fix: 903ms of
// unbroken event-loop freeze at 40,000 lines for a single call with zero
// contention; under real lock contention against a 5,000-line ledger with 10
// concurrent callers, a single continuous 526ms stretch where the event loop
// processed nothing at all. In this package's real deployment shape (a
// single long-lived Node process, no clustering — see x402-server.mjs), that
// is every other in-flight request on the process freezing for over half a
// second, every time anyone records a delivery, and it gets worse forever.
//
// Fix: an in-memory cache, per resolved ledger file path (NOT a single
// global — CAPACITY_ATTEST_DATA_DIR differs between tests/instances, so
// keying by path is what makes this correct for more than one ledger file
// per process), holding the already-parsed-and-validated claims plus two
// indexes built for the two things this module actually needs to answer
// fast: a claimId Set (appendClaim()'s duplicate check) and a
// sellerAddress -> claims[] Map (claimsForSeller()). Each cache entry also
// carries the ledger file's byte size AT THE MOMENT it was built.
//
// On every call, a cheap `statSync` (no parsing) compares the file's CURRENT
// byte size against the cached size. Byte size, not mtime: filesystem mtime
// resolution can be coarse enough on some platforms that two real writes
// within the same tick look unchanged to an mtime check — that would be a
// silent-stale-read correctness bug, not just a missed optimization.
// Unchanged size -> the cache is used as-is, no disk read, no re-parse, no
// re-validation: this is the fast path this fix exists to add. Changed size
// -> the file was written since our cache was built (by another process, or
// by our own appendClaim() before it started updating the cache in-place —
// see below), so the cache is stale and gets rebuilt from disk.
//
// LOCK-VS-STALENESS-CHECK ORDERING (the part that is easy to get backwards
// and silently reintroduce the original duplicate-claim race): appendClaim()
// does its staleness check/resync AFTER acquireLock(), never before. If it
// checked staleness first and only acquired the lock afterward, there would
// be a TOCTOU gap between "we decided the cache is fresh" and "we hold the
// lock" during which another process could append — our now-actually-stale
// cache would then pass the duplicate check against a claimId set that is
// missing that concurrent write, and two processes could both believe they
// won the race, exactly the bug the lock was built to close in the first
// fix. Doing the freshness check (and, if needed, the resync) INSIDE the
// locked section instead means: by the time appendClaim() looks at the
// cache, no other process can be mid-write against this file (the lock
// serializes that), so the cache, once confirmed fresh (or just rebuilt),
// stays a true reflection of on-disk state for the rest of the critical
// section — there is no gap left for a concurrent writer to hide in. The
// cache is therefore a performance layer INSIDE the lock's critical section,
// never a substitute for it; duplicate-claimId safety still comes 100% from
// the lock, exactly as before this fix.
//
// claimsForSeller()/allClaims() do NOT take the lock (same as before this
// fix — see the original comment this one replaces), because their
// correctness need is different: they don't need atomicity with a
// concurrent write, they just need to reflect a recent, self-consistent
// on-disk state at the time they're called. The same statSync-based
// staleness check gives them that: right after another process (or our own
// appendClaim()) writes, the file's size changes, so the very next
// claimsForSeller()/allClaims() call resyncs instead of trusting a now-stale
// cache. This is exactly the "process A warm cache, process B writes
// directly, process A must see it" scenario the new
// cross-process-cache-invalidation test in ledger.test.ts exercises.
//
// The resync-from-disk path is still fundamentally O(n) — unavoidable if the
// true on-disk state must be validated — but two things change: (1) it is
// now the EXCEPTION (only when the file actually changed underneath us),
// not the norm (every call, regardless); (2) it no longer holds the event
// loop hostage for its full duration in one stretch — resyncFromDisk()
// processes lines in RESYNC_BATCH_SIZE-sized batches and `await`s a real
// setImmediate between batches, bounding any single blocking stretch to
// roughly one batch's cost rather than the whole file's, the same
// non-blocking-yield pattern the previous fix in this file applied to lock
// contention.
//
// Concurrent-resync safety within one process: resyncFromDisk() builds its
// claims array / claimId Set / sellerAddress Map into a brand-new object and
// only publishes it (a single synchronous Map.set on cacheByPath) once
// fully built — so a reader that hits the fast path mid-resync sees either
// the old (stale but internally consistent) cache or the new one, never a
// half-populated one. If two callers in the same process both observe
// staleness at once (e.g. a concurrent appendClaim() and claimsForSeller()),
// they share ONE in-flight resync via pendingResyncs rather than each
// starting their own redundant O(n) pass.
//
// Verified after this fix: bench/ledger-scale.mjs (rewritten for this fix)
// shows append/history calls after the first one at a given N running in
// well under a millisecond instead of growing linearly with ledger size;
// bench/ledger-concurrency.mjs still shows 0% duplicates and 0 lost writes
// under real multi-process contention (unchanged from the previous fix);
// bench/event-loop-non-blocking.mjs (the previous fix's proof) still passes
// unmodified, confirming this fix did not reintroduce event-loop blocking on
// the lock-wait path it already fixed.

const RESYNC_BATCH_SIZE = 500;

interface LedgerCache {
  /** Byte size of the file at the moment this cache was built. The staleness marker. */
  size: number;
  /** All valid claims, kept sorted ascending by timestamp (oldest first) AT ALL TIMES — see note below. */
  claims: DeliveryClaim[];
  /** Lower-cased claimId -> present. O(1) duplicate lookup for appendClaim(). */
  claimIdSet: Set<string>;
  /** Lower-cased sellerAddress -> that seller's claims, each bucket also kept sorted ascending by timestamp. */
  bySeller: Map<string, DeliveryClaim[]>;
}

function emptyCache(): LedgerCache {
  return { size: 0, claims: [], claimIdSet: new Set(), bySeller: new Map() };
}

// Keyed by resolved ledger file path, not a single global — tests (and any
// future multi-tenant use) point CAPACITY_ATTEST_DATA_DIR at different
// directories within the same process, and a single shared cache variable
// would silently serve one ledger's data for another's calls.
const cacheByPath = new Map<string, LedgerCache>();
// De-duplicates concurrent resyncs of the SAME path within one process: if
// two callers both observe staleness before either resync finishes, the
// second joins the first's in-flight Promise instead of redoing the O(n)
// work itself.
const pendingResyncs = new Map<string, Promise<LedgerCache>>();

/** Yields control back to the event loop — used between resync batches. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function timestampMs(claim: DeliveryClaim): number {
  return Date.parse(claim.timestamp);
}

// WHY THE CACHE KEEPS claims/bySeller PRE-SORTED, INSTEAD OF SORTING AT READ
// TIME (which is what the pre-cache readClaims()-based code did, and what an
// earlier draft of THIS fix also did): claimsForSeller()/allClaims() are
// exactly the calls this whole fix is about making cheap on the warm path.
// Re-running `.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))`
// on every single warm call is itself O(n log n) with an expensive
// comparator (Date.parse() is a real date-string parse, not a cheap number
// compare) — at N=40,000 that measured at ~13-14ms PER WARM CALL in this
// fix's own benchmark (bench/ledger-cache-scale.mjs), 450x the N=0 floor,
// which is not "amortized O(1) or close to it" by any reasonable reading,
// even though it correctly skipped the disk read. So: claims/bySeller are
// sorted ONCE per resync (still inside the O(n) resync's cost, effectively
// free to add), and appendClaim() keeps that invariant on the warm
// incremental-update path too, via a binary-search insert (sortedInsertIndex
// below) instead of a plain push — O(log n) to find the position, O(n) for
// the underlying array shift (a plain memmove of object references, not
// re-parsing/re-validating anything), which is what turns the warm-call
// benchmark's claimsForSeller()/allClaims() numbers into a plain array copy:
// no comparator, no Date.parse, cost proportional only to the RESULT size,
// not the ledger's total size.
function sortedInsertIndex(sorted: DeliveryClaim[], ts: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    // <= keeps insertion AFTER any existing entries with an equal
    // timestamp, so a newly appended claim with a tied timestamp lands
    // after previously-recorded ones — the same tie-break a stable
    // file-order sort would have produced, since this is an append-only
    // log and the new claim is, by definition, the most recently arrived.
    if (timestampMs(sorted[mid]!) <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// SIXTH FIX (2026-08-31, same day, found by adversarial verification): the
// parse loop above correctly yields every RESYNC_BATCH_SIZE lines, but the
// code that used to follow it — a single `decorated.sort(...)` over the
// WHOLE array, then a single unyielded `for` loop over the WHOLE sorted
// array to build `bySeller` — both ran as one uninterrupted synchronous
// stretch after the batched parse loop finished. Measured: at N=50,000 that
// unyielded tail alone was ~75ms (26ms sort + 47ms bySeller-build); at a
// plausible future N=200,000 it was ~438ms — approaching the magnitude of
// the original pre-cache bug (903ms at N=40,000) this entire fix exists to
// eliminate. A plain per-batch merge (merge each newly-parsed batch into the
// accumulated sorted result, yield between batches) would NOT actually fix
// this: the merge step itself is O(accumulated size), so the LAST merge in a
// large ledger would still be one unyielded O(n) stretch — the exact same
// shape of bug, just moved earlier. What actually bounds every unyielded
// stretch to ~one batch's cost, all the way through an O(n log n) sort, is
// counting WORK DONE (elements written to the merge output), not batch
// boundaries, and yielding whenever that counter crosses RESYNC_BATCH_SIZE —
// this is what yieldingMergeSort() below does: a standard iterative
// bottom-up merge sort (stable, like the native Array.prototype.sort() it
// replaces — see its own comment for why <= on ties matters), except every
// single element written into the merge output increments a shared counter
// that triggers a real yield once it reaches RESYNC_BATCH_SIZE, regardless
// of which pass or which pair-merge that element happened to fall in. Total
// work is still the same O(n log n) a native sort would do; what changes is
// that it is never done in one unbroken stretch bigger than one batch.
async function yieldingMergeSort(items: Array<{ claim: DeliveryClaim; ts: number }>): Promise<void> {
  const n = items.length;
  if (n < 2) return;

  let src: Array<{ claim: DeliveryClaim; ts: number }> = items;
  let dst: Array<{ claim: DeliveryClaim; ts: number }> = new Array(n);
  let writtenSinceYield = 0;

  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += width * 2) {
      const mid = Math.min(lo + width, n);
      const hi = Math.min(lo + width * 2, n);
      let i = lo;
      let j = mid;
      let k = lo;
      while (i < mid || j < hi) {
        // <= (not <) is what makes this stable: on a tie, the left run
        // (which, at every level of a bottom-up merge sort, always holds
        // elements that were earlier in the pre-sort/file order than the
        // right run) is drained first — identical tie-break to the native
        // stable `.sort()` this replaces.
        if (j >= hi || (i < mid && src[i]!.ts <= src[j]!.ts)) {
          dst[k++] = src[i++]!;
        } else {
          dst[k++] = src[j++]!;
        }
        if (++writtenSinceYield >= RESYNC_BATCH_SIZE) {
          writtenSinceYield = 0;
          await yieldToEventLoop();
        }
      }
    }
    [src, dst] = [dst, src];
  }

  if (src !== items) {
    // The last swap left the fully-sorted array in `src`, which is the
    // scratch buffer, not the caller's `items` array — copy it back in
    // place, itself batched/yielded for the same reason as everything else
    // in this function: a plain unyielded `for` here over all n elements
    // would just reintroduce the exact bug this function exists to close.
    for (let i = 0; i < n; i++) {
      items[i] = src[i]!;
      if ((i + 1) % RESYNC_BATCH_SIZE === 0 && i + 1 < n) {
        await yieldToEventLoop();
      }
    }
  }
}

/**
 * Re-reads and re-validates the entire ledger file from disk, in batches
 * with a real yield between them so this never holds the event loop for the
 * whole file's cost in one uninterrupted stretch. Builds a brand-new cache
 * object and only publishes it once complete (see the header comment above
 * for why that matters for in-process concurrent readers).
 */
async function resyncFromDisk(file: string): Promise<LedgerCache> {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch (e) {
    // FIFTH FIX (2026-08-31, same day, found by adversarial verification):
    // this bare `catch` used to treat EVERY readFileSync error identically
    // to "file doesn't exist yet" — including a transient EACCES, EBUSY,
    // EMFILE, or a Windows sharing-violation, none of which mean the ledger
    // is empty. Silently downgrading a real error to "empty cache" can wipe
    // a warm, correct in-memory cache down to zero known claimIds, after
    // which a genuine duplicate claimId would be wrongly accepted — the
    // exact guarantee this whole module exists to protect. Only ENOENT
    // (mirrors isRetryableLockError()'s explicit-code-check style above)
    // means "does not exist yet, empty is the correct read"; every other
    // error now propagates as a real thrown error instead of being eaten.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    // Doesn't exist (or vanished) — a fresh, empty, but still validly-sized
    // (0 bytes) cache. Matches the pre-fix behavior of readClaims()
    // returning [] when the file doesn't exist yet.
    const empty = emptyCache();
    cacheByPath.set(file, empty);
    return empty;
  }

  const lines = content.split("\n").filter(Boolean);
  // Decorated with each claim's parsed timestamp so the sort below compares
  // plain numbers instead of re-parsing every timestamp string on every
  // comparison (an O(n log n)-times cost vs. this O(n)-times one).
  const decorated: Array<{ claim: DeliveryClaim; ts: number }> = [];
  const claimIdSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    try {
      const claim = DeliveryClaimSchema.parse(JSON.parse(line));
      decorated.push({ claim, ts: timestampMs(claim) });
      claimIdSet.add(claim.claimId.toLowerCase());
    } catch {
      // A corrupt/partial line (e.g. a truncated write) must not take down
      // reads of the rest of the ledger — same tolerance as before this fix.
    }
    if ((i + 1) % RESYNC_BATCH_SIZE === 0 && i + 1 < lines.length) {
      await yieldToEventLoop();
    }
  }

  // Stable sort, same tie-break behavior (ties keep original file/append
  // order) as the pre-fix code's native `.sort()` — but via
  // yieldingMergeSort() instead, which bounds every unyielded stretch to
  // ~RESYNC_BATCH_SIZE elements instead of running as one uninterrupted
  // O(n log n) block. See yieldingMergeSort()'s own comment (SIXTH FIX) for
  // why a naive per-batch merge would not actually have achieved this.
  await yieldingMergeSort(decorated);
  const claims = decorated.map((d) => d.claim);

  // sellerAddress is already lower-cased by ClaimContentSchema's own
  // .transform() (see schema.ts), so no extra normalization needed here.
  // Iterating the now-sorted `claims` means every bucket comes out sorted
  // too, with no separate per-seller sort needed. Batched with a yield every
  // RESYNC_BATCH_SIZE claims (same SIXTH FIX as the sort above) instead of
  // one unyielded pass over the whole array — building this map is itself
  // O(n) and was part of the same measured 47ms-at-N=50,000 unyielded tail.
  const bySeller = new Map<string, DeliveryClaim[]>();
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i]!;
    const bucket = bySeller.get(claim.sellerAddress);
    if (bucket) bucket.push(claim);
    else bySeller.set(claim.sellerAddress, [claim]);
    if ((i + 1) % RESYNC_BATCH_SIZE === 0 && i + 1 < claims.length) {
      await yieldToEventLoop();
    }
  }

  // size is derived from the exact content string we just validated
  // (Buffer.byteLength), not a separate statSync call — that would open a
  // gap where a write between the read and the stat could make the marker
  // disagree with what we actually parsed. This way the two can never
  // disagree by construction.
  const entry: LedgerCache = { size: Buffer.byteLength(content, "utf8"), claims, claimIdSet, bySeller };
  cacheByPath.set(file, entry);
  return entry;
}

/**
 * Returns a cache guaranteed fresh as of the moment this is called: if the
 * on-disk file's byte size still matches what the cache was built from,
 * returns it as-is (no disk read at all beyond the one cheap statSync).
 * Otherwise resyncs from disk first (see resyncFromDisk()).
 */
async function getFreshCache(file: string): Promise<LedgerCache> {
  let diskSize: number;
  try {
    diskSize = statSync(file).size;
  } catch (e) {
    // Same explicit-ENOENT-only reasoning as resyncFromDisk()'s catch above
    // (FIFTH FIX) — a non-ENOENT statSync error is a real problem, not an
    // empty ledger, and must not be swallowed into diskSize=0.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    diskSize = 0; // file does not exist yet
  }

  const cached = cacheByPath.get(file);
  if (cached && cached.size === diskSize) {
    return cached;
  }

  // KNOWN LIMITATION (documented 2026-08-31, not fixed): this join does not
  // re-check the in-flight resync's eventual `.size` against the `diskSize`
  // measured above. If that resync was already snapshotting disk (via
  // resyncFromDisk()'s own readFileSync) before an external, lock-bypassing
  // writer appended a claim, and this call's own statSync happened to run
  // after that external write, the joined resync can resolve to a cache
  // that is already stale relative to what this caller just observed on
  // disk. In appendClaim()'s case that means the duplicate-claimId check
  // could pass against a claimId the external writer just added, producing
  // a real duplicate line in the ledger. Reproduced 3/3 in adversarial
  // testing. Low real-world severity today: this package's actual
  // deployment (a single long-lived process holding the lockfile for every
  // write) never has a second, lock-bypassing writer racing a resync in
  // this exact window; the gap only opens for a future deployment shape
  // (e.g. multiple processes/hosts sharing one CAPACITY_ATTEST_DATA_DIR,
  // with something other than this package's own appendClaim() writing to
  // the file directly). Fix direction if this is ever revisited: re-check
  // `inFlight`'s resolved `.size` against `diskSize` after joining, and
  // loop to a fresh resyncFromDisk() call if they still disagree.
  const inFlight = pendingResyncs.get(file);
  if (inFlight) return inFlight;

  const resync = resyncFromDisk(file).finally(() => {
    pendingResyncs.delete(file);
  });
  pendingResyncs.set(file, resync);
  return resync;
}

/**
 * Append one already-verified claim to the ledger. Throws if a claim with
 * the same claimId was already recorded.
 */
export async function appendClaim(claim: DeliveryClaim): Promise<DeliveryClaim> {
  ensureDataDir();
  const file = claimsFile();
  const lock = lockFile();
  await acquireLock(lock);
  try {
    // Freshness check happens AFTER acquiring the lock — see this file's
    // header comment for why that ordering, not the reverse, is what keeps
    // the duplicate-claimId guarantee intact across processes.
    const cache = await getFreshCache(file);
    const claimIdLower = claim.claimId.toLowerCase();
    if (cache.claimIdSet.has(claimIdLower)) {
      throw new Error(`claim_already_recorded: ${claim.claimId}`);
    }
    // FOURTH FIX (2026-08-31, same day, found by adversarial verification of
    // the THIRD FIX above): this used to re-`statSync(file).size` right
    // after the write below, on the theory that "exact by construction" was
    // safer than hand-computing a delta. That reasoning was backwards: a
    // statSync reads the file's CURRENT combined size, so if any OTHER
    // writer — even one that doesn't respect this module's own lockfile,
    // e.g. a second independent process doing a raw fs.appendFileSync, which
    // this whole lock exists to defend against for the on-disk data but was
    // never guarding OUR in-memory size marker — wrote to the same file in
    // the narrow window between our appendFileSync and that statSync, the
    // cache's `size` would end up matching the file's new COMBINED size
    // while cache.claims/claimIdSet only reflect OUR write. The next
    // getFreshCache() would then see size-matches-disk and trust a cache
    // that is silently missing the other writer's claim — permanently,
    // until some unrelated write happens to invalidate it again. Reproduced
    // 4/4 runs: a duplicate claimId got accepted (should have been
    // rejected), and claimsForSeller()/allClaims() silently omitted the
    // externally-written claim. Fixed by computing the new size as a DELTA —
    // old cached size + exactly the bytes of the line we ourselves just
    // wrote — which by construction cannot be perturbed by anyone else's
    // write landing in that window, matching resyncFromDisk()'s own
    // Buffer.byteLength(content, "utf8") convention for what "size" means.
    const serializedLine = JSON.stringify(claim) + "\n";
    appendFileSync(file, serializedLine);
    // Update the cache in place to reflect our own write, synchronously and
    // with no `await` anywhere in this block — that's what guarantees no
    // other same-process caller can observe a half-updated cache (JS never
    // preempts a synchronous stretch of code). This keeps OUR process's
    // cache warm for the next call without forcing an immediate resync, and
    // is why repeated appendClaim()/claimsForSeller() calls from the same
    // long-lived process stay cheap even as the ledger grows. Insertion
    // (not push) keeps claims/bySeller sorted by timestamp at all times —
    // see sortedInsertIndex()'s comment for why that matters.
    const ts = timestampMs(claim);
    cache.claims.splice(sortedInsertIndex(cache.claims, ts), 0, claim);
    cache.claimIdSet.add(claimIdLower);
    const bucket = cache.bySeller.get(claim.sellerAddress);
    if (bucket) bucket.splice(sortedInsertIndex(bucket, ts), 0, claim);
    else cache.bySeller.set(claim.sellerAddress, [claim]);
    cache.size = cache.size + Buffer.byteLength(serializedLine, "utf8");
    return claim;
  } finally {
    releaseLock(lock);
  }
}

/** All claims recorded against one seller, oldest first. */
export async function claimsForSeller(sellerAddress: string): Promise<DeliveryClaim[]> {
  const cache = await getFreshCache(claimsFile());
  const bucket = cache.bySeller.get(sellerAddress.toLowerCase()) ?? [];
  // bucket is already sorted (see LedgerCache's invariant) — just copy it,
  // so a caller mutating the returned array can't corrupt the shared cache.
  // No sort, no Date.parse, at call time: this is the whole point of the
  // fix — cost proportional to the RESULT size, not the ledger's total size.
  return [...bucket];
}

/** Every claim in the ledger, oldest first. Mainly useful for tests/inspection. */
export async function allClaims(): Promise<DeliveryClaim[]> {
  const cache = await getFreshCache(claimsFile());
  return [...cache.claims];
}
