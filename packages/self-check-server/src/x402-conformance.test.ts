// x402-conformance.test.ts — is de testbestemming zelf wel in orde?
//
// Dit is het soort bestand dat makkelijk met de hand wordt bijgehouden en
// daardoor stil verkeerd raakt. Bij het schrijven van de fixture gokte ik twee
// tijdstempels en twee handtekeningen, en allebei waren fout: de handtekeningen
// zouden naar een vreemd adres hebben herleid en een implementeerder zou terecht
// hebben geconcludeerd dat onze bonnetjes niet kloppen.
//
// Deze test rekent daarom de HELE fixture na zonder netwerk: elke handtekening
// moet naar de genoemde ondertekenaar herleiden, en elk commitment moet openen
// op de genoemde nonce. Een getal dat niet bij de rest past, kan niet meer live
// gaan zonder dat dit rood wordt.

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { computeAuthorizationCommitment } from "capacity-attest/dist/receipt-authorization.js";
import {
  RECEIPT_EIP712_DOMAIN,
  RECEIPT_EIP712_TYPES_V2,
} from "capacity-attest/dist/receipt-issue.js";
import { conformanceFixture } from "./x402-conformance.js";

const fixture = conformanceFixture();
const cases = fixture.replayableCases.cases;
const asset = fixture.replayableCases.asset;

describe("de conformance-fixture", () => {
  it("bevat drie gevallen", () => {
    expect(cases).toHaveLength(3);
  });

  it("geeft nooit een sleutel of een omgevingswaarde weg", () => {
    // Deze route is publiek en heeft geen auth, dus alleen al-publieke waarden
    // mogen erin. Een private key is 64 hextekens; een handtekening is 130, dus
    // die vorm wordt apart uitgesloten in plaats van breed op lengte te zoeken.
    const platte = JSON.stringify(fixture);
    expect(platte).not.toMatch(/PRIVATE|SIGNING_KEY|mnemonic|seed phrase/i);
    const verdachte = (platte.match(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g) ?? []).filter((h) => {
      // zout, nonce, commitment en tx-hash zijn allemaal 32 bytes en horen hier
      return !platte.includes(`"${h}"`);
    });
    expect(verdachte).toEqual([]);
  });

  for (const c of cases) {
    describe(c.id, () => {
      it("de handtekening herleidt naar de genoemde ondertekenaar", () => {
        const hersteld = ethers.verifyTypedData(
          RECEIPT_EIP712_DOMAIN,
          RECEIPT_EIP712_TYPES_V2 as never,
          c.receipt.payload as never,
          c.receipt.signature,
        );
        expect(hersteld.toLowerCase()).toBe(c.expected.receiptSigner.toLowerCase());
      });

      it("het commitment opent op de genoemde nonce", () => {
        const herrekend = computeAuthorizationCommitment({
          method: "eip3009",
          asset,
          authorizer: c.receipt.payload.payer,
          identifier: c.expected.authorizationNonce,
          salt: c.authorizationSalt,
        });
        expect(herrekend.toLowerCase()).toBe(c.receipt.payload.authorizationCommitment.toLowerCase());
      });

      it("opent NIET op de nonce van een ander geval, want dan zou de fixture niets bewijzen", () => {
        const andere = cases.filter((x) => x.id !== c.id);
        for (const a of andere) {
          const metAndereNonce = computeAuthorizationCommitment({
            method: "eip3009",
            asset,
            authorizer: c.receipt.payload.payer,
            identifier: a.expected.authorizationNonce,
            salt: c.authorizationSalt,
          });
          expect(metAndereNonce.toLowerCase()).not.toBe(
            c.receipt.payload.authorizationCommitment.toLowerCase(),
          );
        }
      });

      it("is versie 2 met beide commitment-velden gevuld", () => {
        expect(c.receipt.payload.version).toBe(2);
        expect(c.receipt.payload.authorizationMethod).toBe("eip3009");
        expect(c.receipt.payload.authorizationCommitment).toMatch(/^0x[0-9a-f]{64}$/);
      });
    });
  }

  it("alle drie hebben identieke voorwaarden, want daar zit de moeilijkheid", () => {
    const sleutels = ["network", "resourceUrl", "payer"] as const;
    for (const k of sleutels) {
      const waarden = new Set(cases.map((c) => c.receipt.payload[k]));
      expect(waarden.size).toBe(1);
    }
  });

  it("alle drie hebben een ANDER zout, commitment, nonce en afrekening", () => {
    for (const veld of [
      cases.map((c) => c.authorizationSalt),
      cases.map((c) => c.receipt.payload.authorizationCommitment),
      cases.map((c) => c.expected.authorizationNonce),
      cases.map((c) => c.expected.settlementTransaction),
    ]) {
      expect(new Set(veld).size).toBe(3);
    }
  });

  it("draagt zijn eigen bronvermelding mee", () => {
    expect(fixture.citeAs).toContain("api.tokenizen.nl/api/x402/conformance");
    expect(fixture.specification.builtAgainstCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("noemt de grenzen, inclusief dat koper en verkoper dezelfde partij zijn", () => {
    expect(fixture.honestLimits.join(" ")).toMatch(/both us/i);
  });
});
