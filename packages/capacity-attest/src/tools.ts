// tools.ts — the two tools' actual logic, kept separate from the MCP
// transport wiring in index.ts (same separation-of-concerns pattern as
// al-yad-mcp-server's companion-client.ts vs. index.ts). This lets tests
// and examples/demo.ts call the real logic directly without spinning up a
// stdio JSON-RPC transport.

import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";
import { appendClaim, claimsForSeller } from "./ledger.js";

export type RecordDeliveryResult = { ok: true; claimId: string } | { ok: false; reason: string };

/**
 * Validate the claim's schema, verify its signature (must recover to
 * buyerAddress), and persist it to the append-only ledger. This is the
 * logic behind the `record_delivery` MCP tool.
 */
export function recordDelivery(input: unknown): RecordDeliveryResult {
  const parsed = DeliveryClaimSchema.safeParse(input);
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
    appendClaim(claim);
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
 */
export function getDeliveryHistory(sellerAddress: string): DeliveryHistoryResult {
  const claims = claimsForSeller(sellerAddress);
  return { sellerAddress, count: claims.length, claims };
}
