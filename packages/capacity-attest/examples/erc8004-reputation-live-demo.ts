// examples/erc8004-reputation-live-demo.ts — LIVE, on-chain proof that
// publishReputationFeedback() (src/erc8004-reputation.ts) really works
// against the real, deployed ERC-8004 Reputation Registry, not just a
// mocked contract in erc8004-reputation.test.ts.
//
// Deliberately does NOT target a real stranger's already-registered agent:
// giveFeedback() requires a validly registered Identity Registry agentId,
// and writing synthetic demo feedback about someone else's real, public
// on-chain reputation record would be noise pollution on a real third
// party's identity, not a fair thing to do just to prove our own plumbing
// works. So this demo registers its OWN, fresh, throwaway test agent first
// (register() on the Identity Registry is open to anyone, no access
// control), then a SEPARATE throwaway wallet gives feedback about that
// agent — same "nothing about a real third party" posture as
// eas-live-demo.ts's synthetic seller address.
//
// Works on Base Sepolia (free, faucet ETH) or Base mainnet (a few cents).
// Needs, from the environment:
//   RPC_URL      a Base or Base-Sepolia JSON-RPC endpoint
//   PRIVATE_KEY  a funded key that pays gas for BOTH steps (registering the
//                test agent, and giving feedback about it)
// Real, canonical ERC-8004 deployment addresses (same address on every
// chain, github.com/erc-8004/erc-8004-contracts README.md, checked 2026-09-10):
//   IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
//   ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
//
// Run: RPC_URL=... PRIVATE_KEY=... npx tsx examples/erc8004-reputation-live-demo.ts

import { ethers } from "ethers";
import { signClaim } from "../src/signing.js";
import type { ClaimContent, DeliveryClaim } from "../src/schema.js";
import { publishReputationFeedback } from "../src/erc8004-reputation.js";

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
const IDENTITY_REGISTER_ABI = ["function register() external returns (uint256 agentId)"];

async function sign(wallet: ethers.Wallet, content: ClaimContent): Promise<DeliveryClaim> {
  const { claimId, signature } = await signClaim(wallet, content);
  return { ...content, claimId, signature };
}

async function main(): Promise<void> {
  const rpcUrl = process.env["RPC_URL"];
  const pk = process.env["PRIVATE_KEY"];
  if (!rpcUrl || !pk) {
    console.error("Set RPC_URL and PRIVATE_KEY (a funded key that pays gas for both steps).");
    process.exitCode = 1;
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const payer = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, provider);
  const bal = await provider.getBalance(payer.address);

  console.log("=== capacity-attest — LIVE ERC-8004 Reputation Registry demo ===");
  console.log(`chainId              : ${chainId}`);
  console.log(`gas payer            : ${payer.address}`);
  console.log(`balance              : ${ethers.formatEther(bal)} ETH`);
  console.log(`IdentityRegistry     : ${IDENTITY_REGISTRY}`);
  console.log(`ReputationRegistry   : ${REPUTATION_REGISTRY}\n`);
  if (bal === 0n) {
    console.error("Payer balance is 0 — fund it first (Sepolia faucet, or a few cents on mainnet).");
    process.exitCode = 1;
    return;
  }

  console.log("1) Registering a FRESH, throwaway test agent (never a real stranger's identity)...");
  const identity = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_REGISTER_ABI, payer);
  const registerTx = await identity["register()"]!();
  const receipt = await registerTx.wait();
  let agentId: bigint | null = null;
  for (const log of receipt.logs) {
    // ERC-721 Transfer(address(0), owner, tokenId) — standard mint event, no ERC-8004-specific ABI needed.
    if (log.topics[0] === ethers.id("Transfer(address,address,uint256)") && log.topics[1] === ethers.zeroPadValue(ethers.ZeroAddress, 32)) {
      agentId = BigInt(log.topics[3]!);
    }
  }
  if (agentId === null) {
    console.error("Could not find the new agentId in the register() receipt.");
    process.exitCode = 1;
    return;
  }
  console.log(`   registered test agentId ${agentId}, owned by ${payer.address}\n`);

  // The feedback GIVER must not be the agent's own owner/operator (the
  // registry reverts with "Self-feedback not allowed" otherwise) — so the
  // buyer here is deliberately a SEPARATE, freshly generated wallet, funded
  // with a small amount from the payer to cover its own gas.
  const buyer = ethers.Wallet.createRandom().connect(provider);
  console.log(`2) Funding a separate throwaway buyer wallet (${buyer.address}) to give feedback...`);
  const fundTx = await payer.sendTransaction({ to: buyer.address, value: ethers.parseEther("0.0005") });
  await fundTx.wait();

  const claim = await sign(buyer as unknown as ethers.Wallet, {
    // Must be the agent's REAL registered owner (payer.address here — register() made payer the
    // owner), not a synthetic placeholder: publishReputationFeedback() (adversarial review
    // 2026-09-11) now verifies agentId's registered owner matches claim.sellerAddress before
    // writing anything on-chain, so a made-up sellerAddress would correctly get refused.
    sellerAddress: payer.address,
    buyerAddress: buyer.address,
    assetType: "gpu-hours",
    promisedSpec: "1x A100, 4h — live erc8004-reputation-live-demo run",
    delivered: "yes",
    evidenceHash: "a".repeat(64),
    settlementRef: "0x" + "03".repeat(32),
    timestamp: new Date().toISOString(),
  });

  console.log(`3) Publishing feedback about agentId ${agentId} via giveFeedback()...`);
  const result = await publishReputationFeedback(buyer, {
    reputationRegistryRef: `eip155:${chainId}:${REPUTATION_REGISTRY}`,
    agentRegistryRef: `eip155:${chainId}:${IDENTITY_REGISTRY}`,
    agentId: agentId.toString(),
    rpcUrl,
    claim,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.ok) {
    console.log(`\nPROOF: real giveFeedback() call on ${REPUTATION_REGISTRY}, tx ${result.txHash}. Open it on the chain's explorer to check.`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((e) => {
  console.error("Live demo failed:", e);
  process.exitCode = 1;
});
