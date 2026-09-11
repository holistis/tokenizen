import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, appendFileSync, readFileSync, statSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendClaim, claimsForSeller, allClaims } from "./ledger.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

// vi.mock hoists above these imports (vitest's transform does this
// automatically), so ledger.ts's own internal `import { readFileSync,
// appendFileSync, statSync } from "node:fs"` resolves to these wrapped
// versions too — real behavior preserved by default (each delegates to the
// actual implementation), just spyable/overridable per-test. A plain
// `vi.spyOn(fs, "readFileSync")` does NOT work here: Node's ESM module
// namespace objects are non-configurable, so vitest cannot redefine an
// export on the real "node:fs" module directly; mocking the whole module
// (and spreading the real implementation through) is the supported way to
// spy on a built-in's named export under ESM.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    appendFileSync: vi.fn(actual.appendFileSync),
    statSync: vi.fn(actual.statSync),
  };
});

// Each test gets its own throwaway directory via CAPACITY_ATTEST_DATA_DIR, read
// lazily by config.ts on every call — so no import-order tricks are needed,
// unlike a module-load-time-captured constant would require.
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-test-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
});

afterEach(() => {
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("ledger", () => {
  it("slaat een claim op en leest hem terug", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    const claims = await claimsForSeller(claim.sellerAddress);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.claimId).toBe(claim.claimId);
  });

  it("retourneert claims chronologisch (oudste eerst)", async () => {
    const buyer = testWallet();
    const older = await buildSignedClaim(buyer, { timestamp: "2026-01-01T00:00:00.000Z", settlementRef: "0x" + "aa".repeat(32) });
    const newer = await buildSignedClaim(buyer, { timestamp: "2026-06-01T00:00:00.000Z", settlementRef: "0x" + "bb".repeat(32) });

    // Append in reverse order on purpose — the ledger, not insertion order, must sort them.
    await appendClaim(newer);
    await appendClaim(older);

    const claims = await claimsForSeller(older.sellerAddress);
    expect(claims.map((c) => c.claimId)).toEqual([older.claimId, newer.claimId]);
  });

  it("filtert uitsluitend op de gevraagde sellerAddress", async () => {
    const buyer = testWallet();
    const forSellerA = await buildSignedClaim(buyer, {
      sellerAddress: "0x00000000000000000000000000000000000000aa",
      settlementRef: "0x" + "aa".repeat(32),
    });
    const forSellerB = await buildSignedClaim(buyer, {
      sellerAddress: "0x00000000000000000000000000000000000000bb",
      settlementRef: "0x" + "bb".repeat(32),
    });
    await appendClaim(forSellerA);
    await appendClaim(forSellerB);

    const claims = await claimsForSeller("0x00000000000000000000000000000000000000aa");
    expect(claims).toHaveLength(1);
    expect(claims[0]?.claimId).toBe(forSellerA.claimId);
  });

  it("is case-insensitief op adressen bij het filteren", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: "0x00000000000000000000000000000000000000aa" });
    await appendClaim(claim);

    const claims = await claimsForSeller("0x00000000000000000000000000000000000000AA");
    expect(claims).toHaveLength(1);
  });

  it("is append-only: een tweede keer dezelfde claim opslaan wordt geweigerd, niet overschreven", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    await expect(appendClaim(claim)).rejects.toThrow(/claim_already_recorded/);
    expect(await allClaims()).toHaveLength(1);
  });

  it("heeft geen enkele update- of delete-functie geëxporteerd", async () => {
    const ledgerModule = await import("./ledger.js");
    const exportedNames = Object.keys(ledgerModule);
    expect(exportedNames).toEqual(
      expect.arrayContaining(["appendClaim", "claimsForSeller", "allClaims"]),
    );
    for (const name of exportedNames) {
      expect(name.toLowerCase()).not.toMatch(/update|delete|mutate|overwrite/);
    }
  });
});

// Tests for the 2026-08-31 caching fix (see ledger.ts's header comment for
// the full reasoning): appendClaim()/claimsForSeller()/allClaims() used to
// re-read and re-validate the ENTIRE ledger file on every single call. These
// tests exercise the three things that fix could plausibly get wrong: (1)
// the fast path actually skips disk reads and still returns correct data,
// (2) a write that happens outside the cache (another process, or a direct
// bypass of appendClaim()) is still picked up on the next call rather than
// silently served stale, and (3) the lock — not the cache — is still what
// prevents the original duplicate-claim race, even under real in-process
// concurrent pressure.
describe("ledger cache (2026-08-31 fix)", () => {
  it("cache-hit fast path: retourneert correcte data zonder het bestand opnieuw van schijf te lezen", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim); // warms the cache (and itself triggers exactly one initial readFileSync, on the empty-file path)

    const readSpy = vi.mocked(readFileSync);
    readSpy.mockClear();

    const first = await claimsForSeller(claim.sellerAddress);
    const second = await claimsForSeller(claim.sellerAddress);
    const third = await allClaims();

    expect(first).toHaveLength(1);
    expect(first[0]?.claimId).toBe(claim.claimId);
    expect(second).toEqual(first);
    expect(third).toHaveLength(1);
    expect(third[0]?.claimId).toBe(claim.claimId);

    // The one thing this fix exists to prove: once the cache is warm and
    // nothing on disk has changed since, repeated reads must NOT re-read
    // (let alone re-parse+re-validate) the ledger file.
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("cache-invalidatie: een schrijf die buiten de cache om gebeurt (een ander proces) wordt bij de eerstvolgende call gezien, niet stilletjes gemist", async () => {
    const buyer = testWallet();
    const claim1 = await buildSignedClaim(buyer, { settlementRef: "0x" + "11".repeat(32) });
    await appendClaim(claim1);

    // Warm the cache.
    const before = await claimsForSeller(claim1.sellerAddress);
    expect(before).toHaveLength(1);

    // Simulate a SECOND PROCESS: append directly to the ledger file with the
    // raw fs API, completely bypassing this module's cache (this process's
    // cacheByPath entry has no idea this write happened) and even its lock
    // (deliberately — a real second OS process wouldn't share either).
    const claim2 = await buildSignedClaim(buyer, { settlementRef: "0x" + "22".repeat(32) });
    const ledgerFile = join(tmpDir, "claims.jsonl");
    appendFileSync(ledgerFile, JSON.stringify(claim2) + "\n");

    // The cache `before` was built from is now stale: the file grew
    // underneath it. The next read MUST detect that via the byte-size check
    // and resync — returning the old, cached 1-claim view here would be
    // exactly the "silently stale reads" correctness bug this fix must not
    // introduce.
    const after = await claimsForSeller(claim1.sellerAddress);
    expect(after.map((c) => c.claimId).sort()).toEqual([claim1.claimId, claim2.claimId].sort());

    const all = await allClaims();
    expect(all).toHaveLength(2);

    // appendClaim() itself (which resyncs AFTER acquiring the lock) must
    // also have picked it up — a third, distinct claim must land cleanly
    // alongside both prior ones, not collide with or overwrite claim2.
    const claim3 = await buildSignedClaim(buyer, { settlementRef: "0x" + "33".repeat(32) });
    await appendClaim(claim3);
    expect(await allClaims()).toHaveLength(3);
  });

  it("dubbele-claim race blijft voorkomen bij gelijktijdige in-process aanroepen (de lock, niet de cache, is wat dit garandeert)", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);

    // Ten concurrent in-process appendClaim() calls for the EXACT SAME
    // claim. If the freshness check/resync ever ran BEFORE acquireLock()
    // instead of after, this is the shape of bug that would slip through:
    // multiple callers could all see a "not a duplicate" cache before any
    // of them had actually written.
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => appendClaim(claim)));

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const r of rejected) {
      if (r.status === "rejected") {
        expect(String(r.reason)).toMatch(/claim_already_recorded/);
      }
    }

    const all = await allClaims();
    expect(all.filter((c) => c.claimId === claim.claimId)).toHaveLength(1);
  });
});

// Tests for the SAME-DAY adversarial-verification round on top of the
// 2026-08-31 caching fix above (see ledger.ts's FOURTH/FIFTH/SIXTH FIX
// comments): the caching fix's warm-path win was real, but a verifier found
// three real problems in how it did so. Each test below is written to FAIL
// against the pre-verification-round code and PASS against the fixed code —
// verified by hand for the first one (see the inline note).
describe("ledger cache adversarial-verification-round fixes (2026-08-31, same day)", () => {
  it("Issue 1 fix: cache.size na een eigen write is een DELTA, niet een her-`statSync` — een externe schrijfactie die exact tussen onze appendFileSync en onze cache-update landt wordt bij de eerstvolgende call gezien, niet stilletjes verborgen", async () => {
    const buyer = testWallet();
    const ourClaim = await buildSignedClaim(buyer, { settlementRef: "0x" + "61".repeat(32) });
    // Built ahead of time so it can be written from inside the injected
    // appendFileSync call below — this is the "second, independent process"
    // claim, using a raw fs.appendFileSync exactly like
    // ledger-concurrency-worker.mjs / ledger-cache-cross-process-invalidation.mjs
    // do from a real separate OS process. Injecting it from inside a mocked
    // appendFileSync (rather than an actually-spawned child process) is what
    // makes this deterministic: the real bug's window is the handful of
    // synchronous statements between our own appendFileSync call and our own
    // cache-size update, too narrow for a real separate OS process to be
    // guaranteed to land in reliably in a unit test.
    const externalClaim = await buildSignedClaim(buyer, { settlementRef: "0x" + "62".repeat(32) });

    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const appendSpy = vi.mocked(appendFileSync);
    appendSpy.mockClear();
    appendSpy.mockImplementationOnce((path, data) => {
      // Our own real write happens first...
      actualFs.appendFileSync(path as string, data as string);
      // ...then, still inside the exact same synchronous window appendClaim()
      // is executing in (before it gets a chance to update cache.size),
      // simulate a second process appending directly, bypassing this
      // module's lock AND cache entirely.
      actualFs.appendFileSync(path as string, JSON.stringify(externalClaim) + "\n");
    });

    await appendClaim(ourClaim);

    // THE key check: was the concurrent external write silently swallowed
    // (the bug — cache.size would have matched the post-both-writes disk
    // size via the old re-statSync, so the cache would wrongly consider
    // itself fresh despite not knowing about externalClaim at all), or does
    // the ledger now correctly show both claims because the delta-based
    // size no longer matches disk and forces a resync on the next call?
    const all = await allClaims();
    expect(all.map((c) => c.claimId).sort()).toEqual([ourClaim.claimId, externalClaim.claimId].sort());

    // The sharper version of the same bug: appendClaim()'s OWN duplicate
    // check. With the old re-statSync bug, cache.claimIdSet never learned
    // about externalClaim's id (only cache.size happened to "agree" with
    // disk), so re-submitting externalClaim would have been wrongly
    // ACCEPTED as if it were new — a real duplicate landing in the ledger
    // despite the module's one documented guarantee.
    await expect(appendClaim(externalClaim)).rejects.toThrow(/claim_already_recorded/);

    // (Verified by hand: temporarily reverting just the `cache.size = ...`
    // line in ledger.ts back to `statSync(file).size` and re-running only
    // this test reproduces the original bug exactly as predicted — `all`
    // comes back with length 1 (only ourClaim; externalClaim silently
    // missing), and the `appendClaim(externalClaim)` call above succeeds
    // instead of rejecting, recording a real duplicate line in claims.jsonl.
    // Restoring the delta-based fix makes both assertions pass again.)
  });

  it("Issue 2 fix: een niet-ENOENT fout uit readFileSync (resyncFromDisk) wordt doorgegooid, niet stilletjes als lege ledger behandeld", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim); // warm, correct cache: 1 known claim

    // Force the cache stale so the next read actually calls resyncFromDisk()
    // (which is what contains the readFileSync catch under test) instead of
    // hitting the warm fast path where readFileSync is never invoked at all.
    const externalClaim = await buildSignedClaim(buyer, { settlementRef: "0x" + "71".repeat(32) });
    const ledgerFile = join(tmpDir, "claims.jsonl");
    appendFileSync(ledgerFile, JSON.stringify(externalClaim) + "\n");

    const readSpy = vi.mocked(readFileSync);
    readSpy.mockClear();
    const transientError = Object.assign(new Error("EACCES: permission denied, open '" + ledgerFile + "'"), {
      code: "EACCES",
    });
    readSpy.mockImplementationOnce(() => {
      throw transientError;
    });

    // A real (non-ENOENT) error must propagate as a real rejection, NOT be
    // silently downgraded to "empty ledger". If it were swallowed, this call
    // would instead resolve with an empty (or wrongly-cached) result.
    await expect(claimsForSeller(claim.sellerAddress)).rejects.toThrow(/EACCES/);
  });

  it("Issue 2 fix: een niet-ENOENT fout uit statSync (getFreshCache) wordt doorgegooid, niet stilletjes als lege ledger behandeld", async () => {
    const buyer = testWallet();
    await buildSignedClaim(buyer); // no ledger file needed for this one

    const statSpy = vi.mocked(statSync);
    statSpy.mockClear();
    const transientError = Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    statSpy.mockImplementationOnce(() => {
      throw transientError;
    });

    await expect(allClaims()).rejects.toThrow(/EBUSY/);
  });

  it("Issue 2 regressie-check: een echte ontbrekende ledger (ENOENT) gedraagt zich nog steeds als voorheen — lege lijst, geen fout", async () => {
    // No appendClaim() call yet in this test — claims.jsonl genuinely does
    // not exist. Both resyncFromDisk()'s readFileSync (ENOENT) and
    // getFreshCache()'s statSync (ENOENT) hit their real, unmocked ENOENT
    // path here; this proves the explicit `code !== "ENOENT"` check didn't
    // accidentally turn the genuine "doesn't exist yet" case into an error
    // too.
    await expect(allClaims()).resolves.toEqual([]);
    await expect(claimsForSeller("0x" + "0".repeat(40))).resolves.toEqual([]);

    // And a real first appendClaim() against that still-nonexistent file
    // must keep working exactly as before (creates the ledger, no error).
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await expect(appendClaim(claim)).resolves.toMatchObject({ claimId: claim.claimId });
  });

  it("Issue 3 fix: resyncFromDisk() sorteert en bouwt bySeller nog steeds correct, ook na de yielding-mergesort-herschrijving (300 ongeordend + met tie op timestamp)", async () => {
    // Not a performance test (that's bench/ledger-resync-max-gap.mjs) — this
    // is a pure correctness check that yieldingMergeSort() (which replaced
    // the plain `.sort()`) still produces byte-identical ordering, including
    // its stability guarantee on tied timestamps, and that the batched
    // bySeller build still ends up with every claim in the right bucket.
    const buyer = testWallet();
    const tiedTimestamp = "2026-03-01T00:00:00.000Z";
    const sellers = ["aa", "bb", "cc"];
    const claims = [];
    // Built and appended in a deliberately shuffled, non-chronological
    // order, with several ties on the exact same timestamp, so both the
    // sort and the stability tie-break are actually exercised.
    for (let i = 0; i < 60; i++) {
      const useTie = i % 5 === 0;
      const claim = await buildSignedClaim(buyer, {
        sellerAddress: "0x" + "0".repeat(38) + sellers[i % sellers.length],
        settlementRef: "0x" + `t${i}`.padStart(64, "0"),
        timestamp: useTie ? tiedTimestamp : new Date(Date.UTC(2026, 0, 1) + ((i * 9301) % 5000) * 60_000).toISOString(),
      });
      claims.push(claim);
    }
    // Append in REVERSE order on purpose, and force a resync from a totally
    // fresh in-process state afterwards by bypassing appendClaim() for the
    // bulk write (same technique bench scripts use), so the assertions below
    // exercise resyncFromDisk()'s sort/bySeller path, not the warm
    // incremental-insert path.
    const ledgerFile = join(tmpDir, "claims.jsonl");
    const shuffled = [...claims].reverse();
    appendFileSync(ledgerFile, shuffled.map((c) => JSON.stringify(c)).join("\n") + "\n");

    const all = await allClaims();
    expect(all).toHaveLength(60);
    const timestamps = all.map((c) => Date.parse(c.timestamp));
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]!);
    }
    // Native Array.sort() is the reference oracle for "correct, stable
    // order" here — yieldingMergeSort() must match it exactly, tie-break
    // included, given the SAME pre-sort (file/append) order as its input.
    const expectedOrder = [...shuffled]
      .map((c, idx) => ({ c, idx }))
      .sort((a, b) => Date.parse(a.c.timestamp) - Date.parse(b.c.timestamp) || a.idx - b.idx)
      .map((x) => x.c.claimId);
    expect(all.map((c) => c.claimId)).toEqual(expectedOrder);

    for (const seller of sellers) {
      const sellerAddress = "0x" + "0".repeat(38) + seller;
      const sellerClaims = await claimsForSeller(sellerAddress);
      expect(sellerClaims.length).toBeGreaterThan(0);
      expect(sellerClaims.every((c) => c.sellerAddress === sellerAddress)).toBe(true);
      const sellerTs = sellerClaims.map((c) => Date.parse(c.timestamp));
      for (let i = 1; i < sellerTs.length; i++) {
        expect(sellerTs[i]).toBeGreaterThanOrEqual(sellerTs[i - 1]!);
      }
    }
  });
});

// Tests for the SEVENTH FIX (2026-09-06, found by an adversarial misuse-scenario
// audit): the read path (resyncFromDisk, backing claimsForSeller()/allClaims()/
// get_delivery_history) only ever checked claimId/signature's SHAPE via regex —
// it never recomputed either, so a well-shaped but fabricated line, written
// directly to claims.jsonl (the same "second writer" scenario the cache tests
// above simulate for a LEGITIMATE claim), was served back out as if genuine.
// Each test injects such a line with the exact raw-fs technique used above, but
// with a tampered claimId, a garbage signature, or a real-but-misattributed
// signature instead of a legitimate second write.
describe("ledger read-path signature verification (2026-09-06 fix)", () => {
  it("een direct in het bestand geplaatste regel met een claimId die niet bij de inhoud hoort wordt genegeerd, niet teruggegeven", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { settlementRef: "0x" + "81".repeat(32) });
    await appendClaim(genuine);

    const fabricated = await buildSignedClaim(buyer, { settlementRef: "0x" + "82".repeat(32) });
    // Same shape (0x + 64 hex) as a real claimId, but does not hash this
    // content — exactly what a second writer bypassing recordDelivery()'s
    // verifyClaim() gate could produce.
    const tampered = { ...fabricated, claimId: "0x" + "ab".repeat(32) };
    appendFileSync(join(tmpDir, "claims.jsonl"), JSON.stringify(tampered) + "\n");

    expect((await allClaims()).map((c) => c.claimId)).toEqual([genuine.claimId]);
    expect(await claimsForSeller(genuine.sellerAddress)).toHaveLength(1);
  });

  it("een direct in het bestand geplaatste regel met een handtekening van het verkeerde soort (garbage) wordt genegeerd", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { settlementRef: "0x" + "83".repeat(32) });
    await appendClaim(genuine);

    const fabricated = await buildSignedClaim(buyer, { settlementRef: "0x" + "84".repeat(32) });
    // claimId stays correct (it really is the hash of this content) — only
    // the signature is garbage of the right shape (0x + 130 hex).
    const tampered = { ...fabricated, signature: "0x" + "cd".repeat(65) };
    appendFileSync(join(tmpDir, "claims.jsonl"), JSON.stringify(tampered) + "\n");

    expect((await allClaims()).map((c) => c.claimId)).toEqual([genuine.claimId]);
  });

  it("een handtekening van een ANDER wallet dan de opgegeven buyerAddress wordt genegeerd (reattributie-scenario)", async () => {
    const buyer = testWallet();
    const impostor = testWallet();
    const genuine = await buildSignedClaim(buyer, { settlementRef: "0x" + "85".repeat(32) });
    await appendClaim(genuine);

    // Content honestly claims buyerAddress = buyer, but is actually signed
    // by `impostor` — internally consistent (claimId really does hash this
    // content) but signature recovers to impostor, not the declared buyer.
    // The closest a hand-edited ledger line can get to "looking real"
    // without holding buyer's private key.
    const impostorClaim = await buildSignedClaim(impostor, {
      buyerAddress: buyer.address,
      settlementRef: "0x" + "86".repeat(32),
    });
    appendFileSync(join(tmpDir, "claims.jsonl"), JSON.stringify(impostorClaim) + "\n");

    expect((await allClaims()).map((c) => c.claimId)).toEqual([genuine.claimId]);
  });

  it("regressie: een echt via appendClaim() opgeslagen claim blijft na deze fix gewoon zichtbaar", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    expect(await allClaims()).toHaveLength(1);
    expect((await claimsForSeller(claim.sellerAddress))[0]?.claimId).toBe(claim.claimId);
  });
});

describe("ledger newline-tail safety (adversarial review 2026-09-11)", () => {
  it("een gescheurde staart (geen afsluitende newline) verwoest niet langer de eerstvolgende, echte claim", async () => {
    const ledgerFile = join(tmpDir, "claims.jsonl");
    // Simuleert precies het scenario uit de bevinding: een crash/SIGKILL/ENOSPC halverwege
    // een write, of een tweede proces dat buiten het lockfile om schrijft, laat een regel
    // zonder afsluitende "\n" achter. GEEN "\n" op het einde, met opzet.
    writeFileSync(ledgerFile, '{"garbage": "no trailing newline here"}');

    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    // Vóór de fix: deze twee regels smolten samen tot één kapotte string die JSON.parse niet
    // kon lezen, en de zojuist als "gelukt" gemelde claim verdween stil bij de eerstvolgende resync.
    const onDisk = readFileSync(ledgerFile, "utf8");
    expect(onDisk).toContain("\n" + JSON.stringify(claim));
    expect((await allClaims()).map((c) => c.claimId)).toEqual([claim.claimId]);
  });

  it("voegt GEEN extra newline toe als de staart al netjes eindigt (geen regressie op het normale pad)", async () => {
    const buyer = testWallet();
    const first = await buildSignedClaim(buyer, { settlementRef: "0x" + "aa".repeat(32) });
    const second = await buildSignedClaim(buyer, { settlementRef: "0x" + "bb".repeat(32) });
    await appendClaim(first);
    await appendClaim(second);

    const ledgerFile = join(tmpDir, "claims.jsonl");
    const lines = readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("een lege of nog niet bestaande ledger heeft geen leidende newline nodig", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    const ledgerFile = join(tmpDir, "claims.jsonl");
    const onDisk = readFileSync(ledgerFile, "utf8");
    expect(onDisk.startsWith("\n")).toBe(false);
    expect(onDisk).toBe(JSON.stringify(claim) + "\n");
  });
});

describe("ledger lock liveness (adversarial review 2026-09-11)", () => {
  it("steelt een oud-ogend lockbestand NIET als de eigenaar-pid nog echt leeft (voorkomt het dubbele-claim-ras dat het slot juist moet tegenhouden)", async () => {
    const lockPath = join(tmpDir, "claims.jsonl.lock");
    // Dit test-proces zelf is de "eigenaar": gegarandeerd levend, en precies het scenario
    // uit de bevinding — een langzame maar levende houder mag niet bestolen worden puur
    // omdat het slotbestand er al meer dan STALE_LOCK_MS oud uitziet.
    writeFileSync(lockPath, String(process.pid));
    const oldTime = new Date(Date.now() - 31_000);
    utimesSync(lockPath, oldTime, oldTime);

    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await expect(appendClaim(claim)).rejects.toThrow(/ledger_lock_timeout/);
  }, 8_000);

  it("reclaimt een oud lockbestand nog steeds als de eigenaar-pid echt dood is (geen regressie op het bestaande crash-herstel)", async () => {
    const lockPath = join(tmpDir, "claims.jsonl.lock");
    // Een zeer onwaarschijnlijk bestaande pid — simuleert een proces dat is gecrasht
    // terwijl het het slot vasthield.
    writeFileSync(lockPath, "2147483647");
    const oldTime = new Date(Date.now() - 31_000);
    utimesSync(lockPath, oldTime, oldTime);

    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    const result = await appendClaim(claim);
    expect(result.claimId).toBe(claim.claimId);
  });
});
