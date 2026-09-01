// examples/generate-metered-testvector.ts — regenerates
// examples/metered-claim-testvector.json and prints every test vector that
// docs/metered-delivery-spec.md pins down.
//
// Run with: npx tsx examples/generate-metered-testvector.ts
//
// The signing key below is the PUBLICLY KNOWN Hardhat/anvil account #0 test
// key. It is a well-known throwaway key that appears in every Hardhat
// tutorial on earth; it is never funded and is used here for one reason only:
// so that anybody can regenerate this vector byte-for-byte without asking us
// for anything. It is NOT, and must never be, a key that holds value.
//
// No network, no ledger, no MCP server is touched by this script.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { claimPreimage, computeClaimId, type ClaimContent } from "../src/schema.js";
import { signClaim, recoverClaimSigner } from "../src/signing.js";

const ANVIL_ACCOUNT_0_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const buyer = new ethers.Wallet(ANVIL_ACCOUNT_0_PRIVATE_KEY);

  // The story: the buyer paid via x402 for 2x A100 for 4 hours (= 28800
  // gpu-seconds). Its own accounting meter counted 25230 gpu-seconds made
  // available in the 04:00-08:00Z window. The buyer calls the delivery
  // `partial` — note that `delivered` and `measured` are independent: nothing
  // in the schema derives one from the other.
  const content: ClaimContent = {
    sellerAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    buyerAddress: buyer.address,
    assetType: "gpu-hours",
    promisedSpec: { gpuModel: "A100-80GB", region: "eu-west", devices: 2, hours: 4 },
    delivered: "partial",
    evidenceHash: "37353ee638699ea6fd598863a1b55b3713fca76bd8f103c69f7c1dc0f9d36be5",
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-09-01T08:00:12.417Z",
    measured: {
      unit: "gpu-second",
      basis: "supplied",
      promisedAmount: "28800",
      deliveredAmount: "25230",
      period: { start: "2026-09-01T04:00:00Z", end: "2026-09-01T08:00:00Z" },
      method: {
        attribution: "buyer",
        instrument: "nvidia-smi accounting, 10s polling, job 8f21a3",
        readingsHash: "0d08539780ad082368c65079bf21cc1daaf62617549d20d5a304cc551248021d",
      },
    },
  };

  const preimage = claimPreimage(content);
  const { claimId, signature } = await signClaim(buyer, content);
  const recovered = recoverClaimSigner(claimId, signature);
  const eip191Digest = ethers.hashMessage(claimId);

  // The same claim WITHOUT `measured` — proves a measured claim is a
  // different claim (different id) from its unmeasured twin, which is what
  // keeps appendClaim()'s duplicate detection honest.
  const { measured: _dropped, ...withoutMeasured } = content;
  const idWithoutMeasured = computeClaimId(withoutMeasured as ClaimContent);

  const vector = {
    _README: [
      "Self-contained test vector for the `measured` extension of capacity-attest (0.2.0).",
      "Everything needed to verify this offline is in this file. See docs/metered-delivery-spec.md for the rules.",
      "The signing key is the publicly known Hardhat/anvil account #0 test key — never funded, never used for anything real.",
      "Verify with: node examples/verify-metered-example.mjs",
    ].join(" "),
    spec: "docs/metered-delivery-spec.md",
    signingKeyNote:
      "Signed with the publicly known Hardhat/anvil account #0 private key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80. TEST KEY ONLY.",
    claim: { ...content, claimId, signature },
    canonicalPreimage: preimage,
    canonicalPreimageByteLength: Buffer.byteLength(preimage, "utf8"),
    claimId,
    eip191MessageDigestOverClaimIdString: eip191Digest,
    signature,
    expectedRecoveredAddress: recovered,
    notes: {
      preimage:
        "The preimage is canonicalize(ClaimContentSchema.parse(content)), NOT canonicalize(content): the parse step lower-cases sellerAddress/buyerAddress and strips unknown top-level keys. claimId = '0x' + lowercase hex sha256 of the UTF-8 bytes of canonicalPreimage.",
      signature:
        "EIP-191 personal_sign over the 66-character ASCII STRING claimId (prefix '\\x19Ethereum Signed Message:\\n66'), not over the 32 raw bytes. This is the most likely reimplementation mistake.",
      closedPeriod:
        "period.end[0..19) = '" +
        content.measured!.period.end.slice(0, 19) +
        "' <= timestamp[0..19) = '" +
        content.timestamp.slice(0, 19) +
        "' — the 19-character prefix rule, which is why a fractional-second timestamp in the same second still validates.",
      unmeasuredTwinClaimId: idWithoutMeasured,
    },
  };

  const outPath = join(here, "metered-claim-testvector.json");
  writeFileSync(outPath, JSON.stringify(vector, null, 2) + "\n", "utf8");

  console.log("wrote", outPath);
  console.log("claimId                 :", claimId);
  console.log("preimage bytes          :", vector.canonicalPreimageByteLength);
  console.log("eip191 digest           :", eip191Digest);
  console.log("recovered address       :", recovered);
  console.log("buyerAddress            :", content.buyerAddress);
  console.log("claimId without measured:", idWithoutMeasured);
}

main().catch((e) => {
  console.error("generation failed:", e);
  process.exitCode = 1;
});
