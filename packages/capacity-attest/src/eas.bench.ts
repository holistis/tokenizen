// eas.bench.ts — quantifies the concurrency fix from PR #15: how much faster
// is easSource.fetchForSeller at the new default (concurrency=10) versus the
// old, fully-sequential behavior (concurrency=1), under a fixed per-call
// network latency. Run with:
//   npx vitest bench src/eas.bench.ts
//
// A fake AttestationReader simulates realistic RPC latency (a fixed delay per
// dataForUid call) without touching a real network, so the number measured
// is the fan-out strategy's own overhead/parallelism, not real-world RPC
// jitter, which this benchmark cannot control anyway.

import { bench, describe } from "vitest";
import { easSource, encodeClaimData, type AttestationReader } from "./eas.js";
import { generateClaims, BENCH_SELLER } from "./bench-helpers.js";

const UID_COUNT = 100;
const SIMULATED_LATENCY_MS = 5; // a fast, optimistic RPC round-trip

const claims = await generateClaims(UID_COUNT);
const store = new Map(claims.map((c, i) => [`0xuid-${i}`, encodeClaimData(c)]));
const uids = [...store.keys()];

function readerWithConcurrency(concurrency: number): AttestationReader {
  return {
    uidsForSeller: async () => uids,
    concurrency,
    dataForUid: async (uid) => {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
      return store.get(uid)!;
    },
  };
}

describe(`easSource.fetchForSeller, ${UID_COUNT} attestations, ${SIMULATED_LATENCY_MS}ms simulated latency each`, () => {
  bench("concurrency=1 (old, fully sequential behavior before PR #15)", async () => {
    await easSource(readerWithConcurrency(1)).fetchForSeller(BENCH_SELLER);
  });

  bench("concurrency=10 (new default)", async () => {
    await easSource(readerWithConcurrency(10)).fetchForSeller(BENCH_SELLER);
  });

  bench("concurrency=25 (higher, for comparison)", async () => {
    await easSource(readerWithConcurrency(25)).fetchForSeller(BENCH_SELLER);
  });
});
