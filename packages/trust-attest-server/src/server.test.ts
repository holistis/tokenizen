import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { verifyAttestation, challengeToken, proofLocation, type OwnershipCheckDeps } from "endpoint-attest";
import { getOwnershipChallenge, requestTrustAttestation } from "./server.js";
import { createAttesterIdentity, type AttesterIdentity } from "./attester-identity.js";

const ENDPOINT = "https://mcp.example.com/sse";
const OWNER = "0x" + "1".repeat(39) + "a"; // 40 hex chars after 0x, a valid (if not real) EOA-shaped address

function freshIdentity(): AttesterIdentity {
  return createAttesterIdentity();
}

/** A fetchImpl for runChecks' auth-signal check that always reports "enforced" (401), so tests focused on ownership/signing don't also have to think about the check outcome. */
const AUTH_ENFORCED_CHECK_FETCH = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;

describe("getOwnershipChallenge", () => {
  it("returns the same token for dns-txt and well-known-file (host-bound, not method-bound), matching challengeToken directly", () => {
    const identity = freshIdentity();
    const result = getOwnershipChallenge({ endpoint: ENDPOINT, ownerAddress: OWNER }, identity);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedToken = challengeToken(ENDPOINT, OWNER, identity.ownershipSecret);
    expect(result.dnsTxt.token).toBe(expectedToken);
    expect(result.wellKnownFile.token).toBe(expectedToken);
    expect(result.dnsTxt.location).toBe(proofLocation("dns-txt", ENDPOINT));
    expect(result.wellKnownFile.location).toBe(proofLocation("well-known-file", ENDPOINT));
  });

  it("never runs a check or touches the network — it is pure token derivation", () => {
    // No fetch/dns deps exist to inject here at all: the function signature
    // itself proves this (see server.ts), this test just documents why.
    const identity = freshIdentity();
    const result = getOwnershipChallenge({ endpoint: ENDPOINT, ownerAddress: OWNER }, identity);
    expect(result.ok).toBe(true);
  });

  it("returns a clean error, not a throw, on a malformed endpoint", () => {
    const identity = freshIdentity();
    const result = getOwnershipChallenge({ endpoint: "not a url", ownerAddress: OWNER }, identity);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not a valid URL");
  });
});

describe("requestTrustAttestation: ownership gate", () => {
  it("issues NO attestation and runs NO checks when ownership cannot be verified", async () => {
    const identity = freshIdentity();
    let checkFetchWasCalled = false;
    const ownershipDeps: OwnershipCheckDeps = {
      fetchImpl: (async () => new Response("wrong content", { status: 200 })) as typeof fetch,
    };
    const checkDeps = {
      fetchImpl: (async () => {
        checkFetchWasCalled = true;
        return new Response("unauthorized", { status: 401 });
      }) as typeof fetch,
    };

    const result = await requestTrustAttestation(
      { endpoint: ENDPOINT, ownerAddress: OWNER, method: "well-known-file" },
      identity,
      { ownershipDeps, checkDeps },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ownership not verified");
    expect(result.error).toContain("No checks were run and no attestation was issued");
    expect(checkFetchWasCalled).toBe(false); // the real proof this is a gate, not just a worded promise
  });

  it("also refuses cleanly when the DNS/fetch lookup itself fails technically", async () => {
    const identity = freshIdentity();
    const result = await requestTrustAttestation(
      { endpoint: ENDPOINT, ownerAddress: OWNER, method: "well-known-file" },
      identity,
      { ownershipDeps: { fetchImpl: (async () => { throw new Error("network down"); }) as typeof fetch } },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ownership not verified");
  });
});

describe("requestTrustAttestation: full success path", () => {
  it("returns a complete, independently-verifiable, signed EndpointAttestation once ownership IS verified", async () => {
    const identity = freshIdentity();
    const expectedToken = challengeToken(ENDPOINT, OWNER, identity.ownershipSecret);
    const ownershipDeps: OwnershipCheckDeps = {
      fetchImpl: (async () => new Response(expectedToken, { status: 200 })) as typeof fetch,
    };
    // Deliberately NOT injecting `now` here: verifyOwnership (endpoint-attest)
    // stamps ownershipProof.verifiedAt with the REAL wall clock internally
    // (it has no `now` deps seam of its own), and the schema requires
    // verifiedAt <= checkedAt — so checkedAt must track real time too,
    // asserted below via a tolerance rather than a fixed literal.
    const before = Date.now();

    const result = await requestTrustAttestation(
      { endpoint: ENDPOINT, ownerAddress: OWNER, method: "well-known-file" },
      identity,
      { ownershipDeps, checkDeps: { fetchImpl: AUTH_ENFORCED_CHECK_FETCH } },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { attestation } = result;

    // All the required content fields are present and correctly derived.
    expect(attestation.endpoint).toBe(ENDPOINT);
    expect(attestation.ownerAddress.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(attestation.attesterAddress.toLowerCase()).toBe(identity.wallet.address.toLowerCase());
    expect(attestation.ownershipProof).toMatchObject({ method: "well-known-file", token: expectedToken });
    expect(attestation.checksPerformed.length).toBeGreaterThan(0);
    expect(attestation.outcome).toBe("passed"); // AUTH_ENFORCED_CHECK_FETCH returns 401
    expect(attestation.findingsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(attestation.checkedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(attestation.checkedAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(attestation.expiresAt) - Date.parse(attestation.checkedAt)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(attestation.attestationId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(attestation.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);

    // And it verifies independently, via endpoint-attest's own verifier — not just our own construction.
    expect(verifyAttestation(attestation)).toEqual({ ok: true });
  });

  it("still verifies as of a moment before expiry, and is reported expired only after expiresAt", async () => {
    const identity = freshIdentity();
    const expectedToken = challengeToken(ENDPOINT, OWNER, identity.ownershipSecret);
    const ownershipDeps: OwnershipCheckDeps = {
      fetchImpl: (async () => new Response(expectedToken, { status: 200 })) as typeof fetch,
    };

    const result = await requestTrustAttestation(
      { endpoint: ENDPOINT, ownerAddress: OWNER, method: "well-known-file" },
      identity,
      { ownershipDeps, checkDeps: { fetchImpl: AUTH_ENFORCED_CHECK_FETCH } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expiresAtMs = Date.parse(result.attestation.expiresAt);
    expect(verifyAttestation(result.attestation, { now: new Date(expiresAtMs - 1000) })).toEqual({ ok: true });
    expect(verifyAttestation(result.attestation, { now: new Date(expiresAtMs + 1) })).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("propagates a FAILED check outcome into the attestation rather than hiding it behind a generic error", async () => {
    const identity = freshIdentity();
    const expectedToken = challengeToken(ENDPOINT, OWNER, identity.ownershipSecret);
    const ownershipDeps: OwnershipCheckDeps = {
      fetchImpl: (async () => new Response(expectedToken, { status: 200 })) as typeof fetch,
    };
    const checkDeps = {
      fetchImpl: (async () => new Response("No authentication required for this endpoint.", { status: 200 })) as typeof fetch,
    };

    const result = await requestTrustAttestation(
      { endpoint: ENDPOINT, ownerAddress: OWNER, method: "well-known-file" },
      identity,
      { ownershipDeps, checkDeps },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attestation.outcome).toBe("failed");
    expect(verifyAttestation(result.attestation)).toEqual({ ok: true }); // a "failed" outcome is still a validly signed, honest attestation
  });
});

describe("requestTrustAttestation: attesterAddress is NEVER ownerAddress (regression)", () => {
  it("refuses up front when ownerAddress equals this attester's own address, before any network call", async () => {
    const identity = freshIdentity();
    let anyNetworkCallHappened = false;
    const result = await requestTrustAttestation(
      { endpoint: ENDPOINT, ownerAddress: identity.wallet.address, method: "well-known-file" },
      identity,
      {
        ownershipDeps: { fetchImpl: (async () => { anyNetworkCallHappened = true; return new Response("x", { status: 200 }); }) as typeof fetch },
        checkDeps: { fetchImpl: (async () => { anyNetworkCallHappened = true; return new Response("x", { status: 200 }); }) as typeof fetch },
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("must not equal this attester's own address");
    expect(anyNetworkCallHappened).toBe(false);
  });

  it("independently: even a manually-forged content with attesterAddress === ownerAddress is rejected by endpoint-attest's own verifyAttestation, proving this is not merely our own opinion", async () => {
    // This test bypasses our server entirely and goes straight at
    // endpoint-attest's signing/verification, to show the rule holds at the
    // library level regardless of our own proactive guard above.
    const attester = ethers.Wallet.createRandom();
    const { signAttestation } = await import("endpoint-attest");
    const content = {
      endpoint: ENDPOINT,
      ownerAddress: attester.address, // deliberately equal to attesterAddress below
      attesterAddress: attester.address,
      ownershipProof: {
        method: "well-known-file" as const,
        token: "tok_" + "a".repeat(64),
        location: proofLocation("well-known-file", ENDPOINT),
        verifiedAt: "2026-01-01T00:00:00.000Z",
      },
      checksPerformed: ["auth-signal-on-plain-get"],
      outcome: "passed" as const,
      findingsHash: "a".repeat(64),
      checkedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-31T00:00:00.000Z",
    };
    const { attestationId, signature } = await signAttestation(attester, content);
    const attestation = { ...content, attestationId, signature };
    expect(verifyAttestation(attestation)).toMatchObject({ ok: false, reason: "attester_is_owner" });
  });
});
