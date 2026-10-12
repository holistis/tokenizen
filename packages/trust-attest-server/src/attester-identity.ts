// attester-identity.ts — the attester's own signing identity and ownership-
// challenge secret.
//
// PERSISTENT WHEN CONFIGURED, EPHEMERAL OTHERWISE: createAttesterIdentity()
// reads TRUST_ATTEST_PRIVATE_KEY and TRUST_ATTEST_OWNERSHIP_SECRET from the
// environment. If both are set, the identity is stable across restarts, so a
// published attestation stays verifiable against the same attesterAddress
// forever, and a challenge token issued by get_ownership_challenge still
// matches after a restart. If either is missing, this falls back to a fresh,
// random wallet and secret every process start, and prints a loud warning to
// stderr rather than silently pretending to be production-ready: a caller
// who does not read the README should not find out the hard way, months
// later, that every attestation they issued has a different signer.
//
// Found and fixed 2026-09-29 (peer-review, before first npm publish): the
// earlier ephemeral-only version was correct for the prototype but would
// have shipped a package that cannot do what it promises for anyone who
// actually installs and restarts it. Real, safely custodied key management
// (hardware-backed signing, rotation, backup) is still a separate, later
// decision; an env-var-sourced key is the documented minimum bar, same
// posture the wider tokenizen project already uses elsewhere for an
// equivalent placeholder (see mcp-paywall's own demo payout-wallet comment).

import { randomBytes } from "node:crypto";
import { ethers } from "ethers";

export interface AttesterIdentity {
  /** Signs attestations. verifyAttestation (endpoint-attest) requires this to never equal ownerAddress. Either a persistent ethers.Wallet (loaded from TRUST_ATTEST_PRIVATE_KEY) or an ephemeral HDNodeWallet (createRandom() fallback) — both implement the same ethers.Signer interface signAttestation() expects. */
  wallet: ethers.Signer & { address: string };
  /** HMAC secret behind challengeToken()/verifyOwnership() (endpoint-attest/src/ownership.ts). Must be >= 32 chars. Persistent when TRUST_ATTEST_OWNERSHIP_SECRET is set, otherwise 64 random hex chars, well above the floor. */
  ownershipSecret: string;
  /** False when either env var was missing and this fell back to an ephemeral identity. Exposed so callers (and tests) can assert on it instead of re-parsing env vars themselves. */
  persistent: boolean;
}

/**
 * The ownership-challenge secret ALONE, without the attestation signing key.
 * A process that issues/verifies ownership challenges but never signs an
 * attestation (the public self-check edge at tokenizen.nl/check) only needs
 * this — loading the signing wallet there is pure, unnecessary attack surface
 * on the one component any anonymous visitor can reach.
 */
export interface OwnershipContext {
  ownershipSecret: string;
  /** False when TRUST_ATTEST_OWNERSHIP_SECRET was missing and this fell back to an ephemeral secret. */
  persistent: boolean;
}

/**
 * Load ONLY the ownership-challenge secret, never the attestation signing key.
 * Reads TRUST_ATTEST_OWNERSHIP_SECRET; if absent, falls back to a fresh random
 * secret with a loud warning (same honesty posture as createAttesterIdentity),
 * but NEVER reads TRUST_ATTEST_PRIVATE_KEY and never constructs a wallet. In
 * production this must be set to the SAME value the signing MCP server uses, or
 * tokens issued by the edge will not match the ones the signer expects.
 */
export function loadOwnershipSecret(): OwnershipContext {
  const secretFromEnv = process.env.TRUST_ATTEST_OWNERSHIP_SECRET;
  if (secretFromEnv) {
    if (secretFromEnv.length < 32) {
      throw new Error("TRUST_ATTEST_OWNERSHIP_SECRET must be at least 32 characters (see endpoint-attest's challengeToken)");
    }
    return { ownershipSecret: secretFromEnv, persistent: true };
  }
  process.stderr.write(
    "self-check ownership context: TRUST_ATTEST_OWNERSHIP_SECRET is not set. Falling back to a fresh, random " +
      "ownership secret for this process only. Any challenge token issued now stops matching after a restart and " +
      "will NOT match the signing server's identity. Fine for local testing, not for real use. Set " +
      "TRUST_ATTEST_OWNERSHIP_SECRET (to the SAME value the signing server uses) before deploying.\n",
  );
  return { ownershipSecret: randomBytes(32).toString("hex"), persistent: false };
}

/**
 * Create the attester identity for this process. Exported as a function (not
 * a module-level singleton) so tests and the demo can each get their own
 * isolated identity; server.ts creates it lazily, on first actual use, and
 * holds the result for its process lifetime.
 */
export function createAttesterIdentity(): AttesterIdentity {
  const keyFromEnv = process.env.TRUST_ATTEST_PRIVATE_KEY;
  const secretFromEnv = process.env.TRUST_ATTEST_OWNERSHIP_SECRET;

  if (keyFromEnv && secretFromEnv) {
    if (secretFromEnv.length < 32) {
      throw new Error("TRUST_ATTEST_OWNERSHIP_SECRET must be at least 32 characters (see endpoint-attest's challengeToken)");
    }
    return { wallet: new ethers.Wallet(keyFromEnv), ownershipSecret: secretFromEnv, persistent: true };
  }

  process.stderr.write(
    "trust-attest-server: TRUST_ATTEST_PRIVATE_KEY and/or TRUST_ATTEST_OWNERSHIP_SECRET are not set. " +
      "Falling back to a fresh, random identity for this process only. Every attestation this process " +
      "signs will have a DIFFERENT attesterAddress after the next restart, and any ownership challenge " +
      "token issued now will stop matching. This is fine for local testing, not for real use. " +
      "Set both env vars to a persistent value before deploying this for anyone to actually rely on.\n",
  );
  return {
    wallet: ethers.Wallet.createRandom(),
    ownershipSecret: randomBytes(32).toString("hex"),
    persistent: false,
  };
}
