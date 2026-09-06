import { describe, it, expect } from "vitest";
import { encodeClaimData, decodeClaimData, computeSchemaUID, SCHEMA_UID, easSource, type AttestationReader } from "./eas.js";
import { discoverDeliveryHistory } from "./discovery.js";
import { verifyClaim } from "./signing.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

const SELLER = "0x00000000000000000000000000000000000000aa";

describe("EAS encode/decode round-trip (offline, real ABI types)", () => {
  it("encodes a claim and decodes it back to a claim that still verifies", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "01".repeat(32) });
    const data = encodeClaimData(claim);
    const back = decodeClaimData(data);
    expect(back).not.toBeNull();
    expect(back!.claimId).toBe(claim.claimId);
    expect(verifyClaim(back!).ok).toBe(true);
  });

  it("preserves an optional priorClaimId through the round-trip", async () => {
    const buyer = testWallet();
    const c1 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "02".repeat(32) });
    const c2 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "03".repeat(32), priorClaimId: c1.claimId });
    const back = decodeClaimData(encodeClaimData(c2));
    expect(back?.priorClaimId).toBe(c1.claimId);
    expect(verifyClaim(back!).ok).toBe(true);
  });

  it("returns null for undecodable data", () => {
    expect(decodeClaimData("0x1234")).toBeNull();
  });

  it("returns null when the on-chain bytes32 claimId disagrees with the JSON claim", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "04".repeat(32) });
    const coder = (await import("ethers")).ethers.AbiCoder.defaultAbiCoder();
    // Encode with a claimId that does not match the JSON's own claimId.
    const mismatched = coder.encode(["bytes32", "string"], ["0x" + "ab".repeat(32), JSON.stringify(claim)]);
    expect(decodeClaimData(mismatched)).toBeNull();
  });

  it("schema UID is deterministic and matches the exported constant", () => {
    expect(computeSchemaUID()).toBe(SCHEMA_UID);
  });
});

describe("easSource + discovery (offline, injected reader)", () => {
  it("surfaces a genuine EAS-published claim and rejects a tampered one", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "05".repeat(32) });
    const tampered = { ...genuine, delivered: "no" as const }; // claimId no longer matches content

    const coder = (await import("ethers")).ethers.AbiCoder.defaultAbiCoder();
    // Two on-chain attestations: one genuine, one tampered (re-encoded with the
    // tampered content but keeping the original claimId so it still decodes).
    const store: Record<string, string> = {
      "0xuid-genuine": encodeClaimData(genuine),
      "0xuid-tampered": coder.encode(["bytes32", "string"], [genuine.claimId, JSON.stringify(tampered)]),
    };
    const reader: AttestationReader = {
      uidsForSeller: async () => Object.keys(store),
      dataForUid: async (uid) => store[uid]!,
    };

    const result = await discoverDeliveryHistory(SELLER, [easSource(reader, "eas-test")]);
    // Only the genuine claim survives verification.
    expect(result.count).toBe(1);
    expect(result.claims[0]?.claimId).toBe(genuine.claimId);
    // The tampered attestation decoded (same claimId) but failed verifyClaim in discovery.
    expect(result.sources[0]?.rejected).toBe(1);
  });

  it("drops an unreadable attestation without failing the others", async () => {
    const buyer = testWallet();
    const good = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "06".repeat(32) });
    const store: Record<string, string> = { "0xok": encodeClaimData(good), "0xbad": "0xdeadbeef" };
    const reader: AttestationReader = {
      uidsForSeller: async () => ["0xok", "0xbad"],
      dataForUid: async (uid) => store[uid]!,
    };
    const result = await discoverDeliveryHistory(SELLER, [easSource(reader)]);
    expect(result.count).toBe(1);
    expect(result.claims[0]?.claimId).toBe(good.claimId);
  });
});
