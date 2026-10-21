// Re-checks the published conformance vectors against this implementation on
// every CI run.
//
// The vectors exist so that someone implementing this proof in another language
// can verify themselves without asking us for anything. That promise is only
// worth something if the file cannot quietly drift away from the code, which is
// exactly what this test prevents: change the derivation and these fail, change
// the vectors and these fail, and either way nobody ships a vector file that
// lies to an outside implementer.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  challengeToken,
  activeTestConsentToken,
  normalizeEndpoint,
  DNS_LABEL,
  WELL_KNOWN_PATH,
  ACTIVE_CONSENT_DNS_LABEL,
  ACTIVE_CONSENT_WELL_KNOWN_PATH,
} from "./ownership.js";

interface Vector {
  secret: string;
  publishLocations: {
    ownershipDnsLabel: string;
    ownershipWellKnownPath: string;
    consentDnsLabel: string;
    consentWellKnownPath: string;
  };
  cases: Array<{
    name: string;
    endpoint: string;
    ownerAddress: string;
    normalizedEndpoint: string;
    ownershipToken: string;
    activeTestConsentToken: string;
  }>;
}

const vector: Vector = JSON.parse(
  readFileSync(join(__dirname, "..", "examples", "ownership-challenge-testvector.json"), "utf8"),
);

describe("published ownership conformance vectors", () => {
  it("covers the normalisation rules an outside implementer would get wrong", () => {
    const names = vector.cases.map((c) => c.name);
    for (const required of [
      "trailing-slash-is-stripped",
      "query-is-ignored",
      "fragment-is-ignored",
      "owner-address-case-is-ignored",
      "port-changes-the-endpoint",
      "path-changes-the-endpoint",
      "scheme-changes-the-endpoint",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("publishes the same locations this implementation uses", () => {
    expect(vector.publishLocations.ownershipDnsLabel).toBe(DNS_LABEL);
    expect(vector.publishLocations.ownershipWellKnownPath).toBe(WELL_KNOWN_PATH);
    expect(vector.publishLocations.consentDnsLabel).toBe(ACTIVE_CONSENT_DNS_LABEL);
    expect(vector.publishLocations.consentWellKnownPath).toBe(ACTIVE_CONSENT_WELL_KNOWN_PATH);
  });

  for (const c of vector.cases) {
    it(`[${c.name}] matches the implementation exactly`, () => {
      expect(normalizeEndpoint(c.endpoint)).toBe(c.normalizedEndpoint);
      expect(challengeToken(c.endpoint, c.ownerAddress, vector.secret)).toBe(c.ownershipToken);
      expect(activeTestConsentToken(c.endpoint, c.ownerAddress, vector.secret)).toBe(c.activeTestConsentToken);
    });
  }

  it("keeps consent and ownership tokens distinct for every case (domain separation)", () => {
    for (const c of vector.cases) {
      expect(c.activeTestConsentToken).not.toBe(c.ownershipToken);
    }
  });

  it("gives inputs that only differ in ignorable ways the same token", () => {
    const byNormalized = new Map<string, Set<string>>();
    for (const c of vector.cases) {
      const set = byNormalized.get(c.normalizedEndpoint) ?? new Set<string>();
      set.add(c.ownershipToken);
      byNormalized.set(c.normalizedEndpoint, set);
    }
    // Same normalised endpoint and owner must mean one and only one token.
    for (const [normalized, tokens] of byNormalized) {
      expect(tokens.size, `normalised endpoint ${normalized} produced more than one token`).toBe(1);
    }
  });
});
