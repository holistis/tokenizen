# endpoint-attest

Time-bounded, owner-requested security attestations for a network endpoint (for example an MCP server). The operator proves they control the endpoint, an independent attester runs some checks, and the outcome is recorded as a signed, content-addressed, expiring attestation that anyone can verify.

This is deliberately narrow. It is not a security score, not a reputation system, and never a claim about a party that did not ask for one. An attestation only exists because the owner requested it, and it always expires.

Status: new, not yet published to npm. Built to be reused by anything that needs "does this endpoint's operator have a recent, verifiable, opt-in check on record", the same way [capacity-attest](../capacity-attest) answers "was this delivery actually made". It reuses capacity-attest's canonical JSON hashing and EIP-191 signing rather than reimplementing them, but it is a separate package: capacity-attest's claim schema is closed by design (see its `ASSET_TYPES` enum), and an endpoint attestation is a different kind of claim about a different kind of thing.

## Why this is a separate package, not a new claim type in capacity-attest

capacity-attest answers "did the seller deliver what was paid for". An endpoint attestation answers "did this operator prove they control this endpoint, and did an independent party check it recently". Different subject, different trust model (a distinct attester is required, never the owner), different lifecycle (mandatory expiry). Bolting that onto capacity-attest's closed claim schema would blur both.

## How it works

1. **The owner proves control of the endpoint.** Two ACME-style methods, both stateless (no server-side session to manage): a DNS TXT record at `_endpoint-attest.<host>`, or a file at the RFC 8615 well-known path `/.well-known/endpoint-attest.txt`. The token to publish is an HMAC of the endpoint, the owner's address and a shared secret, so it is bound to that exact host and that exact owner. It cannot be reused on a different endpoint or claimed by a different owner.
2. **A distinct attester runs checks and signs.** The attester can never be the owner (`verifyAttestation` rejects that as `attester_is_owner`). It records what it actually checked (`checksPerformed` must be non-empty, so "passed" can never be read as a blanket safety claim), an outcome, and a hash of its findings.
3. **The attestation is content-addressed and signed.** `computeAttestationId` hashes the canonical JSON of the content (reusing capacity-attest's `canonicalize`), and `signAttestation` produces an EIP-191 signature over that id (reusing capacity-attest's signing primitives). Anyone can recompute the id and the signer independently, without trusting this package's code.
4. **The attestation always expires.** `expiresAt` is required and must be after `checkedAt`. There is no way to construct a non-expiring attestation; `verifyAttestation` treats an expired one as failed by default (`ignoreExpiry` exists only for callers who explicitly want to inspect an expired record).

## Usage

```ts
import {
  challengeToken, verifyOwnership,
  signAttestation, verifyAttestation, computeAttestationId,
} from "endpoint-attest";

// 1. Attester derives the challenge token for this exact endpoint and owner.
const token = challengeToken(endpoint, ownerAddress, sharedSecret);

// 2. Owner publishes it (DNS TXT or the well-known file), attester verifies control.
const proof = await verifyOwnership("well-known-file", endpoint, ownerAddress, sharedSecret);

// 3. Attester runs its own checks, then signs the result.
const { attestationId, signature } = await signAttestation(attesterWallet, {
  endpoint, ownerAddress, attesterAddress: attesterWallet.address,
  ownershipProof: { method: proof.method, token, location: proof.location, verifiedAt: proof.verifiedAt },
  checksPerformed: ["tls-config", "no-open-admin-route", "auth-required-on-write"],
  outcome: "passed",
  findingsHash: sha256HexOfYourFullFindingsReport,
  checkedAt: new Date().toISOString(),
  expiresAt: thirtyDaysFromNow.toISOString(),
});

// 4. Anyone, independently, verifies it.
const result = verifyAttestation({ ...content, attestationId, signature });
// result.ok === true, or result.ok === false with a reason: "expired", "bad_signature",
// "attester_is_owner", "id_mismatch", ...
```

Full working example with a real local HTTP server proving the whole flow, including the mandatory expiry: [examples/demo.ts](examples/demo.ts) (`npx tsx examples/demo.ts`).

## What this does not do

- It does not run the checks for you. `checksPerformed` and `findingsHash` are supplied by whatever attester process calls this library; this package only handles ownership proof, signing and verification.
- It does not publish attestations anywhere. Unlike capacity-attest, there is no built-in EAS/on-chain publishing path here yet. Storage and distribution are left to the caller.
- It is not a guarantee. An attestation records what a specific attester checked at a specific time. It says nothing about what changed afterward, and `checksPerformed` should always be read literally, not as "this endpoint is safe".

## Status

43 tests passing (`npm test`), clean typecheck and build. Not yet published to npm. No independent, external review of this code has been done; see [capacity-attest's own security notes](../capacity-attest/docs/SECURITY-REVIEW-2026-09-11.md) for how that project handles the same honesty requirement, which this package follows too.
