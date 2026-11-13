#!/usr/bin/env node
// bench/spend-cap-store-concurrency-worker.mjs — helper child process spawned
// by spend-cap-store-concurrency.mjs. Not meant to be run standalone.
//
// Same busy-wait-to-a-shared-instant technique as ledger-concurrency-worker.mjs
// (read that file first; this one is modeled on it line-for-line): receives
// the spend-cap options (as a JSON string) and a shared target timestamp via
// argv, busy-waits until that exact instant, then calls the REAL
// DurableSpendCapStore from the compiled dist/spend-cap-store.js against
// CAPACITY_ATTEST_DATA_DIR (set by the parent via env — config.ts's dataDir()
// reads it lazily, so no import-order tricks are needed here either).
//
// Each worker does exactly what a real caller would: reserve(), and only if
// that actually returned a slot (not null), immediately consume() it — the
// same reserve-then-confirm sequence http-server.ts's own
// publish_reputation_feedback handler performs around a real payment
// settlement.

import { DurableSpendCapStore } from "../dist/spend-cap-store.js";

const options = JSON.parse(process.argv[2]);
const targetMs = Number(process.argv[3]);

while (Date.now() < targetMs) {
  // busy-wait — deliberately not async/setTimeout, so this process is
  // burning CPU right up to the shared deadline like its siblings are,
  // maximizing how many are actually inside their lock/file syscalls at the
  // same wall-clock moment.
}

const store = new DurableSpendCapStore({
  maxPerWindow: options.maxPerWindow,
  windowMs: options.windowMs,
  reservationTtlMs: options.reservationTtlMs,
});

try {
  const id = await store.reserve(options.key);
  if (id === null) {
    console.log("REFUSED");
    process.exit(0);
  }
  await store.consume(options.key, id);
  console.log(`RESERVED_AND_CONSUMED ${id}`);
  process.exit(0);
} catch (e) {
  console.log(`ERROR ${(e && e.message) || e}`);
  process.exit(1);
}
