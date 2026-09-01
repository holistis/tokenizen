#!/usr/bin/env node
// examples/verify-metered-example.mjs — standalone verifier for
// examples/metered-claim-testvector.json.
//
// Run with: node examples/verify-metered-example.mjs
//
// DELIBERATELY SELF-CONTAINED. This script reads exactly one file (the JSON
// test vector) and imports exactly one library (ethers, for ecrecover). It
// does NOT import src/schema.ts, src/signing.ts, the ledger, or the MCP
// server, and it makes no network call. The canonicalization below is an
// INDEPENDENT reimplementation written from docs/metered-delivery-spec.md
// §4 — if it agreed with schema.ts only because it called schema.ts, it
// would prove nothing.
//
// Exit code 0 = all checks green, 1 = something is red.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));
const vectorPath = process.argv[2] ?? join(here, "metered-claim-testvector.json");

// --- §4.1 step 2: the closed set of top-level keys that go into the preimage.
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
];

// --- §4.1 step 3: ASCII lower-casing, explicitly not locale-sensitive, so a
// tr_TR locale can never bite. Only these two fields are normalized.
const NORMALIZED_ADDRESS_KEYS = ["sellerAddress", "buyerAddress"];

function asciiLowerCase(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

// --- §4.2: keys sorted recursively by UTF-16 code-unit sequence (RFC 8785
// §3.2.3), which is exactly what Array.prototype.sort() without a comparator
// does in JavaScript. Arrays keep their order and are never sorted.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out = Object.create(null);
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

/** The full preimage procedure of §4.1: strip, normalize, sort, serialize. */
function canonicalPreimage(claim) {
  const content = {};
  for (const key of PREIMAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(claim, key)) continue;
    if (claim[key] === undefined) continue; // §4.5: undefined == absent
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

const raw = readFileSync(vectorPath, "utf8");
const vector = JSON.parse(raw);
const claim = vector.claim;

// 1. Recompute the canonical preimage from the claim itself and compare it to
//    the preimage string the file ships, so anyone can diff the two.
const preimage = canonicalPreimage(claim);
check(
  "canonical preimage recomputed from `claim` matches `canonicalPreimage` in the file",
  preimage === vector.canonicalPreimage,
  preimage === vector.canonicalPreimage ? `${Buffer.byteLength(preimage, "utf8")} bytes` : `recomputed:\n${preimage}\nfile:\n${vector.canonicalPreimage}`,
);

check(
  "preimage byte length matches `canonicalPreimageByteLength`",
  Buffer.byteLength(preimage, "utf8") === vector.canonicalPreimageByteLength,
  `${Buffer.byteLength(preimage, "utf8")} vs ${vector.canonicalPreimageByteLength}`,
);

// 2. claimId = "0x" + lowercase hex sha256 of the preimage's UTF-8 bytes.
const computedId = "0x" + sha256Hex(preimage);
check("claimId recomputed from the preimage matches `claimId`", computedId === vector.claimId, computedId);
check("claimId inside `claim` matches the top-level `claimId`", claim.claimId === vector.claimId, claim.claimId);

// 3. EIP-191 digest over the 66-character ASCII claimId STRING (not the 32
//    raw bytes). This is the step reimplementations get wrong.
const digest = ethers.hashMessage(vector.claimId);
check(
  "EIP-191 digest over the claimId string matches `eip191MessageDigestOverClaimIdString`",
  digest === vector.eip191MessageDigestOverClaimIdString,
  digest,
);

// 4. Recover the signer and compare to the address the file says should come
//    out, and to buyerAddress (case-insensitively — the claim carries the
//    lower-cased form, ecrecover returns the checksummed form).
let recovered = null;
let recoveryError = null;
try {
  recovered = ethers.verifyMessage(vector.claimId, vector.signature);
} catch (e) {
  recoveryError = e.message;
}
check("signature recovers without error", recovered !== null, recovered ?? recoveryError);
check(
  "recovered address matches `expectedRecoveredAddress`",
  recovered !== null && recovered.toLowerCase() === vector.expectedRecoveredAddress.toLowerCase(),
  `${recovered} vs ${vector.expectedRecoveredAddress}`,
);
check(
  "recovered address matches the claim's buyerAddress",
  recovered !== null && recovered.toLowerCase() === claim.buyerAddress.toLowerCase(),
  `${recovered} vs ${claim.buyerAddress}`,
);
check("signature inside `claim` matches the top-level `signature`", claim.signature === vector.signature, claim.signature);

// 5. Negative control: flip one digit of deliveredAmount and confirm the
//    claimId changes. Without this, all of the above would also pass for a
//    verifier that ignored `measured` entirely.
const tampered = JSON.parse(JSON.stringify(claim));
tampered.measured.deliveredAmount = "25231";
const tamperedId = "0x" + sha256Hex(canonicalPreimage(tampered));
check("tampering with measured.deliveredAmount changes the claimId", tamperedId !== vector.claimId, tamperedId);

// 6. The closed-period rule of §5.3, on the 19-character prefix.
const endPrefix = claim.measured.period.end.slice(0, 19);
const tsPrefix = claim.timestamp.slice(0, 19);
check("period.end[0..19) <= timestamp[0..19) (closed period, §5.3)", endPrefix <= tsPrefix, `"${endPrefix}" <= "${tsPrefix}"`);
check(
  "period.start < period.end (§5.1)",
  claim.measured.period.start < claim.measured.period.end,
  `"${claim.measured.period.start}" < "${claim.measured.period.end}"`,
);

// --- report -----------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`capacity-attest metered test vector — ${vectorPath}\n`);
for (const r of results) {
  console.log(`${r.ok ? "GREEN" : "RED  "}  ${r.name}`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log("");
if (failed.length === 0) {
  console.log(`GREEN — all ${results.length} checks passed. No network, no ledger, no MCP server involved.`);
  process.exit(0);
} else {
  console.log(`RED — ${failed.length} of ${results.length} checks failed.`);
  process.exit(1);
}
