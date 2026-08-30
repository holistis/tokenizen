// examples/demo.ts — end-to-end local demo, no live infrastructure touched.
//
// Walks through the whole flow using a throwaway TEST wallet (no real funds,
// no real network calls):
//   1. Generate a TEST buyer key and build a delivery claim.
//   2. Sign it (the same signClaim() the `record_delivery` tool verifies against).
//   3. Submit it through recordDelivery() — the exact function the MCP tool
//      `record_delivery` calls.
//   4. Read it back through getDeliveryHistory() — the exact function behind
//      the MCP tool `get_delivery_history`.
//
// Run with: npm run demo (from packages/capacity-attest)
//
// This intentionally calls the tools.ts functions directly rather than
// spawning the MCP stdio server, so the demo has zero process/transport
// plumbing — it proves the record→verify→store→query logic works, which is
// exactly what the two MCP tools wrap.

import { createHash } from "node:crypto";
import { ethers } from "ethers";
import { signClaim } from "../src/signing.js";
import { recordDelivery, getDeliveryHistory } from "../src/tools.js";
import type { ClaimContent } from "../src/schema.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function main(): Promise<void> {
  console.log("=== Capacity Attest — local demo (TEST keys only, no live infra) ===\n");

  // Isolate this demo run's ledger from the real package data/ dir so it
  // never leaves generated claims behind in a shared location.
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env["CAPACITY_ATTEST_DATA_DIR"] = mkdtempSync(join(tmpdir(), "capacity-attest-demo-"));

  // 1. A TEST buyer wallet — created fresh every run, never funded, for
  //    signature-shape demonstration only.
  const buyer = ethers.Wallet.createRandom();
  const seller = ethers.Wallet.createRandom();
  console.log("TEST buyer address :", buyer.address);
  console.log("TEST seller address:", seller.address, "\n");

  // 2. Build + sign a claim: the buyer paid the seller via x402 for 4 hours
  //    of GPU time, and it actually arrived as promised.
  const evidence = "job-log: 4h A100 allocation, exit code 0, output hash matches manifest";
  const content: ClaimContent = {
    sellerAddress: seller.address,
    buyerAddress: buyer.address,
    assetType: "gpu-hours",
    promisedSpec: { gpuModel: "A100", hours: 4, region: "us-east" },
    delivered: "yes",
    evidenceHash: sha256(evidence),
    settlementRef: "0x" + "aa".repeat(32), // stand-in x402 settlement tx hash
    timestamp: new Date().toISOString(),
  };
  const { claimId, signature } = await signClaim(buyer, content);
  const claim = { ...content, claimId, signature };
  console.log("Built + signed claim:", JSON.stringify(claim, null, 2), "\n");

  // 3. Submit it — same path as the `record_delivery` MCP tool.
  const recordResult = recordDelivery(claim);
  console.log("record_delivery ->", recordResult, "\n");
  if (!recordResult.ok) {
    console.error("Demo claim was rejected — this should not happen for a freshly-built valid claim.");
    process.exitCode = 1;
    return;
  }

  // 3b. Also demonstrate that a claim with a forged signature gets rejected.
  const impostor = ethers.Wallet.createRandom();
  const forgedContent: ClaimContent = { ...content, settlementRef: "0x" + "bb".repeat(32) };
  const forged = await signClaim(impostor, forgedContent); // signed by impostor, but claims buyerAddress = buyer
  const forgedRejection = recordDelivery({ ...forgedContent, ...forged });
  console.log("record_delivery (forged signature) ->", forgedRejection, "\n");

  // 4. Query the seller's history — same path as `get_delivery_history`.
  const history = getDeliveryHistory(seller.address);
  console.log(`get_delivery_history("${seller.address}") ->`, JSON.stringify(history, null, 2));

  console.log("\n=== Demo complete. No live network, wallet, or production data was touched. ===");
}

main().catch((e) => {
  console.error("Demo failed:", e);
  process.exitCode = 1;
});
