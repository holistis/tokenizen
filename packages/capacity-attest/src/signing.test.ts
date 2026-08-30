import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { signClaim, verifyClaim, recoverClaimSigner } from "./signing.js";
import { computeClaimId, type ClaimContent } from "./schema.js";
import { evidenceHash, testWallet } from "./test-helpers.js";

function content(overrides: Partial<ClaimContent> = {}, buyerAddress: string): ClaimContent {
  return {
    sellerAddress: "0x00000000000000000000000000000000000000aa",
    buyerAddress,
    assetType: "gpu-hours",
    promisedSpec: "1x A100, 4 hours",
    delivered: "yes",
    evidenceHash: evidenceHash("evidence"),
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-08-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("signClaim + verifyClaim", () => {
  it("een geldig ondertekende claim verifieert succesvol", async () => {
    const buyer = testWallet();
    const claimContent = content({}, buyer.address);
    const { claimId, signature } = await signClaim(buyer, claimContent);

    expect(recoverClaimSigner(claimId, signature)).toBe(buyer.address);
    expect(verifyClaim({ ...claimContent, claimId, signature })).toEqual({ ok: true });
  });

  it("weigert een handtekening van de verkeerde sleutel", async () => {
    const buyer = testWallet();
    const impostor = testWallet();
    const claimContent = content({}, buyer.address);
    // Impostor signs a claim that CLAIMS to be from `buyer`.
    const { claimId, signature } = await signClaim(impostor, claimContent);

    const verdict = verifyClaim({ ...claimContent, claimId, signature });
    expect(verdict).toEqual({ ok: false, reason: "signature_does_not_match_buyer" });
  });

  it("weigert een claim waarvan de inhoud is gewijzigd na ondertekening (claimId mismatch)", async () => {
    const buyer = testWallet();
    const claimContent = content({}, buyer.address);
    const { claimId, signature } = await signClaim(buyer, claimContent);

    // Tamper: change `delivered` after signing, keep the old claimId + signature.
    const tampered = { ...claimContent, delivered: "no" as const, claimId, signature };
    const verdict = verifyClaim(tampered);
    expect(verdict).toEqual({ ok: false, reason: "claimId_mismatch" });
  });

  it("weigert een volstrekt ongeldige handtekening-string", () => {
    const buyer = testWallet();
    const claimContent = content({}, buyer.address);
    const claimId = computeClaimId(claimContent);
    const garbageSignature = "0x" + "00".repeat(65);

    const verdict = verifyClaim({ ...claimContent, claimId, signature: garbageSignature });
    // ethers may recover an unrelated (wrong) address for a garbage-but-valid-shape
    // signature rather than throwing — either outcome must be rejected, never accepted.
    expect(verdict.ok).toBe(false);
  });
});

describe("ethers.Wallet vs ethers.HDNodeWallet compatibility", () => {
  it("werkt met een ethers.Wallet die van een privékey is gemaakt (niet alleen createRandom())", async () => {
    const wallet = new ethers.Wallet("0x" + "42".repeat(32));
    const claimContent = content({}, wallet.address);
    const { claimId, signature } = await signClaim(wallet, claimContent);
    expect(verifyClaim({ ...claimContent, claimId, signature })).toEqual({ ok: true });
  });
});
