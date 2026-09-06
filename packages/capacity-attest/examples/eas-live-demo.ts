// examples/eas-live-demo.ts — the LIVE, on-chain proof of cross-installation
// discovery (D-005) over the Ethereum Attestation Service on Base.
//
// This is the real round-trip: register the schema if needed, publish delivery
// claims as EAS attestations (recipient = seller), then discover them straight
// back FROM THE CHAIN via eth_getLogs, decode, and re-verify locally. What it
// prints is a real attestation UID anyone can open in the EAS explorer, so a
// skeptic (goun7, x402) can check it themselves rather than trust our prose.
//
// Works on Base Sepolia (free, faucet ETH) or Base mainnet (a few cents). It
// needs, from the environment, only:
//   RPC_URL      a Base or Base-Sepolia JSON-RPC endpoint
//   PRIVATE_KEY  a funded key that PAYS GAS and posts the attestations
// The claims themselves are signed by a fresh, throwaway TEST buyer key
// generated here, so PRIVATE_KEY is only the publisher/gas-payer, never the
// buyer identity. No real payment or delivery is implied; settlementRef is a
// stand-in. This proves the MECHANISM works on a real chain, nothing more.
//
// Run: RPC_URL=... PRIVATE_KEY=... npx tsx examples/eas-live-demo.ts

import { ethers } from "ethers";
import { signClaim } from "../src/signing.js";
import type { ClaimContent, DeliveryClaim } from "../src/schema.js";
import { ensureSchema, publishClaim, easSourceFromRpc, SCHEMA_UID, EAS_EXPLORER } from "../src/eas.js";
import { discoverDeliveryHistory } from "../src/discovery.js";

async function sign(wallet: ethers.Wallet, content: ClaimContent): Promise<DeliveryClaim> {
  const { claimId, signature } = await signClaim(wallet, content);
  return { ...content, claimId, signature };
}

async function main(): Promise<void> {
  const rpcUrl = process.env["RPC_URL"];
  const pk = process.env["PRIVATE_KEY"];
  if (!rpcUrl || !pk) {
    console.error("Set RPC_URL and PRIVATE_KEY (a funded Base or Base-Sepolia key that pays gas).");
    process.exitCode = 1;
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const explorer = (EAS_EXPLORER as Record<number, string>)[chainId] ?? "(unknown chain, no explorer mapping)";
  const signer = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, provider);
  const bal = await provider.getBalance(signer.address);

  console.log("=== capacity-attest — LIVE EAS discovery demo ===");
  console.log(`chainId       : ${chainId}`);
  console.log(`publisher     : ${signer.address}  (pays gas, NOT the buyer identity)`);
  console.log(`balance       : ${ethers.formatEther(bal)} ETH`);
  console.log(`schema UID    : ${SCHEMA_UID}`);
  console.log(`EAS explorer  : ${explorer}\n`);
  if (bal === 0n) {
    console.error("Publisher balance is 0 — fund it first (Sepolia faucet, or a few cents on mainnet).");
    process.exitCode = 1;
    return;
  }

  // A fresh throwaway TEST buyer (the claim signer). Two chained claims about
  // one seller: a positive one, then a NEGATIVE one linked to it.
  const buyer = ethers.Wallet.createRandom();
  const seller = "0x" + "a".repeat(40);
  const base = { sellerAddress: seller, buyerAddress: buyer.address, assetType: "gpu-hours" as const, evidenceHash: "a".repeat(64) };
  const c1 = await sign(buyer as unknown as ethers.Wallet, { ...base, promisedSpec: "1x A100, 4h", delivered: "yes", settlementRef: "0x" + "01".repeat(32), timestamp: new Date().toISOString() });
  const c2 = await sign(buyer as unknown as ethers.Wallet, { ...base, promisedSpec: "1x A100, 8h", delivered: "no", settlementRef: "0x" + "02".repeat(32), timestamp: new Date(Date.now() + 1000).toISOString(), priorClaimId: c1.claimId });

  console.log("1) Ensuring schema is registered...");
  await ensureSchema(signer);
  console.log(`   schema ready: ${explorer}/schema/view/${SCHEMA_UID}\n`);

  console.log("2) Publishing two claims as EAS attestations (recipient = seller)...");
  const r1 = await publishClaim(signer, c1);
  console.log(`   c1 (delivered yes) -> uid ${r1.uid}`);
  console.log(`      ${explorer}/attestation/view/${r1.uid}`);
  const r2 = await publishClaim(signer, c2);
  console.log(`   c2 (delivered NO)  -> uid ${r2.uid}`);
  console.log(`      ${explorer}/attestation/view/${r2.uid}\n`);

  console.log("3) Discovering the seller's history straight from the chain (a different 'installation' would do exactly this)...");
  const startBlock = (await provider.getBlockNumber()) - 5000;
  const result = await discoverDeliveryHistory(seller, [
    easSourceFromRpc(rpcUrl, { fromBlock: Math.max(0, startBlock), name: "eas-base" }),
  ]);
  console.log(`   discovered ${result.count} claims for seller ${seller}`);
  for (const c of result.claims) {
    console.log(`     ${c.claimId}  delivered=${c.delivered}  (verified locally)`);
  }
  console.log(`   completeness.chainConsistent = ${result.completeness.chainConsistent}`);
  console.log(`   sources: ${JSON.stringify(result.sources)}\n`);

  const ok = result.count >= 2 && result.claims.some((c) => c.delivered === "no");
  console.log(ok
    ? "PROOF: two claims published on-chain, then discovered back and re-verified locally, including the negative one. Open the explorer links above to check."
    : "Did not discover both claims back — check RPC block range / indexing lag and re-run.");
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error("Live demo failed:", e);
  process.exitCode = 1;
});
