// settlement-corroboration.ts — a SOFT, NON-BLOCKING cross-check of an x402 facilitator's own
// settlement.payer against what the CHAIN ITSELF says, via resolveAuthorizerFromTransaction
// (src/eip3009-authorizer-from-tx.ts).
//
// WHY THIS EXISTS. http-server.ts's two onAfterSettlement hooks (record_delivery and
// publish_reputation_feedback) receive a `settlement` object straight from the x402 facilitator's
// own /settle response (settlement.transaction, settlement.network, settlement.payer) and, until
// now, only logged and trusted those fields — see record_delivery_settled / publish_feedback_attempting
// in http-server.ts. That is a single party's own say-so about who paid. This file adds an EXTRA,
// corroborating signal: ask the chain itself, independently, who it says authorized the transfer
// (the same AuthorizationUsed-event read eip3009-authorizer-from-tx.ts already built for
// x402-foundation/x402#3604 §6), and note whether the two agree.
//
// WHY SOFT, NEVER A GATE. Making a paid action's response wait on a third-party RPC call would
// turn every settlement into a hostage of that RPC's own uptime and latency — a reliability
// regression dressed up as a safety feature. This function is designed to be called WITHOUT being
// awaited by the real action (see http-server.ts's own onAfterSettlement hooks for the fire-and-log
// shape that keeps it off the caller's critical path); corroborateSettlement() itself does not
// enforce that — a caller that did `await corroborateSettlement(...)` before proceeding would still
// work, just defeat the entire point. The contract this function keeps on its own side: it is
// always safe to call this way, because it NEVER throws and is bounded by a short timeout no
// matter how it is invoked.
//
// WHAT THIS DELIBERATELY DOES NOT DO.
//  1. It does not decide anything about whether the paid action is allowed to proceed — by the time
//     either onAfterSettlement hook runs, the fee has already settled and the action it guards is
//     already committed to happening. This is purely a corroborating log signal for an operator to
//     notice afterward, not a pre-condition.
//  2. It does not retry, cache, or rate-limit its own RPC calls — one bounded attempt per
//     settlement, same discipline resolveAuthorizerFromTransaction already applies one layer down.
//  3. It is EVM/eip155-only, the same boundary resolveAuthorizerFromTransaction already draws: a
//     settlement.network outside the eip155 CAIP-2 namespace is 'not_measured', never guessed at.
//
// ZERO-CONFIG DEFAULT. Both CAPACITY_ATTEST_RPC_URL and CAPACITY_ATTEST_SETTLEMENT_ASSET must be
// set for this to do anything at all; either missing returns 'skipped' immediately, with zero
// added latency and zero network activity — see settlement-corroboration.bench.ts for the measured
// proof of that, both in isolation and in the fire-and-forget shape http-server.ts actually uses.
// (Examined first, per this feature's own design brief: examples/authorizer-from-tx-live-demo.ts,
// the one other place in this package that talks to an RPC from outside http-server.ts, has no env
// var of its own for the RPC URL — it only takes a --rpc CLI flag — so there was no existing
// convention to reuse here, and CAPACITY_ATTEST_RPC_URL / CAPACITY_ATTEST_SETTLEMENT_ASSET are new.)

import { resolveAuthorizerFromTransaction } from "./eip3009-authorizer-from-tx.js";

// Same shape as eip3009-authorizer-from-tx.ts's own (module-private, unexported) TX_HASH_RE.
// Duplicated rather than imported: this module's "cheap pre-check before any rpc call, and before
// even constructing a provider" property must hold on its own, not depend on that file continuing
// to expose (or not change the shape of) an internal it currently keeps private.
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// CAIP-2 for the EVM namespace only ("eip155:<chainId>"), e.g. "eip155:8453" — the shape
// settlement.network is typed as by @x402/core (a bare `${string}:${string}` template literal,
// not narrowed to eip155 specifically — see http-server.ts's own RECORD_DELIVERY_NETWORK comment
// for the same observation). Anything else (a different namespace, extra ":"-separated segments,
// a non-numeric chain id) is out of scope for this EVM-only check, same boundary
// resolveAuthorizerFromTransaction itself draws against Permit2/ERC-7710.
const CAIP2_EIP155_RE = /^eip155:(\d+)$/;

// REAL BUG, found by measurement (13 nov 2026, adversarial red-team of this file): without this
// cap, `BigInt(chainMatch[1])` below runs on whatever digit string CAIP2_EIP155_RE's `\d+` greedily
// captured — unbounded — and that call is SYNCHRONOUS, before this function's first `await`.
// Measured directly (node -e, this package): a plain all-'9' digit string costs BigInt() ~140ms at
// 1,000,000 digits, ~930ms at 5,000,000, ~1.7s at 10,000,000 (the regex capturing those same digits
// costs under 10ms even at 10,000,000 — BigInt's decimal-to-binary conversion, not the regex, is
// what's expensive). settlement.network is the x402 FACILITATOR's own field in its real /settle
// response (see this file's header comment), already treated as untrusted by every other check in
// this function — a malicious, compromised, or merely buggy facilitator can put an arbitrarily long
// digit string there. Because this synchronous parse happens before corroborateSettlement() even
// returns a pending promise, `void corroborateSettlement(...)` in http-server.ts's two
// onAfterSettlement hooks does NOT protect against it: the cost is paid before the "never awaited"
// property even starts to apply, blocking Node's entire single-threaded event loop (every
// concurrently-served request, not just this one) for the full duration — directly contradicting
// this module's own "zero added latency" / "always safe to call this way" header-comment contract.
// No real CAIP-2 eip155 chain id is anywhere close to this long (today's largest are a handful of
// digits; even a theoretical uint256 chain id tops out at 78 decimal digits) — 32 is generous
// headroom while keeping BigInt()'s cost on a rejected string negligible (sub-millisecond).
const MAX_CHAIN_ID_DIGITS = 32;

// Reuses eip3009-authorizer-from-tx.ts's own DEFAULT_TIMEOUT_MS value (not its binding — that
// constant is module-private there too) so a single resolveAuthorizerFromTransaction attempt is
// bounded the same way whether it is called from this file or from a live-demo script directly.
const DEFAULT_TIMEOUT_MS = 15_000;
// A second, OUTER bound around the whole corroboration attempt (two sequential RPC round trips
// inside resolveAuthorizerFromTransaction — getNetwork, then getTransactionReceipt — each already
// bounded at DEFAULT_TIMEOUT_MS on its own). This is a last-resort safety net, not the normal
// bound: under ordinary operation the inner per-call timeouts fire first. It exists only so this
// promise is GUARANTEED to settle within a fixed ceiling even if some future change to
// resolveAuthorizerFromTransaction loses one of its own internal timeouts — this function's own
// "never hangs forever" contract must not depend on that file's internals staying exactly as they
// are today.
const OUTER_TIMEOUT_MS = DEFAULT_TIMEOUT_MS * 2 + 5_000;

export interface CorroborationConfig {
  /** The JSON-RPC endpoint to read the chain's own AuthorizationUsed event from. Unset = skipped. */
  rpcUrl?: string;
  /** The token contract settlement.transaction's transfer is expected to be against. Unset = skipped. */
  expectedAsset?: string;
}

export type CorroborationOutcome = "skipped" | "matched" | "mismatched" | "not_measured";

export interface CorroborationResult {
  outcome: CorroborationOutcome;
  /** Present on every outcome except 'matched' (which needs no further explanation). */
  reason?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`settlement corroboration timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Cross-checks settlement.payer (the x402 facilitator's own say-so, from its real /settle
 * response) against who the CHAIN ITSELF says authorized the transfer, for exactly the
 * `exact`/EIP-3009 shape resolveAuthorizerFromTransaction already handles. An EXTRA corroborating
 * signal, never a gate — see this module's header comment.
 *
 * NEVER throws. Every input this cannot cleanly resolve — unconfigured, a non-object or
 * null/undefined settlement, a settlement.network outside eip155, a settlement.transaction that is
 * not a plausible 0x-prefixed 32-byte hash, a missing settlement.payer to compare against, or any
 * non-FOUND outcome from resolveAuthorizerFromTransaction itself (NOT_FOUND / AMBIGUOUS /
 * NOT_MEASURED) — comes back as {outcome:'not_measured', reason}, never a thrown error and never a
 * guess. Bounded by OUTER_TIMEOUT_MS regardless of how any of that fails.
 */
export async function corroborateSettlement(settlement: unknown, config: CorroborationConfig): Promise<CorroborationResult> {
  try {
    return await withTimeout(corroborateSettlementUnbounded(settlement, config), OUTER_TIMEOUT_MS);
  } catch (e) {
    // Belt-and-suspenders: corroborateSettlementUnbounded below already catches everything it can
    // anticipate, including resolveAuthorizerFromTransaction's own (already-never-throwing)
    // outcomes. This outer catch exists so this function's OWN contract — never throw, so a
    // fire-and-forget caller (see http-server.ts) can never be destabilized by it — holds even
    // against the one thing that outer withTimeout() can itself produce (its own timeout
    // rejection) and against any truly unanticipated failure in a hostile settlement object.
    return { outcome: "not_measured", reason: `unexpected error: ${(e as Error)?.message ?? String(e)}` };
  }
}

async function corroborateSettlementUnbounded(settlement: unknown, config: CorroborationConfig): Promise<CorroborationResult> {
  const rpcUrl = config?.rpcUrl;
  const expectedAsset = config?.expectedAsset;
  if (!rpcUrl || !expectedAsset) {
    return { outcome: "skipped", reason: "not configured: set CAPACITY_ATTEST_RPC_URL and CAPACITY_ATTEST_SETTLEMENT_ASSET to enable" };
  }

  // Defensive against a hostile/malformed settlement object on purpose, even though @x402/mcp
  // types `settlement` strictly as SettleResponse: this hook receives whatever the facilitator
  // actually sent, the same "never trust a library type as a runtime guarantee" discipline every
  // onAfterSettlement hook in http-server.ts already applies to its OWN re-validation of
  // `arguments`. A non-object (null, a string, a number, an array) is 'not_measured', never a crash.
  if (settlement === null || typeof settlement !== "object" || Array.isArray(settlement)) {
    return { outcome: "not_measured", reason: "settlement is not an object" };
  }
  const s = settlement as Record<string, unknown>;
  const network = s["network"];
  const transaction = s["transaction"];
  const payer = s["payer"];

  if (typeof network !== "string") {
    return { outcome: "not_measured", reason: "settlement.network is missing or not a string" };
  }
  const chainMatch = CAIP2_EIP155_RE.exec(network);
  if (!chainMatch) {
    return { outcome: "not_measured", reason: `settlement.network is not a recognized eip155 CAIP-2 id (this check is EVM-only): ${network}` };
  }
  // Checked BEFORE BigInt() below, not after — see MAX_CHAIN_ID_DIGITS's own comment for the
  // measured synchronous-blocking cost this refuses to pay.
  if (chainMatch[1]!.length > MAX_CHAIN_ID_DIGITS) {
    return {
      outcome: "not_measured",
      reason: `settlement.network's chain id is implausibly long (${chainMatch[1]!.length} digits, max ${MAX_CHAIN_ID_DIGITS}) — refusing to parse`,
    };
  }
  let expectedChainId: bigint;
  try {
    expectedChainId = BigInt(chainMatch[1]!);
  } catch {
    // Unreachable given CAIP2_EIP155_RE already requires \d+, kept as an explicit fail-closed path
    // rather than an unchecked `!` assumption — same discipline as every other BigInt() call this
    // package makes on externally-sourced input (see eip3009-authorizer-from-tx.ts's own comment).
    return { outcome: "not_measured", reason: `settlement.network's chain id is not a valid integer: ${network}` };
  }

  if (typeof transaction !== "string" || !TX_HASH_RE.test(transaction)) {
    return { outcome: "not_measured", reason: "settlement.transaction is not a plausible 0x-prefixed transaction hash" };
  }

  if (typeof payer !== "string" || payer.length === 0) {
    return { outcome: "not_measured", reason: "settlement.payer is missing — nothing to corroborate the chain's answer against" };
  }

  const resolved = await resolveAuthorizerFromTransaction(transaction, {
    rpcUrl,
    expectedChainId,
    expectedAsset,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  if (resolved.outcome !== "FOUND") {
    return { outcome: "not_measured", reason: `resolveAuthorizerFromTransaction: ${resolved.outcome} — ${resolved.reason}` };
  }

  if (resolved.authorizer.toLowerCase() === payer.toLowerCase()) {
    return { outcome: "matched" };
  }
  return {
    outcome: "mismatched",
    reason: `chain says the real authorizer is ${resolved.authorizer}, but the facilitator's settlement.payer says ${payer}`,
  };
}
