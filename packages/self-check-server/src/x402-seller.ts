// x402-seller.ts — turn this API into a paid x402 resource that signs receipts.
//
// WHY THIS EXISTS, and it is not to make money. Sampled on 2026-10-15 across one
// facilitator's discovery index of 20,462 live x402 resources, at six spread
// offsets of 100 each, not a single resource declared the offer-receipt
// extension. The buyer's half of a delivery record is implemented and published
// (capacity-attest names a seller's receipt by digest); the seller's half does
// not exist in the wild for anyone to name. So the missing piece is a seller
// that emits one at all.
//
// WHAT A BUYER ACTUALLY PAYS FOR HERE. The same ownership verification the free
// route performs, plus a signed receipt for it. The receipt is the product. A
// caller who only wants the answer should keep using the free route.
//
// OFF BY DEFAULT. Without a signing key and a payTo address in the environment,
// this contributes nothing: no route, no 402, no declaration. A storefront that
// advertises a price it cannot settle is a false promise, so it stays dark until
// it is actually configured.
//
// SIGNER AUTHORIZATION. §4.5.1 is explicit that a valid signature is not
// authorization: anyone can sign a receipt for any resourceUrl. The signing key
// is therefore published as a controller of this domain in a DNS TXT record at
// _controllers.tokenizen.nl, in the form the section describes, and `kid` below
// is exactly that controller string so a verifier can match the two without
// guessing.
//
// TESTNET FIRST, deliberately. eip155:84532 is Base Sepolia. The money is fake,
// the cryptography is not, and nothing here needs a real payment to be proven
// wrong. §5.3 also notes a dedicated signing key SHOULD be separate from payTo,
// which is why they are two environment variables rather than one address reused.

import { ethers } from "ethers";
import {
  createEIP712OfferReceiptIssuer,
  createOfferReceiptExtension,
  declareOfferReceiptExtension,
} from "@x402/extensions/offer-receipt";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";

/** Base Sepolia. Confirmed supported by the public facilitator with scheme "exact" on 2026-10-15. */
export const SELLER_NETWORK = "eip155:84532";

/** The public facilitator. Its /supported endpoint lists this network and scheme. */
export const FACILITATOR_URL = "https://x402.org/facilitator";

export interface SellerEnv {
  /** Private key of the receipt signing key. Lives only in the service environment file. */
  X402_RECEIPT_SIGNING_KEY?: string | undefined;
  /** Address that receives payment. Separate from the signing key, per §5.3's SHOULD. */
  X402_PAY_TO?: string | undefined;
  /** Price per call, in the facilitator's dollar notation. Defaults to a tenth of a cent. */
  X402_PRICE?: string | undefined;
  /** Public base URL this API is reached at, used for resourceUrl and signer authorization. */
  X402_RESOURCE_BASE?: string | undefined;
}

export interface SellerConfig {
  /** The controller string from the DNS TXT record, used as the receipt's kid. */
  kid: string;
  signerAddress: string;
  payTo: string;
  price: string;
  resourceBase: string;
  privateKey: string;
}

/**
 * Read the environment, or explain exactly what is missing.
 *
 * Returns null rather than throwing when nothing is configured: not being a
 * seller is the normal state, not an error.
 */
export function readSellerConfig(env: SellerEnv): SellerConfig | null {
  const key = env.X402_RECEIPT_SIGNING_KEY?.trim();
  const payTo = env.X402_PAY_TO?.trim();
  if (!key && !payTo) return null;
  if (!key) throw new Error("X402_PAY_TO is set but X402_RECEIPT_SIGNING_KEY is not: a seller that cannot sign a receipt should not advertise one");
  if (!payTo) throw new Error("X402_RECEIPT_SIGNING_KEY is set but X402_PAY_TO is not: there is nowhere for a payment to go");

  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("X402_RECEIPT_SIGNING_KEY must be a 0x-prefixed 32-byte hex private key");
  if (!ethers.isAddress(payTo)) throw new Error("X402_PAY_TO must be a valid address");

  const signerAddress = ethers.computeAddress(key);
  if (signerAddress.toLowerCase() === payTo.toLowerCase()) {
    throw new Error(
      "the signing key and payTo are the same address: section 5.3 says a dedicated signing key SHOULD be separate, since coupling them means one compromise loses both",
    );
  }

  const resourceBase = (env.X402_RESOURCE_BASE?.trim() || "https://api.tokenizen.nl").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/.test(resourceBase)) {
    throw new Error("X402_RESOURCE_BASE must be an https origin with no path, e.g. https://api.tokenizen.nl");
  }

  return {
    // Matches the controller published at _controllers.<domain> exactly. A
    // verifier compares these two strings, so they must not drift.
    kid: `did:pkh:eip155:1:${signerAddress}`,
    signerAddress,
    payTo,
    price: env.X402_PRICE?.trim() || "$0.001",
    resourceBase,
    privateKey: key,
  };
}

/**
 * Bridge our key to the signature function the extension expects.
 *
 * The extension is built on viem and asks for a function; ethers is already in
 * this tree and signs the same EIP-712 digest. EIP712Domain is stripped because
 * ethers derives it from the domain object and rejects it in the types map.
 */
export function makeTypedDataSigner(privateKey: string) {
  const signer = new ethers.Wallet(privateKey);
  return async (params: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`> => {
    const { EIP712Domain: _ignored, ...types } = params.types as Record<string, unknown>;
    const signature = await signer.signTypedData(
      params.domain as never,
      types as never,
      params.message as never,
    );
    return signature as `0x${string}`;
  };
}

/** The resource-server extension that signs offers and receipts for declared routes. */
export function buildOfferReceiptExtension(config: SellerConfig) {
  const issuer = createEIP712OfferReceiptIssuer(config.kid, makeTypedDataSigner(config.privateKey) as never);
  return createOfferReceiptExtension(issuer);
}

/** The one paid route, with the offer-receipt declaration attached. */
export function buildPaidRoutes(config: SellerConfig): Record<string, unknown> {
  return {
    "POST /api/paid/verify-ownership": {
      accepts: [
        {
          scheme: "exact",
          price: config.price,
          network: SELLER_NETWORK,
          payTo: config.payTo,
        },
      ],
      description:
        "Ownership verification with a signed receipt. The receipt is the product: the same answer is available for free at /api/verify-ownership.",
      extensions: {
        // includeTxHash true: §5.4 makes omitting the transaction the privacy
        // default, and a receipt that cannot be tied to a settlement is far less
        // useful as the counterpart to a buyer's claim. A testnet demo has no
        // correlation risk worth protecting.
        ...declareOfferReceiptExtension({ includeTxHash: true } as never),
      },
    },
  };
}

/**
 * The express middleware that turns the declared route into a real 402.
 *
 * Built only when a seller is configured, which is why it is a function rather
 * than a module-level constant: constructing it reaches for a facilitator, and
 * an unconfigured server should make no such reach.
 */
export function buildPaymentMiddleware(config: SellerConfig) {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator)
    .register(SELLER_NETWORK, new ExactEvmScheme())
    .registerExtension(buildOfferReceiptExtension(config));
  return paymentMiddleware(buildPaidRoutes(config) as never, server);
}
