#!/usr/bin/env node
// bench/ledger-scale.mjs — real wall-clock ledger performance benchmark.
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/ledger-scale.mjs
//
// Seeds the append-only JSONL ledger with N realistic, validly signed
// DeliveryClaims (via the compiled dist/ output — the same code the MCP
// server ships), at N = 100, 1_000, 10_000, and measures:
//
//   1. appendClaim(): time to append ONE MORE claim once the ledger
//      already holds N records. appendClaim() re-reads + re-parses the
//      ENTIRE ledger file on every single call (to check the new claimId
//      isn't a duplicate) before appending — so this number is expected to
//      grow with N. That growth IS the thing being measured.
//   2. getDeliveryHistory()-equivalent (claimsForSeller()): time to fetch
//      one seller's history out of a ledger with N total records spread
//      across many sellers.
//
// Uses a fresh, disposable CAPACITY_ATTEST_DATA_DIR per scale (never the
// real data/ dir) so this never touches real ledger data.

import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const SCALES = [100, 1_000, 10_000];
const APPEND_SAMPLES = 5; // extra single appends measured AFTER seeding, per scale
const HISTORY_SAMPLES = 5; // repeated getDeliveryHistory calls measured, per scale
const TARGET_SELLER = "0x" + "0".repeat(38) + "ee";
const OTHER_SELLER_COUNT = 24; // + TARGET_SELLER = 25 distinct sellers total
const TARGET_SELLER_SHARE = 0.2; // ~20% of seeded claims go to TARGET_SELLER

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

async function runScale(n, mods) {
  const { testWallet, buildSignedClaim, evidenceHash } = mods.testHelpers;
  const { appendClaim, claimsForSeller } = mods.ledger;

  const tmpDir = mkdtempSync(join(tmpdir(), `capacity-attest-bench-${n}-`));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

  console.log(`\n=== N = ${n.toLocaleString("en-US")} ===`);
  console.log(`ledger dir: ${tmpDir}`);

  const buyer = testWallet();
  const targetCount = Math.round(n * TARGET_SELLER_SHARE);

  // --- Seed N realistic, validly signed DeliveryClaims. ---
  //
  // IMPORTANT methodology note: the real appendClaim() re-reads and
  // re-parses the ENTIRE ledger file on every single call (to check for a
  // duplicate claimId) before appending one line. Seeding N records by
  // calling appendClaim() N times in a row is therefore O(N^2) work overall
  // (append #k re-reads the k-1 records already there) — for N=10,000 that
  // is ~50 million claim parses just to set up the benchmark, which made a
  // first run of this script not finish in a reasonable time.
  //
  // So: claims are still individually built as REAL, validly signed
  // DeliveryClaim objects (real ECDSA signing via buildSignedClaim, timed
  // below as "sign" time), but the bulk of them are written to
  // claims.jsonl with one direct bulk file write, in EXACTLY the same
  // line format appendClaim() itself uses (`JSON.stringify(claim) + "\n"`
  // per line) — i.e. this produces a byte-for-byte equivalent ledger file
  // to what N real sequential record_delivery calls would have produced,
  // without paying the O(N^2) dedup-scan cost N times over just to reach
  // that state. The two metrics that are actually reported below —
  // "append 1 more claim" and "get_delivery_history" — both call the real,
  // unmodified ledger.ts functions against this seeded file.
  const signStart = performance.now();
  const claims = [];
  for (let i = 0; i < n; i++) {
    const sellerAddress = i < targetCount ? TARGET_SELLER : otherSeller(i);
    const claim = await buildSignedClaim(buyer, {
      sellerAddress,
      assetType: ["gpu-hours", "storage", "api-credits", "bandwidth"][i % 4],
      delivered: ["yes", "no", "partial"][i % 3],
      promisedSpec: `seed claim #${i}: 1x A100, ${(i % 24) + 1} hours, region-${i % 7}`,
      evidenceHash: evidenceHash(`seed-evidence-${i}`),
      settlementRef: "0x" + i.toString(16).padStart(64, "0"),
      timestamp: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    });
    claims.push(claim);
  }
  const signMs = performance.now() - signStart;
  console.log(`seed: ${n.toLocaleString("en-US")} claims built + real-signed in ${fmtMs(signMs)} (${fmtMs(signMs / n)}/claim, real ECDSA signMessage)`);

  const ledgerFile = join(tmpDir, "claims.jsonl");
  mkdirSync(tmpDir, { recursive: true });
  const bulkWriteStart = performance.now();
  writeFileSync(ledgerFile, claims.map((c) => JSON.stringify(c)).join("\n") + "\n");
  const bulkWriteMs = performance.now() - bulkWriteStart;
  console.log(`seed: bulk-wrote ${n.toLocaleString("en-US")} pre-signed claims to disk in ${fmtMs(bulkWriteMs)} (equivalent ledger file state to ${n.toLocaleString("en-US")} sequential record_delivery calls)`);

  const sizeBytes = statSync(ledgerFile).size;
  console.log(`ledger file size: ${sizeBytes.toLocaleString("en-US")} bytes (${(sizeBytes / n).toFixed(1)} bytes/claim avg)`);

  // --- Metric 1: time to append ONE MORE record_delivery-equivalent claim,
  // now that the ledger already holds N records. ---
  const appendTimings = [];
  for (let i = 0; i < APPEND_SAMPLES; i++) {
    const claim = await buildSignedClaim(buyer, {
      sellerAddress: TARGET_SELLER,
      promisedSpec: `post-seed append #${i}`,
      evidenceHash: evidenceHash(`post-seed-evidence-${i}`),
      settlementRef: "0x" + `ff${i}`.padStart(64, "0"),
      timestamp: new Date().toISOString(),
    });
    const t0 = performance.now();
    await appendClaim(claim);
    const t1 = performance.now();
    appendTimings.push(t1 - t0);
  }
  console.log(
    `append 1 more claim (ledger now has ~${n.toLocaleString("en-US")}+ records): ` +
      `mean ${fmtMs(mean(appendTimings))}, median ${fmtMs(median(appendTimings))}, ` +
      `min ${fmtMs(Math.min(...appendTimings))}, max ${fmtMs(Math.max(...appendTimings))} ` +
      `(n=${APPEND_SAMPLES} samples)`,
  );

  // --- Metric 2: get_delivery_history for a seller with ~targetCount
  // records, out of n total in the ledger. ---
  const historyTimings = [];
  let lastCount = 0;
  for (let i = 0; i < HISTORY_SAMPLES; i++) {
    const t0 = performance.now();
    const sellerClaims = await claimsForSeller(TARGET_SELLER);
    const t1 = performance.now();
    lastCount = sellerClaims.length;
    historyTimings.push(t1 - t0);
  }
  console.log(
    `get_delivery_history(TARGET_SELLER) — ${lastCount.toLocaleString("en-US")} of ${(n + APPEND_SAMPLES).toLocaleString("en-US")} total claims match: ` +
      `mean ${fmtMs(mean(historyTimings))}, median ${fmtMs(median(historyTimings))}, ` +
      `min ${fmtMs(Math.min(...historyTimings))}, max ${fmtMs(Math.max(...historyTimings))} ` +
      `(n=${HISTORY_SAMPLES} samples)`,
  );

  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];

  return {
    n,
    seedMs: signMs + bulkWriteMs,
    sizeBytes,
    appendMeanMs: mean(appendTimings),
    appendMedianMs: median(appendTimings),
    historyMeanMs: mean(historyTimings),
    historyMedianMs: median(historyTimings),
  };
}

async function main() {
  console.log("capacity-attest ledger scale benchmark");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`scales: ${SCALES.join(", ")}`);

  // Dynamic-import AFTER any env setup so config.ts's lazy dataDir() reads
  // whatever CAPACITY_ATTEST_DATA_DIR is set to at call time (see config.ts
  // doc comment — it is read lazily on every call, not at import time).
  const [testHelpers, ledger] = await Promise.all([
    import("../dist/test-helpers.js"),
    import("../dist/ledger.js"),
  ]);
  const mods = { testHelpers, ledger };

  const results = [];
  for (const n of SCALES) {
    results.push(await runScale(n, mods));
  }

  console.log("\n=== Summary ===");
  console.log(
    "N".padStart(8),
    "seed(ms)".padStart(12),
    "file(bytes)".padStart(14),
    "append mean(ms)".padStart(18),
    "append median(ms)".padStart(20),
    "history mean(ms)".padStart(18),
    "history median(ms)".padStart(20),
  );
  for (const r of results) {
    console.log(
      String(r.n).padStart(8),
      r.seedMs.toFixed(1).padStart(12),
      String(r.sizeBytes).padStart(14),
      r.appendMeanMs.toFixed(3).padStart(18),
      r.appendMedianMs.toFixed(3).padStart(20),
      r.historyMeanMs.toFixed(3).padStart(18),
      r.historyMedianMs.toFixed(3).padStart(20),
    );
  }

  const first = results[0];
  const last = results[results.length - 1];
  const nRatio = last.n / first.n;
  const appendRatio = last.appendMedianMs / Math.max(first.appendMedianMs, 0.001);
  const historyRatio = last.historyMedianMs / Math.max(first.historyMedianMs, 0.001);
  console.log(
    `\nN grew ${nRatio}x (${first.n} -> ${last.n}); append-median grew ${appendRatio.toFixed(1)}x; history-median grew ${historyRatio.toFixed(1)}x.`,
  );
  console.log(
    "Both appendClaim() and claimsForSeller()/getDeliveryHistory() read+parse the ENTIRE claims.jsonl " +
      "file on every single call (no index, no pagination) — this is expected linear (or worse, once JSON " +
      "parse overhead is included) growth by design of the current storage layer, not benchmark noise.",
  );
}

main().catch((e) => {
  console.error("ledger-scale benchmark FAILED:", e);
  process.exitCode = 1;
});
