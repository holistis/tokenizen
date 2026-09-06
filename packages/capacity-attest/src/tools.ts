// tools.ts — the two tools' actual logic, kept separate from the MCP
// transport wiring in index.ts (same separation-of-concerns pattern as
// al-yad-mcp-server's companion-client.ts vs. index.ts). This lets tests
// and examples/demo.ts call the real logic directly without spinning up a
// stdio JSON-RPC transport.

import { StrictDeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";
import { appendClaim, claimsForSeller } from "./ledger.js";
import { analyzeCompleteness, type CompletenessReport } from "./completeness.js";

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

/**
 * `scope` and `note` are a factual disclosure, not a judgment: they say
 * where this data came from, never how trustworthy the seller is. Adding a
 * quality/confidence field here would be exactly the score this package
 * refuses to compute (see "Wat dit NIET is" in README.md) — these two exist
 * to close two different, real gaps, both discovered from the same root
 * cause: without them, an empty `claims` array is indistinguishable from
 * "this seller has a clean record" when it may just mean "no claims have
 * been recorded on THIS ledger" (gap 1, DECISIONS.md D-005), and a caller
 * has no way to tell "the host showed everything it has" from "the host
 * showed a curated subset" (gap 2, DECISIONS.md D-006) — every claim that IS
 * shown has its own independently checkable signature (doubly true after the
 * 2026-09-06 fix in ledger.ts that made the read path itself re-verify that,
 * not just check shape), but nothing proves the SET shown is the full set
 * the host actually holds. A caller (human or agent) reading only
 * `count: 0`, or reading any count without this note, has no way to tell
 * either of those apart from a genuinely clean, complete record.
 */
export interface DeliveryHistoryResult {
  sellerAddress: string;
  count: number;
  claims: DeliveryClaim[];
  scope: "local-ledger";
  note: string;
  // Per-buyer chain analysis over exactly the claims returned above. Turns the
  // abstract "can a host hide claims" worry into a concrete, checkable signal:
  // possibleOmissions is non-empty when a shown claim links back to a claim
  // that is NOT in this result. See completeness.ts for the honest boundary
  // (it catches hidden MIDDLE claims, not a hidden tail or a hidden whole
  // buyer) and DECISIONS.md D-006.
  completeness: CompletenessReport;
}

const LOCAL_LEDGER_NOTE =
  "This reflects only claims recorded on this installation's local ledger (see CAPACITY_ATTEST_DATA_DIR in README.md). " +
  "A different installation may hold other claims against the same sellerAddress that this call cannot see. " +
  "An empty or short history does not mean the seller has a clean record elsewhere: it may just mean no claims " +
  "have been recorded here yet. Separately: every claim shown here has an independently checkable signature, but " +
  "this tool cannot prove the operator of this installation has shown you every claim it actually holds — " +
  "completeness rests on that operator's honesty, not on cryptography. For stronger assurance about one specific " +
  "claim, ask the buyer who filed it to share their own signed copy of it directly.";

/**
 * Every known, signature-verified claim recorded against sellerAddress in
 * THIS installation's ledger, oldest first. Purely factual — no aggregate
 * score, rating, or reputation judgment is computed here; see README.md
 * "Wat dit NIET is". This is the logic behind the `get_delivery_history` MCP
 * tool.
 *
 * "Known" is scoped to this ledger, not globally known — see
 * DeliveryHistoryResult's own comment and packages/capacity-attest/DECISIONS.md
 * (D-005) for why that distinction is load-bearing, not pedantic.
 *
 * Async to match claimsForSeller()'s now-async signature (see ledger.ts).
 */
export async function getDeliveryHistory(sellerAddress: string): Promise<DeliveryHistoryResult> {
  const claims = await claimsForSeller(sellerAddress);
  return {
    sellerAddress,
    count: claims.length,
    claims,
    scope: "local-ledger",
    note: LOCAL_LEDGER_NOTE,
    completeness: analyzeCompleteness(claims),
  };
}
