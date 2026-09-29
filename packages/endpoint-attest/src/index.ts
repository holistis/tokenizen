// index.ts — public surface of this package.

export {
  OWNERSHIP_METHODS,
  OUTCOMES,
  ETH_ADDRESS_RE,
  AttestationContentSchema,
  EndpointAttestationSchema,
  OwnershipProofSchema,
  attestationPreimage,
  computeAttestationId,
  isExpired,
  type OwnershipMethod,
  type Outcome,
  type OwnershipProof,
  type AttestationContent,
  type EndpointAttestation,
} from "./schema.js";

export {
  signAttestation,
  verifyAttestation,
  type SignedAttestationParts,
  type VerifyResult,
  type VerifyReason,
  type VerifyOptions,
} from "./signing.js";

export {
  DNS_LABEL,
  WELL_KNOWN_PATH,
  challengeToken,
  endpointHost,
  proofLocation,
  verifyOwnership,
  OwnershipError,
  type OwnershipCheckDeps,
  type OwnershipResult,
} from "./ownership.js";
