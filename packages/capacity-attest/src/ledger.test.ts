import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendClaim, claimsForSeller, allClaims } from "./ledger.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

// Each test gets its own throwaway directory via CAPACITY_ATTEST_DATA_DIR, read
// lazily by config.ts on every call — so no import-order tricks are needed,
// unlike a module-load-time-captured constant would require.
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-test-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
});

afterEach(() => {
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("ledger", () => {
  it("slaat een claim op en leest hem terug", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    const claims = await claimsForSeller(claim.sellerAddress);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.claimId).toBe(claim.claimId);
  });

  it("retourneert claims chronologisch (oudste eerst)", async () => {
    const buyer = testWallet();
    const older = await buildSignedClaim(buyer, { timestamp: "2026-01-01T00:00:00.000Z", settlementRef: "0x" + "aa".repeat(32) });
    const newer = await buildSignedClaim(buyer, { timestamp: "2026-06-01T00:00:00.000Z", settlementRef: "0x" + "bb".repeat(32) });

    // Append in reverse order on purpose — the ledger, not insertion order, must sort them.
    await appendClaim(newer);
    await appendClaim(older);

    const claims = await claimsForSeller(older.sellerAddress);
    expect(claims.map((c) => c.claimId)).toEqual([older.claimId, newer.claimId]);
  });

  it("filtert uitsluitend op de gevraagde sellerAddress", async () => {
    const buyer = testWallet();
    const forSellerA = await buildSignedClaim(buyer, {
      sellerAddress: "0x00000000000000000000000000000000000000aa",
      settlementRef: "0x" + "aa".repeat(32),
    });
    const forSellerB = await buildSignedClaim(buyer, {
      sellerAddress: "0x00000000000000000000000000000000000000bb",
      settlementRef: "0x" + "bb".repeat(32),
    });
    await appendClaim(forSellerA);
    await appendClaim(forSellerB);

    const claims = await claimsForSeller("0x00000000000000000000000000000000000000aa");
    expect(claims).toHaveLength(1);
    expect(claims[0]?.claimId).toBe(forSellerA.claimId);
  });

  it("is case-insensitief op adressen bij het filteren", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: "0x00000000000000000000000000000000000000aa" });
    await appendClaim(claim);

    const claims = await claimsForSeller("0x00000000000000000000000000000000000000AA");
    expect(claims).toHaveLength(1);
  });

  it("is append-only: een tweede keer dezelfde claim opslaan wordt geweigerd, niet overschreven", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer);
    await appendClaim(claim);

    await expect(appendClaim(claim)).rejects.toThrow(/claim_already_recorded/);
    expect(await allClaims()).toHaveLength(1);
  });

  it("heeft geen enkele update- of delete-functie geëxporteerd", async () => {
    const ledgerModule = await import("./ledger.js");
    const exportedNames = Object.keys(ledgerModule);
    expect(exportedNames).toEqual(
      expect.arrayContaining(["appendClaim", "claimsForSeller", "allClaims"]),
    );
    for (const name of exportedNames) {
      expect(name.toLowerCase()).not.toMatch(/update|delete|mutate|overwrite/);
    }
  });
});
