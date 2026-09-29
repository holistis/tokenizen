import { describe, expect, it } from "vitest";

import {
  ATTESTED_ENDPOINTS,
  attestationToTrustRadarEntry,
  isAttestationExpired,
  TRUST_RADAR_ENTRIES,
  type SignedEndpointAttestation,
} from "@/data/trust-radar-entries";

function fixtureAttestation(overrides: Partial<SignedEndpointAttestation> = {}): SignedEndpointAttestation {
  return {
    attestationId: "0xabc123",
    endpoint: "https://docs.example.com/mcp",
    ownerAddress: "0x0000000000000000000000000000000000dead",
    attesterAddress: "0x0000000000000000000000000000000000beef",
    checksPerformed: ["discovery-requires-auth"],
    outcome: "passed",
    checkedAt: "2026-09-28",
    expiresAt: "2099-01-01",
    signature: "0xsig",
    ...overrides,
  };
}

describe("attestationToTrustRadarEntry", () => {
  it("maps a passed attestation to confirmed-safe and derives the hostname", () => {
    const entry = attestationToTrustRadarEntry(fixtureAttestation());
    expect(entry.status).toBe("confirmed-safe");
    expect(entry.domain).toBe("docs.example.com");
    expect(entry.name).toBe("docs.example.com");
    expect(entry.endpoint).toBe("https://docs.example.com/mcp");
    expect(entry.note).toContain("discovery-requires-auth");
    expect(entry.note).toContain("passed");
  });

  it("maps a failed attestation to self-declared-unsafe", () => {
    const entry = attestationToTrustRadarEntry(fixtureAttestation({ outcome: "failed" }));
    expect(entry.status).toBe("self-declared-unsafe");
  });

  it("maps an inconclusive attestation to open-unclear", () => {
    const entry = attestationToTrustRadarEntry(fixtureAttestation({ outcome: "inconclusive" }));
    expect(entry.status).toBe("open-unclear");
  });
});

describe("isAttestationExpired", () => {
  it("is false while the attestation is still valid", () => {
    const attestation = fixtureAttestation({ expiresAt: "2099-01-01" });
    expect(isAttestationExpired(attestation, new Date("2026-09-28"))).toBe(false);
  });

  it("is true once the current time reaches expiresAt", () => {
    const attestation = fixtureAttestation({ expiresAt: "2026-01-01" });
    expect(isAttestationExpired(attestation, new Date("2026-09-28"))).toBe(true);
  });
});

describe("TRUST_RADAR_ENTRIES", () => {
  it("is derived only from ATTESTED_ENDPOINTS, never from fabricated examples", () => {
    expect(TRUST_RADAR_ENTRIES).toHaveLength(ATTESTED_ENDPOINTS.length);
  });

  it("is empty because no real, signed attestation exists yet", () => {
    // This is the correct current state, not a bug: the attestation system
    // is not live. See the file-level comment in trust-radar-entries.ts.
    expect(ATTESTED_ENDPOINTS).toHaveLength(0);
    expect(TRUST_RADAR_ENTRIES).toHaveLength(0);
  });
});
