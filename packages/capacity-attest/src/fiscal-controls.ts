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
// "none", a number means "human, above this amount"; this COLLAPSES the post's five
// approval-source categories into just those two — policy-engine/allowance/budget-rule
// are not separately representable yet, a real narrowing, not an equivalence),
// spend_cap, charge_evidence, audit_trail, revocation_path, next_safe_threshold.
// charge_evidence and audit_trail both point at tools we already shipped
// (get_delivery_history / the Reputation Registry itself), not new code.
// next_safe_threshold is honestly null for both tools below — we have no
// auto-raise-the-cap mechanism, and this field exists so that absence is a stated
// "not yet", never a silent gap.
//
// v2 (13 nov 2026, YE-YI7's own independent test of v1 plus a second, independent
// strategic read): v1's spend_cap_per_hour was a bare number with no unit. YE-YI7's
// own words: "a client should not read this as a monetary ceiling on its own
// purchases" — it counts PAID ATTEMPTS (reservations that reached settlement),
// not proven on-chain successes, and it is in-memory, resetting on restart, scoped
// to this one server process. v1 stated none of that explicitly. spend_cap is now a
// structured, nullable object so every one of those facts has to be filled in, not
// implied or forgotten.
const SpendCapSchema = z.object({
  // "paid-attempts": the server allows at most N calls past the point of charging,
  // regardless of whether each one's own on-chain action then succeeds -- this
  // package's actual current shape for every tool that has a cap at all.
  // "currency": a real ceiling on an asset amount, atomic units of a named asset --
  // not implemented by anything in this package today; the enum exists so a FUTURE
  // tool with a genuine monetary ceiling has a correct value to report, instead of
  // every cap in existence being forced into the "attempts" shape by omission.
  unit: z.enum(["paid-attempts", "currency"]),
  max_per_window: z.number().positive(),
  window_seconds: z.number().positive(),
  // "server-instance": this one process's own in-memory count, the honest answer for
  // every capped tool in this package today -- NOT a cap shared across however many
  // instances of this server might be deployed behind a load balancer, despite v1's
  // "global" name implying otherwise (YE-YI7, 13 nov 2026: "de huidige teller bestaat
  // uit arrays in het geheugen van één Node.js-proces... dat is niet hetzelfde als
  // één limiet over alle instanties"). "all-instances" is for a future durable,
  // shared-storage implementation; "per-caller" for a future per-identity cap.
  scope: z.enum(["server-instance", "all-instances", "per-caller"]),
  persistence: z.enum(["in-memory", "durable"]),
  reset_on_restart: z.boolean(),
  // Scenario found 12 nov 2026 (koning): was this cap enforced BEFORE the caller is
  // charged, or only after? A caller losing a race against a cap-checked-only-after-
  // settlement design pays for nothing. true is a real claim about enforcement
  // order, not aspiration — see reserveFeedbackPublishSlot in http-server.ts.
  reservation_before_settlement: z.boolean(),
  // How long a reservation survives if settlement never follows (the caller backs
  // out, or the facilitator fails). Exists so "the cap resets on restart" and "a
  // reservation has its own, separate, much shorter TTL" are not conflated — see
  // FEEDBACK_RESERVATION_MS in http-server.ts; null when no reservation step exists.
  pending_reservation_ttl_seconds: z.number().positive().nullable(),
});
export type SpendCap = z.infer<typeof SpendCapSchema>;

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
  // Found by a second, independent strategic read, 13 nov 2026: "true" alone invites
  // reading HSM/TEE-grade isolation into a claim that, today, means a private key
  // read from an env var into an in-process ethers.Wallet — real isolation from
  // CALLER funds and CALLER influence, but not from this process's own memory. null
  // when signer_isolation is null (nothing to describe); required whenever
  // signer_isolation is true or false, so the claim's actual basis is never left
  // for a reader to assume.
  signer_custody: z.string().nullable(),
  spend_cap: SpendCapSchema.nullable(),
  human_approval_threshold: z.number().positive().nullable(),
  revocation_path: z.string(),
}).superRefine((control, ctx) => {
  // The header comment above states this as the rule; without enforcing it here, a
  // future entry could set signer_isolation: true with signer_custody: null and the
  // schema would happily accept exactly the unproven HSM/TEE-grade implication this
  // field exists to prevent. Checked with a refinement, not a second nullable field
  // pair, so there is exactly one place this invariant can silently rot.
  if (control.signer_isolation !== null && control.signer_custody === null) {
    ctx.addIssue({ code: "custom", path: ["signer_custody"], message: "required (as a non-null string) whenever signer_isolation is true or false, not null" });
  }
});
export type FiscalControl = z.infer<typeof FiscalControlSchema>;

export const FiscalControlsDocumentSchema = z.object({
  version: z.literal("2"),
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
