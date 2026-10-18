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
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { DNS_LABEL, OWNERSHIP_METHODS } from "endpoint-attest";
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
  /**
   * Set to "1" to declare the bazaar discovery extension on the paid route.
   *
   * OFF BY DEFAULT. It changes the bytes of a live 402 response, and it only
   * pays off when settlement runs through a facilitator that keeps an index.
   * See `declareBazaarDiscovery` for why a declaration alone catalogues nothing.
   */
  X402_BAZAAR?: string | undefined;
  /**
   * The facilitator that verifies and settles payments for this route.
   *
   * WHY THIS IS NOW A VARIABLE. Measured 2026-10-18: the default,
   * x402.org/facilitator, answers 404 on /discovery/resources, /discovery/search
   * and /discovery, so it keeps no catalogue at all. Cataloguing happens inside
   * the facilitator's settle step, so no declaration on our side can be picked up
   * by a facilitator that has nowhere to put it. Changing this is therefore the
   * other half of being discoverable, and it stays a configuration choice rather
   * than an edit to the code.
   *
   * Known alternatives, each measured on its own /supported endpoint on
   * 2026-10-18, each keeping its own index that nobody cross-posts:
   *   https://facilitator.payai.network   v2 exact on eip155:84532 AND
   *     eip155:8453, no API key needed, index of 20.840 resources
   *   https://api.cdp.coinbase.com/platform/v2/x402   largest index at 46.414 and
   *     it does list Base Sepolia entries, but needs CDP credentials
   */
  X402_FACILITATOR_URL?: string | undefined;
}

export interface SellerConfig {
  /** The controller string from the DNS TXT record, used as the receipt's kid. */
  kid: string;
  signerAddress: string;
  payTo: string;
  price: string;
  resourceBase: string;
  privateKey: string;
  /** Whether to declare the bazaar discovery extension, so a facilitator can catalogue this route. */
  bazaar: boolean;
  /** The facilitator that verifies and settles. Only one that keeps an index can catalogue us. */
  facilitatorUrl: string;
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

  // THE FACILITATOR URL GETS THE SAME SCRUTINY AS THE RESOURCE BASE, and it did
  // not before. Three lines above validate X402_RESOURCE_BASE strictly; this one
  // went in unchecked, and it is the more dangerous of the two: every payment this
  // server verifies and settles goes to whatever is in it, and the answer that
  // comes back is what our key then signs a receipt about. A typo in an env file,
  // or anything that can set an env var, silently redirects that.
  const facilitatorUrl = (env.X402_FACILITATOR_URL?.trim() || FACILITATOR_URL).replace(/\/+$/, "");
  const checkFacilitator = (() => {
    let u: URL;
    try {
      u = new URL(facilitatorUrl);
    } catch {
      return "X402_FACILITATOR_URL is not a usable url";
    }
    // http is refused even for a local facilitator: the payment payload and the
    // settlement answer both travel over this, and a receipt our key signs depends
    // on the answer. Someone who needs plain http in development can say so by
    // changing this line on purpose, which is the point.
    if (u.protocol !== "https:") return `X402_FACILITATOR_URL must be https, got ${u.protocol}`;
    if (u.username || u.password) return "X402_FACILITATOR_URL must not carry credentials";
    if (u.search || u.hash) return "X402_FACILITATOR_URL must not carry a query or fragment";
    return null;
  })();
  if (checkFacilitator) throw new Error(checkFacilitator);

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
    bazaar: env.X402_BAZAAR?.trim() === "1",
    facilitatorUrl,
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

        // THE FACILITATOR IS NOT A WITNESS WE CAN SKIP CHECKING. `network` comes
        // straight out of its settle answer, and our key is about to sign a receipt
        // that names it. Nothing compared it to the network we actually offered. A
        // facilitator that answers with another chain would get our signature on a
        // statement about a payment we never advertised, and a reader of that receipt
        // has no way to know.
        //
        // We refuse to sign rather than fall back, and that is deliberate. Falling
        // back to the upstream version 1 receipt would sign the same wrong network,
        // just without the commitment. No receipt is an honest outcome; a signed
        // false one is not. Measured against our three live receipts first: all three
        // carry eip155:84532, exactly SELLER_NETWORK, so this refuses nothing that
        // works today.
        const verwachtNetwerk = context?.requirements?.network ?? SELLER_NETWORK;
        if (String(network) !== String(verwachtNetwerk)) {
          console.error(
            `[x402-seller] refusing to sign: the facilitator settled on ${String(network)} while this route offered ${String(verwachtNetwerk)}`,
          );
          return undefined;
        }

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

/**
 * The bazaar discovery declaration: what this route takes and what it answers.
 *
 * WHY THIS IS THE ONLY WAY INTO A CATALOGUE. There is no registration endpoint
 * anywhere. `specs/extensions/bazaar.md` line 523 settles it: "Clients are
 * expected to echo the `bazaar` extension from `PaymentRequired` into their
 * `PaymentPayload`. If the extension is omitted, discovery cataloging will not
 * occur." So the chain is: we declare it here, a paying client echoes it back
 * automatically, and the FACILITATOR catalogues it while settling. A declaration
 * without a payment lists nothing, a payment without the declaration lists
 * nothing, and each facilitator keeps its own index. Nobody cross-posts.
 *
 * Measured on 2026-10-18, which is why this exists at all: our live 402 declared
 * only offer-receipt, and `x402.org/facilitator` answers 404 on every discovery
 * path. So there was nothing to catalogue AND nobody to catalogue it. Being
 * absent from every index was never a rejection.
 *
 * THE SHAPE IS NOT HAND-ROLLED. `declareDiscoveryExtension` is their own builder
 * and it emits both `info` and the `schema` that facilitators MUST validate
 * `info` against before cataloguing (spec line 323). Writing that pair by hand is
 * how you end up catalogued as something you are not.
 *
 * ABOUT THE EXAMPLE, and this matters more than it looks. An agent may copy it
 * verbatim. It shows the SHAPE of a call, not a call that can succeed: proving
 * ownership needs an endpoint the caller actually controls and a token the caller
 * actually published. A worked example that pretends otherwise would be a lie
 * told to a machine.
 *
 * NOT PART OF THIS EXTENSION: serviceName, tags and iconUrl. Those are set on the
 * route config, which puts them on the `resource` object of the 402 rather than
 * inside this declaration. They are the shop window and this is the door, and the
 * door had to work first: our first catalogue entry on 2026-10-18 carried the full
 * call information and three nulls where a name should be. They are set now, in
 * `buildPaidRoutes` below.
 *
 * Worth keeping separate in your head, because x402 issue 3835 confuses the two:
 * being LISTED is mechanical and these fields are part of that, while the
 * description and category on a site like agentic.market are curated by a human and
 * no field of ours can set those.
 */
export function declareBazaarDiscovery(): Record<string, unknown> {
  return declareDiscoveryExtension({
    bodyType: "json",
    input: {
      endpoint: "https://example.com/api/health",
      // NIET ons payTo-adres. Dat stond hier, en dan staat ons eigen ontvangstadres
      // in een publieke catalogus als voorbeeld van "de partij die beweert dit
      // eindpunt te beheren". Dit is een adres uit de documentatie van ethers zelf,
      // onmiskenbaar een voorbeeld.
      ownerAddress: "0x0000000000000000000000000000000000000001",
      method: "dns-txt",
    },
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description: "The endpoint whose ownership is being proven. Its host must be publicly routable.",
        },
        ownerAddress: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
          description: "The operator claiming control of that endpoint.",
        },
        method: {
          // Taken from the running code rather than retyped, so a new method can
          // never be accepted by the route while the catalogue still advertises
          // the old list.
          type: "string",
          enum: [...OWNERSHIP_METHODS],
          description: "How control is proven: a DNS TXT record, or a file under /.well-known.",
        },
      },
      required: ["endpoint", "ownerAddress", "method"],
      additionalProperties: false,
    },
    // THE OUTPUT CONTRACT, AND IT IS READ BY MACHINES. Measured on 2026-10-18:
    // this block required a `token` field that the route never returned, named a
    // location format the code does not use (the real DNS label is DNS_LABEL,
    // `_endpoint-attest`), and left out `ok` and `reason`, which the route does
    // return. A failed check carries no `verifiedAt` at all, so the old `required`
    // list could not hold even in principle. Our own delivery checker reads the
    // `token` field, so it could not process a single real answer from its own
    // target service. A promise in a catalogue that the route does not keep is
    // worse than no promise: the facilitator validates `info` against `schema`,
    // and an agent decides whether to call us from exactly this.
    output: {
      example: {
        ok: true,
        method: "dns-txt",
        token: "endpoint-attest-0000000000000000",
        location: `${DNS_LABEL}.example.com`,
        verifiedAt: "2026-10-18T00:00:00Z",
      },
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean", description: "Whether control was proven. False is an answer, not an error." },
          method: { type: "string", enum: [...OWNERSHIP_METHODS] },
          token: {
            type: "string",
            minLength: 16,
            maxLength: 512,
            description:
              "The exact token the check compared against. Public by construction: the owner has to publish it, so returning it is what lets a third party re-read the answer without trusting us.",
          },
          location: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "The DNS name queried or the URL fetched, so a reader can re-check it without us.",
          },
          verifiedAt: {
            type: "string",
            description: "ISO timestamp of when control was proven. Present only when ok is true.",
          },
          reason: {
            type: "string",
            description: "Why control was not proven. Present only when ok is false.",
          },
        },
        required: ["ok", "method", "token", "location"],
      },
    },
  } as never) as Record<string, unknown>;
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
      // THE SHOP WINDOW, and these three are the difference between a line and a
      // name. Measured 2026-10-18: our first catalogue entry carried the full call
      // information (method, fields, example, price) but serviceName, tags and
      // iconUrl were all null, which among twenty thousand entries is an anonymous
      // row. They live on RouteConfig next to description, they are optional, and an
      // invalid one is dropped SILENTLY, which is exactly why the test runs their own
      // sanitizer over these values instead of trusting them.
      serviceName: "tokenizen ownership receipts",
      tags: ["x402", "receipts", "ownership", "verification", "eip-3009"],
      iconUrl: "https://tokenizen.nl/favicon.svg",
      extensions: {
        // includeTxHash true: §5.4 makes omitting the transaction the privacy
        // default, and a receipt that cannot be tied to a settlement is far less
        // useful as the counterpart to a buyer's claim. A testnet demo has no
        // correlation risk worth protecting.
        ...declareOfferReceiptExtension({ includeTxHash: true } as never),
        // OFF BY DEFAULT, same reasoning as receipt version 2. Declaring this
        // changes the bytes of a live 402 response and only pays off through a
        // facilitator that keeps an index, so switching it on stays a decision
        // someone makes on a date rather than a side effect of a deploy.
        ...(config.bazaar ? declareBazaarDiscovery() : {}),
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
  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const server = new x402ResourceServer(facilitator)
    .register(SELLER_NETWORK, new ExactEvmScheme())
    .registerExtension(buildOfferReceiptExtension(config));
  // THE SECOND HALF, and leaving it out would have failed silently. The
  // declaration from `declareDiscoveryExtension` carries NO http method on
  // purpose: `bazaarResourceServerExtension.enrichDeclaration` fills it in from
  // the real request, into both `info.input.method` and the schema enum. Without
  // it the served `info` fails its own `schema`, and the spec says a facilitator
  // MUST validate one against the other before cataloguing. So the 402 would have
  // looked complete to us and been rejected by every index, with no error
  // anywhere. Found by the test, not by reading.
  if (config.bazaar) server.registerExtension(bazaarResourceServerExtension as never);
  return paymentMiddleware(buildPaidRoutes(config) as never, server);
}
