// discovery-fixture.ts — a public, reproducible fixture for cross-installation
// discovery (D-005), the companion to completeness-fixture.ts (D-006).
//
// It demonstrates, with claims you can rebuild from fixed test keys, that:
//   1. The gap is real: buyer B, reading only B's own installation, does not
//      see buyer A's claims about the same seller.
//   2. Discovery closes it: aggregating B's local ledger with a shared,
//      UNTRUSTED substrate (simulated here, EAS/ERC-8004 in production) makes
//      A's claims visible to B, and every one is re-verified locally.
//   3. It stays trustless: a malicious source's forged/tampered claims are
//      rejected, and claims about a different seller are filtered out.
//   4. It composes with D-006: a source that hides a MIDDLE claim in a chain
//      it otherwise reveals is still caught by the completeness analysis, now
//      across installations.
//
// Honest boundary, same as everywhere else: discovery is bounded by what
// sources reveal. It solves findability, not completeness. A source that omits
// a claim (a hidden tail, or a whole buyer) cannot be forced to reveal it; no
// aggregation invents what no source shows.
//
// Pure, offline, deterministic: fixed keys, fixed timestamps, no ledger, no
// network. Consumed by examples/discovery-fixture.ts and the discovery tests.

import { ethers } from "ethers";
import { signClaim } from "./signing.js";
import { type ClaimContent, type DeliveryClaim } from "./schema.js";
import { discoverDeliveryHistory, staticSource, type ClaimSource } from "./discovery.js";

// Two fixed TEST buyers on two notional installations, and one impostor.
// source: simulated (deterministic keys, not real identities).
export const BUYER_A = new ethers.Wallet("0x" + "a1".repeat(32));
export const BUYER_B = new ethers.Wallet("0x" + "b2".repeat(32));
const IMPOSTOR = new ethers.Wallet("0x" + "cc".repeat(32));

export const SELLER_X = "0x00000000000000000000000000000000000000aa";
const SELLER_Y = "0x00000000000000000000000000000000000000bb"; // a different seller, for the filter control
const EVIDENCE_HASH = "a".repeat(64);

async function sign(wallet: ethers.Wallet, content: ClaimContent): Promise<DeliveryClaim> {
  const { claimId, signature } = await signClaim(wallet, content);
  return { ...content, claimId, signature };
}

export interface DiscoveryFixture {
  a1: DeliveryClaim; // buyer A, seller X, yes (genesis)
  a2: DeliveryClaim; // buyer A, seller X, NO, priorClaimId a1 (A's negative claim)
  a3: DeliveryClaim; // buyer A, seller X, yes, priorClaimId a2
  b1: DeliveryClaim; // buyer B, seller X, yes (what B has locally)
  y1: DeliveryClaim; // buyer A, seller Y, yes (different seller, must be filtered out)
  forged: DeliveryClaim; // claims buyerAddress A, actually signed by impostor
  tampered: DeliveryClaim; // a1 with delivered flipped, claimId not recomputed
}

export async function buildDiscoveryFixture(): Promise<DiscoveryFixture> {
  const aBase = { sellerAddress: SELLER_X, buyerAddress: BUYER_A.address, assetType: "gpu-hours" as const, evidenceHash: EVIDENCE_HASH };
  const a1 = await sign(BUYER_A, { ...aBase, promisedSpec: "1x A100, 4h", delivered: "yes", settlementRef: "0x" + "a1".repeat(32), timestamp: "2026-01-01T00:00:00.000Z" });
  const a2 = await sign(BUYER_A, { ...aBase, promisedSpec: "1x A100, 8h", delivered: "no", settlementRef: "0x" + "a2".repeat(32), timestamp: "2026-02-01T00:00:00.000Z", priorClaimId: a1.claimId });
  const a3 = await sign(BUYER_A, { ...aBase, promisedSpec: "1x A100, 2h", delivered: "yes", settlementRef: "0x" + "a3".repeat(32), timestamp: "2026-03-01T00:00:00.000Z", priorClaimId: a2.claimId });
  const b1 = await sign(BUYER_B, { sellerAddress: SELLER_X, buyerAddress: BUYER_B.address, assetType: "gpu-hours", promisedSpec: "1x A100, 1h", delivered: "yes", evidenceHash: EVIDENCE_HASH, settlementRef: "0x" + "b1".repeat(32), timestamp: "2026-02-15T00:00:00.000Z" });
  const y1 = await sign(BUYER_A, { sellerAddress: SELLER_Y, buyerAddress: BUYER_A.address, assetType: "gpu-hours", promisedSpec: "other seller", delivered: "yes", evidenceHash: EVIDENCE_HASH, settlementRef: "0x" + "01".repeat(32), timestamp: "2026-01-15T00:00:00.000Z" });

  // forged: content claims buyerAddress = A, but signed by the impostor, so the
  // signature does not recover to A. verifyClaim must reject it.
  const forgedContent: ClaimContent = { sellerAddress: SELLER_X, buyerAddress: BUYER_A.address, assetType: "gpu-hours", promisedSpec: "forged", delivered: "yes", evidenceHash: EVIDENCE_HASH, settlementRef: "0x" + "de".repeat(32), timestamp: "2026-04-01T00:00:00.000Z" };
  const forgedSig = await signClaim(IMPOSTOR, forgedContent);
  const forged = { ...forgedContent, ...forgedSig };

  // tampered: take a genuine a1 and flip delivered without recomputing claimId.
  const tampered = { ...a1, delivered: "no" as const };

  return { a1, a2, a3, b1, y1, forged, tampered };
}

export type ControlKind = "GREEN" | "RED";
export interface Control {
  id: string;
  kind: ControlKind;
  what: string;
  expected: string;
  actual: string;
  pass: boolean;
}
function control(id: string, kind: ControlKind, what: string, expected: string, actual: string): Control {
  return { id, kind, what, expected, actual, pass: expected === actual };
}

function has(result: { claims: DeliveryClaim[] }, claim: DeliveryClaim): boolean {
  return result.claims.some((c) => c.claimId.toLowerCase() === claim.claimId.toLowerCase());
}

export async function runControls(): Promise<Control[]> {
  const { a1, a2, a3, b1, y1, forged, tampered } = await buildDiscoveryFixture();
  const controls: Control[] = [];

  // D1 GREEN — the gap: B, reading only its own installation, does not see A's negative claim.
  const bOnly = await discoverDeliveryHistory(SELLER_X, [staticSource("installation-B-local", [b1])]);
  controls.push(control("D1", "GREEN", "B's own installation alone does NOT contain A's negative claim (the D-005 gap)", "a2 absent, count=1", `a2 ${has(bOnly, a2) ? "present" : "absent"}, count=${bOnly.count}`));

  // D2 GREEN — findability: B + shared substrate surfaces A's claims to B. The
  // substrate is a RAW source (does not pre-filter by seller) that also carries
  // a Y-seller claim, so discovery's OWN seller filter is what must drop y1.
  const substrate: ClaimSource = { name: "shared-substrate (simulated EAS/ERC-8004)", fetchForSeller: async () => [a1, a2, a3, y1] };
  const discovered = await discoverDeliveryHistory(SELLER_X, [staticSource("installation-B-local", [b1]), substrate]);
  controls.push(control("D2", "GREEN", "Discovery surfaces A's negative claim to B across installations", "a2 present, count=4", `a2 ${has(discovered, a2) ? "present" : "absent"}, count=${discovered.count}`));

  // D3 GREEN — every claim in the aggregate is verified.
  const { verifyClaim } = await import("./signing.js");
  const allVerify = discovered.claims.every((c) => verifyClaim(c).ok);
  controls.push(control("D3", "GREEN", "Every claim in the aggregate re-verifies locally", "true", String(allVerify)));

  // D4 GREEN — a claim about a different seller (y1) is filtered out of X's aggregate.
  controls.push(control("D4", "GREEN", "A different-seller claim from a source is filtered out", "y1 absent", `y1 ${has(discovered, y1) ? "present" : "absent"}`));

  // D5 GREEN — dedup: the same claim from two sources is counted once.
  const deduped = await discoverDeliveryHistory(SELLER_X, [staticSource("src1", [b1, a1]), staticSource("src2", [b1, a1])]);
  const src2 = deduped.sources[1];
  controls.push(control("D5", "GREEN", "The same claim from two sources is counted once", "count=2, dup=2", `count=${deduped.count}, dup=${src2?.duplicates}`));

  // D6 RED — a forged claim (wrong signer) from a source is rejected, not surfaced.
  const withForged = await discoverDeliveryHistory(SELLER_X, [staticSource("malicious", [forged])]);
  controls.push(control("D6", "RED", "A forged claim (wrong signer) is rejected, not surfaced", "count=0, rejected>=1", `count=${withForged.count}, ${(withForged.sources[0]?.rejected ?? 0) >= 1 ? "rejected>=1" : "rejected=0"}`));

  // D7 RED — a tampered claim (flipped byte, claimId not recomputed) is rejected.
  const withTampered = await discoverDeliveryHistory(SELLER_X, [staticSource("malicious", [tampered])]);
  controls.push(control("D7", "RED", "A tampered claim (flipped byte) is rejected, not surfaced", "count=0, rejected>=1", `count=${withTampered.count}, ${(withTampered.sources[0]?.rejected ?? 0) >= 1 ? "rejected>=1" : "rejected=0"}`));

  // D8 GREEN — composition with D-006: a substrate that hides A's MIDDLE claim
  // (shows a1 and a3, omits a2) is still caught, now across installations.
  const hiding = await discoverDeliveryHistory(SELLER_X, [staticSource("installation-B-local", [b1]), staticSource("substrate-hiding-a2", [a1, a3])]);
  const flaggedA2 = hiding.completeness.possibleOmissions.some((o) => o.missingPriorClaimId.toLowerCase() === a2.claimId.toLowerCase());
  controls.push(control("D8", "GREEN", "A source hiding a middle claim is caught by completeness, across installations", "true", String(flaggedA2)));

  return controls;
}
