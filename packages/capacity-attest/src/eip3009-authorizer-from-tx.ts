// eip3009-authorizer-from-tx.ts — resolve the REAL EIP-3009 authorizer of an
// on-chain settlement from a bare transaction hash alone, independent of any
// signed payload a caller might otherwise have trusted.
//
// WHY THIS EXISTS. x402-foundation/x402#3604 (the Buyer Delivery Claim
// Extension) section 6 names a narrow, specific gap: when `settlementRef` is
// an on-chain transaction hash rather than an x402 payment reference (the
// latter already carries its own signed `payer` field — see
// receipt-check.ts's compareClaimToReceipt for that already-covered branch),
// a naive lookup of "who paid" from the transaction's own `from` field is
// wrong whenever a sponsor, paymaster, or router contract submitted the
// transaction: `from` is the relayer, not the buyer. This file closes exactly
// that one case, for exactly the `exact`/EIP-3009 transfer method, by reading
// the real authorizer off the `AuthorizationUsed(address indexed authorizer,
// bytes32 indexed nonce)` event the token contract itself emits when the
// authorization is consumed — the same event
// agent-receipt-verify/src/eip3009-nonce-check.mjs already reads for a
// different purpose (confirming a claimed duplicate payment). The event's
// `authorizer` topic is set by the CONTRACT at the moment it consumes the
// authorization, regardless of which address paid gas to submit the
// enclosing transaction, so it survives sponsorship/relaying where a naive
// `tx.from` read does not.
//
// WHAT THIS DELIBERATELY DOES NOT DO.
//  1. Permit2 and ERC-7710 are out of scope, same reasoning and same boundary
//     agent-receipt-verify already drew for the EIP-3009 duplicate-payment
//     check: Permit2 keeps a bitmap in a SHARED contract (not per-token),
//     ERC-7710 has no persistent nonce state at all (everything runs through
//     simulation). Neither has an equivalently simple, queryable "who
//     authorized this" event. A settlement using either stays NOT_MEASURED,
//     never silently guessed.
//  2. It does not decide whether the resolved authorizer matches a claim's
//     buyerAddress. That comparison is the caller's job, the same way
//     compareClaimToReceipt() compares a receipt's `payer` field against
//     claim.buyerAddress for the x402-receipt branch — this function only
//     resolves who the chain itself says authorized the transfer.
//  3. It does not change computeClaimId(), the signing procedure, or any
//     existing schema field. Purely additive, read-only, new file.
//
// FAIL-CLOSED ON AMBIGUITY, same discipline as receipt-authorization.ts's
// openAuthorizationCommitment(): a transaction that batches more than one
// transferWithAuthorization call emits more than one AuthorizationUsed event,
// and guessing which one applies to a given claim would turn "we could not
// tell" into a false answer. `expectedAsset` narrows to the token contract the
// caller is actually checking.
//
// `expectedAsset` IS REQUIRED, not optional (hardened 11 nov 2026, al-Mustamil
// adversarial review). `AUTHORIZATION_USED_TOPIC0` is just
// keccak256("AuthorizationUsed(address,bytes32)") — an ordinary event
// signature, not a cryptographically unique marker of EIP-3009 specifically.
// Any contract that happens to define an event with that same name and
// argument types produces the identical topic0. Precisely the transactions
// this function exists to look at — sponsor/paymaster/router-routed, so
// usually a batched multicall — are exactly the shape where a second,
// unrelated contract call could sit in the same transaction. Without a
// required expectedAsset, a single matching log from ANY contract would have
// been accepted as FOUND with no check that it came from a real token
// contract at all. Requiring the caller to name the asset it is actually
// verifying against closes that silently-trusted path instead of leaving it
// as an undocumented assumption.

import { ethers } from "ethers";
import { ETH_ADDRESS_RE } from "./schema.js";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_TIMEOUT_MS = 15_000;

// keccak256("AuthorizationUsed(address,bytes32)"), derived live via ethers.id(),
// not memorized — same discipline as AUTHORIZATION_STATE_SELECTOR in
// agent-receipt-verify/src/eip3009-nonce-check.mjs:
//   node -e "import('ethers').then(e => console.log(e.id('AuthorizationUsed(address,bytes32)')))"
export const AUTHORIZATION_USED_TOPIC0 = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";

export interface ResolveAuthorizerOptions {
  rpcUrl: string | ethers.FetchRequest;
  /** The chain this transaction is claimed to be on. Checked against the rpc's own eth_chainId, never assumed. */
  expectedChainId: bigint | number;
  /** The token contract this check is actually about. Required — see the module header comment on why an optional asset would silently trust any contract's matching event. */
  expectedAsset: string;
  timeoutMs?: number;
}

export type ResolveAuthorizerResult =
  | { outcome: "FOUND"; authorizer: string; nonce: string; asset: string }
  | { outcome: "NOT_FOUND"; reason: string }
  | { outcome: "AMBIGUOUS"; reason: string; candidateCount: number }
  | { outcome: "NOT_MEASURED"; reason: string };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`rpc call timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Decode the AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)
 * event's two indexed topics. `authorizer` is a 32-byte, left-zero-padded word;
 * the address is its last 20 bytes.
 */
function decodeAuthorizationUsedTopics(authorizerTopic: string, nonceTopic: string): { authorizer: string; nonce: string } {
  const authorizer = ethers.getAddress("0x" + authorizerTopic.slice(-40));
  return { authorizer, nonce: nonceTopic.toLowerCase() };
}

/**
 * Given only a transaction hash, resolve the real EIP-3009 authorizer by
 * reading the AuthorizationUsed event the token contract itself emitted —
 * never by reading the transaction's own `from` field, which is the relayer
 * for a sponsored/paymaster-routed transaction, not the buyer.
 */
export async function resolveAuthorizerFromTransaction(
  txHash: string,
  opts: ResolveAuthorizerOptions,
): Promise<ResolveAuthorizerResult> {
  const { rpcUrl, expectedChainId, expectedAsset, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  if (!TX_HASH_RE.test(txHash)) {
    return { outcome: "NOT_MEASURED", reason: "txHash must be a 0x-prefixed 32-byte transaction hash" };
  }
  if (!ETH_ADDRESS_RE.test(expectedAsset)) {
    return { outcome: "NOT_MEASURED", reason: "expectedAsset must be a 0x-prefixed 20-byte address" };
  }
  // Validated BEFORE any rpc call, same reasoning as the two checks above
  // (al-Mustamil adversarial review, 11 nov 2026): a bare `BigInt(expectedChainId)`
  // throws uncaught on a non-numeric string, NaN, a float, null or undefined —
  // measured directly (`BigInt('base')`, `BigInt(NaN)`, `BigInt(null)` all
  // throw; `BigInt('')` silently becomes 0n instead, which is caught by the
  // "must be a positive integer" check below, not by this one). The one job
  // this function has is to never crash and never guess, so a malformed
  // caller input is NOT_MEASURED, exactly like a malformed txHash.
  let normalizedChainId: bigint;
  try {
    normalizedChainId = BigInt(expectedChainId);
  } catch {
    return { outcome: "NOT_MEASURED", reason: `expectedChainId is not a valid integer: ${String(expectedChainId)}` };
  }
  if (normalizedChainId <= 0n) {
    return { outcome: "NOT_MEASURED", reason: `expectedChainId must be a positive integer, got ${String(expectedChainId)}` };
  }

  // Constructing the provider can itself throw synchronously on a malformed
  // rpcUrl (measured directly: `new ethers.JsonRpcProvider(12345)` and
  // `new ethers.JsonRpcProvider({})` both throw "url.clone is not a function",
  // before any network call happens) — wrapped for the same reason as every
  // other input check here: a caller mistake must come back as NOT_MEASURED,
  // never an uncaught exception.
  let provider: ethers.JsonRpcProvider;
  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
  } catch (e) {
    return { outcome: "NOT_MEASURED", reason: `rpcUrl is not usable: ${(e as Error).message}` };
  }

  let actualChainId: bigint;
  try {
    const network = await withTimeout(provider.getNetwork(), timeoutMs);
    actualChainId = network.chainId;
  } catch (e) {
    return { outcome: "NOT_MEASURED", reason: `rpc unavailable or timed out: ${(e as Error).message}` };
  }
  if (actualChainId !== normalizedChainId) {
    return {
      outcome: "NOT_MEASURED",
      reason: `rpc is on chain ${actualChainId}, expected ${normalizedChainId} — refusing to answer about the wrong chain`,
    };
  }

  let receipt: ethers.TransactionReceipt | null;
  try {
    receipt = await withTimeout(provider.getTransactionReceipt(txHash), timeoutMs);
  } catch (e) {
    return { outcome: "NOT_MEASURED", reason: `rpc unavailable or timed out: ${(e as Error).message}` };
  }
  if (!receipt) {
    return { outcome: "NOT_FOUND", reason: "no transaction receipt found for this hash on this chain (unmined, dropped, or wrong chain)" };
  }
  // A reverted transaction's state changes, event emissions included, are
  // rolled back — it will have zero AuthorizationUsed logs regardless, but a
  // named reason here is clearer than letting it fall through as a bare
  // zero-candidates NOT_FOUND.
  if (receipt.status === 0) {
    return { outcome: "NOT_FOUND", reason: "transaction reverted; no authorization could have been consumed" };
  }

  const candidates = receipt.logs.filter(
    (log) => log.topics[0]?.toLowerCase() === AUTHORIZATION_USED_TOPIC0 && log.address.toLowerCase() === expectedAsset.toLowerCase(),
  );

  if (candidates.length === 0) {
    return { outcome: "NOT_FOUND", reason: "no AuthorizationUsed event for expectedAsset in this transaction's logs" };
  }
  if (candidates.length > 1) {
    // Still possible even with expectedAsset fixed: the same token contract can
    // emit more than one AuthorizationUsed event in one transaction (e.g. two
    // separate transferWithAuthorization calls batched together). Fail closed
    // rather than picking one.
    return {
      outcome: "AMBIGUOUS",
      reason: "more than one AuthorizationUsed event for expectedAsset in this transaction, cannot tell which one this claim is about",
      candidateCount: candidates.length,
    };
  }

  const log = candidates[0]!;
  const authorizerTopic = log.topics[1];
  const nonceTopic = log.topics[2];
  if (!authorizerTopic || !nonceTopic) {
    return { outcome: "NOT_MEASURED", reason: "AuthorizationUsed log is missing an indexed topic — malformed or non-standard emitter" };
  }
  const { authorizer, nonce } = decodeAuthorizationUsedTopics(authorizerTopic, nonceTopic);
  return { outcome: "FOUND", authorizer, nonce, asset: log.address };
}
