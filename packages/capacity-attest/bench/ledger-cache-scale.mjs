#!/usr/bin/env node
// bench/ledger-cache-scale.mjs — proves the 2026-08-31 in-memory caching fix
// (ledger.ts's getFreshCache()/resyncFromDisk()) actually removed the
// per-call O(ledger-size) cost that bench/ledger-scale.mjs was written to
// document in the FIRST place.
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/ledger-cache-scale.mjs
//
// WHAT THIS MEASURES, PER SCALE N (0, 20,000, 40,000 pre-existing claims):
//
//   1. "cold" call: the FIRST appendClaim() (Phase A) / claimsForSeller()
//      (Phase B) call against a ledger file this process has never touched
//      before. This call's cache has nothing to reuse, so it must resync
//      from disk — still O(N), by design (see ledger.ts's header comment:
//      the resync path is the exception now, not eliminated). This number
//      is EXPECTED to still grow with N, same as the old code always did.
//   2. "warm" calls: WARM_SAMPLES further calls against the SAME path,
//      immediately after the cold call warmed its cache, with NOTHING else
//      writing to the file in between. These are the calls this fix exists
//      to speed up — no disk re-read, no re-parse, no re-validation. This
//      number is EXPECTED to stay ~flat regardless of N, close to the N=0
//      floor, not grow with ledger size.
//
// Two separate temp ledgers per N (identically seeded) are used for phase A
// (append) and phase B (history), so the very first touch of each path is
// genuinely the call type being measured — an append phase that had already
// been warmed by a prior history call would misattribute the resync cost.
//
// Event-loop responsiveness (the same setInterval-tick-counting technique
// bench/event-loop-non-blocking.mjs uses to catch actual blocking, not just
// wall-clock time) is measured across the cold call specifically, to confirm
// resyncFromDisk()'s batch-yield loop bounds any single blocking stretch
// rather than freezing the event loop for the whole O(N) resync in one go —
// this is the same failure mode bench/ledger-scale.mjs's 903ms/40k-lines
// number originally exposed.
//
// Uses fresh, disposable CAPACITY_ATTEST_DATA_DIR directories (never the
// real data/ dir).

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const SCALES = [0, 20_000, 40_000];
const WARM_SAMPLES = 20;
const TICK_MS = 10;
const TARGET_SELLER = "0x" + "0".repeat(38) + "ee";
const OTHER_SELLER_COUNT = 24;
const TARGET_SELLER_SHARE = 0.2;

function otherSeller(i) {
  return "0x" + (i % OTHER_SELLER_COUNT).toString(16).padStart(40, "0");
}

function fmtMs(ms) {
  return `${ms.toFixed(3)}ms`;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Builds N realistic, validly signed claims and bulk-writes them to a fresh temp ledger file, bypassing appendClaim() (which would be O(N^2) to seed with — see ledger-scale.mjs's methodology note for why). Returns the temp dir. */
async function seedLedger(n, label, mods) {
  const { testWallet, buildSignedClaim, evidenceHash } = mods.testHelpers;
  const tmpDir = mkdtempSync(join(tmpdir(), `capacity-attest-cachebench-${label}-${n}-`));
  mkdirSync(tmpDir, { recursive: true });
  if (n === 0) return tmpDir; // no file at all — matches a genuinely empty ledger

  const buyer = testWallet();
  const targetCount = Math.round(n * TARGET_SELLER_SHARE);
  const claims = [];
  for (let i = 0; i < n; i++) {
    const sellerAddress = i < targetCount ? TARGET_SELLER : otherSeller(i);
    claims.push(
      await buildSignedClaim(buyer, {
        sellerAddress,
        assetType: ["gpu-hours", "storage", "api-credits", "bandwidth"][i % 4],
        delivered: ["yes", "no", "partial"][i % 3],
        promisedSpec: `seed claim #${i}: 1x A100, ${(i % 24) + 1} hours, region-${i % 7}`,
        evidenceHash: evidenceHash(`seed-evidence-${label}-${i}`),
        settlementRef: "0x" + i.toString(16).padStart(64, "0"),
        timestamp: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      }),
    );
  }
  writeFileSync(join(tmpDir, "claims.jsonl"), claims.map((c) => JSON.stringify(c)).join("\n") + "\n");
  return tmpDir;
}

/** Times one async call, with a concurrent setInterval tick-counter to catch event-loop blocking (not just wall time) during that call. */
async function timeWithTickCount(fn) {
  let ticks = 0;
  const t0 = performance.now();
  const timer = setInterval(() => ticks++, TICK_MS);
  const result = await fn();
  clearInterval(timer);
  const ms = performance.now() - t0;
  const expectedTicks = ms / TICK_MS;
  return { result, ms, ticks, expectedTicks, tickRatio: expectedTicks > 0 ? ticks / expectedTicks : 1 };
}

async function runAppendPhase(n, mods) {
  const { appendClaim } = mods.ledger;
  const { testWallet, buildSignedClaim, evidenceHash } = mods.testHelpers;

  const tmpDir = await seedLedger(n, "append", mods);
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  const buyer = testWallet();

  function nextClaim(i) {
    return buildSignedClaim(buyer, {
      sellerAddress: TARGET_SELLER,
      promisedSpec: `cache-bench append #${i}`,
      evidenceHash: evidenceHash(`cache-bench-append-evidence-${n}-${i}`),
      settlementRef: "0x" + `a${n}${i}`.padStart(64, "0"),
      timestamp: new Date().toISOString(),
    });
  }

  // Cold: first appendClaim() this process has ever done against this path.
  const coldClaim = await nextClaim("cold");
  const cold = await timeWithTickCount(() => appendClaim(coldClaim));

  // Warm: repeated calls immediately after, nothing else touches the file.
  const warmTimings = [];
  for (let i = 0; i < WARM_SAMPLES; i++) {
    const claim = await nextClaim(i);
    const t0 = performance.now();
    await appendClaim(claim);
    warmTimings.push(performance.now() - t0);
  }

  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];

  return {
    coldMs: cold.ms,
    coldTicks: cold.ticks,
    coldExpectedTicks: cold.expectedTicks,
    coldTickRatio: cold.tickRatio,
    warmMeanMs: mean(warmTimings),
    warmMedianMs: median(warmTimings),
    warmMaxMs: Math.max(...warmTimings),
  };
}

async function runHistoryPhase(n, mods) {
  const { claimsForSeller, allClaims } = mods.ledger;

  const tmpDir = await seedLedger(n, "history", mods);
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

  // Cold: first claimsForSeller() this process has ever done against this path.
  const cold = await timeWithTickCount(() => claimsForSeller(TARGET_SELLER));
  const coldCount = cold.result.length;

  // Warm: repeated calls immediately after (mix of claimsForSeller/allClaims).
  const warmTimings = [];
  for (let i = 0; i < WARM_SAMPLES; i++) {
    const t0 = performance.now();
    if (i % 2 === 0) await claimsForSeller(TARGET_SELLER);
    else await allClaims();
    warmTimings.push(performance.now() - t0);
  }

  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];

  return {
    coldMs: cold.ms,
    coldTicks: cold.ticks,
    coldExpectedTicks: cold.expectedTicks,
    coldTickRatio: cold.tickRatio,
    coldMatchCount: coldCount,
    warmMeanMs: mean(warmTimings),
    warmMedianMs: median(warmTimings),
    warmMaxMs: Math.max(...warmTimings),
  };
}

async function main() {
  console.log("capacity-attest ledger CACHE scale benchmark (proves the 2026-08-31 caching fix)");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`scales: ${SCALES.join(", ")}; ${WARM_SAMPLES} warm samples per phase per scale; tick = ${TICK_MS}ms`);

  const [testHelpers, ledger] = await Promise.all([import("../dist/test-helpers.js"), import("../dist/ledger.js")]);
  const mods = { testHelpers, ledger };

  const appendResults = [];
  const historyResults = [];
  for (const n of SCALES) {
    console.log(`\n=== N = ${n.toLocaleString("en-US")} ===`);

    const a = await runAppendPhase(n, mods);
    appendResults.push({ n, ...a });
    console.log(
      `appendClaim() COLD (first touch of this path, ledger has ${n.toLocaleString("en-US")} pre-existing claims): ` +
        `${fmtMs(a.coldMs)} — event loop: got ${a.coldTicks} of ~${a.coldExpectedTicks.toFixed(1)} expected ticks ` +
        `(${(a.coldTickRatio * 100).toFixed(1)}%, bounded by RESYNC_BATCH_SIZE-sized yields, not one unbroken freeze)`,
    );
    console.log(
      `appendClaim() WARM (${WARM_SAMPLES} more calls right after, cache stays hot): ` +
        `mean ${fmtMs(a.warmMeanMs)}, median ${fmtMs(a.warmMedianMs)}, max ${fmtMs(a.warmMaxMs)}`,
    );

    const h = await runHistoryPhase(n, mods);
    historyResults.push({ n, ...h });
    console.log(
      `claimsForSeller() COLD (first touch, ${h.coldMatchCount.toLocaleString("en-US")} of ${n.toLocaleString("en-US")} match): ` +
        `${fmtMs(h.coldMs)} — event loop: got ${h.coldTicks} of ~${h.coldExpectedTicks.toFixed(1)} expected ticks (${(h.coldTickRatio * 100).toFixed(1)}%)`,
    );
    console.log(
      `claimsForSeller()/allClaims() WARM (${WARM_SAMPLES} more calls right after): ` +
        `mean ${fmtMs(h.warmMeanMs)}, median ${fmtMs(h.warmMedianMs)}, max ${fmtMs(h.warmMaxMs)}`,
    );
  }

  console.log("\n=== Summary: appendClaim() ===");
  console.log("N".padStart(10), "cold(ms)".padStart(14), "warm mean(ms)".padStart(16), "warm median(ms)".padStart(18), "warm max(ms)".padStart(14));
  for (const r of appendResults) {
    console.log(
      String(r.n).padStart(10),
      r.coldMs.toFixed(3).padStart(14),
      r.warmMeanMs.toFixed(3).padStart(16),
      r.warmMedianMs.toFixed(3).padStart(18),
      r.warmMaxMs.toFixed(3).padStart(14),
    );
  }

  console.log("\n=== Summary: claimsForSeller()/allClaims() ===");
  console.log("N".padStart(10), "cold(ms)".padStart(14), "warm mean(ms)".padStart(16), "warm median(ms)".padStart(18), "warm max(ms)".padStart(14));
  for (const r of historyResults) {
    console.log(
      String(r.n).padStart(10),
      r.coldMs.toFixed(3).padStart(14),
      r.warmMeanMs.toFixed(3).padStart(16),
      r.warmMedianMs.toFixed(3).padStart(18),
      r.warmMaxMs.toFixed(3).padStart(14),
    );
  }

  const zero = appendResults[0];
  const largest = appendResults[appendResults.length - 1];
  const zeroH = historyResults[0];
  const largestH = historyResults[historyResults.length - 1];
  console.log("\n=== Verdict ===");
  console.log(
    `appendClaim() warm-median at N=${largest.n.toLocaleString("en-US")} (${fmtMs(largest.warmMedianMs)}) vs N=0 floor (${fmtMs(zero.warmMedianMs)}): ` +
      `${(largest.warmMedianMs / Math.max(zero.warmMedianMs, 0.001)).toFixed(2)}x — should be close to 1x (cache hides ledger size), NOT the ~${largest.n.toLocaleString("en-US")}x-ish growth a per-call O(N) re-read/re-validate would produce.`,
  );
  console.log(
    `claimsForSeller()/allClaims() warm-median at N=${largestH.n.toLocaleString("en-US")} (${fmtMs(largestH.warmMedianMs)}) vs N=0 floor (${fmtMs(zeroH.warmMedianMs)}): ` +
      `${(largestH.warmMedianMs / Math.max(zeroH.warmMedianMs, 0.001)).toFixed(2)}x.`,
  );
  console.log(
    `appendClaim() cold call at N=${largest.n.toLocaleString("en-US")} took ${fmtMs(largest.coldMs)} (still O(N) by design — this is the resync EXCEPTION path, ` +
      `not eliminated) but kept ${(largest.coldTickRatio * 100).toFixed(1)}% of expected event-loop ticks flowing during it, ` +
      `via the batched-yield resync, instead of one unbroken freeze for the whole ${fmtMs(largest.coldMs)}.`,
  );
}

main().catch((e) => {
  console.error("ledger-cache-scale benchmark FAILED:", e);
  process.exitCode = 1;
});
