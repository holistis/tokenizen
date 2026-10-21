#!/usr/bin/env node
// examples/generate-offer-receipt-link-testvector.mjs — builds
// examples/offer-receipt-link-testvector.json.
//
// Run with: node examples/generate-offer-receipt-link-testvector.mjs
//
// This produces a worked example of the TWO HALVES of one delivery:
//
//   seller half — an x402 offer-receipt extension artifact, signed by the
//                 resource server. Its spec calls a receipt "a signed statement
//                 returned by the resource server only on success, confirming
//                 that payment was received and service was delivered". That is
//                 the seller's account of the seller's own performance.
//
//   buyer half  — a capacity-attest delivery claim, signed by the buyer, saying
//                 what actually arrived against what was promised.
//
// The two are joined by offerReceiptHash. Both signatures here are REAL and
// independently checkable: the seller's is a genuine EIP-712 signature over the
// spec's own normative domain and types, not a stand-in. Verify the whole thing
// with: node examples/verify-offer-receipt-link.mjs
//
// Keys are the publicly known Hardhat/anvil test accounts, never funded. The
// point of using those is that anyone can regenerate this file byte for byte
// without asking us for anything.

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { claimPreimage, computeClaimId } from "../dist/schema.js";
import { signClaim } from "../dist/signing.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "offer-receipt-link-testvector.json");

// anvil #1 plays the seller (the resource server), anvil #0 the buyer.
const SELLER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const BUYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const seller = new ethers.Wallet(SELLER_KEY);
const buyer = new ethers.Wallet(BUYER_KEY);

// The settlement transaction both halves point at, so the two documents are
// demonstrably about the same payment and not two unrelated pieces of paper.
const SETTLEMENT_TX = "0x" + "3b".repeat(32);

// --- seller half: the x402 receipt ------------------------------------------
// Domain and types are quoted from the extension spec, which states they are
// normative and MUST NOT be transmitted on the wire (§3.2.1). They are recorded
// in the vector anyway so an offline verifier does not need to fetch the spec.
const EIP712_DOMAIN = { name: "x402 receipt", version: "1", chainId: 1 };
const EIP712_TYPES = {
  Receipt: [
    { name: "version", type: "uint256" },
    { name: "network", type: "string" },
    { name: "resourceUrl", type: "string" },
    { name: "payer", type: "string" },
    { name: "issuedAt", type: "uint256" },
    { name: "transaction", type: "string" },
  ],
};

// §5.2 field set, in the spec's own order. issuedAt is a fixed value rather than
// "now" so this generator is deterministic and the vector is reproducible.
const receiptPayload = {
  version: 1,
  network: "eip155:8453",
  resourceUrl: "https://gpu.example.com/v1/train",
  payer: buyer.address,
  issuedAt: 1788249600,
  transaction: SETTLEMENT_TX,
};

const receiptSignature = await seller.signTypedData(EIP712_DOMAIN, EIP712_TYPES, receiptPayload);

// §3.1 common object shape: { format, payload, signature }.
const receiptArtifact = { format: "eip712", payload: receiptPayload, signature: receiptSignature };

// THE DIGEST, and exactly what it is over: the artifact as transmitted. Neither
// x402 format offers a single canonical byte string to hash (for eip712 the
// signing digest comes from types that are never sent; for jws the payload is
// base64url-encoded inside the compact string), so this does not invent a
// canonical form for somebody else's artifact. It hashes the bytes the buyer was
// actually handed. The exact string is shipped in the vector so there is no
// ambiguity about what was hashed.
const transmittedBytes = JSON.stringify(receiptArtifact);
const offerReceiptHash = createHash("sha256").update(transmittedBytes, "utf8").digest("hex");

// --- buyer half: the delivery claim ----------------------------------------
const claimContent = {
  sellerAddress: seller.address.toLowerCase(),
  buyerAddress: buyer.address,
  assetType: "gpu-hours",
  promisedSpec: { gpuModel: "A100-80GB", region: "eu-west", devices: 2, hours: 4 },
  delivered: "partial",
  evidenceHash: createHash("sha256").update("training job 8f21a3 stdout+stderr", "utf8").digest("hex"),
  settlementRef: SETTLEMENT_TX,
  timestamp: "2026-09-01T08:00:12.417Z",
  offerReceiptHash,
};

const { claimId, signature } = await signClaim(buyer, claimContent);
const preimage = claimPreimage(claimContent);

// Cross-check this generator against the package's own implementation before
// writing anything: if these disagree, the vector is wrong and must not ship.
if (claimId !== computeClaimId(claimContent)) {
  throw new Error("claimId disagreement between signClaim and computeClaimId");
}

const vector = {
  _README:
    "Worked example of the two halves of one delivery: a seller-signed x402 offer-receipt and the buyer-signed capacity-attest claim that answers it, joined by offerReceiptHash. Everything needed to check this offline is in this file. Both signatures are real. Verify with: node examples/verify-offer-receipt-link.mjs",
  signingKeyNote:
    "Seller is the publicly known Hardhat/anvil account #1, buyer is account #0. TEST KEYS ONLY, never funded, never used for anything real. Published deliberately so this vector is reproducible by anyone.",
  x402Spec: "https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md",

  sellerHalf: {
    _what:
      "x402 offer-receipt extension artifact, signed by the resource server. Its payload carries no identifier of its own (spec section 5.2), which is why the buyer's claim references it by digest.",
    eip712Domain: EIP712_DOMAIN,
    eip712PrimaryType: "Receipt",
    eip712Types: EIP712_TYPES,
    _typesNote:
      "Recorded here for offline verification only. The spec (section 3.2.1) says these are normative and MUST NOT be transmitted on the wire.",
    receipt: receiptArtifact,
    expectedReceiptSigner: seller.address,
    transmittedBytes,
    transmittedBytesSha256: offerReceiptHash,
  },

  buyerHalf: {
    _what:
      "capacity-attest delivery claim, signed by the buyer. delivered is 'partial': the seller's receipt says service was delivered, the buyer says 25230 of 28800 gpu-seconds arrived. Both statements can be true at once, which is the entire reason both halves are kept.",
    claim: { ...claimContent, claimId, signature },
    canonicalPreimage: preimage,
    canonicalPreimageByteLength: Buffer.byteLength(preimage, "utf8"),
    claimId,
    eip191MessageDigestOverClaimIdString: ethers.hashMessage(claimId),
    signature,
    expectedRecoveredAddress: buyer.address,
  },

  theJoin: {
    offerReceiptHash,
    _what:
      "sha256 over sellerHalf.transmittedBytes, carried inside the buyer's signed content. Because it is inside the signed bytes, changing it changes claimId and breaks the buyer's signature, so a receipt reference cannot be swapped in or stripped out after the fact.",
    receiptSignerEqualsClaimSellerAddress: true,
    _signerNote:
      "True here because this example uses the spec's simplest signer-authorization approach, where the service signs with the key for its payTo address. The spec says production deployments SHOULD use a dedicated signing key instead, in which case the recovered receipt signer will NOT equal sellerAddress and this equality must not be relied on.",
  },

  whatThisVectorDoesNotEstablish: [
    "That the receipt signer was authorized to speak for the service. The spec treats signer authorization as a separate, external problem (section 4.3 on authorization approaches) and notes it SHOULD be evaluated as of the receipt's issuedAt, not at verification time. Nothing here checks that.",
    "That the settlement transaction exists or moved any funds. These are unfunded test keys and no chain was consulted.",
    "That the delivered amounts are accurate. The buyer asserts them; capacity-attest records the assertion and who signed it, and never certifies that an assertion is true.",
    "Any judgment about whether the seller performed well. There is no score here, only two signed statements and the link between them.",
  ],
};

writeFileSync(outPath, JSON.stringify(vector, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
console.log(`  offerReceiptHash  ${offerReceiptHash}`);
console.log(`  claimId           ${claimId}`);
console.log(`  receipt signer    ${seller.address}`);
console.log(`  claim signer      ${buyer.address}`);
