#!/usr/bin/env node
// bench/ledger-cache-cross-process-invalidation.mjs — proves the
// 2026-08-31 caching fix does NOT trade the old "always re-read everything"
// correctness for a new "silently serve stale data" correctness bug.
//
// Run directly with node (NOT vitest): from packages/capacity-attest/
//   npm run build && node bench/ledger-cache-cross-process-invalidation.mjs
//
// SCENARIO (exactly the one this fix's spec calls out as the single most
// important thing not to break, alongside the duplicate-claim race):
//   1. Process A (this process) builds a warm in-memory cache for the
//      ledger file — it calls claimsForSeller() once, which resyncs from
//      disk and caches the result.
//   2. Process B — a REAL separate OS process, spawned fresh, sharing
//      nothing in memory with process A — appends one claim directly to
//      the SAME ledger file via the real, unmodified appendClaim().
//   3. Process A calls claimsForSeller()/allClaims()/appendClaim() again.
//
// The question this answers: does process A correctly see process B's
// write (the file's byte size changed, so getFreshCache()'s staleness check
// should catch it and resync), or does it miss it (a real, dangerous
// correctness bug — silently stale reads that would let a live server serve
// an out-of-date delivery history, or worse, let appendClaim()'s duplicate
// check pass against a claimId set that doesn't know about a claim that
// really is already on disk)?
//
// This is deliberately a SEPARATE script from bench/ledger-concurrency.mjs:
// that script's two scenarios are both about SIMULTANEOUS writes racing
// through appendClaim()'s own lock. This script is about a plain SEQUENTIAL
// cross-process write (no race, no lock contention at all — process B runs
// to completion before process A's next call even starts) and whether
// process A's cache correctly notices it happened.
//
// Uses a fresh, disposable CAPACITY_ATTEST_DATA_DIR (never the real data/
// dir).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER = join(__dirname, "ledger-concurrency-worker.mjs");

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
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

async function main() {
  console.log("capacity-attest cross-process cache-invalidation proof");
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);

  const { appendClaim, claimsForSeller, allClaims } = await import("../dist/ledger.js");
  const { testWallet, buildSignedClaim, evidenceHash } = await import("../dist/test-helpers.js");

  const tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-cross-invalidation-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
  console.log(`ledger dir: ${tmpDir}`);

  const buyer = testWallet();
  const sellerAddress = "0x" + "0".repeat(38) + "cd";

  // --- Step 0: process A writes one claim of its own, then reads, so it
  // starts from a warm, correctly-populated cache (not just an empty one —
  // an empty-cache "fix" that only worked by accident because size 0 == 0
  // would be a much weaker proof).
  const claimA1 = await buildSignedClaim(buyer, {
    sellerAddress,
    promisedSpec: "process A's own first claim",
    evidenceHash: evidenceHash("cross-invalidation-a1"),
    settlementRef: "0x" + "a1".repeat(32),
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(),
  });
  await appendClaim(claimA1);

  const beforeSeller = await claimsForSeller(sellerAddress);
  const beforeAll = await allClaims();
  console.log(`\n[process A] warmed cache: claimsForSeller() = ${beforeSeller.length}, allClaims() = ${beforeAll.length} (expected 1, 1)`);

  const sizeBeforeB = statSync(join(tmpDir, "claims.jsonl")).size;
  console.log(`[process A] ledger file size before process B writes: ${sizeBeforeB} bytes`);

  // --- Step 1: process B — a REAL separate OS process — appends directly,
  // bypassing process A's cache entirely (B has never even imported this
  // module in the same process; it has its own, brand-new, empty cache).
  const claimB = await buildSignedClaim(buyer, {
    sellerAddress,
    promisedSpec: "process B's claim, written by a separate OS process",
    evidenceHash: evidenceHash("cross-invalidation-b"),
    settlementRef: "0x" + "b2".repeat(32),
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 1, 0)).toISOString(),
  });
  const result = await spawnWorker(claimB, Date.now(), tmpDir);
  console.log(`\n[process B] separate OS process appendClaim() result: exit=${result.code} stdout="${result.stdout}"`);
  if (result.code !== 0) {
    console.error("process B failed to append — cannot test invalidation. Aborting.");
    process.exitCode = 1;
    rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  const sizeAfterB = statSync(join(tmpDir, "claims.jsonl")).size;
  console.log(`[process A observes] ledger file size after process B wrote: ${sizeAfterB} bytes (grew by ${sizeAfterB - sizeBeforeB} bytes)`);

  // --- Step 2: process A calls the read functions again. THE key check.
  const afterSeller = await claimsForSeller(sellerAddress);
  const afterAll = await allClaims();

  const sawB_viaSeller = afterSeller.some((c) => c.claimId === claimB.claimId);
  const sawB_viaAll = afterAll.some((c) => c.claimId === claimB.claimId);

  console.log(`\n[process A] claimsForSeller() after B's write: ${afterSeller.length} claims (expected 2)`);
  console.log(`[process A] allClaims() after B's write: ${afterAll.length} claims (expected 2)`);
  console.log(`[process A] does claimsForSeller() include process B's claimId? ${sawB_viaSeller ? "YES" : "NO — STALE READ"}`);
  console.log(`[process A] does allClaims() include process B's claimId? ${sawB_viaAll ? "YES" : "NO — STALE READ"}`);

  // --- Step 3: process A calls appendClaim() again for a THIRD, distinct
  // claim. This exercises the SAME invalidation logic on the write path
  // (post-lock resync) — it must also see claimB, both so its own duplicate
  // check is correct and so the resulting ledger ends up with all 3 claims,
  // not 2.
  const claimA2 = await buildSignedClaim(buyer, {
    sellerAddress,
    promisedSpec: "process A's second claim, written after observing B's write",
    evidenceHash: evidenceHash("cross-invalidation-a2"),
    settlementRef: "0x" + "a3".repeat(32),
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 2, 0)).toISOString(),
  });
  await appendClaim(claimA2);
  const finalAll = await allClaims();
  const finalIds = finalAll.map((c) => c.claimId).sort();
  const expectedIds = [claimA1.claimId, claimB.claimId, claimA2.claimId].sort();
  const finalOk = JSON.stringify(finalIds) === JSON.stringify(expectedIds);

  console.log(`\n[process A] after its own follow-up appendClaim(): ${finalAll.length} total claims (expected 3)`);
  console.log(`[process A] claim set matches {A1, B, A2} exactly: ${finalOk ? "YES" : "NO"}`);

  const ok = afterSeller.length === 2 && afterAll.length === 2 && sawB_viaSeller && sawB_viaAll && finalAll.length === 3 && finalOk;

  console.log(
    `\nRESULT: ${
      ok
        ? "PASS — process A's cache correctly detected process B's real, separate-OS-process write and resynced; no stale read, no missed claim, no collision on A's own follow-up write"
        : "FAIL — process A's cache did NOT correctly reflect process B's write — see counts/flags above"
    }`,
  );

  rmSync(tmpDir, { recursive: true, force: true });
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("cross-process cache-invalidation proof FAILED to run:", e);
  process.exitCode = 1;
});
