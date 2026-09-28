// http-source.bench.ts — quantifies two things for the new httpClaimSource
// (WP1's second, non-EAS production-grade source):
//   1. Real end-to-end throughput through discoverDeliveryHistory at volume,
//      the same question discovery.bench.ts already answers for the
//      aggregation layer itself. (eas.bench.ts answers a narrower, different
//      question: it benchmarks easSource.fetchForSeller() in isolation, at a
//      fixed small volume, to compare concurrency=1 vs 10 vs 25 -- the PR
//      #15 fan-out fix -- not throughput through discoverDeliveryHistory.)
//   2. Whether the byte-bounded streaming read (readBounded, the defense
//      against an oversized/hostile response) costs anything meaningful
//      compared to a naive "buffer everything, then check the size"
//      implementation. readBounded is module-private, so this compares two
//      full fetchForSeller() calls with IDENTICAL post-read work (JSON.parse
//      included in both arms) and only the read strategy itself differing --
//      an earlier version of this benchmark compared readBounded's full
//      fetchForSeller() against a bare response.text() with no JSON.parse,
//      which bundled parse cost into only one arm and overstated the
//      streaming mechanism's true overhead.
// Run with: npx vitest bench src/http-source.bench.ts

import { bench, describe } from "vitest";
import { httpClaimSource } from "./http-source.js";
import { discoverDeliveryHistory } from "./discovery.js";
import { generateClaims, BENCH_SELLER } from "./bench-helpers.js";

const CLAIM_COUNT = 1_000;
const claims = await generateClaims(CLAIM_COUNT);
const body = JSON.stringify(claims);

function fixedResponseFetch(): typeof fetch {
  return (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
}

describe(`discoverDeliveryHistory via httpClaimSource, ${CLAIM_COUNT} claims in one response`, () => {
  bench("end to end (fetch + bounded read + JSON.parse + verify all)", async () => {
    const source = httpClaimSource("https://example.invalid/claims", { fetchImpl: fixedResponseFetch() });
    await discoverDeliveryHistory(BENCH_SELLER, [source]);
  });
});

// A deliberately naive re-implementation of exactly what httpClaimSource does,
// EXCEPT the read step is `await response.text()` (buffer everything, then
// check the length) instead of readBounded's stream-and-cap-as-you-go. Same
// URL building, same JSON.parse, same Array.isArray check, same cast -- so
// the ONLY thing this isolates against the real httpClaimSource is the read
// strategy itself, not an unrelated extra JSON.parse.
async function naiveFetchForSeller(sellerAddress: string): Promise<unknown> {
  const response = await (fixedResponseFetch())("https://example.invalid/claims", {});
  const text = await (response as Response).text();
  if (Buffer.byteLength(text, "utf-8") > body.length * 2) throw new Error("too large");
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("not an array");
  void sellerAddress;
  return parsed;
}

describe(`read strategy only: readBounded (streams+caps) vs naive response.text()+length-check, same ${CLAIM_COUNT}-claim payload (${(body.length / 1024).toFixed(0)} KiB), identical JSON.parse in both arms`, () => {
  bench("naive: response.text() then check length, then JSON.parse", async () => {
    await naiveFetchForSeller(BENCH_SELLER);
  });

  bench("readBounded via httpClaimSource: stream + cap-as-you-go, then JSON.parse", async () => {
    const source = httpClaimSource("https://example.invalid/claims", {
      fetchImpl: fixedResponseFetch(),
      maxResponseBytes: body.length * 2, // generous, so this measures the mechanism's overhead, not a refusal
    });
    await source.fetchForSeller(BENCH_SELLER);
  });
});
