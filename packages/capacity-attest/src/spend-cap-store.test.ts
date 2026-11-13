// spend-cap-store.test.ts — one shared CONTRACT test suite
// (describeSpendCapStoreContract) run against both InMemorySpendCapStore and
// DurableSpendCapStore, so the two can never silently drift apart on what
// SpendCapStore actually guarantees, plus DurableSpendCapStore-specific
// coverage for the parts only it has (on-disk persistence, corrupt/torn
// lines, path-safety).
//
// MUTATION-MATRIX DISCIPLINE (per this codebase's own convention — see
// ledger.ts's FIRST..EIGHTH FIX comments for the style): every mutation
// below was actually planted in spend-cap-store.ts, run against this exact
// suite to confirm it went RED, then reverted and confirmed GREEN again —
// this is a record of what was really run, not a plan of what should be.
// Ten mutations, each caught by exactly the test(s) it should have:
//   1. InMemorySpendCapStore.reserve()'s cap check (`>=` -> `>`) — 6 tests
//      in the InMemorySpendCapStore contract block went red (one extra
//      reservation was wrongly admitted past the cap); DurableSpendCapStore's
//      block stayed fully green, proving the two are tested independently.
//   2. DurableSpendCapStore.reserve()'s identical cap check (`>=` -> `>`) —
//      7 tests went red (the 6 shared contract ones plus the cross-instance
//      persistence test); InMemorySpendCapStore's block stayed green.
//   3. InMemorySpendCapStore.consume() made to skip recording a confirm
//      when releaseReservation() returned null — caught by exactly "a late
//      confirm of an already-expired reservation... still records", only
//      in the InMemorySpendCapStore block.
//   4. The same skip-when-null mutation in DurableSpendCapStore.consume() —
//      caught by the same test, only in the DurableSpendCapStore block.
//   5. InMemorySpendCapStore.confirmedCountInWindow()'s window filter
//      removed (returned the raw, unfiltered array length) — caught by
//      exactly "confirmedCountInWindow prunes to the current window", only
//      in the InMemorySpendCapStore block.
//   6. The same unfiltered-length mutation in
//      DurableSpendCapStore.confirmedCountInWindow() — caught by the same
//      test, only in the DurableSpendCapStore block.
//   7. DurableSpendCapStore's per-line try/catch in resyncFromDisk() removed
//      (let JSON.parse throw uncaught) — caught by "tolerates a
//      corrupt/truncated line", as an uncaught SyntaxError rather than a
//      clean assertion failure — the most convincing kind of red.
//   8. releaseReservation()'s `reservationId`-first branch removed (always
//      released "oldest live" regardless of the id argument) — caught by
//      exactly "releases that EXACT reservation, not merely 'the oldest
//      live one'" (the only test that inspects the raw file to make this
//      otherwise-unobservable choice visible at all).
//   9. spendCapFile()'s SPEND_CAP_KEY_PATTERN check removed — caught by
//      "rejects a key shaped like a path traversal"; the failure output
//      also showed the lock file actually being opened at a path with a
//      literal ".." segment, confirming the traversal is a real on-disk
//      effect, not just a theoretical one.
//   10. appendEventLine()'s torn-tail separator check hardcoded to "" —
//      caught by "tolerates a write left without a trailing newline" (the
//      hand-placed sentinel line and the new one were found glued into one
//      unparseable line instead of two).
// releaseReservation() (mutations 3, 4 and 8) and
// pruneAndCountLiveReservations() are shared, single functions called by
// BOTH implementations — mutations 3 vs. 4 and the cap-check mutations (1
// vs. 2) are two SEPARATE call sites nonetheless, because InMemorySpendCapStore
// and DurableSpendCapStore each still do their own cap arithmetic and their
// own decision to skip recording; that is why each mutation had to be
// planted and proven twice, once per implementation.
// NOT covered by a vitest unit test, by design: the lock-acquired-BEFORE-
// cache-freshness-check ordering inside DurableSpendCapStore's reserve()/
// consume(). That ordering closes a cross-PROCESS race (see this module's
// own comment on it, mirroring ledger.ts's header comment) — a single-
// process vitest run cannot make two calls' file I/O genuinely interleave
// inside one synchronous critical section, which is exactly why ledger.ts's
// own analogous TOCTOU bug was only ever caught by a real multi-process
// benchmark, not a unit test. That guarantee is verified instead by
// bench/spend-cap-store-concurrency.mjs (see that file for its own measured,
// real result — not an unverified claim).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemorySpendCapStore, DurableSpendCapStore, createSpendCapStore, type SpendCapStore, type SpendCapStoreOptions } from "./spend-cap-store.js";

// Same per-test isolated-directory pattern as ledger.test.ts: a fresh throwaway
// CAPACITY_ATTEST_DATA_DIR per test, read lazily by config.ts on every call.
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-spend-cap-test-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
});

afterEach(() => {
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * The shared contract both implementations must satisfy identically. `make` builds a FRESH store
 * for the given tuning — fresh per test, so reservations/confirms from one test can never leak
 * into the next.
 */
function describeSpendCapStoreContract(label: string, make: (options: SpendCapStoreOptions) => SpendCapStore) {
  describe(label, () => {
    it("allows up to maxPerWindow reservations, then refuses the next one (cap enforcement)", async () => {
      const store = make({ maxPerWindow: 3, windowMs: 60_000, reservationTtlMs: 60_000 });
      expect(await store.reserve("k")).toEqual(expect.any(String));
      expect(await store.reserve("k")).toEqual(expect.any(String));
      expect(await store.reserve("k")).toEqual(expect.any(String));
      expect(await store.reserve("k")).toBeNull(); // null-at-cap-limit
    });

    it("a confirmed slot is still counted -- confirming must not shrink the cap for the next caller (one slot just moves from 'reserved' to 'confirmed', the total stays the same)", async () => {
      const store = make({ maxPerWindow: 2, windowMs: 60_000, reservationTtlMs: 60_000 });
      const id1 = await store.reserve("k");
      const id2 = await store.reserve("k");
      expect(id1).toEqual(expect.any(String));
      expect(id2).toEqual(expect.any(String));
      expect(await store.reserve("k")).toBeNull(); // 0 confirmed + 2 live == cap of 2

      await store.consume("k", id1 ?? undefined);
      expect(await store.confirmedCountInWindow("k")).toBe(1);
      // 1 confirmed + 1 still-live (id2) == 2 -- still at the cap, NOT freed by confirming.
      expect(await store.reserve("k")).toBeNull();
    });

    it("different keys on the same store instance have fully independent caps", async () => {
      const store = make({ maxPerWindow: 1, windowMs: 60_000, reservationTtlMs: 60_000 });
      expect(await store.reserve("a")).toEqual(expect.any(String));
      expect(await store.reserve("a")).toBeNull();
      // "b" is a different key -- must have its own room, not share "a"'s already-spent slot.
      expect(await store.reserve("b")).toEqual(expect.any(String));
      expect(await store.confirmedCountInWindow("a")).toBe(0);
    });

    it("an expired reservation stops counting against the cap, freeing room for a new one (reservation expiry)", async () => {
      vi.useFakeTimers();
      try {
        const store = make({ maxPerWindow: 1, windowMs: 60_000, reservationTtlMs: 5_000 });
        const id1 = await store.reserve("k");
        expect(id1).toEqual(expect.any(String));
        expect(await store.reserve("k")).toBeNull(); // at cap while id1 is still live

        vi.advanceTimersByTime(5_001); // outlive reservationTtlMs

        const id2 = await store.reserve("k");
        expect(id2).toEqual(expect.any(String)); // id1 no longer counts -- room again
      } finally {
        vi.useRealTimers();
      }
    });

    it("a late confirm of an already-expired reservation (nothing left live for this key) still records a confirmed slot, instead of throwing or silently dropping it (late confirm)", async () => {
      vi.useFakeTimers();
      try {
        const store = make({ maxPerWindow: 5, windowMs: 60_000, reservationTtlMs: 5_000 });
        const id1 = await store.reserve("k");
        expect(id1).toEqual(expect.any(String));

        vi.advanceTimersByTime(5_001); // id1 expires -- nothing live for "k" any more

        await expect(store.consume("k", id1 ?? undefined)).resolves.toBeUndefined();
        expect(await store.confirmedCountInWindow("k")).toBe(1);

        // State stays sane afterward -- a fresh reservation still works normally.
        expect(await store.reserve("k")).toEqual(expect.any(String));
      } finally {
        vi.useRealTimers();
      }
    });

    it("consume() with no reservationId at all still records a confirmed slot and releases the oldest live reservation", async () => {
      const store = make({ maxPerWindow: 2, windowMs: 60_000, reservationTtlMs: 60_000 });
      const id1 = await store.reserve("k");
      expect(id1).toEqual(expect.any(String));

      await store.consume("k"); // no id passed at all

      expect(await store.confirmedCountInWindow("k")).toBe(1);
      // id1 was the only live reservation -- it must have been the one released, freeing full room
      // again (1 confirmed + 0 live == 1, well under the cap of 2).
      expect(await store.reserve("k")).toEqual(expect.any(String));
      expect(await store.reserve("k")).toBeNull(); // now 1 confirmed + 1 live == 2 == cap
    });

    it("consume() with a reservationId that was never valid for this key behaves exactly like omitting it (not-found falls back the same way as undefined)", async () => {
      const store = make({ maxPerWindow: 2, windowMs: 60_000, reservationTtlMs: 60_000 });
      const id1 = await store.reserve("k");
      expect(id1).toEqual(expect.any(String));

      await store.consume("k", "this-id-was-never-reserved");

      expect(await store.confirmedCountInWindow("k")).toBe(1);
      expect(await store.reserve("k")).toEqual(expect.any(String)); // id1 was released as the fallback
    });

    it("confirmedCountInWindow prunes to the current window -- a confirm old enough to have aged out of windowMs stops counting, freeing cap room (confirmedCountInWindow pruning)", async () => {
      vi.useFakeTimers();
      try {
        const store = make({ maxPerWindow: 1, windowMs: 10_000, reservationTtlMs: 10_000 });
        const id1 = await store.reserve("k");
        await store.consume("k", id1 ?? undefined);
        expect(await store.confirmedCountInWindow("k")).toBe(1);
        expect(await store.reserve("k")).toBeNull(); // confirmed slot still within the window

        vi.advanceTimersByTime(10_001); // outlive windowMs

        expect(await store.confirmedCountInWindow("k")).toBe(0);
        expect(await store.reserve("k")).toEqual(expect.any(String)); // room freed as the window slid forward
      } finally {
        vi.useRealTimers();
      }
    });
  });
}

describeSpendCapStoreContract("InMemorySpendCapStore", (options) => new InMemorySpendCapStore(options));
describeSpendCapStoreContract("DurableSpendCapStore", (options) => new DurableSpendCapStore(options));

describe("DurableSpendCapStore-specific", () => {
  it("tolerates a corrupt/truncated line in its JSONL file -- does not crash, does not lose the OTHER already-recorded counts", async () => {
    const store = new DurableSpendCapStore({ maxPerWindow: 5, windowMs: 60_000, reservationTtlMs: 60_000 });
    const id1 = await store.reserve("k");
    await store.consume("k", id1 ?? undefined);
    const id2 = await store.reserve("k");
    await store.consume("k", id2 ?? undefined);
    expect(await store.confirmedCountInWindow("k")).toBe(2);

    // Directly tamper with the file, bypassing the module entirely -- exactly how ledger.test.ts's
    // own corrupt-line tests simulate a second writer or a torn/partial write.
    const file = join(tmpDir, "spend-cap-k.jsonl");
    appendFileSync(file, "not valid json at all -- a torn or hand-edited write\n");
    appendFileSync(file, JSON.stringify({ type: "reserve" }) + "\n"); // valid JSON, wrong shape: missing id/at

    await expect(store.confirmedCountInWindow("k")).resolves.toBe(2); // not lost, not crashed
    const id3 = await store.reserve("k");
    expect(id3).toEqual(expect.any(String)); // the store stays fully usable afterward
  });

  it("tolerates a write left without a trailing newline (a crash mid-write) -- the next append separates itself instead of gluing onto the existing line", async () => {
    const store = new DurableSpendCapStore({ maxPerWindow: 5, windowMs: 60_000, reservationTtlMs: 60_000 });
    const file = join(tmpDir, "spend-cap-k.jsonl");
    const tornEvent = { type: "reserve", id: "torn-tail-sentinel", at: Date.now() };
    writeFileSync(file, JSON.stringify(tornEvent)); // deliberately no trailing "\n"

    const id = await store.reserve("k");
    expect(id).toEqual(expect.any(String));

    const onDisk = readFileSync(file, "utf8");
    const lines = onDisk.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2); // the torn line stayed intact AND separate -- not glued to the new one
    expect(JSON.parse(lines[0]!)).toEqual(tornEvent);
    expect(() => JSON.parse(lines[1]!)).not.toThrow();
  });

  it("consume(key, reservationId) releases that EXACT reservation, not merely whichever one happens to be oldest", async () => {
    const store = new DurableSpendCapStore({ maxPerWindow: 5, windowMs: 60_000, reservationTtlMs: 60_000 });
    const idOld = await store.reserve("k");
    const idNew = await store.reserve("k");
    expect(idOld).toEqual(expect.any(String));
    expect(idNew).toEqual(expect.any(String));

    // Confirm the NEWER one specifically. If the implementation secretly always released "the
    // oldest live one" regardless of the id argument (same as InMemorySpendCapStore's own fallback
    // path, and indistinguishable from the outside through aggregate counts alone -- see this
    // file's header comment), the on-disk consume event's `id` field would read idOld here, not
    // idNew. Reading the raw file is what makes this actually observable.
    await store.consume("k", idNew ?? undefined);

    const file = join(tmpDir, "spend-cap-k.jsonl");
    const events = readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type: string; id: string | null });
    const consumeEvents = events.filter((e) => e.type === "consume");
    expect(consumeEvents).toHaveLength(1);
    expect(consumeEvents[0]?.id).toBe(idNew);
  });

  it("rejects a key shaped like a path traversal instead of letting it escape CAPACITY_ATTEST_DATA_DIR as a filename", async () => {
    const store = new DurableSpendCapStore({ maxPerWindow: 5, windowMs: 60_000, reservationTtlMs: 60_000 });
    await expect(store.reserve("../evil")).rejects.toThrow(/invalid_spend_cap_key/);
    await expect(store.consume("../evil")).rejects.toThrow(/invalid_spend_cap_key/);
    await expect(store.confirmedCountInWindow("../../etc/passwd")).rejects.toThrow(/invalid_spend_cap_key/);
  });

  it("rejects an oversized key with the same clean invalid_spend_cap_key error instead of a raw OS filesystem error that leaks CAPACITY_ATTEST_DATA_DIR's absolute path (adversarial probe, 2026-11-13: a 255+ char all-alphanumeric key, which SPEND_CAP_KEY_PATTERN's character class alone happily accepts, blew past this OS's per-filename-component length limit and surfaced as an uncaught ENOENT/ENAMETOOLONG straight out of openSync/statSync, embedding the full resolved path in the thrown message -- never hitting invalid_spend_cap_key at all)", async () => {
    const store = new DurableSpendCapStore({ maxPerWindow: 5, windowMs: 60_000, reservationTtlMs: 60_000 });
    const hugeKey = "a".repeat(10_000);
    await expect(store.reserve(hugeKey)).rejects.toThrow(/invalid_spend_cap_key/);
    await expect(store.consume(hugeKey)).rejects.toThrow(/invalid_spend_cap_key/);
    await expect(store.confirmedCountInWindow(hugeKey)).rejects.toThrow(/invalid_spend_cap_key/);
    // Must not be the raw OS error leaking the absolute data dir path -- that's the actual bug.
    await expect(store.reserve(hugeKey)).rejects.not.toThrow(/ENAMETOOLONG|ENOENT/);
    // The error message itself must stay small -- must not echo all 10,000 characters back verbatim.
    await store.reserve(hugeKey).catch((e: unknown) => {
      expect((e as Error).message.length).toBeLessThan(500);
    });
  });

  it("state survives across separate DurableSpendCapStore instances pointed at the same data dir and key -- the actual durability this class exists to add", async () => {
    const opts: SpendCapStoreOptions = { maxPerWindow: 2, windowMs: 60_000, reservationTtlMs: 60_000 };
    const storeA = new DurableSpendCapStore(opts);
    const id = await storeA.reserve("k");
    await storeA.consume("k", id ?? undefined);

    const storeB = new DurableSpendCapStore(opts); // a fresh instance -- simulates a second process, or a restart
    expect(await storeB.confirmedCountInWindow("k")).toBe(1);
    expect(await storeB.reserve("k")).toEqual(expect.any(String));
    expect(await storeB.reserve("k")).toBeNull(); // 1 confirmed + 1 now-live == the cap of 2
  });
});

describe("InMemorySpendCapStore-specific", () => {
  it("does NOT share state across separate instances -- documents the actual tradeoff vs. DurableSpendCapStore (the known, accepted limitation a caller opts out of by using the durable implementation instead)", async () => {
    const opts: SpendCapStoreOptions = { maxPerWindow: 1, windowMs: 60_000, reservationTtlMs: 60_000 };
    const storeA = new InMemorySpendCapStore(opts);
    const id = await storeA.reserve("k");
    await storeA.consume("k", id ?? undefined);
    expect(await storeA.confirmedCountInWindow("k")).toBe(1);

    const storeB = new InMemorySpendCapStore(opts); // a fresh instance -- simulates a second process
    expect(await storeB.confirmedCountInWindow("k")).toBe(0); // no shared backing at all
  });
});

describe("createSpendCapStore factory", () => {
  afterEach(() => {
    delete process.env["CAPACITY_ATTEST_SPEND_CAP_DURABLE"];
  });

  it("defaults to InMemorySpendCapStore when CAPACITY_ATTEST_SPEND_CAP_DURABLE is unset", () => {
    delete process.env["CAPACITY_ATTEST_SPEND_CAP_DURABLE"];
    const store = createSpendCapStore({ maxPerWindow: 1, windowMs: 1_000, reservationTtlMs: 1_000 });
    expect(store).toBeInstanceOf(InMemorySpendCapStore);
  });

  it.each(["true", "1"])("selects DurableSpendCapStore when CAPACITY_ATTEST_SPEND_CAP_DURABLE=%j", (value) => {
    process.env["CAPACITY_ATTEST_SPEND_CAP_DURABLE"] = value;
    const store = createSpendCapStore({ maxPerWindow: 1, windowMs: 1_000, reservationTtlMs: 1_000 });
    expect(store).toBeInstanceOf(DurableSpendCapStore);
  });

  it.each(["false", "0", "", "yes", "TRUE"])("selects InMemorySpendCapStore for any other value, including %j (not just unset)", (value) => {
    process.env["CAPACITY_ATTEST_SPEND_CAP_DURABLE"] = value;
    const store = createSpendCapStore({ maxPerWindow: 1, windowMs: 1_000, reservationTtlMs: 1_000 });
    expect(store).toBeInstanceOf(InMemorySpendCapStore);
  });
});
