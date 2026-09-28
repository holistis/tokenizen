// signing.ts — sign an endpoint attestation as the attester, and verify it later.
//
// Same deliberate choice as capacity-attest: EIP-191 personal-sign over the
// content-address, not EIP-712 typed data, to keep the crypto surface small
// enough to audit end to end. `recoverClaimSigner` is imported from
// capacity-attest rather than reimplemented: it is a one-line
// ethers.verifyMessage wrapper, but importing it keeps both packages
// provably on the same recovery path instead of two copies that can drift.
//
// WHO SIGNS, AND WHY IT MATTERS: the ATTESTER signs, not the owner. The
// owner's role is to prove control of the endpoint (see ownership.ts); the
// attester's role is to state what the checks found and to carry the
// responsibility for that statement. An attestation signed by the owner
// about their own endpoint would be a self-declaration, which is worth
// nothing to the third party reading it. verifyAttestation therefore
// requires the signature to recover to `attesterAddress`, and deliberately
// rejects an attestation where attester and owner are the same address.

import { ethers } from "ethers";
import { recoverClaimSigner } from "capacity-attest/dist/signing.js";
import {
  type AttestationContent,
  type EndpointAttestation,
  computeAttestationId,
  isExpired,
} from "./schema.js";

export interface SignedAttestationParts {
  attestationId: string;
  signature: string;
}

/** Sign an attestation as the attester. Returns the content-addressed id alongside the signature so a caller can assemble a full EndpointAttestation. */
export async function signAttestation(
  attester: ethers.Signer,
  content: AttestationContent,
): Promise<SignedAttestationParts> {
  const attestationId = computeAttestationId(content);
  const signature = await attester.signMessage(attestationId);
  return { attestationId, signature };
}

export type VerifyReason =
  | "attestation_id_mismatch"
  | "signature_recovery_failed"
  | "signature_does_not_match_attester"
  | "attester_is_owner"
  | "expired";

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyReason; detail?: string };

export interface VerifyOptions {
  /** Treat this as "now" when checking expiry. Injectable so tests do not depend on the wall clock. */
  now?: Date;
  /**
   * Skip the expiry check. Use ONLY when the caller genuinely needs to know
   * "was this ever validly signed" separately from "is it valid today", for
   * example when displaying an archived attestation as historical. Never use
   * it to present an expired attestation as current: that is exactly the
   * false confidence the mandatory expiry exists to prevent.
   */
  ignoreExpiry?: boolean;
}

/**
 * Verify that an assembled attestation is internally consistent AND still valid:
 *   1. `attestationId` really is the sha256 content-address of the content fields.
 *   2. `signature` recovers to `attesterAddress`.
 *   3. The attester is not the owner (a self-declaration is not an attestation).
 *   4. It has not expired (unless the caller explicitly opts out, see VerifyOptions).
 *
 * Checks run in that order on purpose: an expired attestation whose signature
 * is also forged reports the forgery, not the expiry, so a caller can never
 * mistake a forged attestation for a merely stale one.
 */
export function verifyAttestation(attestation: EndpointAttestation, opts: VerifyOptions = {}): VerifyResult {
  let expectedId: string;
  try {
    expectedId = computeAttestationId(attestation);
  } catch (e) {
    // Content that cannot even be canonicalised (pathological nesting, or a
    // shape that fails AttestationContentSchema) can never have a matching
    // id, so report it as the mismatch it is rather than throwing at a
    // caller who asked a yes/no question.
    return { ok: false, reason: "attestation_id_mismatch", detail: (e as Error).message };
  }
  if (expectedId.toLowerCase() !== attestation.attestationId.toLowerCase()) {
    return { ok: false, reason: "attestation_id_mismatch" };
  }

  let recovered: string;
  try {
    recovered = recoverClaimSigner(attestation.attestationId, attestation.signature);
  } catch (e) {
    return { ok: false, reason: "signature_recovery_failed", detail: (e as Error).message };
  }
  if (recovered.toLowerCase() !== attestation.attesterAddress.toLowerCase()) {
    return { ok: false, reason: "signature_does_not_match_attester" };
  }

  if (attestation.attesterAddress.toLowerCase() === attestation.ownerAddress.toLowerCase()) {
    return { ok: false, reason: "attester_is_owner" };
  }

  if (!opts.ignoreExpiry && isExpired(attestation, opts.now ?? new Date())) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true };
}
