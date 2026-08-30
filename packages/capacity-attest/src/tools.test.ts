import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import { recordDelivery, getDeliveryHistory } from "./tools.js";
import { signClaim } from "./signing.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-tools-test-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
});

afterEach(() => {
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("recordDelivery", () => {
  it("accepteert en slaat een geldige, correct ondertekende claim op", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);

    const result = recordDelivery(claim);

    expect(result).toEqual({ ok: true, claimId: claim.claimId });
  });

  it("weigert een claim met een ongeldige handtekening", async () => {
    const buyer = testWallet();
    const impostor = testWallet();
    // Build the claim's content honestly claiming to be from `buyer`, but
    // sign it with a different wallet — same tamper scenario an attacker
    // trying to fabricate someone else's delivery record would attempt.
    const claimContent = {
      sellerAddress: "0x00000000000000000000000000000000000000aa",
      buyerAddress: buyer.address,
      assetType: "gpu-hours" as const,
      promisedSpec: "1x A100, 4 hours",
      delivered: "yes" as const,
      evidenceHash: "1".repeat(64),
      settlementRef: "0x" + "11".repeat(32),
      timestamp: new Date().toISOString(),
    };
    const { claimId, signature } = await signClaim(impostor, claimContent);

    const result = recordDelivery({ ...claimContent, claimId, signature });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/signature_invalid/);
  });

  it("weigert input die niet aan het schema voldoet", () => {
    const result = recordDelivery({ not: "a claim" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/invalid_claim/);
  });

  it("weigert dezelfde claim een tweede keer (ledger blijft append-only via deze tool)", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);

    expect(recordDelivery(claim)).toEqual({ ok: true, claimId: claim.claimId });
    const second = recordDelivery(claim);
    expect(second.ok).toBe(false);
  });
});

describe("getDeliveryHistory", () => {
  it("retourneert claims chronologisch en alleen voor de gevraagde verkoper", async () => {
    const buyer = testWallet();
    const sellerA = "0x00000000000000000000000000000000000000aa";
    const sellerB = "0x00000000000000000000000000000000000000bb";

    const older = await buildSignedClaim(buyer, {
      sellerAddress: sellerA,
      timestamp: "2026-01-01T00:00:00.000Z",
      settlementRef: "0x" + "01".repeat(32),
    });
    const newer = await buildSignedClaim(buyer, {
      sellerAddress: sellerA,
      timestamp: "2026-06-01T00:00:00.000Z",
      settlementRef: "0x" + "02".repeat(32),
    });
    const otherSeller = await buildSignedClaim(buyer, {
      sellerAddress: sellerB,
      settlementRef: "0x" + "03".repeat(32),
    });

    recordDelivery(newer);
    recordDelivery(older);
    recordDelivery(otherSeller);

    const history = getDeliveryHistory(sellerA);

    expect(history.sellerAddress).toBe(sellerA);
    expect(history.count).toBe(2);
    expect(history.claims.map((c) => c.claimId)).toEqual([older.claimId, newer.claimId]);
  });

  it("retourneert een lege lijst voor een verkoper zonder claims (geen crash)", () => {
    const history = getDeliveryHistory("0x00000000000000000000000000000000000000ff");
    expect(history).toEqual({ sellerAddress: "0x00000000000000000000000000000000000000ff", count: 0, claims: [] });
  });

  it("berekent geen samengevat score-getal — enkel de ruwe claims komen terug", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    recordDelivery(claim);

    const history = getDeliveryHistory(claim.sellerAddress);
    expect(Object.keys(history).sort()).toEqual(["claims", "count", "sellerAddress"]);
  });
});

// Sanity check that ethers.Wallet (not just the test-helper's HDNodeWallet) round-trips too.
describe("recordDelivery met een standaard ethers.Wallet", () => {
  it("werkt met een wallet van een expliciete privékey", async () => {
    const wallet = new ethers.Wallet("0x" + "77".repeat(32));
    const content = {
      sellerAddress: "0x00000000000000000000000000000000000000aa",
      buyerAddress: wallet.address,
      assetType: "storage" as const,
      promisedSpec: "500GB, 30 days",
      delivered: "partial" as const,
      evidenceHash: "2".repeat(64),
      settlementRef: "0x" + "22".repeat(32),
      timestamp: new Date().toISOString(),
    };
    const { claimId, signature } = await signClaim(wallet, content);

    const result = recordDelivery({ ...content, claimId, signature });
    expect(result).toEqual({ ok: true, claimId });
  });
});
