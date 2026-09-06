// discovery.ts — cross-installation claim discovery (D-005).
//
// THE PROBLEM (DECISIONS.md D-005): a buyer's claim about a seller lives only
// in that buyer's local ledger. A different buyer, on a separate installation,
// cannot see it via get_delivery_history before deciding to pay the same
// seller. get_delivery_history is, by construction, local-only.
//
// THE INSIGHT that makes findability solvable WITHOUT a trusted index: our
// claims are already self-verifying (claimId is a content hash, signature
// recovers to buyerAddress). So discovery does not need anyone to be trusted.
// Claims can be published anywhere, and whoever discovers them re-verifies each
// one locally. A source that injects a forged claim is caught by verifyClaim;
// a source that omits claims is the D-006 completeness problem, unchanged and
// carried over here (analyzeCompleteness still runs on the aggregate). So
// findability and verification compose cleanly: gather from anywhere untrusted,
// verify everything locally.
//
// WHAT THIS MODULE IS: the trustless client-side aggregation. Given several
// independent SOURCES (the local ledger, and any host-independent substrate a
// buyer chooses to also read), it fetches claims for a seller from each,
// de-duplicates by claimId, RE-VERIFIES every single one regardless of which
// source produced it, and runs the completeness analysis over the surviving
// set. The result carries per-source accounting so the caller can see what
// each source contributed and what was rejected.
//
// WHAT THIS MODULE IS NOT, stated so it is never oversold:
//   - It does not run, host, or endorse any index. A `ClaimSource` is an
//     UNTRUSTED input; the trust comes entirely from re-verifying each claim.
//   - It does not solve completeness. If a source silently omits claims, this
//     cannot invent them; analyzeCompleteness carries over the same honest
//     detection/limits from D-006 (catches a hidden middle claim in a chain
//     it can see, not a hidden tail or a hidden whole buyer).
//   - The production substrate (EAS on Base, ERC-8004) is deliberately NOT
//     wired here. That needs gas, a live chain, and a real integrator; see
//     DECISIONS.md D-005/D-012. This module is the substrate-agnostic seam
//     plus a reference in-memory/static source for simulation and tests.

import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";
import { verifyClaim } from "./signing.js";
import { claimsForSeller } from "./ledger.js";
import { analyzeCompleteness, type CompletenessReport } from "./completeness.js";

// Bound the work a single untrusted source can force. Defense against VOLUME
// (a source returning millions of entries, or an attacker generating millions
// of genuinely-valid self-signed claims), not against Sybil (see the note).
// Overridable per call via DiscoverOptions.
const MAX_CLAIMS_PER_SOURCE = 10_000;
const MAX_TOTAL_CLAIMS = 50_000;

/**
 * An untrusted place claims about a seller can be discovered: the local
 * ledger, a shared file, an EAS query on Base, another installation's public
 * endpoint, an IPFS/git convention, etc. `fetchForSeller` may return anything,
 * including forged or junk claims; discoverDeliveryHistory re-verifies all of
 * them, so a source is never trusted, only read.
 */
export interface ClaimSource {
  /** Human label for per-source accounting in the result. */
  name: string;
  /** Return whatever this source believes are claims about sellerAddress. Untrusted. */
  fetchForSeller(sellerAddress: string): Promise<DeliveryClaim[]>;
}

/** Per-source accounting: what a source returned, and how much survived verification. */
export interface SourceReport {
  name: string;
  /** How many entries the source returned (before any cap). */
  fetched: number;
  /** How many verified, concerned this seller, AND were not already contributed by an earlier source. */
  accepted: number;
  /** How many FAILED verifyClaim (forged/tampered/junk). Cryptographic failures only. */
  rejected: number;
  /** How many verified fine but were about a DIFFERENT seller (honest-but-off-topic, not a forgery). */
  wrongSeller: number;
  /** How many verified but were duplicates of a claim already seen (same claimId). */
  duplicates: number;
  /** Set when the source returned more than the per-source cap; only the first cap entries were examined. */
  truncated?: boolean;
  /** Set only when fetchForSeller threw OR resolved to a non-array; the source is skipped, others still run. */
  error?: string;
}

/** Optional per-call limits, mainly so tests can exercise the caps cheaply; production uses the defaults above. */
export interface DiscoverOptions {
  maxClaimsPerSource?: number;
  maxTotalClaims?: number;
}

export interface AggregatedHistory {
  sellerAddress: string;
  /** Distinct, verified claims for this seller across all sources, oldest first. */
  count: number;
  claims: DeliveryClaim[];
  /** Per-source contribution accounting. */
  sources: SourceReport[];
  /** Completeness analysis over the aggregated set (same meaning + limits as D-006). */
  completeness: CompletenessReport;
  /** Fixed, factual note about what aggregation does and does not guarantee. */
  note: string;
}

const DISCOVERY_NOTE =
  "Aggregated from independent, UNTRUSTED sources. Every claim shown was re-verified locally (claimId recomputed and " +
  "signature recovered to buyerAddress), so a source cannot inject a forged claim. What verification proves is narrow: " +
  "it proves AUTHORSHIP of the content, NOT that a real payment or delivery happened (settlementRef is not checked " +
  "on-chain here) and NOT that buyers are distinct. So a single keypair can still flood valid positive claims to " +
  "inflate a seller, or valid negatives to grief one; volume and Sybil are not addressed by aggregation. This solves " +
  "findability across installations, NOT completeness: a source can still omit claims, and no aggregation can invent " +
  "what no source reveals. The completeness field carries the same D-006 detection and limits over the aggregate. Add " +
  "more independent sources to raise the cost of a coordinated omission; it never reaches a proof. See DECISIONS.md D-005.";

function lower(s: string): string {
  return s.toLowerCase();
}

function timestampMs(claim: DeliveryClaim): number {
  return Date.parse(claim.timestamp);
}

/**
 * Trustless cross-installation aggregation. Reads a seller's claims from every
 * source, de-duplicates by claimId, re-verifies each one (dropping anything
 * that fails), and runs completeness over the survivors. No source is trusted;
 * a source that throws is recorded and skipped, never fatal.
 *
 * Order note: sources are processed in the order given, purely so per-source
 * `accepted`/`duplicates` accounting is deterministic (the first source to
 * carry a given claimId gets the `accepted` credit; later ones counting it as
 * a duplicate). The final `claims` array is sorted by timestamp regardless of
 * source order, so the aggregate itself does not depend on which source is
 * listed first.
 */
export async function discoverDeliveryHistory(
  sellerAddress: string,
  sources: ClaimSource[],
  opts: DiscoverOptions = {},
): Promise<AggregatedHistory> {
  const maxPerSource = opts.maxClaimsPerSource ?? MAX_CLAIMS_PER_SOURCE;
  const maxTotal = opts.maxTotalClaims ?? MAX_TOTAL_CLAIMS;
  const byId = new Map<string, DeliveryClaim>();
  const sourceReports: SourceReport[] = [];

  for (const source of sources) {
    let fetched: DeliveryClaim[];
    try {
      fetched = await source.fetchForSeller(sellerAddress);
    } catch (e) {
      sourceReports.push({ name: source.name, fetched: 0, accepted: 0, rejected: 0, wrongSeller: 0, duplicates: 0, error: (e as Error).message });
      continue;
    }
    // An untrusted source may RESOLVE (not reject) to anything, including a
    // non-array: malformed JSON from a real HTTP/EAS source, or a hostile one
    // trying to abort the whole aggregation. Treat that as a per-source error
    // and keep going. Without this guard the `for...of` below throws
    // "not iterable", rejects discoverDeliveryHistory entirely, and censors
    // every other source including the local ledger — defeating the very
    // fault-isolation this function promises.
    if (!Array.isArray(fetched)) {
      sourceReports.push({ name: source.name, fetched: 0, accepted: 0, rejected: 0, wrongSeller: 0, duplicates: 0, error: "source did not return an array" });
      continue;
    }

    let accepted = 0;
    let rejected = 0;
    let wrongSeller = 0;
    let duplicates = 0;
    // Bound the work this source can force: examine at most maxPerSource
    // entries, and stop growing the aggregate past maxTotal. A source that
    // returns more is marked `truncated` rather than allowed to exhaust
    // CPU/memory on untrusted input.
    const limit = Math.min(fetched.length, maxPerSource);
    const truncated = fetched.length > maxPerSource;
    for (let i = 0; i < limit; i++) {
      if (byId.size >= maxTotal) break;
      const claim = fetched[i]!;
      // Re-verify EVERY claim, from EVERY source, no exceptions: this is the
      // entire trust model. A source is just bytes until verifyClaim passes.
      let verdict: ReturnType<typeof verifyClaim>;
      try {
        verdict = verifyClaim(claim);
      } catch {
        // computeClaimId can throw on pathological content (e.g. promisedSpec
        // past MAX_DEPTH); treat exactly like a failed verification.
        rejected++;
        continue;
      }
      if (!verdict.ok) {
        rejected++;
        continue;
      }
      // Valid, but about a DIFFERENT seller: honest-but-off-topic, tracked
      // separately from cryptographic rejections so an honest source that
      // simply returns other sellers' claims is not mislabeled as feeding
      // forgeries (case-insensitive, matching ledger semantics).
      if (lower(claim.sellerAddress) !== lower(sellerAddress)) {
        wrongSeller++;
        continue;
      }
      const key = lower(claim.claimId);
      if (byId.has(key)) {
        duplicates++;
        continue;
      }
      // Store the schema-parsed form so no unverified, attacker-attached
      // top-level key rides into the result. verifyClaim already proved the
      // content hashes to claimId; parsing strips anything outside the signed
      // shape. It cannot fail here (the claim already passed verifyClaim,
      // whose computeClaimId parses the same content), but guard anyway since
      // the input is untrusted.
      let parsed: DeliveryClaim;
      try {
        parsed = DeliveryClaimSchema.parse(claim);
      } catch {
        rejected++;
        continue;
      }
      byId.set(key, parsed);
      accepted++;
    }
    const report: SourceReport = { name: source.name, fetched: fetched.length, accepted, rejected, wrongSeller, duplicates };
    if (truncated) report.truncated = true;
    sourceReports.push(report);
  }

  const claims = [...byId.values()].sort((a, b) => timestampMs(a) - timestampMs(b));
  return {
    sellerAddress,
    count: claims.length,
    claims,
    sources: sourceReports,
    completeness: analyzeCompleteness(claims),
    note: DISCOVERY_NOTE,
  };
}

/**
 * A source backed by THIS installation's local ledger. This is the one source
 * that is already trusted in the sense that its own read path re-verifies, but
 * discoverDeliveryHistory re-verifies it anyway (harmless, keeps the trust
 * model uniform: no source is special).
 */
export function localLedgerSource(name = "local-ledger"): ClaimSource {
  return {
    name,
    fetchForSeller: (sellerAddress) => claimsForSeller(sellerAddress),
  };
}

/**
 * A source over a fixed, in-memory list of claims. Used to simulate a
 * host-independent substrate (a shared file, an EAS query result, another
 * installation's export) in tests and the discovery fixture, without a network
 * or a chain. Deliberately does NO verification itself, so the aggregation's
 * own verification is what the tests actually exercise.
 */
export function staticSource(name: string, claims: DeliveryClaim[]): ClaimSource {
  return {
    name,
    fetchForSeller: async (sellerAddress) => claims.filter((c) => lower(c.sellerAddress) === lower(sellerAddress)),
  };
}
