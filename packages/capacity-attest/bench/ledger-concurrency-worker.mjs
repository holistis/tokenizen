#!/usr/bin/env node
// bench/ledger-concurrency-worker.mjs — helper child process spawned by
// ledger-concurrency.mjs. Not meant to be run standalone.
//
// Receives one pre-built, validly signed DeliveryClaim (as a JSON string)
// and a shared target timestamp (ms since epoch) via argv, busy-waits until
// that exact instant, then calls the REAL appendClaim() from the compiled
// ledger.ts. Busy-waiting (instead of setTimeout) all workers to the same
// wall-clock instant maximizes how many of the spawned OS processes are
// actually inside their fs write syscall at the same moment — this is what
// makes the test a genuine concurrent-write test rather than N sequential
// writes that merely look concurrent because they were kicked off close
// together.
//
// appendClaim() is async since the 2026-08-31 non-blocking-lock fix (its
// retry-on-contention now awaits a real timer instead of spinning), so this
// worker awaits it and reports APPENDED/REJECTED from inside the .then()/
// catch() path rather than assuming the call completed synchronously.

import { appendClaim } from "../dist/ledger.js";

const claim = JSON.parse(process.argv[2]);
const targetMs = Number(process.argv[3]);

while (Date.now() < targetMs) {
  // busy-wait — deliberately not async/setTimeout, so this process is
  // burning CPU right up to the shared deadline like its siblings are.
}

try {
  await appendClaim(claim);
  console.log(`APPENDED ${claim.claimId}`);
  process.exit(0);
} catch (e) {
  console.log(`REJECTED ${claim.claimId} ${(e && e.message) || e}`);
  process.exit(1);
}
