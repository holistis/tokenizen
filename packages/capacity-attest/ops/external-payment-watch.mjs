#!/usr/bin/env node
// external-payment-watch.mjs — alerts the king by Telegram the first time a
// genuinely EXTERNAL wallet pays capacity-attest's publish_reputation_feedback
// route, not another one of our own self-tests.
//
// WHY THIS WATCHES THE CHAIN, NOT OUR OWN CODE: zero risk to the live paid
// tool. This never imports, calls or depends on anything in http-server.ts —
// it only reads a public USDC Transfer event on Base, from a DIFFERENT public
// RPC than the live service itself uses (base.publicnode.com here vs
// mainnet.base.org in production), so this watcher's own correctness never
// depends on the same provider or the same code path it is checking up on.
//
// WHAT IT WATCHES: ERC-20 Transfer(address,address,uint256) events on Base
// USDC, filtered to `to == PUBLISH_FEEDBACK_PAY_TO` (the fee actually lands
// here, per http-server.ts's own deployment note — same address as the
// signer). A `from` that is not our own known self-test buyer is, by
// construction, someone else's wallet paying this route for the first time.
//
// STATE: a single JSON file holding the last block number already checked,
// so a cron re-run never re-alerts on the same transfer twice and never
// rescans from USDC's genesis block.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RPC_URL = "https://base.publicnode.com";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0xF2b3679bE59ADaC8981A2b4095ff772736120339";
// The ONLY address this service has ever been paid from, tonight's own live
// test (X402_TEST_CLIENT_KEY, see DECISIONS.md D-020) — never a new external
// caller. Add any other address we ourselves control here if that changes.
const KNOWN_SELF_ADDRESSES = new Set(["0x87f344b6ec48a936373d774d3de8649deeb66ee1"]);

const STATE_FILE = new URL("./external-payment-watch-state.json", import.meta.url);
// keccak256("Transfer(address,address,uint256)") — computed with ethers.id(),
// never hand-typed: a single wrong hex character here would silently match
// zero logs forever, with no error anywhere to notice it by.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TELEGRAM_BOT_TOKEN = process.env.EXTERNAL_PAYMENT_WATCH_TG_TOKEN;
const TELEGRAM_CHAT_ID = process.env.EXTERNAL_PAYMENT_WATCH_TG_CHAT;

function topicToAddress(topic) {
  return "0x" + topic.slice(-40);
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method} failed: ${JSON.stringify(body.error)}`);
  return body.result;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("external-payment-watch: no Telegram credentials configured, printing instead:\n" + text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
  if (!res.ok) console.error("external-payment-watch: Telegram send failed:", res.status, await res.text());
}

async function main() {
  const currentBlockHex = await rpc("eth_blockNumber", []);
  const currentBlock = Number.parseInt(currentBlockHex, 16);

  let state = loadState();
  if (!state) {
    // First run: seed from the current block, never rescan USDC's whole
    // history. A later look-back is a deliberate, separate decision, not an
    // accident of this watcher's first execution.
    state = { lastCheckedBlock: currentBlock };
    saveState(state);
    console.log(`external-payment-watch: first run, seeded at block ${currentBlock}, nothing scanned yet`);
    return;
  }

  const fromBlock = state.lastCheckedBlock + 1;
  if (fromBlock > currentBlock) {
    console.log("external-payment-watch: no new blocks since last run");
    return;
  }

  const logs = await rpc("eth_getLogs", [
    {
      address: USDC_BASE,
      topics: [TRANSFER_TOPIC, null, "0x" + "0".repeat(24) + PAY_TO.slice(2).toLowerCase()],
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + currentBlock.toString(16),
    },
  ]);

  for (const log of logs) {
    const from = topicToAddress(log.topics[1]).toLowerCase();
    if (KNOWN_SELF_ADDRESSES.has(from)) continue;
    const amountUsdc = Number.parseInt(log.data, 16) / 1_000_000;
    const text =
      `capacity-attest: a NEW wallet paid publish_reputation_feedback.\n` +
      `from: ${from}\namount: $${amountUsdc.toFixed(2)} USDC\n` +
      `tx: https://basescan.org/tx/${log.transactionHash}`;
    console.log(text);
    await sendTelegram(text);
  }

  state.lastCheckedBlock = currentBlock;
  saveState(state);
}

await main();
