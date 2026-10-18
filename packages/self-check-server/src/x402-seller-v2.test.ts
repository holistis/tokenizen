// x402-seller-v2.test.ts — does the seller emit a receipt that can actually be opened?
//
// The nonce, asset and payer below are not invented. They are the real values
// from our own settlement on Base Sepolia, transaction
// 0xd22cfc2d0707b8fa159e6f70ba7a75e8eb83349374797d0e252c9ff3d2ecc749, whose
// receipt logs an AuthorizationUsed(authorizer, nonce) event with exactly this
// 32 byte nonce. So the linking test below is the same arithmetic a stranger
// would do against the chain, run offline against a value the chain already has.

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  openAuthorizationCommitment,
  computeAuthorizationCommitment,
} from "capacity-attest/dist/receipt-authorization.js";
import { recoverReceiptSigner } from "capacity-attest/dist/receipt-issue.js";
import {
  readSellerConfig,
  buildOfferReceiptExtension,
  readSettlementAuthorization,
  SELLER_NETWORK,
} from "./x402-seller.js";

const KEY = "0x" + "11".repeat(32);
const SIGNER = ethers.computeAddress(KEY);
const PAY_TO = "0x" + "cc".repeat(20);
const RESOURCE = "https://api.tokenizen.nl/api/paid/verify-ownership";

/** USDC on Base Sepolia, the asset of the accepts entry we actually paid. */
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
/** The buyer in that settlement, and the authorizer in the on-chain event. */
const BUYER = "0x87f344b6ec48a936373d774d3de8649deeb66ee1";
/** The nonce the chain logged for it. */
const NONCE = "0xbad0d2c8c94df800c67bb382f5e8aa04f6ec50bca0be40d53d25131af839da8c";

function config(v2: boolean) {
  return readSellerConfig({
    X402_RECEIPT_SIGNING_KEY: KEY,
    X402_PAY_TO: PAY_TO,
    ...(v2 ? { X402_RECEIPT_V2: "1" } : {}),
  })!;
}

function context(over: Record<string, any> = {}) {
  return {
    result: { success: true, payer: BUYER, network: SELLER_NETWORK, transaction: "0x" + "ee".repeat(32) },
    requirements: { asset: ASSET },
    paymentPayload: { payload: { authorization: { from: BUYER, nonce: NONCE } } },
    transportContext: { request: { adapter: { getUrl: () => RESOURCE } } },
    ...over,
  };
}

async function settle(v2: boolean, over: Record<string, any> = {}) {
  const ext = buildOfferReceiptExtension(config(v2)) as unknown as {
    enrichSettlementResponse: (d: unknown, c: unknown) => Promise<any>;
  };
  return ext.enrichSettlementResponse({}, context(over));
}

describe("readSettlementAuthorization", () => {
  it("finds the authorization the payer signed", () => {
    expect(readSettlementAuthorization(context(), BUYER)).toEqual({ asset: ASSET, authorizer: BUYER, nonce: NONCE });
  });

  it("accepts the flatter payload shape too, since the wrapper is not ours", () => {
    const flat = context({ paymentPayload: { authorization: { from: BUYER, nonce: NONCE } } });
    expect(readSettlementAuthorization(flat, BUYER)?.nonce).toBe(NONCE);
  });

  it("returns nothing for a nonce that is not 32 bytes, such as a Permit2 one", () => {
    const permit2 = context({ paymentPayload: { payload: { authorization: { from: BUYER, nonce: "0x2a" } } } });
    expect(readSettlementAuthorization(permit2, BUYER)).toBeNull();
  });

  it("returns nothing when the authorizer is not the payer the receipt will name", () => {
    // Such a commitment opens to no nonce at all, so it would be a field that
    // looks like a link and is not one.
    const other = context({ paymentPayload: { payload: { authorization: { from: PAY_TO, nonce: NONCE } } } });
    expect(readSettlementAuthorization(other, BUYER)).toBeNull();
  });
});

describe("the seller with version 2 switched off", () => {
  it("signs the same version 1 receipt it always did", async () => {
    const out = await settle(false);
    expect(out.info.receipt.payload.version).toBe(1);
    expect(out.info).not.toHaveProperty("authorizationSalt");
  });
});

describe("the seller with version 2 switched on", () => {
  it("returns a version 2 receipt and the salt beside it, never inside it", async () => {
    const out = await settle(true);
    const payload = out.info.receipt.payload;
    expect(payload.version).toBe(2);
    expect(payload.authorizationMethod).toBe("eip3009");
    expect(payload.authorizationCommitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(out.info.authorizationSalt).toMatch(/^0x[0-9a-f]{64}$/);
    // Section 5.6.3: forwarding the receipt must not forward the link.
    expect(JSON.stringify(out.info.receipt)).not.toContain(out.info.authorizationSalt);
  });

  it("signs it so a stranger recovers our address", async () => {
    const out = await settle(true);
    const recovered = recoverReceiptSigner(JSON.stringify(out.info.receipt));
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.signer).toBe(SIGNER);
  });

  it("opens against the nonce the chain really logged", async () => {
    const out = await settle(true);
    const linked = openAuthorizationCommitment({
      payload: out.info.receipt.payload,
      salt: out.info.authorizationSalt,
      asset: ASSET,
      candidateIdentifiers: ["0x" + "77".repeat(32), NONCE, "0x" + "88".repeat(32)],
    });
    expect(linked).toEqual({ linked: true, identifier: NONCE });
  });

  it("gives a different salt and commitment every time, for the same payment", async () => {
    const a = await settle(true);
    const b = await settle(true);
    expect(a.info.authorizationSalt).not.toBe(b.info.authorizationSalt);
    expect(a.info.receipt.payload.authorizationCommitment).not.toBe(
      b.info.receipt.payload.authorizationCommitment,
    );
    // Both still open to the same settlement, which is the point of the salt.
    for (const out of [a, b]) {
      expect(
        openAuthorizationCommitment({
          payload: out.info.receipt.payload,
          salt: out.info.authorizationSalt,
          asset: ASSET,
          candidateIdentifiers: [NONCE],
        }).linked,
      ).toBe(true);
    }
  });

  it("tells a holder of the receipt alone nothing, because the salt is what opens it", async () => {
    const out = await settle(true);
    const guessed = computeAuthorizationCommitment({
      method: "eip3009", asset: ASSET, authorizer: BUYER, identifier: NONCE, salt: "0x" + "00".repeat(32),
    });
    expect(guessed).not.toBe(out.info.receipt.payload.authorizationCommitment);
  });

  it("falls back to a version 1 receipt rather than emitting none, on a Permit2 nonce", async () => {
    const out = await settle(true, {
      paymentPayload: { payload: { authorization: { from: BUYER, nonce: "0x2a" } } },
    });
    expect(out.info.receipt.payload.version).toBe(1);
    expect(out.info).not.toHaveProperty("authorizationSalt");
  });

  it("falls back when the asset is missing from the requirements", async () => {
    const out = await settle(true, { requirements: {} });
    expect(out.info.receipt.payload.version).toBe(1);
  });

  it("emits nothing at all for a failed settlement", async () => {
    expect(await settle(true, { result: { success: false } })).toBeUndefined();
  });

  // ONZE SLEUTEL TEKENT NIET OP HET WOORD VAN EEN DERDE. `network` komt rechtstreeks
  // uit het settle-antwoord van de facilitator, en niets vergeleek het met het netwerk
  // dat deze route zelf aanbood. Een facilitator die een andere keten noemt, kreeg
  // daarmee onze handtekening op een uitspraak over een betaling die wij nooit hebben
  // geadverteerd, en een lezer van dat bonnetje kan dat niet zien.
  //
  // WEIGEREN, NIET TERUGVALLEN. Terugvallen op het bonnetje van versie 1 zou hetzelfde
  // verkeerde netwerk ondertekenen, alleen zonder commitment. Geen bonnetje is een
  // eerlijke uitkomst; een ondertekend onwaar bonnetje niet.
  //
  // GEMETEN VOOR DIT ERIN GING: onze drie echte bonnetjes dragen alle drie
  // eip155:84532, precies SELLER_NETWORK, dus dit weigert niets wat vandaag werkt.
  it("weigert te tekenen als de facilitator een ander netwerk meldt dan wij aanboden", async () => {
    const uit = await settle(true, {
      result: { success: true, payer: BUYER, network: "eip155:1", transaction: "0x" + "ee".repeat(32) },
    });
    expect(uit).toBeUndefined();
  });

  it("en ook als de route een netwerk EIST dat de facilitator niet gebruikte", async () => {
    const uit = await settle(true, {
      requirements: { asset: ASSET, network: "eip155:8453" },
    });
    expect(uit).toBeUndefined();
  });

  it("maar tekent gewoon als het netwerk klopt met wat de route eist", async () => {
    const uit = await settle(true, {
      requirements: { asset: ASSET, network: SELLER_NETWORK },
    });
    expect(uit?.info?.receipt).toBeTruthy();
    expect(uit?.info?.authorizationSalt).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
