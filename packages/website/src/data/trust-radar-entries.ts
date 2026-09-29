/**
 * Trust Radar data model.
 *
 * HARD PRINCIPLE (set 2026-09-28, see the koning-conversation this branch's
 * commits reference): a public page never carries a judgement about a third
 * party that did not ask for one. `endpoint-attest`'s own README states this
 * as its own rule ("never a claim about a party that did not ask for one"),
 * and Trust Radar exists to surface exactly that kind of attestation, never
 * anything else.
 *
 * Concretely: the ONLY thing that may ever appear in `TRUST_RADAR_ENTRIES` is
 * a real, signed `EndpointAttestation` the owner requested themselves and
 * that proved ownership of the endpoint's domain (DNS TXT or well-known
 * file) before a single check outcome was signed. It is never our own
 * research, never a passive scan we ran unprompted, and never a list of
 * "good" results hand-picked out of a broader scan the owner never opted
 * into — that is precisely the "judgement about a bystander" problem this
 * page must not become.
 *
 * `ATTESTED_ENDPOINTS` below is empty because the attestation system is not
 * live yet: there are no real, signed attestations to show. That is the
 * correct state for this page today, not a placeholder to fill with
 * plausible-looking examples. `TrustRadarPage` renders an explicit empty
 * state for it instead of fabricated rows.
 *
 * Why the attestation type is duplicated here instead of imported: this
 * branch does not have `packages/endpoint-attest` wired up as a workspace
 * dependency of `@tokenizen/website` (that package lives on
 * `feat/endpoint-attest-package`). `SignedEndpointAttestation` below mirrors
 * the fields Trust Radar needs from `EndpointAttestation` in
 * `packages/endpoint-attest/src/schema.ts`. Once that package is a real
 * dependency of this one, replace the local type with a real import and
 * delete this paragraph.
 */

export type TrustRadarStatus = "confirmed-safe" | "open-unclear" | "self-declared-unsafe";

export interface TrustRadarEntry {
  /** Display name of the MCP server / product. Falls back to the hostname: the attestation itself carries no product name. */
  name: string;
  /** Primary domain the server is hosted on. */
  domain: string;
  /** The MCP endpoint URL that was checked. */
  endpoint: string;
  status: TrustRadarStatus;
  /** ISO 8601 date the attested check was performed. */
  checkedAt: string;
  /** One-line, factual basis for the status: which checks ran and what the signed outcome was. */
  note: string;
}

/** Mirrors `endpoint-attest`'s `Outcome`. Deliberately not a score or a grade — see that package's own schema comment. */
export type AttestationOutcome = "passed" | "failed" | "inconclusive";

/**
 * Mirrors the fields Trust Radar needs from `EndpointAttestation`
 * (`packages/endpoint-attest/src/schema.ts`): a content-addressed,
 * ownership-verified, signed record of one check outcome. See the
 * file-level comment above for why this is a local copy, not an import.
 */
export interface SignedEndpointAttestation {
  /** Content-addressed id: sha256 over the canonical JSON of the attestation content. */
  attestationId: string;
  /** The MCP endpoint URL the check ran against. */
  endpoint: string;
  /** The address that proved control of the endpoint's domain (dns-txt or well-known-file) before this attestation was issued. */
  ownerAddress: string;
  /** The address that signed this attestation. */
  attesterAddress: string;
  /** Names of the checks that were actually run. */
  checksPerformed: string[];
  outcome: AttestationOutcome;
  /** ISO 8601 timestamp the checks were performed. */
  checkedAt: string;
  /** ISO 8601 timestamp this attestation stops being valid. An expired attestation is not a weaker attestation, it is not an attestation. */
  expiresAt: string;
  signature: string;
}

function outcomeToStatus(outcome: AttestationOutcome): TrustRadarStatus {
  switch (outcome) {
    case "passed":
      return "confirmed-safe";
    case "failed":
      return "self-declared-unsafe";
    case "inconclusive":
      return "open-unclear";
  }
}

function hostnameOf(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    // Not expected for a signed attestation (the endpoint was reachable when
    // checked), but never let a malformed URL throw while rendering a list.
    return endpoint;
  }
}

/** True when `at` (default: now) is at or after `expiresAt`. Mirrors `endpoint-attest`'s `isExpired`. */
export function isAttestationExpired(attestation: Pick<SignedEndpointAttestation, "expiresAt">, at: Date = new Date()): boolean {
  return at.getTime() >= new Date(attestation.expiresAt).getTime();
}

/**
 * Converts one real, signed attestation into the shape `TrustRadarPage`
 * renders. Never call this on anything but a genuine `SignedEndpointAttestation`
 * the owner requested — see the file-level principle above.
 */
export function attestationToTrustRadarEntry(attestation: SignedEndpointAttestation): TrustRadarEntry {
  const domain = hostnameOf(attestation.endpoint);
  const checks = attestation.checksPerformed.length > 0 ? attestation.checksPerformed.join(", ") : "no checks recorded";
  return {
    name: domain,
    domain,
    endpoint: attestation.endpoint,
    status: outcomeToStatus(attestation.outcome),
    checkedAt: attestation.checkedAt,
    note: `Owner-requested, ownership-verified check (${checks}). Signed outcome: ${attestation.outcome}.`,
  };
}

/**
 * The real data source: every endpoint whose owner requested a check,
 * proved they control it, and let the signed outcome be published here.
 * Empty until the attestation system is live — see the file-level comment.
 */
export const ATTESTED_ENDPOINTS: SignedEndpointAttestation[] = [];

export const TRUST_RADAR_ENTRIES: TrustRadarEntry[] = ATTESTED_ENDPOINTS.filter(
  (attestation) => !isAttestationExpired(attestation),
).map(attestationToTrustRadarEntry);
