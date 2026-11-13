#!/usr/bin/env node
// bench/spend-cap-store-concurrency.mjs — real concurrent-write safety test
// for DurableSpendCapStore, modeled EXACTLY on bench/ledger-concurrency.mjs
// (read that file first; this one follows its structure deliberately, right
// down to LEAD_MS and the spawn/collect/verify shape).
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/spend-cap-store-concurrency.mjs [N]
//
// WHY THIS SPAWNS SEPARATE OS PROCESSES, NOT Promise.all() IN ONE PROCESS:
// same reasoning as ledger-concurrency.mjs's own header comment. Within one
// Node process, reserve()/consume()'s critical section (between
// acquireLock() and releaseLock()) is plain synchronous code with no
// `await` in it, so it cannot be preempted mid-section by the event loop —
// Promise.all() in one process cannot make two calls' file I/O genuinely
// interleave inside it. The real question this package's design depends on
// — multiple separate OS processes sharing one CAPACITY_ATTEST_DATA_DIR,
// exactly this package's documented multi-agent deployment shape — requires
// actual OS-level parallelism, so this script spawns N real child `node`
// processes (see spend-cap-store-concurrency-worker.mjs), synchronizes them
// to busy-wait to the same target timestamp, and only then has all of them
// call the real, unmodified reserve()/consume().
//
// Two scenarios, directly answering the task this bench exists for ("assert
// 0% double-counting / 0% lost counts"):
//
//   1. N concurrent reserve()+consume() cycles against a cap set to EXACTLY
//      N. Every single one of them has genuine room — this is the "0% LOST
//      COUNTS" check: if the lock/cache were not actually safe, a
//      legitimate caller could be wrongly refused (a stale cache
//      undercounting room), or a confirm could silently vanish.
//
//   2. N concurrent reserve() attempts against a cap set to roughly HALF of
//      N — this is the "0% DOUBLE-COUNTING" check: if the lock/cache were
//      not actually safe, more than `cap` admissions could slip through a
//      TOCTOU window the way claims.jsonl's duplicate-claimId race did
//      before ledger.ts's own fix (see ledger.ts's header comment).
//
// Uses a fresh, disposable CAPACITY_ATTEST_DATA_DIR per scenario (never the
// real data/ dir).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER = join(__dirname, "spend-cap-store-concurrency-worker.mjs");

const N = Number(process.argv[2]) || 50;
const LEAD_MS = 300; // how far in the future the shared target instant is, so all N processes have time to spawn + reach their busy-wait before it arrives

function spawnWorker(options, targetMs, tmpDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, JSON.stringify(options), String(targetMs)], {
      env: { ...process.env, CAPACITY_ATTEST_DATA_DIR: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function raceWorkers(options, count, tmpDir, label) {
  console.log(`spend-cap dir: ${tmpDir}`);
  const targetMs = Date.now() + LEAD_MS;
  const spawnStart = performance.now();

  const results = await Promise.all(Array.from({ length: count }, () => spawnWorker(options, targetMs, tmpDir)));

  const totalWallMs = performance.now() - spawnStart;
  console.log(`${label}: target instant was ${LEAD_MS}ms after spawn-start; all ${count} child processes spawned+raced+exited in ${totalWallMs.toFixed(1)}ms total wall time`);

  return results;
}

function readEventLines(tmpDir, key) {
  const file = join(tmpDir, `spend-cap-${key}.jsonl`);
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return { file, events: [], parseFailures: 0 };
  }
  const rawLines = raw.split("\n").filter((l) => l.length > 0);
  const events = [];
  let parseFailures = 0;
  for (const line of rawLines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      parseFailures++;
    }
  }
  return { file, events, parseFailures };
}

async function scenarioNoLostCounts() {
  console.log("\n############################################################");
  console.log(`# Scenario 1: N=${N} concurrent reserve()+consume() cycles, cap == N (expect ALL to succeed -- 0% lost counts)`);
  console.log("############################################################");

  const tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-spend-cap-concurrency-"));
  const options = { key: "bench-no-lost-counts", maxPerWindow: N, windowMs: 10 * 60 * 1000, reservationTtlMs: 5 * 60 * 1000 };

  const results = await raceWorkers(options, N, tmpDir, "no-lost-counts");

  const reservedAndConsumed = results.filter((r) => r.code === 0 && r.stdout.startsWith("RESERVED_AND_CONSUMED"));
  const refused = results.filter((r) => r.code === 0 && r.stdout === "REFUSED");
  const errored = results.filter((r) => r.code !== 0 || (!r.stdout.startsWith("RESERVED_AND_CONSUMED") && r.stdout !== "REFUSED"));

  console.log(`workers finished: ${reservedAndConsumed.length} RESERVED_AND_CONSUMED, ${refused.length} REFUSED, ${errored.length} errored/unexpected`);
  if (errored.length > 0) {
    console.log("errored workers:");
    for (const r of errored.slice(0, 10)) console.log(`  exit=${r.code} stdout="${r.stdout}" stderr="${r.stderr.slice(0, 200)}"`);
  }

  const { file, events, parseFailures } = readEventLines(tmpDir, options.key);
  const reserveEvents = events.filter((e) => e.type === "reserve");
  const consumeEvents = events.filter((e) => e.type === "consume");
  const reserveIds = new Set(reserveEvents.map((e) => e.id));
  const consumedIds = consumeEvents.map((e) => e.id).filter((id) => id !== null);
  const consumedIdSet = new Set(consumedIds);
  const consumeIdsNotInReserveIds = consumedIds.filter((id) => !reserveIds.has(id));
  const doubleConsumedIds = consumedIds.length - consumedIdSet.size;

  console.log(`\n=== Verification against ${file} ===`);
  console.log(`lines that failed JSON.parse (torn/corrupted lines): ${parseFailures} (expected 0)`);
  console.log(`"reserve" lines in file: ${reserveEvents.length} (expected ${N})`);
  console.log(`distinct reservation ids among "reserve" lines: ${reserveIds.size} (expected ${N} -- duplicates would mean randomUUID() collided or a reserve line was written twice)`);
  console.log(`"consume" lines in file: ${consumeEvents.length} (expected ${N})`);
  console.log(`consume lines whose id does not match any reserve id (LOST/FABRICATED reservation): ${consumeIdsNotInReserveIds.length} (expected 0)`);
  console.log(`reservation ids consumed more than once (DOUBLE-RELEASE of the same reservation): ${doubleConsumedIds} (expected 0)`);
  console.log(`reserve ids never consumed (LOST confirm -- reserved but never recorded as confirmed): ${reserveIds.size - consumedIdSet.size} (expected 0)`);

  const ok =
    parseFailures === 0 &&
    reservedAndConsumed.length === N &&
    refused.length === 0 &&
    errored.length === 0 &&
    reserveEvents.length === N &&
    reserveIds.size === N &&
    consumeEvents.length === N &&
    consumeIdsNotInReserveIds.length === 0 &&
    doubleConsumedIds === 0 &&
    consumedIdSet.size === N;

  console.log(`RESULT (scenario 1): ${ok ? "PASS — all " + N + " concurrent reserve()+consume() cycles landed, none lost, none double-released" : "FAIL — see counts above"}`);

  rmSync(tmpDir, { recursive: true, force: true });
  return ok;
}

async function scenarioNoDoubleCounting() {
  const cap = Math.max(1, Math.floor(N / 2));
  console.log("\n############################################################");
  console.log(`# Scenario 2: N=${N} concurrent reserve() attempts, cap == ${cap} (expect EXACTLY ${cap} to succeed -- 0% double-counting past the cap)`);
  console.log("############################################################");

  const tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-spend-cap-concurrency-"));
  const options = { key: "bench-no-double-counting", maxPerWindow: cap, windowMs: 10 * 60 * 1000, reservationTtlMs: 5 * 60 * 1000 };

  const results = await raceWorkers(options, N, tmpDir, "no-double-counting");

  const reservedAndConsumed = results.filter((r) => r.code === 0 && r.stdout.startsWith("RESERVED_AND_CONSUMED"));
  const refused = results.filter((r) => r.code === 0 && r.stdout === "REFUSED");
  const errored = results.filter((r) => r.code !== 0 || (!r.stdout.startsWith("RESERVED_AND_CONSUMED") && r.stdout !== "REFUSED"));

  console.log(`workers finished: ${reservedAndConsumed.length} RESERVED_AND_CONSUMED, ${refused.length} REFUSED, ${errored.length} errored/unexpected`);
  if (errored.length > 0) {
    console.log("errored workers:");
    for (const r of errored.slice(0, 10)) console.log(`  exit=${r.code} stdout="${r.stdout}" stderr="${r.stderr.slice(0, 200)}"`);
  }

  const { file, events, parseFailures } = readEventLines(tmpDir, options.key);
  const reserveEvents = events.filter((e) => e.type === "reserve");
  const reserveIds = new Set(reserveEvents.map((e) => e.id));

  console.log(`\n=== Verification against ${file} ===`);
  console.log(`lines that failed JSON.parse: ${parseFailures} (expected 0)`);
  console.log(`workers reporting RESERVED_AND_CONSUMED: ${reservedAndConsumed.length} (expected exactly ${cap})`);
  console.log(`workers reporting REFUSED: ${refused.length} (expected exactly ${N - cap})`);
  console.log(`"reserve" lines actually written to the file: ${reserveEvents.length} (expected exactly ${cap} -- MORE than ${cap} here is the over-admission bug this scenario exists to catch)`);
  console.log(`distinct reservation ids: ${reserveIds.size} (expected ${cap})`);

  const ok =
    parseFailures === 0 &&
    errored.length === 0 &&
    reservedAndConsumed.length === cap &&
    refused.length === N - cap &&
    reserveEvents.length === cap &&
    reserveIds.size === cap;

  console.log(
    `RESULT (scenario 2): ${
      ok
        ? "PASS — exactly " + cap + " of " + N + " racing reserve() calls won; the cap held under real concurrent pressure, 0% over-admission"
        : "FAIL — " + reserveEvents.length + " reservations were actually admitted against a cap of " + cap + " (double-counting), or the worker-reported counts disagree with the file"
    }`,
  );

  rmSync(tmpDir, { recursive: true, force: true });
  return ok;
}

async function main() {
  console.log("capacity-attest DurableSpendCapStore concurrency test");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`N = ${N} concurrent OS-process reserve()/consume() calls per scenario`);

  const ok1 = await scenarioNoLostCounts();
  const ok2 = await scenarioNoDoubleCounting();

  console.log("\n============================================================");
  console.log(`OVERALL: scenario 1 (no lost counts) ${ok1 ? "PASS" : "FAIL"}, scenario 2 (no double-counting) ${ok2 ? "PASS" : "FAIL"}`);
  console.log("============================================================");

  if (!ok1 || !ok2) process.exitCode = 1;
}

main().catch((e) => {
  console.error("spend-cap-store-concurrency test FAILED to run:", e);
  process.exitCode = 1;
});
