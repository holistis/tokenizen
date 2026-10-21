// receipt-authorization.test.ts — does our commitment match the published one,
// and does a version 2 receipt still verify for a stranger?
//
// The anchor that matters is SPEC_VECTOR.expected: a number published by someone
// else. An implementation that only agrees with itself proves nothing.

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  AUTHORIZATION_METHODS,
  SPEC_VECTOR,
  computeAuthorizationCommitment,
  generateAuthorizationSalt,
  openAuthorizationCommitment,
} from "./receipt-authorization.js";
import {
  RECEIPT_EIP712_DOMAIN,
  RECEIPT_EIP712_TYPES,
  RECEIPT_EIP712_TYPES_V2,
  RECEIPT_PAYLOAD_VERSION_V2,
  buildReceiptPayload,
  issueReceipt,
  recoverReceiptSigner,
  receiptTypesForVersion,
} from "./receipt-issue.js";

const seller = new ethers.Wallet("0x" + "33".repeat(32));
const buyer = new ethers.Wallet("0x" + "44".repeat(32));
const ISSUED_AT = 1_767_225_600;
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NONCE = "0xbad0d2c8c94df800c67bb382f5e8aa04f6ec50bca0be40d53d25131af839da8c";
const SALT = "0x" + "ab".repeat(32);

describe("computeAuthorizationCommitment", () => {
  it("reproduces the vector published with the spec", () => {
    const got = computeAuthorizationCommitment({ ...SPEC_VECTOR.input, method: "eip3009" });
    expect(got).toBe(SPEC_VECTOR.expected);
  });

  it("ignores hex case, because the spec hashes bytes and not text", () => {
    const upper = computeAuthorizationCommitment({
      method: "eip3009",
      asset: "0x" + SPEC_VECTOR.input.asset.slice(2).toUpperCase(),
      authorizer: SPEC_VECTOR.input.authorizer.toLowerCase(),
      identifier: "0x" + SPEC_VECTOR.input.identifier.slice(2).toUpperCase(),
      salt: SPEC_VECTOR.input.salt,
    });
    expect(upper).toBe(SPEC_VECTOR.expected);
  });

  it("refuses a field of the wrong length instead of hashing it anyway", () => {
    expect(() =>
      computeAuthorizationCommitment({
        method: "eip3009",
        asset: "0x1234",
        authorizer: SPEC_VECTOR.input.authorizer,
        identifier: NONCE,
        salt: SALT,
      }),
    ).toThrow(/20 bytes/);
    // A uint256 Permit2 nonce arrives as a short hex string, and a commitment made
    // over it would open to nothing. Better to fail here than to emit a dud.
    expect(() =>
      computeAuthorizationCommitment({
        method: "eip3009",
        asset: ASSET,
        authorizer: buyer.address,
        identifier: "0x01",
        salt: SALT,
      }),
    ).toThrow(/32 bytes/);
  });

  it("changes completely when only the salt changes", () => {
    const a = computeAuthorizationCommitment({
      method: "eip3009", asset: ASSET, authorizer: buyer.address, identifier: NONCE, salt: SALT,
    });
    const b = computeAuthorizationCommitment({
      method: "eip3009", asset: ASSET, authorizer: buyer.address, identifier: NONCE, salt: "0x" + "cd".repeat(32),
    });
    expect(a).not.toBe(b);
  });
});

describe("generateAuthorizationSalt", () => {
  it("returns 32 bytes and does not repeat", () => {
    const salts = new Set(Array.from({ length: 50 }, () => generateAuthorizationSalt()));
    expect(salts.size).toBe(50);
    for (const s of salts) expect(s).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("openAuthorizationCommitment", () => {
  const payload = {
    payer: buyer.address,
    authorizationMethod: "eip3009",
    authorizationCommitment: computeAuthorizationCommitment({
      method: "eip3009", asset: ASSET, authorizer: buyer.address, identifier: NONCE, salt: SALT,
    }),
  };
  const others = ["0x" + "11".repeat(32), "0x" + "22".repeat(32)];

  it("finds the one nonce among several candidates", () => {
    const r = openAuthorizationCommitment({
      payload, salt: SALT, asset: ASSET, candidateIdentifiers: [...others, NONCE],
    });
    expect(r).toEqual({ linked: true, identifier: NONCE });
  });

  it("does not link without the right salt", () => {
    const r = openAuthorizationCommitment({
      payload, salt: "0x" + "99".repeat(32), asset: ASSET, candidateIdentifiers: [NONCE],
    });
    expect(r.linked).toBe(false);
  });

  it("does not link with the right salt but the wrong asset", () => {
    // Section 5.6.4: holding only the receipt and the salt is not enough.
    const r = openAuthorizationCommitment({
      payload, salt: SALT, asset: seller.address, candidateIdentifiers: [NONCE],
    });
    expect(r.linked).toBe(false);
  });

  it("uses the signed payer, so a commitment made for someone else opens to nothing", () => {
    const foreign = {
      ...payload,
      authorizationCommitment: computeAuthorizationCommitment({
        method: "eip3009", asset: ASSET, authorizer: seller.address, identifier: NONCE, salt: SALT,
      }),
    };
    const r = openAuthorizationCommitment({
      payload: foreign, salt: SALT, asset: ASSET, candidateIdentifiers: [NONCE],
    });
    expect(r.linked).toBe(false);
  });

  it("says nothing rather than guessing when two candidates match", () => {
    const r = openAuthorizationCommitment({
      payload, salt: SALT, asset: ASSET, candidateIdentifiers: [NONCE, NONCE],
    });
    expect(r).toEqual({ linked: false, reason: "2 candidates open the same commitment, ambiguous" });
  });

  it("reports a v1 receipt as carrying no commitment", () => {
    const r = openAuthorizationCommitment({
      payload: { payer: buyer.address }, salt: SALT, asset: ASSET, candidateIdentifiers: [NONCE],
    });
    expect(r).toEqual({ linked: false, reason: "receipt carries no commitment" });
  });
});

describe("version 2 receipts", () => {
  const commitment = computeAuthorizationCommitment({
    method: "eip3009", asset: ASSET, authorizer: buyer.address, identifier: NONCE, salt: SALT,
  });
  const input = {
    network: "eip155:84532",
    resourceUrl: "https://api.tokenizen.nl/api/paid/verify-ownership",
    payer: buyer.address,
    issuedAt: ISSUED_AT,
    authorizationMethod: "eip3009" as string | undefined,
    authorizationCommitment: commitment as string | undefined,
  };
  const v1Input = {
    network: input.network,
    resourceUrl: input.resourceUrl,
    payer: input.payer,
    issuedAt: input.issuedAt,
  };

  it("stays on version 1 when no commitment is given", () => {
    const p = buildReceiptPayload(v1Input);
    expect(p.version).toBe(1);
    expect(p).not.toHaveProperty("authorizationCommitment");
  });

  it("becomes version 2 with both fields when a commitment is given", () => {
    const p = buildReceiptPayload(input);
    expect(p.version).toBe(RECEIPT_PAYLOAD_VERSION_V2);
    expect(p.authorizationMethod).toBe("eip3009");
    expect(p.authorizationCommitment).toBe(commitment);
  });

  it("refuses one half of the pair", () => {
    expect(() => buildReceiptPayload({ ...input, authorizationCommitment: undefined })).toThrow(/go together/);
    expect(() => buildReceiptPayload({ ...input, authorizationMethod: undefined })).toThrow(/go together/);
  });

  it("refuses a commitment that is not a sha-256 digest", () => {
    expect(() => buildReceiptPayload({ ...input, authorizationCommitment: "0xdeadbeef" })).toThrow(/SHA-256/);
  });

  it("round-trips through a signature a stranger can check", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(input), seller);
    const recovered = recoverReceiptSigner(artifact);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.signer).toBe(seller.address);
    expect(recovered.payload.authorizationCommitment).toBe(commitment);
  });

  it("does not verify a v2 payload under the v1 type, which is why the version selects the schema", async () => {
    const p = buildReceiptPayload(input);
    const artifact = await issueReceipt(p, seller);
    const { signature } = JSON.parse(artifact) as { signature: string };
    const underV1 = ethers.verifyTypedData(
      RECEIPT_EIP712_DOMAIN,
      RECEIPT_EIP712_TYPES as never,
      p as never,
      signature,
    );
    expect(underV1).not.toBe(seller.address);
  });

  it("still verifies every version 1 receipt, unchanged", async () => {
    const artifact = await issueReceipt(buildReceiptPayload(v1Input), seller);
    const recovered = recoverReceiptSigner(artifact);
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.signer).toBe(seller.address);
  });

  it("rejects a version nobody has defined instead of guessing a schema", () => {
    expect(receiptTypesForVersion(3)).toBeNull();
    expect(RECEIPT_EIP712_TYPES_V2.Receipt).toHaveLength(RECEIPT_EIP712_TYPES.Receipt.length + 2);
  });

  it("only knows eip3009 for now, and says so", () => {
    expect(Object.keys(AUTHORIZATION_METHODS)).toEqual(["eip3009"]);
  });
});
