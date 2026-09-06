// completeness.ts — detect (never prevent) a host that hides claims.
//
// Background, in one paragraph: get_delivery_history is served by whoever runs
// this installation, and in the general case that party is not trusted (see
// DECISIONS.md D-005/D-006). Every claim it shows is individually authentic
// (signature re-verified on read since the 2026-09-06 fix in ledger.ts), but
// nothing in a single flat answer proves the SET is complete. A host could
// return every positive claim and silently drop the negative ones. There is
// no way to prove completeness directly from one answer — that is a real
// impossibility, not a gap we forgot to close (confirmed against the
// Certificate Transparency literature and 2024-2026 transparency-log research;
// even CT leans on external monitors, not on a proof inside the log).
//
// What IS possible is to make an omission LEAVE A TRACE. `priorClaimId`
// (schema.ts) chains each buyer's successive claims about one seller: claim N
// carries the claimId of that buyer's claim N-1 about the same seller, inside
// the signed content, so the host cannot strip or alter it. This function
// reads a set of claims (already filtered to one seller by getDeliveryHistory)
// and asks: does any shown claim point back to a prior claim that is NOT in
// the set? If so, the host either hid that prior claim or it lives on another
// installation — either way it is a concrete, checkable signal, not a vibe.
//
// WHO COMPUTES THIS, AND WHY IT IS THE WHOLE POINT: the report this function
// produces is DERIVED data, not signed. The trust does NOT live in the report;
// it lives in the `priorClaimId` links, which sit inside each claim's signed
// content and so cannot be forged or stripped by a host. A reader who does NOT
// run this installation must therefore recompute this report LOCALLY, by
// calling analyzeCompleteness() themselves over the returned claims (each of
// which they independently verify with verifyClaim()). The `completeness` field
// that get_delivery_history returns is only a convenience for the honest /
// self-hosted case: a malicious host can just put chainConsistent:true in it
// and still omit claims, because it controls its own response. Trusting the
// field from an untrusted host is worth exactly as much as trusting that host;
// recomputing it from the signed claims is the part with teeth. Stated again in
// COMPLETENESS_NOTE, the tool description, README and DECISIONS.md D-006.
//
// HONEST BOUNDARY, stated in code so it is never oversold downstream:
//   - Catches (when recomputed locally, see above): a hidden claim in the
//     MIDDLE of a buyer's chain (the next link dangles).
//   - Does NOT catch: a hidden MOST-RECENT claim (a tail truncation leaves no
//     dangling reference), nor a hidden ENTIRE buyer (no link to dangle from a
//     chain you were shown zero links of). Those need the external witnesses
//     no schema field can replace: the buyer's own retained copy and the
//     on-chain payment record. This function never claims otherwise.
//   - A dangling reference is NOT proof of dishonesty: the prior claim may
//     simply have been recorded on a DIFFERENT installation (the D-005
//     scenario). possibleOmissions means "look closer", not "the host lied".

import type { DeliveryClaim } from "./schema.js";

/** A shown claim whose priorClaimId points to a claim absent from the result. */
export interface CompletenessGap {
  /** The buyer whose chain has the gap (lower-cased). */
  buyerAddress: string;
  /** The claimId that was referenced as a prior link but is not in the result. */
  missingPriorClaimId: string;
  /** The claimId of the shown claim that points back to the missing one. */
  referencedBy: string;
}

/** A priorClaimId referenced by more than one shown claim from the same buyer. */
export interface CompletenessFork {
  buyerAddress: string;
  priorClaimId: string;
  /** The claimIds of the shown claims that all point back to the same prior. */
  claimIds: string[];
}

export interface CompletenessReport {
  /**
   * true only when every shown claim's priorClaimId resolves to another shown
   * claim (no dangling back-references) AND no prior is referenced twice (no
   * forks). false means the shown set is not a clean, complete view of every
   * chain it contains: a middle claim is missing (possibleOmissions) OR a
   * buyer forked their own chain (forks). Those two are different things,
   * deliberately collapsed into one boolean only as a quick "all clear" flag,
   * so ALWAYS read possibleOmissions vs forks to know which fired: a fork is a
   * BUYER-side anomaly and says nothing about the host hiding anything.
   * NOTE: true does NOT mean "you were shown everything" — a hidden tail or a
   * hidden whole-buyer chain still passes. And this whole report is only
   * trustworthy if YOU computed it; see this module's header. See D-006.
   */
  chainConsistent: boolean;
  /** Concrete "a claim may be hidden here" signals: a link points at a claim not shown. */
  possibleOmissions: CompletenessGap[];
  /** Forks: an honest single-writer chain never has two claims sharing one prior. */
  forks: CompletenessFork[];
  /** A fixed, factual sentence explaining what this report does and does not prove. */
  note: string;
}

const COMPLETENESS_NOTE =
  "This report is DERIVED, not signed. If you did not run this installation yourself, do NOT trust this field: recompute it locally with " +
  "analyzeCompleteness() over the returned claims, whose priorClaimId links ARE signed and cannot be forged or stripped by a host. " +
  "chainConsistent=true (when you recompute it) means every shown claim's priorClaimId links to another shown claim, so no MIDDLE claim was " +
  "hidden from any chain present here. It does NOT prove you were shown everything: a host can still hide a buyer's most recent claim, or an " +
  "entire buyer, without breaking any link. A dangling reference (possibleOmissions) can also be innocent: the prior claim may just have been " +
  "recorded on a different installation (see D-005). For real assurance, cross-check against the buyer's own retained copy and the on-chain " +
  "payment (settlementRef). See DECISIONS.md D-006.";

function lower(s: string): string {
  return s.toLowerCase();
}

/**
 * Analyze the per-buyer, per-seller claim chains in a set of claims (already
 * scoped to one seller by getDeliveryHistory) for hidden-middle-claim and
 * fork signals. Pure and offline: no network, no ledger access, operates only
 * on the claims handed in. Safe on an empty set (reports consistent).
 *
 * ASSUMES its inputs are already signature-verified and de-duplicated (which
 * is true for everything getDeliveryHistory feeds it: the read path in
 * ledger.ts re-verifies every claim and appendClaim rejects duplicate
 * claimIds). Because claimId is a content hash, a self-referencing or cyclic
 * priorClaimId is cryptographically unconstructible and cross-buyer claimId
 * collisions are impossible, so those degenerate shapes are not defended
 * against here. If you ever call this on RAW, unverified claims, verify them
 * first — this function trusts that claimId really is the content hash.
 */
export function analyzeCompleteness(claims: DeliveryClaim[]): CompletenessReport {
  const presentIds = new Set<string>();
  for (const c of claims) presentIds.add(lower(c.claimId));

  const possibleOmissions: CompletenessGap[] = [];
  // Per-buyer map of priorClaimId -> claimIds that reference it, to find forks.
  const referencesByBuyer = new Map<string, Map<string, string[]>>();

  for (const c of claims) {
    if (c.priorClaimId === undefined) continue; // genesis link, nothing to check
    const prior = lower(c.priorClaimId);
    const buyer = lower(c.buyerAddress);

    if (!presentIds.has(prior)) {
      possibleOmissions.push({ buyerAddress: buyer, missingPriorClaimId: c.priorClaimId, referencedBy: c.claimId });
    }

    let byPrior = referencesByBuyer.get(buyer);
    if (!byPrior) {
      byPrior = new Map<string, string[]>();
      referencesByBuyer.set(buyer, byPrior);
    }
    const refs = byPrior.get(prior);
    if (refs) refs.push(c.claimId);
    else byPrior.set(prior, [c.claimId]);
  }

  const forks: CompletenessFork[] = [];
  for (const [buyerAddress, byPrior] of referencesByBuyer) {
    for (const [priorClaimId, claimIds] of byPrior) {
      if (claimIds.length > 1) forks.push({ buyerAddress, priorClaimId, claimIds });
    }
  }

  return {
    chainConsistent: possibleOmissions.length === 0 && forks.length === 0,
    possibleOmissions,
    forks,
    note: COMPLETENESS_NOTE,
  };
}
