// settlement-corroboration.bench.ts — quantifies the one property this feature's whole design
// hinges on: that http-server.ts's two onAfterSettlement hooks are NEVER made slower by settlement
// corroboration, whether it is unconfigured (the zero-config default) or configured and actually
// resolving (even in its best case: resolveAuthorizerFromTransaction answering instantly). Modeled
// on eas.bench.ts: a fake stands in for the real network dependency so the number measured is this
// file's OWN fire-and-forget wiring, never real-world RPC jitter.
//
// WHY A MOCK, NOT A REAL (even test-net) RPC CALL. corroborateSettlement has no dependency-injection
// point of its own for resolveAuthorizerFromTransaction (unlike easSource's AttestationReader
// parameter) — it is a plain function import. vi.mock is this package's own established way to
// control a dependency shaped like that under vitest (see ledger.test.ts's vi.mock("node:fs") and
// its header comment for the same reasoning), and it works identically in a .bench.ts file.
//
// WHY THE HOOK SHAPE IS MODELED, NOT THE FULL HTTP+MCP+x402 STACK. The thing under test is a
// three-line wiring pattern (`void corroborateSettlement(...).then(...).catch(...)` followed by the
// real, awaited action) — see http-server.ts's own two onAfterSettlement hooks. Running that exact
// pattern here, with a stand-in "real action" of a fixed, realistic duration, measures precisely
// the property in question (does corroboration ever add to the awaited latency) without the noise
// of a full facilitator round-trip, which neither hook's own real action depends on anyway (that
// already happened by the time onAfterSettlement runs).
//
// Run with: npx vitest bench src/settlement-corroboration.bench.ts

import { bench, describe, vi } from "vitest";

vi.mock("./eip3009-authorizer-from-tx.js", () => ({
  resolveAuthorizerFromTransaction: vi.fn(async () => ({
    outcome: "FOUND" as const,
    authorizer: "0x" + "11".repeat(20),
    nonce: "0x" + "22".repeat(32),
    asset: "0x" + "33".repeat(20),
  })),
}));

const { corroborateSettlement } = await import("./settlement-corroboration.js");

const SAMPLE_SETTLEMENT = {
  success: true,
  transaction: "0x" + "aa".repeat(32),
  network: "eip155:8453",
  payer: "0x" + "11".repeat(20), // matches the mocked authorizer above -> the 'matched' branch
};

const UNCONFIGURED = {};
const CONFIGURED = { rpcUrl: "https://example-rpc.invalid/base", expectedAsset: "0x" + "33".repeat(20) };

// A fast, realistic stand-in for the awaited work either real hook does after settlement:
// record_delivery's local ledger append, or publish_reputation_feedback's already-reserved-slot
// confirm immediately before its own (separately metered, real-chain) broadcast. 5ms is deliberately
// small so any added overhead from corroboration — if the fire-and-forget wiring were wrong and it
// were accidentally awaited — would show up clearly in the comparison below rather than being lost
// in a large baseline.
const REAL_ACTION_MS = 5;

function realAction(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, REAL_ACTION_MS));
}

// Exactly the shape both onAfterSettlement hooks in http-server.ts use: fire corroboration WITHOUT
// awaiting it, then await only the real action. What this function returns resolves the instant the
// real action does, regardless of whether corroboration has finished, is still running, or was
// never configured at all.
async function onAfterSettlementShape(corroborationConfig: { rpcUrl?: string; expectedAsset?: string }): Promise<void> {
  void corroborateSettlement(SAMPLE_SETTLEMENT, corroborationConfig).catch(() => {});
  await realAction();
}

describe(`onAfterSettlement hook shape: awaited real-action latency only (~${REAL_ACTION_MS}ms simulated), corroboration fired-and-forgotten alongside it`, () => {
  bench("WITHOUT corroboration configured (zero-config default — CAPACITY_ATTEST_RPC_URL/CAPACITY_ATTEST_SETTLEMENT_ASSET unset)", async () => {
    await onAfterSettlementShape(UNCONFIGURED);
  });

  bench("WITH corroboration configured, resolveAuthorizerFromTransaction mocked to resolve instantly (best case for the real on-chain call)", async () => {
    await onAfterSettlementShape(CONFIGURED);
  });
});

// For reference only — NOT the shape production code uses (http-server.ts never awaits
// corroborateSettlement before its real action proceeds). This isolates corroborateSettlement's OWN
// cost, which is irrelevant to caller-perceived latency by construction, but useful to know.
describe("corroborateSettlement in isolation, fully awaited (reference only — never the production shape)", () => {
  bench("skipped (unconfigured)", async () => {
    await corroborateSettlement(SAMPLE_SETTLEMENT, UNCONFIGURED);
  });

  bench("matched (resolveAuthorizerFromTransaction mocked to resolve instantly)", async () => {
    await corroborateSettlement(SAMPLE_SETTLEMENT, CONFIGURED);
  });
});
