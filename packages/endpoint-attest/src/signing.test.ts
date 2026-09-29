import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  AttestationContentSchema,
  computeAttestationId,
  attestationPreimage,
  isExpired,
  type AttestationContent,
  type EndpointAttestation,
} from "./schema.js";
import { signAttestation, verifyAttestation } from "./signing.js";

const OWNER = "0x00000000000000000000000000000000000000aa";
const CHECKED_AT = "2026-09-28T12:00:00.000Z";
const EXPIRES_AT = "2026-10-28T12:00:00.000Z";
const AFTER_EXPIRY = new Date("2026-11-01T00:00:00.000Z");
const BEFORE_EXPIRY = new Date("2026-10-01T00:00:00.000Z");

function content(overrides: Partial<AttestationContent> = {}): AttestationContent {
  return {
    endpoint: "https://mcp.example.com/sse",
    ownerAddress: OWNER,
    attesterAddress: "0x00000000000000000000000000000000000000bb",
    ownershipProof: {
      method: "dns-txt",
      token: "tok_" + "a".repeat(20),
      location: "_endpoint-attest.mcp.example.com",
      verifiedAt: "2026-09-28T11:00:00.000Z",
    },
    checksPerformed: ["tls-valid", "no-open-admin-route"],
    outcome: "passed",
    findingsHash: "a".repeat(64),
    checkedAt: CHECKED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  } as AttestationContent;
}

async function signed(
  attester: ethers.HDNodeWallet,
  overrides: Partial<AttestationContent> = {},
): Promise<EndpointAttestation> {
  const c = content({ attesterAddress: attester.address, ...overrides });
  const { attestationId, signature } = await signAttestation(attester, c);
  return { ...c, attestationId, signature };
}

describe("schema: the three honesty constraints are enforced, not documented", () => {
  it("rejects an attestation with no expiry at all", () => {
    const { expiresAt, ...withoutExpiry } = content();
    expect(() => AttestationContentSchema.parse(withoutExpiry)).toThrow();
  });

  it("rejects expiresAt equal to or before checkedAt", () => {
    expect(() => AttestationContentSchema.parse(content({ expiresAt: CHECKED_AT }))).toThrow(/strictly after checkedAt/);
    expect(() => AttestationContentSchema.parse(content({ expiresAt: "2026-09-27T12:00:00.000Z" }))).toThrow(/strictly after checkedAt/);
  });

  it("rejects an empty checksPerformed, so outcome 'passed' can never mean a blanket 'is secure'", () => {
    expect(() => AttestationContentSchema.parse(content({ checksPerformed: [] }))).toThrow();
  });

  it("rejects a missing ownershipProof, so an attestation about a party that never asked is not expressible", () => {
    const { ownershipProof, ...withoutProof } = content();
    expect(() => AttestationContentSchema.parse(withoutProof)).toThrow();
  });

  it("rejects ownership proven AFTER the checks ran", () => {
    expect(() =>
      AttestationContentSchema.parse(
        content({ ownershipProof: { ...content().ownershipProof, verifiedAt: "2026-09-28T13:00:00.000Z" } }),
      ),
    ).toThrow(/before or when the checks run/);
  });

  it("accepts the valid baseline", () => {
    expect(() => AttestationContentSchema.parse(content())).not.toThrow();
  });
});

describe("content addressing", () => {
  it("is stable regardless of key order", () => {
    const a = content();
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as AttestationContent;
    expect(computeAttestationId(reordered)).toBe(computeAttestationId(a));
  });

  it("is case-insensitive for the two address fields, because the preimage normalises them", () => {
    const lower = content({ ownerAddress: OWNER.toLowerCase() });
    const upper = content({ ownerAddress: "0x" + OWNER.slice(2).toUpperCase() });
    expect(computeAttestationId(upper)).toBe(computeAttestationId(lower));
  });

  it("changes when any content field changes", () => {
    const base = computeAttestationId(content());
    expect(computeAttestationId(content({ outcome: "failed" }))).not.toBe(base);
    expect(computeAttestationId(content({ expiresAt: "2026-10-29T12:00:00.000Z" }))).not.toBe(base);
    expect(computeAttestationId(content({ checksPerformed: ["tls-valid"] }))).not.toBe(base);
    expect(computeAttestationId(content({ findingsHash: "b".repeat(64) }))).not.toBe(base);
  });

  it("strips unknown top-level keys from the preimage instead of hashing them", () => {
    const withExtra = { ...content(), somethingUnsigned: "attacker-controlled" } as unknown as AttestationContent;
    expect(computeAttestationId(withExtra)).toBe(computeAttestationId(content()));
    expect(attestationPreimage(withExtra)).not.toContain("attacker-controlled");
  });
});

describe("signing and verification", () => {
  it("a genuinely signed, unexpired attestation verifies", async () => {
    const attester = ethers.Wallet.createRandom();
    const att = await signed(attester);
    expect(verifyAttestation(att, { now: BEFORE_EXPIRY })).toEqual({ ok: true });
  });

  it("rejects a tampered content field (id no longer matches)", async () => {
    const attester = ethers.Wallet.createRandom();
    const att = await signed(attester);
    const tampered = { ...att, outcome: "passed" as const, checksPerformed: ["tls-valid"] };
    expect(verifyAttestation(tampered, { now: BEFORE_EXPIRY })).toMatchObject({ ok: false, reason: "attestation_id_mismatch" });
  });

  it("rejects an attestation signed by someone other than attesterAddress", async () => {
    const realAttester = ethers.Wallet.createRandom();
    const impostor = ethers.Wallet.createRandom();
    const c = content({ attesterAddress: realAttester.address });
    const { attestationId } = await signAttestation(realAttester, c);
    const signature = await impostor.signMessage(attestationId);
    expect(verifyAttestation({ ...c, attestationId, signature }, { now: BEFORE_EXPIRY })).toMatchObject({
      ok: false,
      reason: "signature_does_not_match_attester",
    });
  });

  it("rejects a garbage signature without throwing", async () => {
    const attester = ethers.Wallet.createRandom();
    const att = await signed(attester);
    const r = verifyAttestation({ ...att, signature: "0x" + "11".repeat(65) }, { now: BEFORE_EXPIRY });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["signature_recovery_failed", "signature_does_not_match_attester"]).toContain(r.reason);
  });

  it("rejects a self-declaration: attester and owner the same address", async () => {
    const selfAttester = ethers.Wallet.createRandom();
    const att = await signed(selfAttester, { ownerAddress: selfAttester.address });
    expect(verifyAttestation(att, { now: BEFORE_EXPIRY })).toMatchObject({ ok: false, reason: "attester_is_owner" });
  });

  it("rejects an expired attestation even though the signature is perfectly valid", async () => {
    const attester = ethers.Wallet.createRandom();
    const att = await signed(attester);
    expect(verifyAttestation(att, { now: AFTER_EXPIRY })).toMatchObject({ ok: false, reason: "expired" });
  });

  it("reports the FORGERY, not the expiry, when an attestation is both expired and tampered", async () => {
    const attester = ethers.Wallet.createRandom();
    const att = await signed(attester);
    const tampered = { ...att, outcome: "failed" as const };
    expect(verifyAttestation(tampered, { now: AFTER_EXPIRY })).toMatchObject({
      ok: false,
      reason: "attestation_id_mismatch",
    });
  });

  it("ignoreExpiry lets a caller check historical validity, but only when asked explicitly", async () => {
    const attester = ethers.Wallet.createRandom();
    const att = await signed(attester);
    expect(verifyAttestation(att, { now: AFTER_EXPIRY })).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyAttestation(att, { now: AFTER_EXPIRY, ignoreExpiry: true })).toEqual({ ok: true });
  });

  it("isExpired is exact at the boundary: the expiry instant itself already counts as expired", () => {
    const c = content();
    expect(isExpired(c, new Date(Date.parse(EXPIRES_AT) - 1))).toBe(false);
    expect(isExpired(c, new Date(Date.parse(EXPIRES_AT)))).toBe(true);
  });
});
