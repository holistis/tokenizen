// fiscal-controls.ts — a small, honest answer to a gap found 12 nov 2026 in
// modelcontextprotocol/registry discussion #1300 ("Optional fiscal-safety
// metadata for paid MCP servers"): nobody publishes, as STATIC, pre-connection
// metadata, which actual safety controls a paid server has around its own
// money-moving tools — before a caller ever makes a 402-triggering call.
//
// WHAT ALREADY EXISTS, AND WHY THIS IS NOT IT:
//   - x402's own PaymentRequired response (accepts[]) describes PRICE
//     (scheme/network/asset/maxAmountRequired/payTo/maxTimeoutSeconds), only
//     visible AFTER a caller has already tried the paid call once.
//   - @x402/extensions/bazaar (see bazaar-discovery.ts) describes WHAT a
//     tool does (name, description, input/output schema) for catalogue
//     search. Checked directly in its own .d.ts (2026-11-12): it carries no
//     spend-cap, signer-isolation, or approval field at all.
//   - Google AP2 (ap2-protocol.org) covers the BUYER's side — a signed
//     mandate the agent brings with it (budget, allowed payees, expiry).
//     Nothing here describes what a SELLER's own server enforces.
// This module is the SELLER-side piece: what does THIS server's own
// wallet/signer risk, and what bounds that risk, stated before a caller ever
// pays. Covers all 7 fields #1300's own opening post proposed — see the
// field-by-field comment on FiscalControlSchema below for the exact mapping,
// and which ones currently have a real, non-null value versus an honest null.
//
// WHY DERIVED, NOT HAND-WRITTEN: every field below reads an existing
// constant or gate that already controls real behavior in http-server.ts
// (recordDeliveryPaid, publishFeedbackPaid, PUBLISH_FEEDBACK_MAX_PER_HOUR).
// Same reasoning bazaar-discovery.ts documents for its own schema derivation
// — a hand-typed second copy of a true value drifts the moment the real
// value changes and nobody remembers to update the copy.
import { z } from "zod/v4";

// The field names below are deliberately matched 1:1 to the 7 fields proposed in
// modelcontextprotocol/registry#1300's own opening post, so a reader can check our
// coverage directly against that proposal, not just against our own paraphrase of it:
// paid_action_surface, approval_source (human_approval_threshold here — null means
// "none", a number means "human, above this amount", same options the post itself
// lists), spend_cap (spend_cap_per_hour/scope), charge_evidence, audit_trail,
// revocation_path, next_safe_threshold. Added 12 nov 2026 after re-reading the
// original post rather than relying on a paraphrase; charge_evidence and audit_trail
// both point at a tool we already shipped (get_delivery_history / the Reputation
// Registry itself), not new code. next_safe_threshold is honestly null for both
// tools below — we have no auto-raise-the-cap mechanism, and this field exists so
// that absence is a stated "not yet", never a silent gap.
export const FiscalControlSchema = z.object({
  tool: z.string(),
  paid: z.literal(true),
  paid_action_surface: z.string(),
  charge_evidence: z.string().nullable(),
  audit_trail: z.string().nullable(),
  next_safe_threshold: z.string().nullable(),
  // Found by muraqib-al-khasm's adversarial review, 12 nov 2026: a plain
  // boolean cannot distinguish "no server-held signer at all" (record_delivery
  // — nothing to isolate) from "a signer exists but is NOT isolated" (a
  // hypothetical future tool sharing a key or letting a caller influence it)
  // — both would have had to report false, collapsing exactly the question
  // this field exists to answer. null = no signer held; false = a signer is
  // held but not isolated; true = isolated.
  signer_isolation: z.boolean().nullable(),
  spend_cap_per_hour: z.number().positive().nullable(),
  spend_cap_scope: z.enum(["global", "per-caller"]).nullable(),
  // Scenario found 12 nov 2026 (koning): was this cap enforced BEFORE the
  // caller is charged, or only after? A caller losing a race against a
  // cap-checked-only-after-settlement design pays for nothing. true here is
  // a real claim about enforcement order, not aspiration — see
  // reserveFeedbackPublishSlot in http-server.ts.
  reservation_before_settlement: z.boolean().nullable(),
  human_approval_threshold: z.number().positive().nullable(),
  revocation_path: z.string(),
});
export type FiscalControl = z.infer<typeof FiscalControlSchema>;

export const FiscalControlsDocumentSchema = z.object({
  version: z.literal("1"),
  controls: z.array(FiscalControlSchema),
});
export type FiscalControlsDocument = z.infer<typeof FiscalControlsDocumentSchema>;

/**
 * Validates an arbitrary fiscal-controls document (this server's own, or a
 * third party's) against the schema above. Exported so a stranger — exactly
 * the audience this file exists for — can check any server's claim, not
 * just ours, the same "trust the schema, not the publisher" posture
 * bazaar-discovery.ts's own validateDiscoveryExtension already uses.
 */
export function validateFiscalControls(candidate: unknown): { valid: boolean; errors?: string[] } {
  const parsed = FiscalControlsDocumentSchema.safeParse(candidate);
  if (parsed.success) return { valid: true };
  return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}
