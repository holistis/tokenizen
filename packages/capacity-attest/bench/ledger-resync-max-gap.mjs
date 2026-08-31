#!/usr/bin/env node
// bench/ledger-resync-max-gap.mjs — proves the SIXTH FIX (see ledger.ts's
// yieldingMergeSort() comment) actually bounds the event loop's WORST
// single stall during a full cold resyncFromDisk(), not just the aggregate
// tick-count ratio bench/ledger-cache-scale.mjs already measures.
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/ledger-resync-max-gap.mjs
//
// WHY "MAX GAP" INSTEAD OF (OR IN ADDITION TO) A TICK-COUNT RATIO:
// bench/ledger-cache-scale.mjs's tick-count-ratio metric (ticks-received /
// ticks-expected) is an AGGREGATE over the whole resync — it can look fine
// even if one single merge/build step inside the resync blocks for, say,
// 400ms in one unbroken stretch, as long as the rest of the resync yields
// often enough to keep the AVERAGE reasonable. The actual failure mode this
// fix targets (a single long synchronous stretch freezing every other
// in-flight request on the process) is a WORST-CASE, single-gap question,
// not an average. So this script records the wall-clock timestamp of every
// single tick during the cold resync and reports the MAXIMUM gap between
// any two consecutive ticks — the true worst-case stall, which is exactly
// what "no single unyielded stretch should be meaningfully larger than one
// batch's cost" (the SIXTH FIX's own requirement) means in measurable terms.
//
// METHOD, per scale N (50,000 and 200,000, per the fix's own before/after
// numbers: 26ms sort + 47ms bySeller-build ~= 75ms unyielded tail measured
// at N=50,000; ~438ms projected at N=200,000):
//   1. Bulk-write N pre-signed claims directly to a fresh ledger file (same
//      technique bench/ledger-scale.mjs and bench/ledger-cache-scale.mjs use
//      to avoid the O(N^2) cost of seeding via N real appendClaim() calls).
//   2. Start a setImmediate-based tick recorder BEFORE the first touch of
//      that ledger file in this process — setImmediate (not setInterval) is
//      used here specifically because it reschedules itself only after the
//      previous tick actually ran, so consecutive tick timestamps directly
//      bound how long the event loop was unavailable between them, with no
//      timer-coalescing floor the way a short setInterval can have.
//   3. Call claimsForSeller() ONCE against that never-before-touched path —
//      this is the cold call that must run the full resyncFromDisk(): parse
//      (already yielded, unaffected by this fix) + yieldingMergeSort() +
//      batched bySeller build (both new in this fix).
//   4. Stop the recorder, compute every consecutive-tick gap, report the
//      MAX.
//
// Uses fresh, disposable CAPACITY_ATTEST_DATA_DIR directories (never the
// real data/ dir).

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const SCALES = [50_000, 200_000];
const TARGET_SELLER = "0x" + "0".repeat(38) + "ee";
const OTHER_SELLER_COUNT = 24;
const TARGET_SELLER_SHARE = 0.2;

function otherSeller(i) {
  return "0x" + (i % OTHER_SELLER_COUNT).toString(16).padStart(40, "0");
}

function fmtMs(ms) {
  return `${ms.toFixed(3)}ms`;
}

/** Builds N realistic, validly signed claims, deliberately shuffled (not chronological) so the sort under test does real work, and bulk-writes them to a fresh temp ledger file. */
async function seedLedger(n, mods) {
  const { testWallet, buildSignedClaim, evidenceHash } = mods.testHelpers;
  const tmpDir = mkdtempSync(join(tmpdir(), `capacity-attest-maxgap-${n}-`));
  mkdirSync(tmpDir, { recursive: true });

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
        promisedSpec: `maxgap-bench claim #${i}`,
        evidenceHash: evidenceHash(`maxgap-evidence-${n}-${i}`),
        settlementRef: "0x" + i.toString(16).padStart(64, "0"),
        // Deliberately NOT monotonic with i (unlike ledger-scale.mjs's seed)
        // — a pseudo-random-looking but deterministic spread of timestamps,
        // so yieldingMergeSort() has to do real reordering work instead of
        // being handed an already-sorted array (which would understate its
        // cost/behavior).
        timestamp: new Date(Date.UTC(2026, 0, 1) + ((i * 104729) % (n * 60_000))).toISOString(),
      }),
    );
  }
  // Shuffle the WRITE order too (Fisher-Yates with a fixed seed via a simple
  // LCG) so file/append order also disagrees with sorted order — matching a
  // real ledger where claims are not appended in strict timestamp order.
  let seed = 42;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  for (let i = claims.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [claims[i], claims[j]] = [claims[j], claims[i]];
  }

  writeFileSync(join(tmpDir, "claims.jsonl"), claims.map((c) => JSON.stringify(c)).join("\n") + "\n");
  return tmpDir;
}

/** Records the timestamp of every setImmediate tick until stopped; returns the recorder handle. */
function startTickRecorder() {
  const ticks = [performance.now()];
  let stopped = false;
  function tick() {
    ticks.push(performance.now());
    if (!stopped) setImmediate(tick);
  }
  setImmediate(tick);
  return {
    stop() {
      stopped = true;
    },
    ticks,
  };
}

function gapStats(ticks) {
  const gaps = [];
  for (let i = 1; i < ticks.length; i++) gaps.push(ticks[i] - ticks[i - 1]);
  const max = Math.max(...gaps);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { count: gaps.length, max, mean, p99 };
}

async function runScale(n, mods) {
  const { claimsForSeller } = mods.ledger;

  console.log(`\n=== N = ${n.toLocaleString("en-US")} ===`);
  const tmpDir = await seedLedger(n, mods);
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  console.log(`ledger dir: ${tmpDir}`);

  // Recorder starts BEFORE the first (cold) touch of this path in this
  // process — so it captures the entire resync, start to finish, including
  // the parse loop (already yielded pre-fix, included here as a baseline
  // sanity check that its own gaps stay small too), the new
  // yieldingMergeSort(), and the new batched bySeller build.
  const recorder = startTickRecorder();
  const t0 = performance.now();
  const result = await claimsForSeller(TARGET_SELLER);
  const totalMs = performance.now() - t0;
  recorder.stop();
  // One more setImmediate so the recorder's final scheduled tick (if any)
  // lands before we read `ticks`.
  await new Promise((resolve) => setImmediate(resolve));

  const stats = gapStats(recorder.ticks);
  console.log(`cold claimsForSeller() total wall time: ${fmtMs(totalMs)} (matched ${result.length.toLocaleString("en-US")} of ${n.toLocaleString("en-US")} claims)`);
  console.log(`event-loop ticks recorded during resync: ${recorder.ticks.length} (${stats.count} gaps)`);
  console.log(`gap between ticks: mean ${fmtMs(stats.mean)}, p99 ${fmtMs(stats.p99)}, MAX ${fmtMs(stats.max)}`);

  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];

  return { n, totalMs, maxGapMs: stats.max, meanGapMs: stats.mean, p99GapMs: stats.p99 };
}

async function main() {
  console.log("capacity-attest ledger resync MAX-GAP benchmark (Issue 3 / SIXTH FIX)");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`scales: ${SCALES.join(", ")} — measuring the worst single event-loop stall during a full cold resync, not just an aggregate tick ratio`);

  const [testHelpers, ledger] = await Promise.all([import("../dist/test-helpers.js"), import("../dist/ledger.js")]);
  const mods = { testHelpers, ledger };

  const results = [];
  for (const n of SCALES) {
    results.push(await runScale(n, mods));
  }

  console.log("\n=== Summary ===");
  console.log("N".padStart(10), "total(ms)".padStart(12), "mean gap(ms)".padStart(14), "p99 gap(ms)".padStart(14), "MAX gap(ms)".padStart(14));
  for (const r of results) {
    console.log(
      String(r.n).padStart(10),
      r.totalMs.toFixed(1).padStart(12),
      r.meanGapMs.toFixed(3).padStart(14),
      r.p99GapMs.toFixed(3).padStart(14),
      r.maxGapMs.toFixed(3).padStart(14),
    );
  }

  const first = results[0];
  const last = results[results.length - 1];
  const nRatio = last.n / first.n;
  const maxGapRatio = last.maxGapMs / Math.max(first.maxGapMs, 0.001);
  console.log(
    `\nN grew ${nRatio}x (${first.n.toLocaleString("en-US")} -> ${last.n.toLocaleString("en-US")}); MAX gap grew ${maxGapRatio.toFixed(2)}x ` +
      `(${fmtMs(first.maxGapMs)} -> ${fmtMs(last.maxGapMs)}).`,
  );
  console.log(
    "Before the SIXTH FIX, the unyielded sort+bySeller tail alone was measured at ~75ms at N=50,000 and projected ~438ms at " +
      "N=200,000 (a ~5.8x growth, tracking N almost linearly, since neither step yielded at all). A MAX-gap ratio here that stays " +
      "well under that — ideally close to flat/bounded rather than growing with N — is what the fix's own requirement (\"no single " +
      "unyielded stretch meaningfully larger than one batch's cost\") looks like when actually measured, not just reasoned about.",
  );
}

main().catch((e) => {
  console.error("ledger-resync-max-gap benchmark FAILED:", e);
  process.exitCode = 1;
});
