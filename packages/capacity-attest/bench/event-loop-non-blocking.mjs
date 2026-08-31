#!/usr/bin/env node
// bench/event-loop-non-blocking.mjs — proves the 2026-08-31 lock-contention
// fix actually stopped blocking the Node.js event loop, IN THE PROCESS
// that is waiting on a contended lock (the concrete failure scenario this
// fix addresses: a live server, e.g. an x402 API, calling appendClaim()
// while some other writer already holds the lockfile).
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/event-loop-non-blocking.mjs [N]
//
// WHY THIS NEEDS AN EXTERNALLY-HELD LOCK, NOT JUST Promise.all() OF
// appendClaim() CALLS IN ONE PROCESS:
// appendClaim()'s critical section (acquire -> read -> check -> write ->
// release) contains no `await` on the SUCCESS path — by design, so the
// section stays atomic (see ledger.ts's header comment). That means N
// appendClaim() calls fired via `claims.map(c => appendClaim(c))` in one
// process each run to full completion, synchronously, the instant they are
// invoked, before the next call in the array even starts — so in practice
// none of them ever actually contend with each other; this was confirmed
// empirically (see below) before this script was rewritten to the current
// approach. The ONLY way to put THIS process's appendClaim() calls onto
// the actual EEXIST-retry path (the one that used to busy-wait) is to have
// something else already holding the lock when they start — exactly what
// bench/lock-holder-worker.mjs does: a separate child process creates
// claims.jsonl.lock and holds it for a known duration (HOLD_MS), while
// this process's own appendClaim() calls, and its own setInterval, run
// concurrently against that externally-imposed contention.
//
// METHOD:
//   1. Spawn the lock-holder child; wait for it to confirm the lock file
//      exists.
//   2. Start a `setInterval` ticking every TICK_MS (10ms), counting ticks.
//      A healthy, unblocked event loop fires this roughly on schedule.
//   3. Fire N concurrent appendClaim() calls (Promise.all, all in THIS
//      process) at the SAME ledger file. Every one of them immediately
//      hits EEXIST (the child's lock file is present) and enters
//      acquireLock()'s retry loop:
//        - BEFORE the fix, that retry loop was a synchronous
//          `while (Date.now() < until) {}` spin. Node.js is
//          single-threaded, so that spin does not just delay its own
//          caller — it physically prevents the event loop from running
//          ANYTHING else, including this same process's own setInterval
//          callback, for as long as it spins.
//        - AFTER the fix, the retry loop does `await delay(5ms)` — a real
//          setTimeout-based wait — so the event loop is free to run other
//          callbacks (including the interval) while a call is waiting.
//   4. The child releases the lock after HOLD_MS; our N calls then
//      succeed. Stop the interval, compute how many ticks SHOULD have
//      fired given the actual wall-clock duration of the whole contention
//      window (duration / TICK_MS), and compare to how many ticks
//      ACTUALLY fired.
//
// Uses a fresh, disposable CAPACITY_ATTEST_DATA_DIR (never the real data/
// dir).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCK_HOLDER = join(__dirname, "lock-holder-worker.mjs");

const N = Number(process.argv[2]) || 25;
const TICK_MS = 10;
const HOLD_MS = 2000; // how long the child process holds the lock — well under STALE_LOCK_MS=30000 and LOCK_TIMEOUT_MS=5000, so our calls just wait, they don't time out or reclaim-as-stale

function waitFor(predicate, timeoutMs, pollMs = 5) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    (function poll() {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error("waitFor: timed out"));
      setTimeout(poll, pollMs);
    })();
  });
}

async function main() {
  console.log("capacity-attest event-loop non-blocking proof");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(
    `N = ${N} concurrent in-process appendClaim() calls, all forced onto the lock-contention retry path by ` +
      `an externally held lock for ${HOLD_MS}ms; interval tick = ${TICK_MS}ms`,
  );

  const tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-eventloop-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  console.log(`ledger dir: ${tmpDir}`);

  const claimsFilePath = join(tmpDir, "claims.jsonl");
  const lockFilePath = claimsFilePath + ".lock";

  // Dynamic-import AFTER setting the env var, same reason as
  // ledger-scale.mjs: config.ts's dataDir() is read lazily on every call,
  // not captured at import time.
  const { appendClaim } = await import("../dist/ledger.js");
  const { testWallet, buildSignedClaim, evidenceHash } = await import("../dist/test-helpers.js");

  const buyer = testWallet();
  const claims = [];
  for (let i = 0; i < N; i++) {
    claims.push(
      await buildSignedClaim(buyer, {
        sellerAddress: "0x" + "0".repeat(38) + "ee",
        promisedSpec: `event-loop-proof claim #${i}`,
        evidenceHash: evidenceHash(`event-loop-proof-evidence-${i}`),
        settlementRef: "0x" + `e${i}`.padStart(64, "0"),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  // --- Baseline: how reliably does an UNCONTENDED interval tick on this
  // machine, with nothing else running? Establishes the "no contention at
  // all" expectation to compare the contention-window rate against,
  // instead of assuming a naive, unrealistic 100%-of-10ms-exactly rate.
  let baselineTicks = 0;
  const baselineWindowMs = HOLD_MS;
  const baselineStart = performance.now();
  const baselineTimer = setInterval(() => baselineTicks++, TICK_MS);
  await new Promise((resolve) => setTimeout(resolve, baselineWindowMs));
  clearInterval(baselineTimer);
  const baselineActualMs = performance.now() - baselineStart;
  const baselineExpected = baselineActualMs / TICK_MS;
  const baselineRatio = baselineTicks / baselineExpected;
  console.log(
    `\nbaseline (nothing else running): ${baselineActualMs.toFixed(1)}ms window, expected ~${baselineExpected.toFixed(1)} ticks at ${TICK_MS}ms/tick, got ${baselineTicks} ticks (${(baselineRatio * 100).toFixed(1)}% of expected)`,
  );

  // --- Spawn the lock-holder and wait for it to confirm the lock exists.
  const holder = spawn(process.execPath, [LOCK_HOLDER, lockFilePath, String(HOLD_MS)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let holderStderr = "";
  holder.stderr.on("data", (d) => (holderStderr += d));
  await waitFor(() => existsSync(lockFilePath), 2000);
  console.log(`\nexternal lock confirmed present at ${lockFilePath} (held by a separate OS process for ${HOLD_MS}ms)`);

  // --- Contention window: the interval keeps running WHILE N concurrent
  // appendClaim() calls all sit in acquireLock()'s retry loop, waiting for
  // the externally-held lock above to be released.
  let contentionTicks = 0;
  const contentionStart = performance.now();
  const contentionTimer = setInterval(() => contentionTicks++, TICK_MS);

  const results = await Promise.allSettled(claims.map((claim) => appendClaim(claim)));

  clearInterval(contentionTimer);
  const contentionActualMs = performance.now() - contentionStart;
  const contentionExpected = contentionActualMs / TICK_MS;
  const contentionRatio = contentionTicks / contentionExpected;

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.log(`\n${failed} of ${N} appendClaim() calls rejected (unexpected for distinct claims):`);
    for (const r of results.filter((r) => r.status === "rejected").slice(0, 5)) {
      console.log(`  ${r.reason?.message || r.reason}`);
    }
  }

  await new Promise((resolve) => holder.on("close", resolve));
  if (holderStderr.trim()) console.log(`\n[lock-holder child] ${holderStderr.trim().split("\n").join("\n[lock-holder child] ")}`);

  console.log(
    `\ncontention window: ${N} concurrent appendClaim() calls (${succeeded} succeeded, ${failed} failed), all starting while the lock was externally held, took ${contentionActualMs.toFixed(1)}ms wall time total (includes waiting out the ${HOLD_MS}ms external hold)`,
  );
  console.log(
    `expected ~${contentionExpected.toFixed(1)} interval ticks at ${TICK_MS}ms/tick during that window (no-contention rate) — got ${contentionTicks} ticks (${(contentionRatio * 100).toFixed(1)}% of expected)`,
  );
  console.log(
    `for comparison: the OLD synchronous busy-wait (\`while (Date.now() < until) {}\`) would have spun the CPU for the whole ${HOLD_MS}ms the lock was held (since it never yields to let a timer fire), so the interval would have produced close to 0 ticks during that stretch instead of the ~${(HOLD_MS / TICK_MS).toFixed(0)} it should get at this cadence.`,
  );

  // A blocked event loop (the old synchronous spin-wait bug) would show up
  // as a ratio far below baseline — ticks stall for however long the spin
  // holds the thread. A healthy, non-blocking wait keeps the ratio close to
  // the baseline's own ratio (both are typically <100% because of real
  // Node/OS timer coalescing and GC pauses — "close to baseline" is the
  // right bar, not literal 100%).
  const ok = contentionRatio > baselineRatio * 0.7 && succeeded === N;

  console.log(
    `\nRESULT: ${
      ok
        ? `PASS — contention-window tick rate (${(contentionRatio * 100).toFixed(1)}%) stayed close to the no-contention baseline (${(baselineRatio * 100).toFixed(1)}%); the event loop was NOT blocked while ${N} calls waited out a ${HOLD_MS}ms externally-held lock`
        : `FAIL — contention-window tick rate (${(contentionRatio * 100).toFixed(1)}%) dropped well below the no-contention baseline (${(baselineRatio * 100).toFixed(1)}%), or not all ${N} calls succeeded (${succeeded}/${N}) — event loop may still be getting blocked`
    }`,
  );

  rmSync(tmpDir, { recursive: true, force: true });
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("event-loop-non-blocking proof FAILED to run:", e);
  process.exitCode = 1;
});
