// signing.ts — sign a claim as the buyer, and verify that signature later.
//
// Deliberately simple EIP-191 personal-sign over the claim's content-address
// (claimId), not EIP-712 typed data. This keeps the MVP's crypto surface
// small and easy to audit end-to-end; a typed-data path can be added later
// as an additive upgrade (accept both, prefer the new one) without breaking
// already-recorded claims. See mcp-paywall/src/x402.mjs for the EIP-712
// pattern this project can graduate to if/when claims need domain-separated
// signing (e.g. once claims are also submitted on-chain).

import { ethers } from "ethers";
import { type ClaimContent, computeClaimId } from "./schema.js";

export interface SignedClaimParts {
  claimId: string;
  signature: string;
}

/**
 * Sign a delivery claim as the buyer. Returns the content-addressed claimId
 * alongside the signature so callers can assemble a full DeliveryClaim.
 */
export async function signClaim(signer: ethers.Signer, content: ClaimContent): Promise<SignedClaimParts> {
  const claimId = computeClaimId(content);
  const signature = await signer.signMessage(claimId);
  return { claimId, signature };
}

/**
 * Recover the address that produced `signature` over `claimId`. Pure,
 * offline, deterministic — no network call.
 */
export function recoverClaimSigner(claimId: string, signature: string): string {
  return ethers.verifyMessage(claimId, signature);
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify that an assembled claim is internally consistent:
 *   1. claimId really is the sha256 content-address of the claim's own
 *      content fields (catches a submitted claimId that doesn't match a
 *      tampered/edited content field), and
 *   2. the signature really does recover to buyerAddress — the party
 *      attesting to what it received, per the project's design (the PAYING
 *      agent leaves the claim about the SELLER it paid).
 */
export function verifyClaim(
  claim: ClaimContent & { claimId: string; signature: string },
): VerifyResult {
  const expectedClaimId = computeClaimId(claim);
  if (expectedClaimId.toLowerCase() !== claim.claimId.toLowerCase()) {
    return { ok: false, reason: "claimId_mismatch" };
  }

  let recovered: string;
  try {
    recovered = recoverClaimSigner(claim.claimId, claim.signature);
  } catch (e) {
    return { ok: false, reason: `signature_recovery_failed: ${(e as Error).message}` };
  }

  if (recovered.toLowerCase() !== claim.buyerAddress.toLowerCase()) {
    return { ok: false, reason: "signature_does_not_match_buyer" };
  }

  return { ok: true };
}
