// selftest-live.mjs — echte end-to-end zelftest tegen een levende, betaalde
// x402-dienst: koopt echt /api/pt ($0.001 USDC op Base), legt daarna een
// echte, ondertekende leveringsclaim vast met capacity-attest zelf (de
// net gefixte 0.1.2-code), en leest hem terug. Geen mocks, geen testkeys
// voor de betaling zelf — dit is de daadwerkelijke koper-flow die het
// package voor externe gebruikers bedoeld is.
//
// Draai met: node examples/selftest-live.mjs

import { ethers } from "ethers";
import { createHash } from "node:crypto";
import { signClaim } from "../dist/signing.js";
import { recordDelivery, getDeliveryHistory } from "../dist/tools.js";

const RPC_URL = "https://mainnet.base.org";
const USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SELLER_ADDR = "0x015Eb036560216B3051339061FF68A207E0fe88f"; // live PAYMENT_WALLET, bevestigd via /api/status vandaag
const TOLLBOOTH = "https://wazir-x402.duckdns.org";
const ENDPOINT = "/api/pt";
const PRICE_6 = 1000n; // $0.001 USDC (6 decimalen)

// Al gefinancierd (echte USDC + ETH gas) tijdens de eerdere, mislukte poging
// vandaag — hergebruiken in plaats van opnieuw te financieren.
const CLIENT_PK = process.env.SELFTEST_CLIENT_PK;
if (!CLIENT_PK) {
  console.error("SELFTEST_CLIENT_PK env var ontbreekt.");
  process.exit(1);
}

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  process.env["CAPACITY_ATTEST_DATA_DIR"] = "./data-selftest";

  const provider = new ethers.JsonRpcProvider(RPC_URL, 8453, { staticNetwork: true, batchMaxCount: 1 });
  const client = new ethers.Wallet(CLIENT_PK, provider);
  console.log("Koper-wallet (echt, al gefinancierd vandaag):", client.address);

  const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, client);
  const bal = await usdc.balanceOf(client.address);
  const ethBal = await provider.getBalance(client.address);
  console.log("Saldo koper: ", ethers.formatUnits(bal, 6), "USDC /", ethers.formatEther(ethBal), "ETH");
  if (bal < PRICE_6) throw new Error("Onvoldoende USDC bij koper-wallet");

  console.log("\n--- Stap 1: echte, directe USDC-betaling op Base mainnet ---");
  const payTx = await usdc.transfer(SELLER_ADDR, PRICE_6);
  console.log("Betaal-tx verstuurd:", payTx.hash);
  const t0 = Date.now();
  await payTx.wait(1);
  const payConfirmMs = Date.now() - t0;
  console.log("Betaal-tx bevestigd na", payConfirmMs, "ms");

  console.log("\n--- Stap 2: de betaalde dienst echt aanroepen ---");
  const t1 = Date.now();
  const resp = await fetch(`${TOLLBOOTH}${ENDPOINT}`, {
    headers: { "PAYMENT-SIGNATURE": payTx.hash },
    signal: AbortSignal.timeout(30000),
  });
  const callMs = Date.now() - t1;
  const bodyText = await resp.text();
  console.log("HTTP status:", resp.status, "| responstijd:", callMs, "ms");
  console.log("Response (eerste 500 tekens):", bodyText.slice(0, 500));

  const delivered = resp.status === 200 ? "yes" : "no";
  const evidenceHash = sha256(bodyText);

  console.log("\n--- Stap 3: echte leveringsclaim bouwen en ondertekenen (capacity-attest, koper ondertekent) ---");
  const content = {
    sellerAddress: SELLER_ADDR,
    buyerAddress: client.address,
    assetType: "api-credits",
    promisedSpec: {
      endpoint: `${TOLLBOOTH}${ENDPOINT}`,
      priceUsdc: "0.001",
      description: "PoolTogether draw scans + recente claims (live self-test 2026-08-31)",
    },
    delivered,
    evidenceHash,
    settlementRef: payTx.hash,
    timestamp: new Date().toISOString(),
  };
  const t2 = Date.now();
  const { claimId, signature } = await signClaim(client, content);
  const signMs = Date.now() - t2;
  const claim = { ...content, claimId, signature };
  console.log("claimId:", claimId, "| ondertekenen duurde", signMs, "ms");

  console.log("\n--- Stap 4: record_delivery aanroepen (de echte MCP-tool-functie) ---");
  const t3 = Date.now();
  const recordResult = await recordDelivery(claim);
  const recordMs = Date.now() - t3;
  console.log("record_delivery ->", recordResult, "| duurde", recordMs, "ms");

  console.log("\n--- Stap 5: get_delivery_history aanroepen om terug te lezen ---");
  const t4 = Date.now();
  const history = await getDeliveryHistory(SELLER_ADDR);
  const historyMs = Date.now() - t4;
  console.log("get_delivery_history ->", JSON.stringify(history, null, 2));
  console.log("duurde", historyMs, "ms");

  console.log("\n=== BENCHMARK-SAMENVATTING ===");
  console.log(JSON.stringify({
    payConfirmMs, tollboothCallMs: callMs, httpStatus: resp.status,
    signMs, recordMs, historyMs,
    totalEndToEndMs: payConfirmMs + callMs + signMs + recordMs + historyMs,
    claimId, settlementRef: payTx.hash,
  }, null, 2));

  console.log("\n=== Zelftest klaar. Echte betaling, echte levering, echte ondertekende claim, echt teruggelezen. ===");
}

main().catch((e) => {
  console.error("Zelftest mislukt:", e);
  process.exitCode = 1;
});
