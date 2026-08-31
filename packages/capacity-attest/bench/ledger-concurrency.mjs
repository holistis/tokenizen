#!/usr/bin/env node
// bench/ledger-concurrency.mjs — real concurrent-write safety test for the
// append-only JSONL ledger.
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/ledger-concurrency.mjs [N]
//
// WHY THIS SPAWNS SEPARATE OS PROCESSES, NOT Promise.all() IN ONE PROCESS:
// ledger.ts's appendClaim() is fully SYNCHRONOUS (readFileSync,
// Array#some, appendFileSync — no `await` anywhere in the call chain from
// readClaims() through the final write). In a single Node.js process,
// synchronous code cannot be preempted mid-function by the event loop, so
// firing many appendClaim() calls from Promise.all() in one process cannot
// ever interleave two calls' file I/O — each call fully completes (its
// read, its dedup check, its write) before the next one starts, no matter
// how "concurrently" they were kicked off. Such a test would trivially
// pass 100% of the time and would not actually be testing anything about
// concurrent-write safety.
//
// The real question — the one this package's design actually depends on,
// since get_delivery_history's whole value proposition is a SHARED history
// multiple agents/processes write into — is: what happens when multiple
// separate OS processes (e.g. multiple hosted server instances, or
// multiple concurrent MCP client sessions against a shared
// CAPACITY_ATTEST_DATA_DIR) call appendClaim() against the SAME file at
// the same wall-clock instant? That requires actual OS-level parallelism,
// so this script spawns N real child `node` processes (see
// ledger-concurrency-worker.mjs), synchronizes them to busy-wait to the
// same target timestamp, and only then has all of them call the real,
// unmodified appendClaim().
//
// Two scenarios are run:
//
//   1. N DISTINCT claims racing to append to the same file. Verifies no
//      lost writes, no torn/corrupted lines, no truncated claims.
//   2. N processes racing to append the EXACT SAME claim (identical
//      claimId). appendClaim()'s duplicate rejection is a classic
//      check-then-write pattern (readClaims() to check for an existing
//      claimId, THEN appendFileSync) with no lock between the two — this
//      scenario tests whether that gap is a real, exploitable TOCTOU race
//      that lets the "claim, once written, is permanent, singular history"
//      guarantee (ledger.ts's own header comment) be defeated by two
//      processes both passing the "not a duplicate" check before either
//      has written.
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
const WORKER = join(__dirname, "ledger-concurrency-worker.mjs");

const N = Number(process.argv[2]) || 50;
const LEAD_MS = 300; // how far in the future the shared target instant is, so all N processes have time to spawn + reach their busy-wait before it arrives

function spawnWorker(claim, targetMs, tmpDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, JSON.stringify(claim), String(targetMs)], {
      env: { ...process.env, CAPACITY_ATTEST_DATA_DIR: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      resolve({ claimId: claim.claimId, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function raceClaims(claims, label) {
  const tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-concurrency-"));
  console.log(`ledger dir: ${tmpDir}`);

  const targetMs = Date.now() + LEAD_MS;
  const spawnStart = performance.now();

  const results = await Promise.all(claims.map((claim) => spawnWorker(claim, targetMs, tmpDir)));

  const totalWallMs = performance.now() - spawnStart;
  console.log(
    `${label}: target instant was ${LEAD_MS}ms after spawn-start; all ${claims.length} child processes spawned+raced+exited in ${totalWallMs.toFixed(1)}ms total wall time`,
  );

  return { tmpDir, results };
}

function readLedgerLines(tmpDir) {
  const ledgerFile = join(tmpDir, "claims.jsonl");
  const raw = readFileSync(ledgerFile, "utf8");
  return { ledgerFile, rawLines: raw.split("\n").filter((l) => l.length > 0) };
}

async function scenarioDistinctClaims({ testWallet, buildSignedClaim, evidenceHash, DeliveryClaimSchema }) {
  console.log("\n############################################################");
  console.log(`# Scenario 1: N=${N} DISTINCT claims, all racing to append to the same file`);
  console.log("############################################################");

  const buyer = testWallet();
  const claims = [];
  for (let i = 0; i < N; i++) {
    const claim = await buildSignedClaim(buyer, {
      sellerAddress: "0x" + "0".repeat(38) + "cc",
      promisedSpec: `concurrency claim #${i}`,
      evidenceHash: evidenceHash(`concurrency-evidence-${i}`),
      settlementRef: "0x" + `c${i}`.padStart(64, "0"),
      timestamp: new Date().toISOString(),
    });
    claims.push(claim);
  }
  const expectedClaimIds = new Set(claims.map((c) => c.claimId));
  if (expectedClaimIds.size !== N) {
    throw new Error(`test setup bug: only ${expectedClaimIds.size} distinct claimIds among ${N} built claims`);
  }

  const { tmpDir, results } = await raceClaims(claims, "distinct-claims");

  const appended = results.filter((r) => r.code === 0);
  const rejected = results.filter((r) => r.code !== 0);
  console.log(`workers finished: ${appended.length} reported APPENDED, ${rejected.length} reported REJECTED/error`);
  if (rejected.length > 0) {
    console.log("rejected workers:");
    for (const r of rejected.slice(0, 10)) {
      console.log(`  claimId=${r.claimId} exit=${r.code} stdout="${r.stdout}" stderr="${r.stderr.slice(0, 200)}"`);
    }
  }

  const { ledgerFile, rawLines } = readLedgerLines(tmpDir);

  let jsonParseFailures = 0;
  let schemaValidationFailures = 0;
  const parsedClaimIds = [];
  for (const line of rawLines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      jsonParseFailures++;
      continue;
    }
    const result = DeliveryClaimSchema.safeParse(obj);
    if (!result.success) {
      schemaValidationFailures++;
      continue;
    }
    parsedClaimIds.push(result.data.claimId);
  }

  const parsedIdSet = new Set(parsedClaimIds);
  const duplicateCount = parsedClaimIds.length - parsedIdSet.size;
  const missing = [...expectedClaimIds].filter((id) => !parsedIdSet.has(id));
  const unexpected = [...parsedIdSet].filter((id) => !expectedClaimIds.has(id));

  console.log(`\n=== Verification against ${ledgerFile} ===`);
  console.log(`raw non-empty lines in file: ${rawLines.length} (expected ${N})`);
  console.log(`lines that failed JSON.parse (torn/corrupted lines): ${jsonParseFailures} (expected 0)`);
  console.log(`lines that parsed as JSON but failed DeliveryClaimSchema (truncated/malformed claims): ${schemaValidationFailures} (expected 0)`);
  console.log(`valid, schema-passing claims recovered: ${parsedClaimIds.length} (expected ${N})`);
  console.log(`duplicate claimIds among recovered claims: ${duplicateCount} (expected 0)`);
  console.log(`expected claimIds missing from the file (LOST WRITES): ${missing.length} (expected 0)`);
  console.log(`unexpected claimIds present that weren't in our N (data corruption): ${unexpected.length} (expected 0)`);

  const ok =
    rawLines.length === N &&
    jsonParseFailures === 0 &&
    schemaValidationFailures === 0 &&
    duplicateCount === 0 &&
    missing.length === 0 &&
    unexpected.length === 0 &&
    appended.length === N &&
    rejected.length === 0;

  console.log(`RESULT (scenario 1): ${ok ? "PASS — all " + N + " concurrent appends of distinct claims landed, uncorrupted, no lost writes, no torn lines" : "FAIL — see counts above"}`);

  rmSync(tmpDir, { recursive: true, force: true });
  return ok;
}

async function scenarioDuplicateClaim({ testWallet, buildSignedClaim, evidenceHash, DeliveryClaimSchema }) {
  console.log("\n############################################################");
  console.log(`# Scenario 2: N=${N} processes racing to append the SAME claim (TOCTOU dedup-race check)`);
  console.log("############################################################");

  const buyer = testWallet();
  const theClaim = await buildSignedClaim(buyer, {
    sellerAddress: "0x" + "0".repeat(38) + "dd",
    promisedSpec: "the one claim everyone races to record",
    evidenceHash: evidenceHash("duplicate-race-evidence"),
    settlementRef: "0x" + "d".repeat(64),
    timestamp: new Date().toISOString(),
  });
  const claims = Array.from({ length: N }, () => theClaim); // literally the same object/claimId every time

  const { tmpDir, results } = await raceClaims(claims, "duplicate-claim");

  const appended = results.filter((r) => r.code === 0);
  const rejected = results.filter((r) => r.code !== 0);
  console.log(`workers finished: ${appended.length} reported APPENDED, ${rejected.length} reported REJECTED (claim_already_recorded)`);

  const { ledgerFile, rawLines } = readLedgerLines(tmpDir);
  let matchingLines = 0;
  let jsonParseFailures = 0;
  for (const line of rawLines) {
    try {
      const obj = JSON.parse(line);
      const result = DeliveryClaimSchema.safeParse(obj);
      if (result.success && result.data.claimId === theClaim.claimId) matchingLines++;
    } catch {
      jsonParseFailures++;
    }
  }

  console.log(`\n=== Verification against ${ledgerFile} ===`);
  console.log(`raw non-empty lines in file: ${rawLines.length}`);
  console.log(`lines that failed JSON.parse: ${jsonParseFailures} (expected 0)`);
  console.log(`lines matching the raced claimId: ${matchingLines} (expected exactly 1 — appendClaim()'s own docs promise a duplicate is REJECTED, not silently double-recorded)`);
  console.log(`workers that reported APPENDED (exit 0): ${appended.length} (expected exactly 1)`);

  const ok = matchingLines === 1 && appended.length === 1 && jsonParseFailures === 0;

  console.log(
    `RESULT (scenario 2): ${
      ok
        ? "PASS — exactly 1 of " + N + " racing processes won; appendClaim()'s duplicate-rejection held under real concurrent pressure"
        : "FAIL — " + matchingLines + " copies of the same claimId ended up recorded (dedup TOCTOU race), or worker-reported-success count disagrees with the file"
    }`,
  );

  rmSync(tmpDir, { recursive: true, force: true });
  return ok;
}

async function main() {
  console.log("capacity-attest ledger concurrency test");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`N = ${N} concurrent OS-process appendClaim() calls per scenario`);

  const mods = {
    ...(await import("../dist/test-helpers.js")),
    ...(await import("../dist/schema.js")),
  };

  const ok1 = await scenarioDistinctClaims(mods);
  const ok2 = await scenarioDuplicateClaim(mods);

  console.log("\n============================================================");
  console.log(`OVERALL: scenario 1 (distinct claims) ${ok1 ? "PASS" : "FAIL"}, scenario 2 (duplicate-claim race) ${ok2 ? "PASS" : "FAIL"}`);
  console.log("============================================================");

  if (!ok1 || !ok2) process.exitCode = 1;
}

main().catch((e) => {
  console.error("ledger-concurrency test FAILED to run:", e);
  process.exitCode = 1;
});
