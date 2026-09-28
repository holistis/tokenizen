// discovery.bench.ts — real wall-clock numbers for discoverDeliveryHistory at
// the volumes the NLnet proposal's WP1 explicitly names: "a source returning
// tens of thousands of claims" and multi-source aggregation. Run with:
//   npx vitest bench src/discovery.bench.ts
//
// This does not replace discovery.fuzz.test.ts (adversarial correctness); it
// answers a different question: given genuinely valid, well-formed claims at
// real scale, how fast is aggregation, and does it stay roughly linear as
// volume grows, or does it degrade unexpectedly.

import { bench, describe } from "vitest";
import { discoverDeliveryHistory, staticSource } from "./discovery.js";
import { generateClaims, BENCH_SELLER } from "./bench-helpers.js";

// Pre-generate once per size, outside the timed bench() body, so the
// benchmark measures discoverDeliveryHistory itself, not fixture setup.
const small = await generateClaims(1_000);
const large = await generateClaims(40_000); // close to MAX_TOTAL_CLAIMS (50,000) without exceeding it
const perSourceForFanOut = await generateClaims(4_000);

describe("discoverDeliveryHistory volume", () => {
  bench("single source, 1,000 claims", async () => {
    await discoverDeliveryHistory(BENCH_SELLER, [staticSource("s1", small)]);
  });

  bench("single source, 40,000 claims (near MAX_TOTAL_CLAIMS)", async () => {
    await discoverDeliveryHistory(BENCH_SELLER, [staticSource("s1", large)]);
  });

  bench("ten independent sources, 4,000 claims each (40,000 total, realistic multi-source fan-in)", async () => {
    const sources = Array.from({ length: 10 }, (_, i) => staticSource(`s${i}`, perSourceForFanOut));
    await discoverDeliveryHistory(BENCH_SELLER, sources);
  });
});
