// spend-cap-store.ts — pluggable storage for a sliding-window spend cap with
// pre-charge reservations (reserve a slot BEFORE the caller is committed to
// being charged, confirm it after whatever that reservation was guarding —
// e.g. a payment settlement — actually succeeds).
//
// Extracted from http-server.ts's publish_reputation_feedback hourly cap
// (feedbackPublishTimestamps / feedbackReservations, see that file's own
// FEEDBACK_RESERVATION_MS comment for the charged-but-got-nothing race the
// reserve/confirm split exists to close). That logic was single-process,
// in-memory only, hardcoded to exactly one named cap, and silently reset to
// zero on every process restart — fine for a single long-lived server, wrong
// the moment more than one instance of this server shares one
// CAPACITY_ATTEST_DATA_DIR (this package's own documented multi-agent
// deployment shape — see ledger.ts's header comment).
//
// Two implementations of the same SpendCapStore interface:
//
//   - InMemorySpendCapStore: the EXISTING Map/array logic, unchanged,
//     moved here and parameterized by `key` so one store instance can track
//     more than one named cap. Same characteristics as before: fast, zero
//     setup, single-process only, resets on restart.
//
//   - DurableSpendCapStore: the SAME cross-process-safety pattern ledger.ts
//     already proved (and bench/ledger-concurrency.mjs already measured at
//     0% duplicates / 0% lost writes under real multi-process contention)
//     for the delivery-claims ledger — an append-only JSONL event log, a
//     lockfile mutex (O_EXCL "wx", PID-liveness-checked stale-lock reclaim),
//     and an in-memory cache keyed by file path, invalidated by byte-size
//     comparison, resynced in yielded batches so a large log never blocks
//     the event loop for its whole cost in one stretch. See ledger.ts's own
//     header and FIRST..EIGHTH FIX comments for the full incident history
//     behind each of those pieces — this file does not repeat that history,
//     it reuses the mechanism. The primitives below are a deliberate,
//     commented DUPLICATE of ledger.ts's internals (not an import of them —
//     ledger.ts does not export them, and this module is meant to be a
//     self-contained, genuinely pluggable piece with no coupling to the
//     delivery-claims ledger's own file or schema): keeping this module
//     import-free of ledger.ts also means a future change to the claims
//     ledger's format can never accidentally affect spend-cap accounting,
//     and vice versa.
//
// ONE DELIBERATE DIFFERENCE FROM ledger.ts, justified here because it is the
// kind of divergence that is easy to get wrong silently: ledger.ts's
// resyncFromDisk() sorts claims by each claim's OWN (caller-supplied,
// content-addressed) `timestamp` field, because that field can legitimately
// disagree with file append order (claims can arrive out of order). Here,
// every event's `at` field is stamped by THIS module itself, inside the
// locked critical section, at the exact moment it appends the line — it is
// never caller-supplied and can never disagree with append order. Replaying
// the file top-to-bottom therefore already yields events in chronological
// order; no separate sort step is needed (or correct to skip based on a
// hunch — this comment is the record of why it is actually safe to skip).
//
// ALSO DELIBERATELY ABSENT: any signature/authenticity check on replay
// (ledger.ts's SEVENTH FIX added exactly that for claims). A spend-cap event
// carries no claim ABOUT a third party and is never handed back to a caller
// as evidence of anything — it is purely this package's own internal
// operational counter. The threat ledger.ts's SEVENTH FIX defends against
// (a second writer fabricating a well-shaped but fake claim) has no
// equivalent here: anyone with write access to CAPACITY_ATTEST_DATA_DIR
// could trivially defeat ANY in-process accounting scheme (e.g. by editing
// the cap's own source), so cryptographically verifying a bare counter bump
// against itself would add cost and complexity without closing a real gap.
//
// createSpendCapStore() below picks an implementation at runtime via
// CAPACITY_ATTEST_SPEND_CAP_DURABLE, so existing zero-config, single-process
// deployments are unaffected by default.

import { readFileSync, appendFileSync, openSync, closeSync, readSync, writeSync, unlinkSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { dataDir, ensureDataDir } from "./config.js";

/** Pluggable storage for a sliding-window spend cap with reserve-then-confirm semantics. */
export interface SpendCapStore {
  /**
   * Claims a slot BEFORE the caller is committed to being charged, counting confirmed spends in
   * the current window plus other still-live reservations, so a flood of concurrent callers can
   * never all see "room available" the way a naive post-settlement-only check could. Returns a
   * reservation id on success, or null if the cap was already reached.
   */
  reserve(key: string): Promise<string | null>;
  /**
   * Confirms a slot into the permanent, windowed record, once whatever the reservation was
   * guarding (e.g. a payment settlement) has actually succeeded. NEVER refuses — the cap was
   * already enforced at reserve() time, and by the time consume() runs the caller may already
   * have been charged, so re-refusing here would recreate the exact charged-but-got-nothing race
   * the reserve/consume split exists to remove.
   *
   * `reservationId`, when given and still live, is released specifically — confirming a slot
   * frees exactly the reservation it corresponds to, not an arbitrary one. When omitted, or when
   * it no longer names a live reservation (already consumed, or pruned as expired — a settlement
   * slower than the reservation TTL), the oldest still-live reservation for this key is released
   * instead: reservations are fungible counters, not tied to a specific caller, so which exact one
   * is released does not change the resulting count. If none are live either, the slot is still
   * recorded as confirmed (the caller was already committed) — this is the one way the cap can be
   * exceeded by a small amount in practice, the same documented tolerance as the logic this module
   * replaces (see http-server.ts's consumeFeedbackPublishSlot doc comment).
   */
  consume(key: string, reservationId?: string): Promise<void>;
  /** How many confirmed spends for `key` fall within the current rolling window, right now. Read-only — never mutates state or creates storage. */
  confirmedCountInWindow(key: string): Promise<number>;
  /**
   * What this store actually IS — scope, persistence, and whether it resets on restart — read
   * synchronously, no I/O, no env var lookup of its own. Exists so a caller like http-server.ts's
   * buildFiscalControls() can report the REAL behavior of whichever store createSpendCapStore()
   * picked, instead of a second, hand-typed literal that can silently drift from it the moment a
   * new implementation (or a new env var) changes which store is actually in use. Found 13 nov
   * 2026 (a completeness-critic review): buildFiscalControls() was reporting a hardcoded
   * "in-memory"/"server-instance" triple even while CAPACITY_ATTEST_SPEND_CAP_DURABLE=1 had a real
   * DurableSpendCapStore active underneath it — exactly the kind of inaccurate self-reported
   * fiscal-safety claim this whole fiscal-controls feature exists to prevent.
   *
   * `scope`/`persistence` use the SAME two enums fiscal-controls.ts's own SpendCapSchema already
   * declares (scope's own comment there anticipated "a future durable, shared-storage
   * implementation" by name) — this is that implementation, not a new vocabulary.
   */
  describePersistence(): {
    scope: "server-instance" | "all-instances" | "per-caller";
    persistence: "in-memory" | "durable";
    resetOnRestart: boolean;
  };
}

/**
 * Tuning for one spend cap. Deliberately a single options object rather than three positional
 * numbers: all three fields are plain `number`s in the same units family (a count and two
 * millisecond durations), which is exactly the shape of parameter list where transposing two
 * arguments at a call site type-checks fine and fails silently at runtime. Naming each field at
 * the call site removes that failure mode.
 *
 * No defaults are given for any field, anywhere in this module (not here, not in either
 * implementation's constructor, not in createSpendCapStore()) — on purpose. The real values
 * (PUBLISH_FEEDBACK_MAX_PER_HOUR / FEEDBACK_HOUR_MS / FEEDBACK_RESERVATION_MS today) already live
 * in http-server.ts; this module must never grow its own second, possibly-drifting copy of them.
 * A caller that forgets to pass one gets a TypeScript compile error, not a silently-wrong number.
 */
export interface SpendCapStoreOptions {
  /** Maximum confirmed+reserved slots allowed within one rolling `windowMs`. */
  maxPerWindow: number;
  /** Width of the rolling window confirmed spends are counted over, in milliseconds. */
  windowMs: number;
  /** How long an unconfirmed reservation stays "live" before it is treated as abandoned and no longer counted against the cap, in milliseconds. */
  reservationTtlMs: number;
}

// ============================================================================
// InMemorySpendCapStore — the pre-existing http-server.ts logic, unchanged,
// parameterized by `key`.
// ============================================================================

interface InMemoryKeyState {
  /** Confirmed spend timestamps for this key, oldest first. Pruned to the window on every consume() call — mirrors feedbackPublishTimestamps's own reassignment-based pruning exactly. */
  confirmedTimestamps: number[];
  /** Reservation id -> reserved-at ms, for this key's still-live reservations. Mirrors feedbackReservations exactly. */
  reservations: Map<string, number>;
}

export class InMemorySpendCapStore implements SpendCapStore {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly reservationTtlMs: number;
  private readonly stateByKey = new Map<string, InMemoryKeyState>();

  constructor(options: SpendCapStoreOptions) {
    this.maxPerWindow = options.maxPerWindow;
    this.windowMs = options.windowMs;
    this.reservationTtlMs = options.reservationTtlMs;
  }

  private stateFor(key: string): InMemoryKeyState {
    let state = this.stateByKey.get(key);
    if (!state) {
      state = { confirmedTimestamps: [], reservations: new Map() };
      this.stateByKey.set(key, state);
    }
    return state;
  }

  async reserve(key: string): Promise<string | null> {
    const state = this.stateFor(key);
    const now = Date.now();
    const confirmed = state.confirmedTimestamps.filter((t) => t > now - this.windowMs).length;
    const live = pruneAndCountLiveReservations(state.reservations, now, this.reservationTtlMs);
    if (confirmed + live >= this.maxPerWindow) return null;
    const id = randomUUID();
    state.reservations.set(id, now);
    return id;
  }

  async consume(key: string, reservationId?: string): Promise<void> {
    const state = this.stateFor(key);
    const now = Date.now();
    releaseReservation(state.reservations, now, this.reservationTtlMs, reservationId);
    state.confirmedTimestamps = state.confirmedTimestamps.filter((t) => t > now - this.windowMs);
    state.confirmedTimestamps.push(now);
  }

  async confirmedCountInWindow(key: string): Promise<number> {
    const state = this.stateFor(key);
    const now = Date.now();
    return state.confirmedTimestamps.filter((t) => t > now - this.windowMs).length;
  }

  describePersistence(): { scope: "server-instance"; persistence: "in-memory"; resetOnRestart: boolean } {
    return { scope: "server-instance", persistence: "in-memory", resetOnRestart: true };
  }
}

/**
 * Prunes expired entries from `reservations` IN PLACE (same cutoff-and-delete shape as
 * http-server.ts's own liveReservationCount()), then returns how many remain live. Shared between
 * InMemorySpendCapStore and DurableSpendCapStore — both hold the exact same `Map<string, number>`
 * (id -> reserved-at) shape for this, and "prune expired, count what's left" is one piece of logic
 * either implementation drifting from would be a real, cap-enforcement-affecting bug.
 */
function pruneAndCountLiveReservations(reservations: Map<string, number>, now: number, reservationTtlMs: number): number {
  const cutoff = now - reservationTtlMs;
  for (const [id, reservedAt] of reservations) {
    if (reservedAt <= cutoff) reservations.delete(id);
  }
  return reservations.size;
}

/**
 * Decides (and applies) which reservation a consume() call should release: the named
 * `reservationId` if it is still live, otherwise the oldest still-live one, otherwise none — see
 * SpendCapStore.consume()'s own doc comment for why that fallback order is correct. Prunes expired
 * entries from `reservations` IN PLACE first, so "still live" and "oldest live" are both accurate,
 * then deletes whichever id it picks (also in place) and returns that id, or null if nothing was
 * live to release — the caller still records a confirmed slot regardless; see consume()'s doc
 * comment for why that tolerance is intentional, not a bug.
 *
 * Shared between BOTH implementations, not just InMemorySpendCapStore: DurableSpendCapStore also
 * needs exactly this decision (it serializes the returned id into its "consume" event's `id`
 * field). This single function is what makes it structurally impossible for the two
 * implementations' released-reservation semantics to drift apart.
 */
function releaseReservation(reservations: Map<string, number>, now: number, reservationTtlMs: number, reservationId: string | undefined): string | null {
  pruneAndCountLiveReservations(reservations, now, reservationTtlMs);
  if (reservationId !== undefined && reservations.has(reservationId)) {
    reservations.delete(reservationId);
    return reservationId;
  }
  const [oldestId] = reservations.keys();
  if (oldestId !== undefined) {
    reservations.delete(oldestId);
    return oldestId;
  }
  return null; // nothing live to release — a late confirm after expiry, or an id that was never valid
}

// ============================================================================
// DurableSpendCapStore — ledger.ts's exact lockfile + PID-liveness +
// byte-size-cache pattern, applied to a per-key append-only JSONL event log.
// ============================================================================

/** One line in a spend-cap event log. `at` is always stamped by this module itself — see this file's header comment for why that means file order already IS chronological order. */
type SpendCapEvent =
  | { type: "reserve"; id: string; at: number }
  | { type: "consume"; id: string | null; at: number };

function parseSpendCapEvent(line: string): SpendCapEvent {
  const obj = JSON.parse(line) as unknown;
  if (obj && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    if (rec["type"] === "reserve" && typeof rec["id"] === "string" && rec["id"].length > 0 && typeof rec["at"] === "number" && Number.isFinite(rec["at"])) {
      return { type: "reserve", id: rec["id"], at: rec["at"] };
    }
    if (
      rec["type"] === "consume" &&
      (rec["id"] === null || (typeof rec["id"] === "string" && rec["id"].length > 0)) &&
      typeof rec["at"] === "number" &&
      Number.isFinite(rec["at"])
    ) {
      return { type: "consume", id: rec["id"] as string | null, at: rec["at"] };
    }
  }
  throw new Error("invalid_spend_cap_event");
}

// Keys become part of a filename under CAPACITY_ATTEST_DATA_DIR (spend-cap-<key>.jsonl) — this
// allowlist is what stops a key like "../../etc/passwd" from ever being interpreted as a path
// component instead of a literal filename fragment. Today's only call site passes a hardcoded
// literal ("publish_reputation_feedback"), never anything caller-controlled, but the interface
// itself does not promise that for every future caller, and the check costs nothing.
const SPEND_CAP_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

// Adversarial probe (2026-11-13): SPEND_CAP_KEY_PATTERN's character class has no length bound, so
// a key of, say, 10,000 plain alphanumeric characters passes it cleanly and only fails later, deep
// inside openSync()/statSync(), once "spend-cap-" + key + ".jsonl" exceeds this filesystem's
// per-component name limit (NAME_MAX = 255 bytes on Linux/macOS; NTFS enforces an equivalent
// 255-UTF-16-code-unit limit on Windows — reproduced on both ENOENT, for lengths where Windows's
// short-path heuristics misfire first, and ENAMETOOLONG, for longer ones). That raw Node fs error
// has none of this module's own "invalid_spend_cap_key" prefix — breaking the one error-shape
// contract callers (and this file's own tests) rely on to detect a bad key — and it embeds the
// full attempted path, leaking CAPACITY_ATTEST_DATA_DIR's absolute filesystem location into
// whatever surfaces the message, exactly the class of leak this module's own acquireLock() timeout
// error (see its comment, mirroring ledger.ts's EIGHTH FIX) was deliberately written to avoid. 128
// is comfortably under every real filename limit even after the fixed "spend-cap-"/".jsonl"
// affixes, with margin to spare for a longer affix later.
const SPEND_CAP_KEY_MAX_LENGTH = 128;

function spendCapFile(key: string): string {
  if (!SPEND_CAP_KEY_PATTERN.test(key) || key.length > SPEND_CAP_KEY_MAX_LENGTH) {
    // Preview, not the full key, in the thrown message: an oversized/hostile key must not get to
    // flood whatever logs or re-displays this error with thousands of characters echoed back.
    const preview = key.length > 80 ? `${key.slice(0, 80)}...(${key.length} chars total)` : key;
    throw new Error(
      `invalid_spend_cap_key: "${preview}" becomes part of a filename under CAPACITY_ATTEST_DATA_DIR and must match ${SPEND_CAP_KEY_PATTERN} and be at most ${SPEND_CAP_KEY_MAX_LENGTH} characters`,
    );
  }
  return join(dataDir(), `spend-cap-${key}.jsonl`);
}

function lockFileFor(file: string): string {
  return file + ".lock";
}

// Same tuning as ledger.ts's own lock, deliberately unchanged — these values are already proven
// (bench/ledger-concurrency.mjs, bench/event-loop-non-blocking.mjs) under real multi-process load;
// inventing different numbers here for no functional reason would just be a second, untested guess.
const LOCK_RETRY_DELAY_MS = 5;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const RESYNC_BATCH_SIZE = 500;

/** Resolves after `ms` real milliseconds — yields control back to the event loop, unlike a spin loop. Identical to ledger.ts's delay(). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Yields control back to the event loop — used between resync batches. Identical to ledger.ts's yieldToEventLoop(). */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Identical reasoning and error-code set as ledger.ts's isRetryableLockError() — see that
// function's own comment for the Windows/NTFS EPERM-on-delete race this also guards against here.
function isRetryableLockError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "EPERM";
}

// Identical to ledger.ts's isProcessAlive() — see that function's own comment for why a PID-
// liveness check (not just lock age) is what makes stale-lock reclaim safe for a holder that is
// legitimately still alive and mid-operation past STALE_LOCK_MS.
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

// Identical to ledger.ts's fileTailEndsWithNewlineOrEmpty() — reads the ACTUAL on-disk tail (never
// the in-memory cache, for the same reason ledger.ts's own comment gives: the whole point is to
// catch a torn or foreign write the cache has no idea happened).
function fileTailEndsWithNewlineOrEmpty(file: string): boolean {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return true; // doesn't exist yet -- nothing to separate our first line from
  }
  if (size === 0) return true;
  const fd = openSync(file, "r");
  try {
    const lastByte = Buffer.alloc(1);
    readSync(fd, lastByte, 0, 1, size - 1);
    return lastByte[0] === 0x0a; // "\n"
  } finally {
    closeSync(fd);
  }
}

// Identical structure to ledger.ts's acquireLock()/releaseLock() — see ledger.ts's header comment
// (SECOND FIX) for why the retry awaits a real timer instead of busy-waiting the event loop, and
// its STALE_LOCK_MS comment for the PID-liveness reclaim logic duplicated here.
async function acquireLock(path: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const fd = openSync(path, "wx");
      try {
        writeSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
      return;
    } catch (e) {
      if (!isRetryableLockError(e)) throw e;
      try {
        if (Date.now() - statSync(path).mtimeMs > STALE_LOCK_MS) {
          let holderPid: number | null = null;
          try {
            const content = readFileSync(path, "utf8").trim();
            const parsed = Number(content);
            if (Number.isInteger(parsed) && parsed > 0) holderPid = parsed;
          } catch {
            // Lock file vanished or unreadable between our stat and this read — treat as gone.
          }
          if (holderPid === null || !isProcessAlive(holderPid)) {
            unlinkSync(path);
            continue;
          }
        }
      } catch {
        // Lock file vanished between our failed open() and this stat/unlink — another process
        // released it. Just retry the open immediately.
        continue;
      }
      if (Date.now() > deadline) {
        // No absolute path in the message — same reasoning as ledger.ts's EIGHTH FIX: a caller who
        // merely triggers ordinary lock contention must not get the server's filesystem layout back.
        throw new Error("spend_cap_lock_timeout: could not acquire the spend-cap lock in time");
      }
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

interface DurableCache {
  /** Byte size of the file at the moment this cache was built. The staleness marker — see ledger.ts's getFreshCache() comment for why byte size, not mtime. */
  size: number;
  /** Every confirmed event's `at`, in file order (== chronological order — see this file's header comment). Never pruned here; filtering to a window happens at read time, in confirmedCountInWindow()/reserve(), same as ledger.ts never pre-filters `claims`. */
  confirmedTimestamps: number[];
  /** Reservation id -> reserved-at ms, for "reserve" events not yet matched by a "consume" event as of this cache's last resync. */
  liveReservations: Map<string, number>;
}

function emptyDurableCache(): DurableCache {
  return { size: 0, confirmedTimestamps: [], liveReservations: new Map() };
}

// Keyed by resolved file path, not a single global — exactly ledger.ts's cacheByPath reasoning:
// tests (and any real multi-cap deployment) point different keys, and therefore different files,
// at this same module within one process.
const cacheByPath = new Map<string, DurableCache>();
// De-duplicates concurrent resyncs of the SAME path within one process — identical to ledger.ts's
// pendingResyncs.
const pendingResyncs = new Map<string, Promise<DurableCache>>();

/**
 * Re-reads and replays the entire event log from disk, in batches with a real yield between them
 * — identical shape to ledger.ts's resyncFromDisk(), minus the sort step (see this file's header
 * comment for why that is safe to skip here) and minus any signature check (see header comment for
 * why that has no equivalent for a bare counter event).
 */
async function resyncFromDisk(file: string): Promise<DurableCache> {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const empty = emptyDurableCache();
    cacheByPath.set(file, empty);
    return empty;
  }

  const lines = content.split("\n").filter(Boolean);
  const confirmedTimestamps: number[] = [];
  const liveReservations = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    try {
      const event = parseSpendCapEvent(line);
      if (event.type === "reserve") {
        liveReservations.set(event.id, event.at);
      } else {
        if (event.id !== null) liveReservations.delete(event.id);
        confirmedTimestamps.push(event.at);
      }
    } catch {
      // A corrupt/partial line (e.g. a torn write, or a hand-edited file) must not take down
      // replay of the rest of the log — same tolerance as ledger.ts's resyncFromDisk() applies to
      // claims.jsonl: silently excluded, the log stays readable, no new error surface.
    }
    if ((i + 1) % RESYNC_BATCH_SIZE === 0 && i + 1 < lines.length) {
      await yieldToEventLoop();
    }
  }

  const entry: DurableCache = { size: Buffer.byteLength(content, "utf8"), confirmedTimestamps, liveReservations };
  cacheByPath.set(file, entry);
  return entry;
}

/** Identical shape to ledger.ts's getFreshCache() — see that function's own comment for the documented, low-severity known limitation this inherits unchanged (a lock-bypassing external writer racing a resync). */
async function getFreshCache(file: string): Promise<DurableCache> {
  let diskSize: number;
  try {
    diskSize = statSync(file).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    diskSize = 0;
  }

  const cached = cacheByPath.get(file);
  if (cached && cached.size === diskSize) {
    return cached;
  }

  const inFlight = pendingResyncs.get(file);
  if (inFlight) return inFlight;

  const resync = resyncFromDisk(file).finally(() => {
    pendingResyncs.delete(file);
  });
  pendingResyncs.set(file, resync);
  return resync;
}

/** Appends one already-built event line to `file`, protecting against a torn/foreign tail exactly like ledger.ts's appendClaim() does, and returns the exact bytes written (for the caller's own cache.size delta update). Must be called with the file's lock already held. */
function appendEventLine(file: string, event: SpendCapEvent): string {
  const leadingSeparator = fileTailEndsWithNewlineOrEmpty(file) ? "" : "\n";
  const serializedLine = leadingSeparator + JSON.stringify(event) + "\n";
  appendFileSync(file, serializedLine);
  return serializedLine;
}

export class DurableSpendCapStore implements SpendCapStore {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly reservationTtlMs: number;

  constructor(options: SpendCapStoreOptions) {
    this.maxPerWindow = options.maxPerWindow;
    this.windowMs = options.windowMs;
    this.reservationTtlMs = options.reservationTtlMs;
  }

  async reserve(key: string): Promise<string | null> {
    ensureDataDir();
    const file = spendCapFile(key);
    const lock = lockFileFor(file);
    await acquireLock(lock);
    try {
      // Freshness check happens AFTER acquiring the lock — same ordering ledger.ts's header
      // comment documents as the part that is easy to get backwards and silently reintroduce a
      // duplicate-admission race: checking staleness first would leave a TOCTOU gap between
      // "cache looked fresh" and "we hold the lock" for another process to append into unseen.
      const cache = await getFreshCache(file);
      const now = Date.now();
      const confirmed = cache.confirmedTimestamps.filter((t) => t > now - this.windowMs).length;
      const live = pruneAndCountLiveReservations(cache.liveReservations, now, this.reservationTtlMs);
      if (confirmed + live >= this.maxPerWindow) return null;
      const id = randomUUID();
      const serializedLine = appendEventLine(file, { type: "reserve", id, at: now });
      // Update the cache in place, synchronously, no `await` in this block — same reasoning as
      // ledger.ts's appendClaim(): guarantees no other same-process caller can observe a half-
      // updated cache, and keeps this process's cache warm without forcing an immediate resync.
      cache.liveReservations.set(id, now);
      cache.size = cache.size + Buffer.byteLength(serializedLine, "utf8");
      return id;
    } finally {
      releaseLock(lock);
    }
  }

  async consume(key: string, reservationId?: string): Promise<void> {
    ensureDataDir();
    const file = spendCapFile(key);
    const lock = lockFileFor(file);
    await acquireLock(lock);
    try {
      const cache = await getFreshCache(file);
      const now = Date.now();
      const releasedId = releaseReservation(cache.liveReservations, now, this.reservationTtlMs, reservationId);
      const serializedLine = appendEventLine(file, { type: "consume", id: releasedId, at: now });
      cache.confirmedTimestamps.push(now);
      cache.size = cache.size + Buffer.byteLength(serializedLine, "utf8");
    } finally {
      releaseLock(lock);
    }
  }

  async confirmedCountInWindow(key: string): Promise<number> {
    // Read-only: no lock, no ensureDataDir() — identical reasoning to ledger.ts's
    // claimsForSeller()/allClaims() (correctness need here is "reflect a recent, self-consistent
    // on-disk state", not atomicity with a concurrent write; the byte-size staleness check already
    // gives that).
    const file = spendCapFile(key);
    const cache = await getFreshCache(file);
    const now = Date.now();
    return cache.confirmedTimestamps.filter((t) => t > now - this.windowMs).length;
  }

  describePersistence(): { scope: "all-instances"; persistence: "durable"; resetOnRestart: boolean } {
    return { scope: "all-instances", persistence: "durable", resetOnRestart: false };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Picks an implementation at runtime: CAPACITY_ATTEST_SPEND_CAP_DURABLE set to "true" or "1"
 * selects DurableSpendCapStore (cross-process-safe, requires CAPACITY_ATTEST_DATA_DIR to be a
 * writable, shared directory); anything else (including unset) selects InMemorySpendCapStore, so
 * an existing zero-config, single-process deployment is unaffected by default.
 */
export function createSpendCapStore(options: SpendCapStoreOptions): SpendCapStore {
  const flag = process.env["CAPACITY_ATTEST_SPEND_CAP_DURABLE"];
  if (flag === "true" || flag === "1") {
    return new DurableSpendCapStore(options);
  }
  return new InMemorySpendCapStore(options);
}
