#!/usr/bin/env node
// verify-nonce.mjs — re-check our claim against the chain instead of taking it
// on our word.
//
// WHAT THIS SHOWS, in order:
//   1. the two receipts are identical field by field except issuedAt
//   2. transaction is empty in both, so neither receipt names its settlement
//   3. the EIP-3009 authorization nonce does differ, and the seller holds it
//      before settlement runs
//   4. that nonce is checkable on the rail itself: authorizationState says the
//      authorization was consumed, and the AuthorizationUsed log inside each
//      settlement carries exactly that nonce
//
// Step 4 is the point. A verifier recomputes the mapping from a public ledger
// rather than trusting the seller or the facilitator.
//
// HONEST LIMIT: buyer and seller in these artifacts are both us. This shows the
// chain runs end to end. It is not evidence that anyone else uses it.
//
// USAGE: node verify-nonce.mjs [payment-a.json payment-b.json]

import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const paths = args.length === 2
  ? args
  : [new URL("./payment-a.json", import.meta.url), new URL("./payment-b.json", import.meta.url)];

const [a, b] = paths.map((p) => JSON.parse(readFileSync(p, "utf8")));

console.log("## 1. The two receipts, field by field\n");
const pa = a.receipt.payload;
const pb = b.receipt.payload;
const differing = [];
for (const k of Object.keys(pa)) {
  const same = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
  if (!same) differing.push(k);
  console.log(`${k.padEnd(12)} ${same ? "same    " : "DIFFERS "} A=${String(pa[k]).slice(0, 46)}  B=${String(pb[k]).slice(0, 46)}`);
}
console.log(`\ndiffering fields : ${differing.join(", ") || "none"}`);
console.log(`issuedAt gap     : ${pb.issuedAt - pa.issuedAt} seconds`);
console.log(`transaction A/B  : ${JSON.stringify(pa.transaction)} / ${JSON.stringify(pb.transaction)}`);

console.log("\n## 2. What the seller already held before settlement ran\n");
console.log(`nonce A : ${a.nonce}`);
console.log(`nonce B : ${b.nonce}`);
console.log(`equal   : ${a.nonce === b.nonce ? "yes, which would be a problem" : "no"}`);

console.log("\n## 3. Recomputed from the rail\n");
const provider = new ethers.JsonRpcProvider(RPC);
const usdc = new ethers.Contract(
  USDC,
  [
    "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
    "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  ],
  provider,
);
const topic = usdc.interface.getEvent("AuthorizationUsed").topicHash;

let allMatch = true;
for (const [label, art] of [["A", a], ["B", b]]) {
  const payer = art.receipt.payload.payer;
  const { nonce } = art;
  const tx = art.settlement?.transaction;

  const used = await usdc.authorizationState(payer, nonce);
  const rcpt = await provider.getTransactionReceipt(tx);
  const noncesInTx = (rcpt?.logs ?? []).filter((l) => l.topics[0] === topic).map((l) => l.topics[2]);
  const match = noncesInTx.includes(nonce);
  if (!match || !used) allMatch = false;

  console.log(`${label}:`);
  console.log(`  payer                       ${payer}`);
  console.log(`  nonce                       ${nonce}`);
  console.log(`  authorizationState          ${used ? "true (consumed)" : "false"}`);
  console.log(`  settlement                  ${tx}`);
  console.log(`  AuthorizationUsed in that tx ${noncesInTx.join(", ") || "none"}`);
  console.log(`  nonce matches               ${match ? "yes" : "no"}`);
}

console.log("");
if (!allMatch) {
  console.error("At least one nonce did not line up with its settlement. That is a real failure, not a warning.");
  process.exit(1);
}
console.log("Both nonces map to exactly one settlement each, recomputed from the chain.");
