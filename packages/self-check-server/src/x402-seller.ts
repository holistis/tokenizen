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
import {
  computeAuthorizationCommitment,
  generateAuthorizationSalt,
} from "capacity-attest/dist/receipt-authorization.js";
import { buildReceiptPayload, issueReceipt } from "capacity-attest/dist/receipt-issue.js";

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
  /**
   * Set to "1" to sign receipt payload version 2 with an authorization commitment.
   *
   * OFF BY DEFAULT, and that is a deliberate choice rather than caution for its
   * own sake. Version 2 is defined in an open pull request, so its preimage can
   * still change. A flag means a spec revision cannot silently alter what this
   * live seller signs; turning it on stays a decision someone makes on a date.
   */
  X402_RECEIPT_V2?: string | undefined;
}

export interface SellerConfig {
  /** The controller string from the DNS TXT record, used as the receipt's kid. */
  kid: string;
  signerAddress: string;
  payTo: string;
  price: string;
  resourceBase: string;
  privateKey: string;
  /** Whether to emit receipt payload version 2 with a commitment. */
  receiptV2: boolean;
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
    receiptV2: env.X402_RECEIPT_V2?.trim() === "1",
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

/**
 * What a version 2 receipt needs that a version 1 receipt does not: the ERC-3009
 * nonce the payer signed, and the token it was signed against.
 *
 * Both are known to this server BEFORE settlement runs, which is the property the
 * commitment is built on. The transaction hash is not: it only exists afterwards,
 * and for us it never arrives at all (upstream replaces the route declaration, so
 * includeTxHash is always undefined by the time a receipt is signed; reported
 * separately). That is why the commitment, not the hash, is what finally makes our
 * receipts linkable.
 */
export interface SettlementAuthorization {
  asset: string;
  authorizer: string;
  nonce: string;
}

/**
 * Dig the authorization out of the settlement context, or return null.
 *
 * Returns null rather than throwing for every reason it can fail: a Permit2
 * payment carries a uint256 nonce instead of a 32 byte one, a future scheme may
 * carry none at all, and section 5.6.2 says such a payment MUST simply omit the
 * commitment. The one check that is not about shape is the last: if the
 * authorizer is not the payer the receipt will name, the commitment would open to
 * no nonce at all (section 5.6.4 step 1 takes the authorizer from the signed
 * payer field). Emitting it anyway would ship a field that looks like a link and
 * is not one.
 */
export function readSettlementAuthorization(
  context: Record<string, any>,
  payer: string,
): SettlementAuthorization | null {
  const payload = context?.paymentPayload;
  const auth = payload?.payload?.authorization ?? payload?.authorization;
  const asset = context?.requirements?.asset;
  if (!auth || typeof asset !== "string") return null;
  const nonce = auth.nonce;
  const authorizer = auth.from;
  if (typeof nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(nonce)) return null;
  if (typeof authorizer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(authorizer)) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) return null;
  if (authorizer.toLowerCase() !== String(payer).toLowerCase()) return null;
  return { asset, authorizer, nonce };
}

/** The resource-server extension that signs offers and receipts for declared routes. */
type OfferReceiptExtension = ReturnType<typeof createOfferReceiptExtension>;

export function buildOfferReceiptExtension(config: SellerConfig): OfferReceiptExtension {
  const sign = makeTypedDataSigner(config.privateKey);
  const issuer = createEIP712OfferReceiptIssuer(config.kid, sign as never);
  const upstream = createOfferReceiptExtension(issuer);
  if (!config.receiptV2) return upstream;

  // Upstream has no public type for its hooks, so the delegate is reached through
  // one narrow cast rather than by retyping the whole extension.
  const upstreamSettle = (upstream as unknown as {
    enrichSettlementResponse: (declaration: unknown, context: unknown) => Promise<unknown>;
  }).enrichSettlementResponse;

  // Our own signer for the version 2 payload. The upstream issuer hardcodes
  // version 1, so the commitment cannot be added by swapping the issuer alone.
  const typedDataSigner = {
    signTypedData: (domain: unknown, types: unknown, value: unknown) =>
      sign({
        domain: domain as Record<string, unknown>,
        types: types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: "Receipt",
        message: value as Record<string, unknown>,
      }),
  };

  return {
    ...upstream,
    enrichSettlementResponse: async (declaration: unknown, context: Record<string, any>) => {
      // Anything unexpected falls back to the upstream version 1 receipt. Upstream
      // swallows a throw into a console line and returns undefined, which means NO
      // receipt at all, so a wrong-length nonce must never be allowed to reach it.
      try {
        if (!context?.result?.success) return undefined;
        const payer = context.result.payer;
        const network = context.result.network;
        const resourceUrl = context.transportContext?.request?.adapter?.getUrl?.();
        if (!payer || !network || !resourceUrl) return upstreamSettle(declaration, context);

        const auth = readSettlementAuthorization(context, payer);
        if (!auth) return upstreamSettle(declaration, context);

        // Section 5.6.3: fresh per payment, from a CSPRNG, derived from nothing.
        const salt = generateAuthorizationSalt();
        const commitment = computeAuthorizationCommitment({
          method: "eip3009",
          asset: auth.asset,
          authorizer: auth.authorizer,
          identifier: auth.nonce,
          salt,
        });

        const artifact = await issueReceipt(
          buildReceiptPayload({
            network,
            resourceUrl,
            payer,
            issuedAt: Math.floor(Date.now() / 1000),
            authorizationMethod: "eip3009",
            authorizationCommitment: commitment,
          }),
          typedDataSigner,
        );

        return {
          info: {
            receipt: JSON.parse(artifact),
            // Section 5.6.3 names this exact location. It travels NEXT TO the
            // receipt and never inside it: a receipt that carried its own salt
            // would hand the settlement link to everyone it is ever forwarded to.
            authorizationSalt: salt,
          },
          schema: RECEIPT_V2_SCHEMA,
        };
      } catch (error) {
        console.error("[x402-seller] version 2 receipt failed, falling back to version 1:", error);
        return upstreamSettle(declaration, context);
      }
    },
  } as unknown as OfferReceiptExtension;
}

/**
 * The declared shape of our settlement extension data.
 *
 * Upstream's schema describes only `receipt`, so the salt is declared here
 * rather than left to ride along undeclared next to a field nobody announced.
 */
export const RECEIPT_V2_SCHEMA = {
  type: "object",
  properties: {
    receipt: { type: "object" },
    authorizationSalt: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
  },
  required: ["receipt"],
} as const;

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
