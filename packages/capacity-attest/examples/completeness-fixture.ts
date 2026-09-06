// examples/completeness-fixture.ts — run the public completeness fixture and
// print a human-readable report. No ledger, no network, deterministic.
//
// Run with: npm run fixture (from packages/capacity-attest)
//
// It builds one buyer's chained claims about one seller, then checks a set of
// controls: GREEN properties that must hold (authenticity survives hiding,
// local recompute detects the hidden middle claim, a rosy host field is
// contradicted by that recompute) and RED tamper negatives that must be
// rejected (flipped byte, stripped/repointed chain link, wrong signer). Exits
// non-zero if any control fails, so it is usable as a CI gate too.

import { buildFixture, runControls } from "../src/completeness-fixture.js";

async function main(): Promise<void> {
  console.log("=== capacity-attest — completeness fixture (TEST keys only, no live infra) ===\n");

  const { c1, c2, c3, dishonestView } = await buildFixture();
  console.log("One buyer, one seller, three chained claims (source labels in completeness-fixture.ts):");
  console.log(`  c1  delivered=yes  claimId=${c1.claimId}  priorClaimId=(genesis)`);
  console.log(`  c2  delivered=NO   claimId=${c2.claimId}  priorClaimId=${c2.priorClaimId}`);
  console.log(`  c3  delivered=yes  claimId=${c3.claimId}  priorClaimId=${c3.priorClaimId}\n`);
  console.log("A seller-friendly host hides the negative c2 and returns only [c1, c3].");
  console.log(`  dishonest view shown: [${dishonestView.map((c) => (c.delivered === "no" ? "c2(no)" : c.claimId === c1.claimId ? "c1(yes)" : "c3(yes)")).join(", ")}]\n`);

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
  console.log(`\n${controls.length - failed}/${controls.length} controls pass (${green} GREEN properties, ${red} RED tamper negatives).`);
  console.log("Honest limits: this catches a hidden MIDDLE claim only. A hidden most-recent claim or a hidden whole");
  console.log("buyer is NOT caught here and needs the buyer's own retained copy and the on-chain settlementRef.");
  console.log("See docs/COMPLETENESS-FIXTURE.md and DECISIONS.md D-006.");

  if (failed > 0) {
    console.error(`\n${failed} control(s) FAILED — the fixture's guarantees do not hold, do not ship.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll controls pass.");
  }
}

main().catch((e) => {
  console.error("Fixture run failed:", e);
  process.exitCode = 1;
});
