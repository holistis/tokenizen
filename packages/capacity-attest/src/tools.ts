// tools.ts — the two tools' actual logic, kept separate from the MCP
// transport wiring in index.ts (same separation-of-concerns pattern as
// al-yad-mcp-server's companion-client.ts vs. index.ts). This lets tests
// and examples/demo.ts call the real logic directly without spinning up a
// stdio JSON-RPC transport.

import { StrictDeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";
import { appendClaim, claimsForSeller } from "./ledger.js";

export type RecordDeliveryResult = { ok: true; claimId: string } | { ok: false; reason: string };

/**
 * Validate the claim's schema, verify its signature (must recover to
 * buyerAddress), and persist it to the append-only ledger. This is the
 * logic behind the `record_delivery` MCP tool.
 *
 * Async because appendClaim() is: its lock-contention retry awaits a real
 * timer instead of busy-waiting, so this function must be awaited by every
 * caller — an un-awaited call here would let the caller's next statement
 * run before the claim is actually locked/checked/written, reordering the
 * exact read-check-write sequence the lock exists to make atomic.
 */
export async function recordDelivery(input: unknown): Promise<RecordDeliveryResult> {
  // StrictDeliveryClaimSchema, not DeliveryClaimSchema: new claims must also
  // pass the ingest hardening of S-1..S-5 (see schema.ts). That schema is a
  // superset of the frozen one, so it never changes a claimId — it only
  // refuses input the frozen schema would have accepted. Historical ledger
  // lines are still read back through the FROZEN DeliveryClaimSchema in
  // ledger.ts, so a claim recorded before 0.2.0 with (say) a float in
  // promisedSpec stays readable and verifiable forever.
  // safeParse() is wrapped for the same reason verifyClaim() below is: the
  // ingest checks walk caller-supplied data, and hostile or merely odd input
  // (a cyclic object, a shared-reference graph) has already been shown to
  // throw from inside a zod check rather than return a failed parse. The
  // tool's contract is {ok:false, reason}, never an uncaught exception, so
  // every step that touches untrusted input belongs inside a try/catch.
  let parsed: ReturnType<typeof StrictDeliveryClaimSchema.safeParse>;
  try {
    parsed = StrictDeliveryClaimSchema.safeParse(input);
  } catch (e) {
    return { ok: false, reason: `invalid_claim: ${(e as Error).message}` };
  }
  if (!parsed.success) {
    return { ok: false, reason: `invalid_claim: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }

  const claim = parsed.data;
  let verdict: ReturnType<typeof verifyClaim>;
  try {
    verdict = verifyClaim(claim);
  } catch (e) {
    // computeClaimId() (called inside verifyClaim, before any signature is
    // even checked) can throw on pathological input, e.g. promisedSpec
    // nested past schema.ts's MAX_DEPTH. That must degrade to the tool's
    // normal error contract, not an uncaught exception.
    return { ok: false, reason: `invalid_claim: ${(e as Error).message}` };
  }
  if (!verdict.ok) {
    return { ok: false, reason: `signature_invalid: ${verdict.reason}` };
  }

  try {
    await appendClaim(claim);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  return { ok: true, claimId: claim.claimId };
}

export interface DeliveryHistoryResult {
  sellerAddress: string;
  count: number;
  claims: DeliveryClaim[];
}

/**
 * Every known, signature-verified claim recorded against sellerAddress,
 * oldest first. Purely factual — no aggregate score, rating, or reputation
 * judgment is computed here; see README.md "Wat dit NIET is". This is the
 * logic behind the `get_delivery_history` MCP tool.
 *
 * Async to match claimsForSeller()'s now-async signature (see ledger.ts).
 */
export async function getDeliveryHistory(sellerAddress: string): Promise<DeliveryHistoryResult> {
  const claims = await claimsForSeller(sellerAddress);
  return { sellerAddress, count: claims.length, claims };
}
