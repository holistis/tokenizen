#!/usr/bin/env node
// examples/verify-offer-receipt-link.mjs — standalone verifier for
// examples/offer-receipt-link-testvector.json.
//
// Run with: node examples/verify-offer-receipt-link.mjs
//
// DELIBERATELY SELF-CONTAINED, the same way verify-metered-example.mjs is. This
// reads exactly one file (the JSON vector) and imports exactly one library
// (ethers, for ecrecover and the EIP-712 encoder). It does NOT import
// src/schema.ts, src/signing.ts, the ledger, or the MCP server, and it makes no
// network call. The canonicalization below is an INDEPENDENT reimplementation --
// if it agreed with schema.ts only because it called schema.ts, it would prove
// nothing.
//
// What it checks, in order:
//   1. the seller's half  — a real EIP-712 signature over x402's own normative
//                           domain and types, recovered to the expected signer
//   2. the digest         — sha256 over the receipt exactly as transmitted
//   3. the join           — that digest is what the buyer's claim carries
//   4. the buyer's half   — canonical preimage, claimId, EIP-191, ecrecover
//   5. negative controls  — tampering with either half breaks the link
//
// Exit code 0 = all checks green, 1 = something is red.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));
const vectorPath = process.argv[2] ?? join(here, "offer-receipt-link-testvector.json");

// --- the closed set of top-level keys that go into a claim's preimage.
// offerReceiptHash is one of them, which is the whole point: it is part of what
// the buyer signs, not metadata stapled alongside.
const PREIMAGE_KEYS = [
  "sellerAddress",
  "buyerAddress",
  "assetType",
  "promisedSpec",
  "delivered",
  "evidenceHash",
  "settlementRef",
  "timestamp",
  "measured",
  "offerReceiptHash",
  "priorClaimId",
  "externalRefs",
];

// ASCII lower-casing, explicitly not locale-sensitive, so a tr_TR locale can
// never bite. Only these two fields are normalized.
const NORMALIZED_ADDRESS_KEYS = ["sellerAddress", "buyerAddress"];

function asciiLowerCase(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

// Keys sorted recursively by UTF-16 code-unit sequence (RFC 8785 section 3.2.3),
// which is what Array.prototype.sort() without a comparator does in JavaScript.
// Arrays keep their order and are never sorted.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out = Object.create(null);
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

/** Strip to known keys, normalize the addresses, sort, serialize. */
function canonicalPreimage(claim) {
  const content = {};
  for (const key of PREIMAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(claim, key)) continue;
    if (claim[key] === undefined) continue; // undefined == absent
    content[key] = NORMALIZED_ADDRESS_KEYS.includes(key) ? asciiLowerCase(claim[key]) : claim[key];
  }
  return JSON.stringify(sortKeysDeep(content));
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// --- checks -----------------------------------------------------------------
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
}

const vector = JSON.parse(readFileSync(vectorPath, "utf8"));
const sellerHalf = vector.sellerHalf;
const buyerHalf = vector.buyerHalf;
const claim = buyerHalf.claim;
const receipt = sellerHalf.receipt;

// === 1. The seller's half ===================================================
// A real EIP-712 signature, recovered using the spec's normative domain and
// types. Per the spec, receipt.payload must be used EXACTLY as transmitted and
// verifiers must not reconstruct or infer payload fields, so the payload object
// is passed through untouched.
check(
  "receipt artifact has the spec's shape: format, payload, signature",
  receipt.format === "eip712" && typeof receipt.payload === "object" && typeof receipt.signature === "string",
  `format=${receipt.format}`,
);

let receiptSigner = null;
let receiptError = null;
try {
  receiptSigner = ethers.verifyTypedData(
    sellerHalf.eip712Domain,
    sellerHalf.eip712Types,
    receipt.payload,
    receipt.signature,
  );
} catch (e) {
  receiptError = e.message;
}
check("seller's EIP-712 receipt signature recovers without error", receiptSigner !== null, receiptSigner ?? receiptError);
check(
  "recovered receipt signer matches `expectedReceiptSigner`",
  receiptSigner !== null && receiptSigner.toLowerCase() === sellerHalf.expectedReceiptSigner.toLowerCase(),
  `${receiptSigner} vs ${sellerHalf.expectedReceiptSigner}`,
);
check(
  "the EIP-712 domain is the one the x402 spec mandates for receipts",
  sellerHalf.eip712Domain.name === "x402 receipt" &&
    sellerHalf.eip712Domain.version === "1" &&
    sellerHalf.eip712Domain.chainId === 1,
  JSON.stringify(sellerHalf.eip712Domain),
);

// === 2. The digest ==========================================================
check(
  "`transmittedBytes` really is the serialization of the receipt artifact in the file",
  sellerHalf.transmittedBytes === JSON.stringify(receipt),
  `${Buffer.byteLength(sellerHalf.transmittedBytes, "utf8")} bytes`,
);
const recomputedDigest = sha256Hex(sellerHalf.transmittedBytes);
check(
  "sha256 over those exact bytes matches `transmittedBytesSha256`",
  recomputedDigest === sellerHalf.transmittedBytesSha256,
  recomputedDigest,
);

// === 3. The join ============================================================
// The one check this whole vector exists for.
check(
  "the buyer's claim carries that digest as `offerReceiptHash`",
  claim.offerReceiptHash === recomputedDigest,
  `${claim.offerReceiptHash} vs ${recomputedDigest}`,
);
check(
  "`theJoin.offerReceiptHash` agrees with both halves",
  vector.theJoin.offerReceiptHash === recomputedDigest && vector.theJoin.offerReceiptHash === claim.offerReceiptHash,
  vector.theJoin.offerReceiptHash,
);
check(
  "the digest is lower-case hex with no 0x prefix, so one receipt cannot mint two digests",
  /^[0-9a-f]{64}$/.test(claim.offerReceiptHash),
  claim.offerReceiptHash,
);

// === 4. The buyer's half ====================================================
const preimage = canonicalPreimage(claim);
check(
  "canonical preimage recomputed from `claim` matches `canonicalPreimage` in the file",
  preimage === buyerHalf.canonicalPreimage,
  preimage === buyerHalf.canonicalPreimage
    ? `${Buffer.byteLength(preimage, "utf8")} bytes`
    : `recomputed:\n${preimage}\nfile:\n${buyerHalf.canonicalPreimage}`,
);
check(
  "preimage byte length matches `canonicalPreimageByteLength`",
  Buffer.byteLength(preimage, "utf8") === buyerHalf.canonicalPreimageByteLength,
  `${Buffer.byteLength(preimage, "utf8")} vs ${buyerHalf.canonicalPreimageByteLength}`,
);
check(
  "offerReceiptHash appears inside the signed preimage, in sorted key position",
  preimage.includes(`"offerReceiptHash":"${claim.offerReceiptHash}"`),
  "present",
);

const computedId = "0x" + sha256Hex(preimage);
check("claimId recomputed from the preimage matches `claimId`", computedId === buyerHalf.claimId, computedId);
check("claimId inside `claim` matches the top-level `claimId`", claim.claimId === buyerHalf.claimId, claim.claimId);

// EIP-191 over the 66-character ASCII claimId STRING, not the 32 raw bytes.
// This is the step reimplementations get wrong.
const digest = ethers.hashMessage(buyerHalf.claimId);
check(
  "EIP-191 digest over the claimId string matches `eip191MessageDigestOverClaimIdString`",
  digest === buyerHalf.eip191MessageDigestOverClaimIdString,
  digest,
);

let claimSigner = null;
let claimError = null;
try {
  claimSigner = ethers.verifyMessage(buyerHalf.claimId, buyerHalf.signature);
} catch (e) {
  claimError = e.message;
}
check("buyer's claim signature recovers without error", claimSigner !== null, claimSigner ?? claimError);
check(
  "recovered claim signer matches the claim's buyerAddress",
  claimSigner !== null && claimSigner.toLowerCase() === claim.buyerAddress.toLowerCase(),
  `${claimSigner} vs ${claim.buyerAddress}`,
);
check(
  "the two halves are signed by DIFFERENT parties, which is the reason to keep both",
  receiptSigner !== null && claimSigner !== null && receiptSigner.toLowerCase() !== claimSigner.toLowerCase(),
  `receipt ${receiptSigner} vs claim ${claimSigner}`,
);

// === 5. Negative controls ===================================================
// Without these, every check above would also pass for a verifier that quietly
// ignored the receipt link.

// 5a. Change one character of the receipt and its digest no longer matches the
//     claim. This is what stops a seller swapping in a different receipt.
const tamperedReceipt = JSON.parse(sellerHalf.transmittedBytes);
tamperedReceipt.payload.resourceUrl = "https://gpu.example.com/v1/something-else";
const tamperedDigest = sha256Hex(JSON.stringify(tamperedReceipt));
check(
  "editing the receipt changes its digest, so it no longer matches the claim",
  tamperedDigest !== claim.offerReceiptHash,
  tamperedDigest,
);

// 5b. The tampered receipt also fails its own signature, independently.
let tamperedSigner = null;
try {
  tamperedSigner = ethers.verifyTypedData(
    sellerHalf.eip712Domain,
    sellerHalf.eip712Types,
    tamperedReceipt.payload,
    tamperedReceipt.signature,
  );
} catch {
  tamperedSigner = null;
}
check(
  "the edited receipt no longer recovers to the seller",
  tamperedSigner === null || tamperedSigner.toLowerCase() !== sellerHalf.expectedReceiptSigner.toLowerCase(),
  tamperedSigner ?? "recovery failed",
);

// 5c. Swapping the reference inside the claim changes claimId, so the buyer's
//     signature no longer covers it. This is what stops anyone stapling a
//     different receipt onto an already-signed claim.
const swapped = { ...claim, offerReceiptHash: tamperedDigest };
const swappedId = "0x" + sha256Hex(canonicalPreimage(swapped));
check(
  "swapping offerReceiptHash in the claim changes the claimId",
  swappedId !== buyerHalf.claimId,
  swappedId,
);
check(
  "...and the buyer's original signature does not cover that new claimId",
  ethers.verifyMessage(swappedId, buyerHalf.signature).toLowerCase() !== claim.buyerAddress.toLowerCase(),
  "signature does not carry over",
);

// 5d. Removing the reference entirely also changes the claimId, so a receipt
//     link cannot be silently dropped from a signed claim either.
const stripped = { ...claim };
delete stripped.offerReceiptHash;
const strippedId = "0x" + sha256Hex(canonicalPreimage(stripped));
check("stripping offerReceiptHash out of the claim changes the claimId", strippedId !== buyerHalf.claimId, strippedId);

// --- report -----------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`capacity-attest offer-receipt link vector — ${vectorPath}\n`);
for (const r of results) {
  console.log(`${r.ok ? "GREEN" : "RED  "}  ${r.name}`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log("");
console.log("Not established by this vector, by design:");
for (const line of vector.whatThisVectorDoesNotEstablish) console.log(`  - ${line}`);
console.log("");
if (failed.length === 0) {
  console.log(`GREEN — all ${results.length} checks passed. No network, no ledger, no MCP server involved.`);
  process.exit(0);
} else {
  console.log(`RED — ${failed.length} of ${results.length} checks failed.`);
  process.exit(1);
}
