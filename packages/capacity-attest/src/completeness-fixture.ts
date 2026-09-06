// completeness-fixture.ts — a public, reproducible fixture proving what the
// per-buyer claim chain (priorClaimId) + analyzeCompleteness() actually
// detect, and, just as importantly, what they do NOT.
//
// Modeled on the transparency discipline goun7 published for Tamga Protocol
// (docs/PAIRING-FIXTURE.md): every value is labeled by its `source`, the
// scenario is regenerable from a fixed TEST key so a skeptic can rebuild it,
// and it ships explicit TAMPER NEGATIVES that MUST be rejected. The point is
// that nobody has to trust our prose: they run this and check the outcomes
// themselves.
//
// SOURCE LABELS used below (same idea as the Tamga fixture):
//   simulated — a stand-in value, no real-world counterpart is claimed
//               (e.g. settlementRef: no real x402 payment was made here).
//   derived   — computed deterministically from other fields (claimId, the
//               chain links, the completeness report).
//   observed  — a real, reproducible output of this package's own code (the
//               EIP-191 signatures, produced by the actual signClaim()).
//
// This module is pure and offline: no ledger, no network, no clock-dependence
// (timestamps are fixed literals). It is consumed by examples/completeness-
// fixture.ts (human-readable run) and src/completeness-fixture.test.ts (CI).

import { ethers } from "ethers";
import { signClaim, verifyClaim } from "./signing.js";
import { type ClaimContent, type DeliveryClaim } from "./schema.js";
import { analyzeCompleteness, type CompletenessReport } from "./completeness.js";

// A FIXED, well-known TEST key. Deliberately not a real identity: its whole
// job is to make this fixture deterministic and regenerable by anyone. source: simulated
const TEST_PRIVATE_KEY = "0x" + "a1".repeat(32);
export const FIXTURE_BUYER = new ethers.Wallet(TEST_PRIVATE_KEY);

// A fixed TEST seller address. source: simulated
export const FIXTURE_SELLER = "0x00000000000000000000000000000000000000aa";

// sha256 hex of some evidence bytes — shape only, no real artifact. source: simulated
const EVIDENCE_HASH = "a".repeat(64);

async function sign(content: ClaimContent): Promise<DeliveryClaim> {
  // signature: observed (real EIP-191 output of signClaim); claimId: derived.
  const { claimId, signature } = await signClaim(FIXTURE_BUYER, content);
  return { ...content, claimId, signature };
}

export interface Fixture {
  /** The buyer's three real, signed claims about one seller, chained oldest->newest. */
  c1: DeliveryClaim; // genesis (no priorClaimId), delivered: yes
  c2: DeliveryClaim; // delivered: NO — the claim a dishonest host wants to hide
  c3: DeliveryClaim; // delivered: yes, priorClaimId = c2.claimId
  /** What an honest host returns: the full, ordered chain. */
  honestView: DeliveryClaim[];
  /** What a dishonest host returns: the negative middle claim (c2) silently dropped. */
  dishonestView: DeliveryClaim[];
}

/**
 * Build the fixture: three real, signed, chained claims from one buyer about
 * one seller. Deterministic given the fixed TEST key above.
 */
export async function buildFixture(): Promise<Fixture> {
  const base = {
    sellerAddress: FIXTURE_SELLER,
    buyerAddress: FIXTURE_BUYER.address,
    assetType: "gpu-hours" as const,
    evidenceHash: EVIDENCE_HASH,
  };
  // c1 — genesis: no priorClaimId. source of scalar fields: simulated.
  const c1 = await sign({
    ...base,
    promisedSpec: "1x A100, 4 hours",
    delivered: "yes",
    settlementRef: "0x" + "01".repeat(32),
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  // c2 — the buyer's SECOND claim about this seller, and it is NEGATIVE. This
  // is exactly the claim a seller-friendly host is tempted to hide. Its
  // priorClaimId links it to c1. source: derived (link), simulated (rest).
  const c2 = await sign({
    ...base,
    promisedSpec: "1x A100, 8 hours",
    delivered: "no",
    settlementRef: "0x" + "02".repeat(32),
    timestamp: "2026-02-01T00:00:00.000Z",
    priorClaimId: c1.claimId,
  });
  // c3 — the buyer's THIRD claim, linked to c2. Because this link is signed,
  // a host cannot show c3 while hiding c2 without leaving c3 pointing at a
  // claim that is not in the response. source: derived (link), simulated (rest).
  const c3 = await sign({
    ...base,
    promisedSpec: "1x A100, 2 hours",
    delivered: "yes",
    settlementRef: "0x" + "03".repeat(32),
    timestamp: "2026-03-01T00:00:00.000Z",
    priorClaimId: c2.claimId,
  });

  return { c1, c2, c3, honestView: [c1, c2, c3], dishonestView: [c1, c3] };
}

export type ControlKind = "GREEN" | "RED";

export interface Control {
  id: string;
  kind: ControlKind; // GREEN = this good-path property must hold; RED = this tampered input must be rejected
  what: string; // one-line human description
  expected: string;
  actual: string;
  pass: boolean;
}

function control(id: string, kind: ControlKind, what: string, expected: string, actual: string): Control {
  return { id, kind, what, expected, actual, pass: expected === actual };
}

/**
 * Run every control over the fixture and return the results. A caller (the
 * example runner, or the CI test) decides what to do with them; this function
 * itself never throws on a failed control, it just reports pass:false.
 */
export async function runControls(): Promise<Control[]> {
  const { c1, c2, c3, honestView, dishonestView } = await buildFixture();
  const controls: Control[] = [];

  // --- GREEN: good-path properties that must hold ---

  // G1: every claim in the honest view is individually authentic.
  const honestAllVerify = honestView.every((c) => verifyClaim(c).ok);
  controls.push(control("G1", "GREEN", "Every claim in the honest view verifies (claimId + signature)", "true", String(honestAllVerify)));

  // G2: the honest, complete view has a consistent chain and zero omissions.
  const honestReport = analyzeCompleteness(honestView);
  controls.push(
    control(
      "G2",
      "GREEN",
      "Honest full view: chainConsistent with no possibleOmissions",
      "consistent=true omissions=0",
      `consistent=${honestReport.chainConsistent} omissions=${honestReport.possibleOmissions.length}`,
    ),
  );

  // G3: KEY PROPERTY — under a dishonest host that hid c2, the shown claims
  //     STILL individually verify. Authenticity of what is shown is intact;
  //     that is exactly why omission (not forgery) is the real threat.
  const dishonestAllVerify = dishonestView.every((c) => verifyClaim(c).ok);
  controls.push(control("G3", "GREEN", "Under hiding, each shown claim still verifies (authenticity intact)", "true", String(dishonestAllVerify)));

  // G4: DETECTION — recomputing analyzeCompleteness() locally over the
  //     dishonest view flags exactly one omission, pointing at the hidden c2.
  const dishonestReport = analyzeCompleteness(dishonestView);
  const flaggedC2 =
    dishonestReport.chainConsistent === false &&
    dishonestReport.possibleOmissions.length === 1 &&
    dishonestReport.possibleOmissions[0]?.missingPriorClaimId.toLowerCase() === c2.claimId.toLowerCase() &&
    dishonestReport.possibleOmissions[0]?.referencedBy.toLowerCase() === c3.claimId.toLowerCase();
  controls.push(control("G4", "GREEN", "Local recompute over hidden view flags exactly the missing c2", "true", String(flaggedC2)));

  // G5: DON'T TRUST THE HOST'S FIELD — a host can return a rosy completeness
  //     field while hiding c2. Trusting it misses the omission; recomputing
  //     locally catches it. This control proves the two disagree.
  const hostClaimedRosy: CompletenessReport = { chainConsistent: true, possibleOmissions: [], forks: [], note: "host says all good" };
  const trustingHostWouldMiss = hostClaimedRosy.chainConsistent === true && dishonestReport.chainConsistent === false;
  controls.push(
    control("G5", "GREEN", "A rosy host-supplied completeness field is contradicted by local recompute", "true", String(trustingHostWouldMiss)),
  );

  // --- RED: tampered inputs that MUST be rejected by verifyClaim() ---

  // R1: flip c2's delivered byte (no -> yes) without recomputing claimId.
  const flippedDelivery = { ...c2, delivered: "yes" as const };
  controls.push(control("R1", "RED", "Flipped delivered byte (no->yes), claimId unchanged", "rejected", verifyClaim(flippedDelivery).ok ? "ACCEPTED" : "rejected"));

  // R2: strip c3's priorClaimId but keep its signature — the exact "host tries
  //     to remove the chain link" attack. Must break claimId.
  const strippedLink = { ...c3 };
  delete (strippedLink as { priorClaimId?: string }).priorClaimId;
  controls.push(control("R2", "RED", "Stripped priorClaimId from c3, signature kept (host cannot remove the link)", "rejected", verifyClaim(strippedLink).ok ? "ACCEPTED" : "rejected"));

  // R3: repoint c3's priorClaimId to a different claim, signature kept.
  const forgedLink = { ...c3, priorClaimId: c1.claimId };
  controls.push(control("R3", "RED", "Repointed c3.priorClaimId to c1, signature kept", "rejected", verifyClaim(forgedLink).ok ? "ACCEPTED" : "rejected"));

  // R4: sign c2's content with a DIFFERENT wallet while still claiming
  //     buyerAddress = the fixture buyer. Signature must not recover to buyer.
  const impostor = new ethers.Wallet("0x" + "b2".repeat(32));
  const impostorContent: ClaimContent = {
    sellerAddress: FIXTURE_SELLER,
    buyerAddress: FIXTURE_BUYER.address,
    assetType: "gpu-hours",
    promisedSpec: "1x A100, 8 hours",
    delivered: "no",
    evidenceHash: EVIDENCE_HASH,
    settlementRef: "0x" + "02".repeat(32),
    timestamp: "2026-02-01T00:00:00.000Z",
    priorClaimId: c1.claimId,
  };
  const impostorSigned = await signClaim(impostor, impostorContent);
  const impostorClaim = { ...impostorContent, ...impostorSigned };
  controls.push(control("R4", "RED", "c2 signed by a different wallet, buyerAddress unchanged", "rejected", verifyClaim(impostorClaim).ok ? "ACCEPTED" : "rejected"));

  return controls;
}
