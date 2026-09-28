// attester-identity.ts — the attester's own signing identity and ownership-
// challenge secret.
//
// TEST IDENTITY ONLY, NOT PRODUCTION KEY MANAGEMENT: createAttesterIdentity()
// generates a fresh, in-memory ethers.Wallet.createRandom() plus a fresh
// random HMAC secret, every time the process starts. That is deliberate for
// this prototype: it makes clear, by construction, that no real, persistent
// signing key or long-lived shared secret exists yet. A real, safely
// custodied attester key (hardware-backed, or at minimum an env-var-sourced
// key with a documented rotation/backup story) and a persistent ownership
// secret are SEPARATE decisions that have not been made, and must be brought
// to the koning before this server ever attests anything that leaves this
// machine or is meant to be verifiable across a restart. This mirrors the
// same "clearly-marked demo wallet, real key custody is a later decision"
// posture the wider tokenizen project already uses elsewhere for an
// equivalent placeholder (see mcp-paywall's own demo payout-wallet comment) —
// not quoted verbatim here since mcp-paywall is a separate repo out of scope
// for this task, only the same posture.
//
// PRACTICAL CONSEQUENCE OF BEING EPHEMERAL: because ownershipSecret is
// regenerated on every process start, a challenge token issued by
// get_ownership_challenge before a restart will no longer match what
// request_trust_attestation expects after one. Within a single running
// process this is exactly the "stateless" design ownership.ts already
// documents (same (endpoint, owner) pair always yields the same token as
// long as the secret is stable); across a restart it is not, and that gap is
// intentional for now rather than hidden — production would source
// ownershipSecret from a persisted value (e.g. an environment variable) for
// exactly this reason.

import { randomBytes } from "node:crypto";
import { ethers } from "ethers";

export interface AttesterIdentity {
  /** Signs attestations. verifyAttestation (endpoint-attest) requires this to never equal ownerAddress. ethers.Wallet.createRandom() actually returns an HDNodeWallet, which implements the same ethers.Signer interface signAttestation() expects. */
  wallet: ethers.HDNodeWallet;
  /** HMAC secret behind challengeToken()/verifyOwnership() (endpoint-attest/src/ownership.ts). Must be >= 32 chars; 64 hex chars here, well above that floor. */
  ownershipSecret: string;
}

/** Create a fresh, ephemeral attester identity. Exported as a function (not a module-level singleton) so tests and the demo can each get their own isolated identity; server.ts calls this once and holds the result for its process lifetime. */
export function createAttesterIdentity(): AttesterIdentity {
  return {
    wallet: ethers.Wallet.createRandom(),
    ownershipSecret: randomBytes(32).toString("hex"),
  };
}
