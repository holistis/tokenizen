// examples/discovery-fixture.ts — run the public cross-installation discovery
// fixture (D-005) and print a human-readable report. No ledger, no network,
// deterministic. Run with: npm run discovery-fixture (from packages/capacity-attest)
//
// It shows the gap (buyer B does not see buyer A's claims), then closes it by
// aggregating B's local ledger with a shared untrusted substrate, re-verifying
// every discovered claim, filtering wrong-seller and de-duplicating, rejecting
// forged/tampered claims, and still catching a hidden middle claim across
// installations. Exits non-zero if any control fails, so it doubles as a CI gate.

import { buildDiscoveryFixture, runControls, SELLER_X } from "../src/discovery-fixture.js";

async function main(): Promise<void> {
  console.log("=== capacity-attest — cross-installation discovery fixture (D-005, TEST keys, no live infra) ===\n");

  const { a2, b1 } = await buildDiscoveryFixture();
  console.log("Two installations, two buyers, one seller:");
  console.log(`  Installation B has only its own claim b1 (${b1.claimId.slice(0, 18)}...).`);
  console.log(`  Installation A recorded, among others, a NEGATIVE claim a2 (${a2.claimId.slice(0, 18)}...) about the same seller.`);
  console.log("  Buyer B wants seller X's history before paying. Without discovery, B never sees a2.\n");

  const controls = await runControls();
  let failed = 0;
  console.log("Controls:");
  for (const c of controls) {
    const mark = c.pass ? "PASS" : "FAIL";
    if (!c.pass) failed++;
    console.log(`  [${mark}] ${c.id} (${c.kind})  ${c.what}`);
    console.log(`         expected: ${c.expected}   actual: ${c.actual}`);
  }

  const green = controls.filter((c) => c.kind === "GREEN").length;
  const red = controls.filter((c) => c.kind === "RED").length;
  console.log(`\n${controls.length - failed}/${controls.length} controls pass (${green} GREEN, ${red} RED).`);
  console.log("Honest limits: discovery solves findability, not completeness. A source that omits a claim cannot be");
  console.log("forced to reveal it; no aggregation invents what no source shows. The production substrate (EAS on Base,");
  console.log("ERC-8004) is documented, not wired live. See docs/DISCOVERY-FIXTURE.md and DECISIONS.md D-005.");

  if (failed > 0) {
    console.error(`\n${failed} control(s) FAILED — the fixture's guarantees do not hold, do not ship.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll controls pass.");
    void SELLER_X;
  }
}

main().catch((e) => {
  console.error("Discovery fixture run failed:", e);
  process.exitCode = 1;
});
