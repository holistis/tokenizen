// test-helpers.ts — shared fixtures for the test suite. Not part of the
// published surface (README/dist only ship what package.json's "files"
// lists), but kept in src/ so it type-checks alongside the code it exercises.

import { ethers } from "ethers";
import { createHash } from "node:crypto";
import type { ClaimContent, DeliveryClaim } from "./schema.js";
import { signClaim } from "./signing.js";

/** A fresh random TEST wallet — never funded, never used outside this test suite. */
export function testWallet(): ethers.HDNodeWallet {
  return ethers.Wallet.createRandom();
}

/** sha256 hex digest of some evidence bytes, in the shape evidenceHash expects. */
export function evidenceHash(evidence: string): string {
  return createHash("sha256").update(evidence).digest("hex");
}

export interface BuildClaimOverrides {
  sellerAddress?: string;
  buyerAddress?: string;
  assetType?: ClaimContent["assetType"];
  promisedSpec?: ClaimContent["promisedSpec"];
  delivered?: ClaimContent["delivered"];
  evidenceHash?: string;
  settlementRef?: string;
  timestamp?: string;
}

/** Build a valid, signed DeliveryClaim for buyer `wallet`, with sensible defaults. */
export async function buildSignedClaim(
  wallet: ethers.HDNodeWallet,
  overrides: BuildClaimOverrides = {},
): Promise<DeliveryClaim> {
  const content: ClaimContent = {
    sellerAddress: overrides.sellerAddress ?? "0x00000000000000000000000000000000000000aa",
    buyerAddress: overrides.buyerAddress ?? wallet.address,
    assetType: overrides.assetType ?? "gpu-hours",
    promisedSpec: overrides.promisedSpec ?? "1x A100, 4 hours, us-east region",
    delivered: overrides.delivered ?? "yes",
    evidenceHash: overrides.evidenceHash ?? evidenceHash("demo evidence payload"),
    settlementRef: overrides.settlementRef ?? "0x" + "11".repeat(32),
    timestamp: overrides.timestamp ?? new Date().toISOString(),
  };
  const { claimId, signature } = await signClaim(wallet, content);
  return { ...content, claimId, signature };
}
