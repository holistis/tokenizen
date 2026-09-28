// bench-helpers.ts — shared fixture generation for *.bench.ts files.
//
// Not part of the published surface (same convention as test-helpers.ts).
// Separate from test-helpers.ts because benchmark fixtures need to generate
// large volumes fast: real signing per claim (buildSignedClaim) is correct
// but costs real ECDSA work per call, so generating tens of thousands of
// claims with a FRESH random wallet each time would make fixture setup
// itself the bottleneck, not the code being measured. This reuses a small,
// fixed pool of wallets (signing cost scales with claim count either way;
// wallet CREATION does not need to) and skips the schema round-trip test
// suites don't need for a benchmark.

import { ethers } from "ethers";
import { createHash } from "node:crypto";
import { signClaim } from "./signing.js";
import type { ClaimContent, DeliveryClaim } from "./schema.js";

const SELLER = "0x00000000000000000000000000000000000000aa";
const WALLET_POOL_SIZE = 50;

let pool: ethers.HDNodeWallet[] | null = null;
function walletPool(): ethers.HDNodeWallet[] {
  if (!pool) pool = Array.from({ length: WALLET_POOL_SIZE }, () => ethers.Wallet.createRandom());
  return pool;
}

/**
 * Generate `count` distinct, genuinely-signed claims for SELLER, spread
 * across a small wallet pool (not one fresh wallet per claim). Each claim is
 * still a real, independently verifiable signature; only wallet reuse is a
 * shortcut, and reusing a buyer wallet across claims is realistic (a real
 * buyer transacts with the same seller more than once).
 */
export async function generateClaims(count: number): Promise<DeliveryClaim[]> {
  const wallets = walletPool();
  const claims: DeliveryClaim[] = [];
  for (let i = 0; i < count; i++) {
    const wallet = wallets[i % wallets.length]!;
    const content: ClaimContent = {
      sellerAddress: SELLER,
      buyerAddress: wallet.address,
      assetType: "gpu-hours",
      promisedSpec: `bench claim ${i}`,
      delivered: i % 5 === 0 ? "no" : "yes",
      evidenceHash: createHash("sha256").update(`evidence-${i}`).digest("hex"),
      settlementRef: "0x" + i.toString(16).padStart(64, "0"),
      timestamp: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    };
    const { claimId, signature } = await signClaim(wallet, content);
    claims.push({ ...content, claimId, signature });
  }
  return claims;
}

export { SELLER as BENCH_SELLER };
