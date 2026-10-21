// x402-seller.test.ts — the seller side refuses to be half-configured.

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  readSellerConfig,
  makeTypedDataSigner,
  buildPaidRoutes,
  buildOfferReceiptExtension,
  SELLER_NETWORK,
} from "./x402-seller.js";

const KEY = "0x" + "11".repeat(32);
const SIGNER = ethers.computeAddress(KEY);
const PAY_TO = "0x" + "cc".repeat(20);

describe("readSellerConfig", () => {
  it("returns null when nothing is configured, because not selling is normal", () => {
    expect(readSellerConfig({})).toBeNull();
  });

  it("refuses a payTo without a signing key, rather than advertising a receipt it cannot sign", () => {
    expect(() => readSellerConfig({ X402_PAY_TO: PAY_TO })).toThrow(/cannot sign a receipt/);
  });

  it("refuses a signing key without a payTo, rather than taking payment nowhere", () => {
    expect(() => readSellerConfig({ X402_RECEIPT_SIGNING_KEY: KEY })).toThrow(/nowhere for a payment/);
  });

  it("refuses the signing key and payTo being the same address", () => {
    expect(() =>
      readSellerConfig({ X402_RECEIPT_SIGNING_KEY: KEY, X402_PAY_TO: SIGNER }),
    ).toThrow(/SHOULD be separate/);
  });

  it("refuses a malformed key or payTo instead of signing with it", () => {
    expect(() => readSellerConfig({ X402_RECEIPT_SIGNING_KEY: "0xdeadbeef", X402_PAY_TO: PAY_TO })).toThrow(/32-byte hex/);
    expect(() => readSellerConfig({ X402_RECEIPT_SIGNING_KEY: KEY, X402_PAY_TO: "not-an-address" })).toThrow(/valid address/);
  });

  it("refuses a resource base with a path or without https, since authorization is checked against its host", () => {
    const base = { X402_RECEIPT_SIGNING_KEY: KEY, X402_PAY_TO: PAY_TO };
    expect(() => readSellerConfig({ ...base, X402_RESOURCE_BASE: "https://api.tokenizen.nl/api" })).toThrow(/no path/);
    expect(() => readSellerConfig({ ...base, X402_RESOURCE_BASE: "http://api.tokenizen.nl" })).toThrow(/https origin/);
  });

  it("derives a kid that matches the controller form published in DNS", () => {
    const c = readSellerConfig({ X402_RECEIPT_SIGNING_KEY: KEY, X402_PAY_TO: PAY_TO })!;
    expect(c.kid).toBe(`did:pkh:eip155:1:${SIGNER}`);
    expect(c.signerAddress).toBe(SIGNER);
  });

  it("defaults the price and the resource base, and strips a trailing slash", () => {
    const c = readSellerConfig({
      X402_RECEIPT_SIGNING_KEY: KEY,
      X402_PAY_TO: PAY_TO,
      X402_RESOURCE_BASE: "https://api.tokenizen.nl/",
    })!;
    expect(c.price).toBe("$0.001");
    expect(c.resourceBase).toBe("https://api.tokenizen.nl");
  });
});

describe("makeTypedDataSigner", () => {
  it("signs the receipt digest so the signature recovers to the signing key", async () => {
    const domain = { name: "x402 receipt", version: "1", chainId: 1 };
    const types = {
      Receipt: [
        { name: "version", type: "uint256" },
        { name: "network", type: "string" },
        { name: "resourceUrl", type: "string" },
        { name: "payer", type: "string" },
        { name: "issuedAt", type: "uint256" },
        { name: "transaction", type: "string" },
      ],
    };
    const message = {
      version: 1,
      network: SELLER_NETWORK,
      resourceUrl: "https://api.tokenizen.nl/api/paid/verify-ownership",
      payer: "0x" + "22".repeat(20),
      issuedAt: 1_767_225_600,
      transaction: "",
    };

    const sign = makeTypedDataSigner(KEY);
    const signature = await sign({ domain, types, primaryType: "Receipt", message });
    expect(ethers.verifyTypedData(domain, types, message, signature)).toBe(SIGNER);
  });

  it("tolerates an EIP712Domain entry in the types map, which ethers would otherwise reject", async () => {
    const domain = { name: "x402 receipt", version: "1", chainId: 1 };
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      Receipt: [{ name: "version", type: "uint256" }],
    };
    const sign = makeTypedDataSigner(KEY);
    await expect(sign({ domain, types, primaryType: "Receipt", message: { version: 1 } })).resolves.toMatch(/^0x[0-9a-f]+$/);
  });
});

describe("buildPaidRoutes", () => {
  const config = readSellerConfig({ X402_RECEIPT_SIGNING_KEY: KEY, X402_PAY_TO: PAY_TO })!;

  it("prices one route on the network the facilitator actually supports", () => {
    const routes = buildPaidRoutes(config) as Record<string, { accepts: Array<Record<string, unknown>> }>;
    const route = routes["POST /api/paid/verify-ownership"]!;
    expect(route.accepts[0]!.network).toBe(SELLER_NETWORK);
    expect(route.accepts[0]!.payTo).toBe(PAY_TO);
    expect(route.accepts[0]!.scheme).toBe("exact");
  });

  it("declares the offer-receipt extension on that route", () => {
    const routes = buildPaidRoutes(config) as Record<string, { extensions: Record<string, unknown> }>;
    const declared = Object.keys(routes["POST /api/paid/verify-ownership"]!.extensions);
    expect(declared).toContain("offer-receipt");
  });

  it("says plainly that the same answer is free elsewhere", () => {
    const routes = buildPaidRoutes(config) as Record<string, { description: string }>;
    expect(routes["POST /api/paid/verify-ownership"]!.description).toMatch(/free/);
  });
});

describe("buildOfferReceiptExtension", () => {
  it("constructs without reaching the network", () => {
    const config = readSellerConfig({ X402_RECEIPT_SIGNING_KEY: KEY, X402_PAY_TO: PAY_TO })!;
    expect(() => buildOfferReceiptExtension(config)).not.toThrow();
  });
});
