// examples/authorizer-from-tx-live-demo.ts — the LIVE, on-chain proof that
// resolveAuthorizerFromTransaction() (src/eip3009-authorizer-from-tx.ts)
// actually resolves the real EIP-3009 authorizer from nothing but a bare
// transaction hash, closing the x402-foundation/x402#3604 §6 gap it was built
// for.
//
// WHY A REAL LOG AND NOT A SELF-MADE ANSWER. A hand-built fixture only proves
// the code agrees with what WE assumed the chain says. This script instead
// finds a REAL AuthorizationUsed event USDC itself emitted on Base mainnet,
// reads its authorizer/nonce straight off the log (ground truth, independent
// of this package's own code), then calls resolveAuthorizerFromTransaction()
// with ONLY that event's transaction hash — no payload, no authorizer, no
// nonce handed in — and checks the two answers match byte for byte. It also
// runs the honest-failure paths against the real chain: a wrong expected
// chain id, a transaction hash that does not exist, and an expectedAsset that
// does not match.
//
// mainnet.base.org refuses eth_getLogs for public callers on any window, even
// fromBlock=toBlock='latest' ("request limit reached") — confirmed live
// 11 nov 2026 while building agent-receipt-verify's twin benchmark
// (bench/duplicate-payment-onchain.mjs). base-rpc.publicnode.com and
// base.drpc.org both allow it; this script defaults to the former and lets
// --rpc override it.
//
// Run: npx tsx examples/authorizer-from-tx-live-demo.ts [--rpc=<url>] [--window=<blocks>]

import { resolveAuthorizerFromTransaction, AUTHORIZATION_USED_TOPIC0 } from "../src/eip3009-authorizer-from-tx.js";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHAIN_ID = 8453n;

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const RPC_URL = flag("rpc", "https://base-rpc.publicnode.com");
let windowSize = Number(flag("window", "5000"));

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

let checks = 0;
let passed = 0;
function check(name: string, ok: boolean, extra = ""): void {
  checks++;
  if (ok) {
    passed++;
    console.log("  ok    " + name);
  } else {
    console.log("  FAIL  " + name + (extra ? "  <- " + extra : ""));
  }
}

console.log("resolveAuthorizerFromTransaction, live against Base mainnet (" + RPC_URL + ")");
console.log("");

console.log("1. finding a real AuthorizationUsed log on USDC (" + USDC_BASE + ")");
const latestHex = (await rpcCall(RPC_URL, "eth_blockNumber", [])) as string;
const latest = parseInt(latestHex, 16);

type FoundLog = { authorizer: string; nonce: string; tx: string };
let found: FoundLog | null = null;
for (let attempt = 0; attempt < 4 && !found; attempt++) {
  const fromBlock = Math.max(0, latest - windowSize);
  let logs: Array<{ topics: string[]; transactionHash: string }>;
  try {
    logs = (await rpcCall(RPC_URL, "eth_getLogs", [
      {
        address: USDC_BASE,
        topics: [AUTHORIZATION_USED_TOPIC0],
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + latest.toString(16),
      },
    ])) as Array<{ topics: string[]; transactionHash: string }>;
  } catch {
    windowSize = Math.floor(windowSize / 2);
    continue;
  }
  if (logs.length > 0) {
    const log = logs[logs.length - 1]!;
    found = {
      authorizer: ("0x" + log.topics[1]!.slice(-40)).toLowerCase(),
      nonce: log.topics[2]!.toLowerCase(),
      tx: log.transactionHash,
    };
  } else {
    windowSize = windowSize * 2;
  }
}

if (!found) {
  console.log("  no AuthorizationUsed log found within the tried windows, stopping (honest: not measured, no guess).");
  process.exit(2);
}
console.log("  found: authorizer " + found.authorizer + ", tx " + found.tx);
console.log("");

console.log("2. resolveAuthorizerFromTransaction(tx hash only) must return the same authorizer+nonce");
{
  const result = await resolveAuthorizerFromTransaction(found.tx, { rpcUrl: RPC_URL, expectedChainId: CHAIN_ID, expectedAsset: USDC_BASE });
  check(
    "FOUND, authorizer matches the independently read log",
    result.outcome === "FOUND" && result.authorizer.toLowerCase() === found.authorizer,
    JSON.stringify(result),
  );
  check(
    "FOUND, nonce matches the independently read log",
    result.outcome === "FOUND" && result.nonce.toLowerCase() === found.nonce,
    JSON.stringify(result),
  );
}
console.log("");

console.log("3. mutation matrix against the real chain: an honest outcome for every deviation, never a silent PASS");
{
  const wrongChain = await resolveAuthorizerFromTransaction(found.tx, { rpcUrl: RPC_URL, expectedChainId: 1n, expectedAsset: USDC_BASE });
  check(
    "[change] wrong expectedChainId -> NOT_MEASURED, never answered about the wrong chain",
    wrongChain.outcome === "NOT_MEASURED",
    JSON.stringify(wrongChain),
  );

  // Measured, not assumed (11 nov 2026): base-rpc.publicnode.com does not answer a
  // completely nonexistent tx hash with a clean "null" the way an archive node
  // would, but with HTTP 403 "Archive requests require a personal token" — so
  // NOT_MEASURED is the honest, correct answer here, not NOT_FOUND. Both count as
  // passing below: the point of this check is that there is NEVER a silent FOUND
  // or a crash, not which of the two honest "we don't know" outcomes a specific
  // RPC node happens to return.
  const fakeTx = "0x" + "ff".repeat(32);
  const nonexistent = await resolveAuthorizerFromTransaction(fakeTx, { rpcUrl: RPC_URL, expectedChainId: CHAIN_ID, expectedAsset: USDC_BASE });
  check(
    "[variant] nonexistent tx hash -> NOT_FOUND or honest NOT_MEASURED, never a crash or a guessed FOUND",
    nonexistent.outcome === "NOT_FOUND" || nonexistent.outcome === "NOT_MEASURED",
    JSON.stringify(nonexistent),
  );

  const wrongAsset = await resolveAuthorizerFromTransaction(found.tx, {
    rpcUrl: RPC_URL,
    expectedChainId: CHAIN_ID,
    expectedAsset: "0x" + "00".repeat(20),
  });
  check(
    "[change] expectedAsset on a contract that did not log in this tx -> NOT_FOUND",
    wrongAsset.outcome === "NOT_FOUND",
    JSON.stringify(wrongAsset),
  );
}

console.log("");
console.log(passed + " / " + checks + " passed");
process.exit(passed === checks ? 0 : 1);
