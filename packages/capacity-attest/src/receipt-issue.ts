// receipt-issue.ts — build and sign an x402 offer-receipt as a seller.
//
// Everything else in this package is the buyer's side. This is the other half,
// and it exists because that half is missing in the wild: sampled on 2026-10-15
// across one facilitator's discovery index of 20,462 live x402 resources, at six
// spread offsets of 100 each, not one declared the offer-receipt extension. A
// buyer's claim can name a seller's receipt, and today there is almost nothing
// to name.
//
// The EIP-712 types and domain below are copied verbatim from the extension's
// normative sections and exported, because a verifier needs exactly these and
// the spec says they MUST NOT travel on the wire (§3.2.1). A party holding only
// the artifact has to get them from here or from the spec.
//
// JWS is the other permitted format and is deliberately not implemented. An
// Ethereum key signs EIP-712 directly, so JWS would add a key type and a DID
// resolution path for no gain today.

import { ethers } from "ethers";

/** §5.3, normative. EIP712Domain is omitted on purpose: ethers derives it from the domain object. */
export const RECEIPT_EIP712_TYPES = {
  Receipt: [
    { name: "version", type: "uint256" },
    { name: "network", type: "string" },
    { name: "resourceUrl", type: "string" },
    { name: "payer", type: "string" },
    { name: "issuedAt", type: "uint256" },
    { name: "transaction", type: "string" },
  ],
} as const;

/** §5.5 step 3. chainId is 1 for every network: it identifies the signing domain, not the settlement chain. */
export const RECEIPT_EIP712_DOMAIN = { name: "x402 receipt", version: "1", chainId: 1 } as const;

/** Only version 1 is defined (§5.2). */
export const RECEIPT_PAYLOAD_VERSION = 1;

/** CAIP-2, which §5.2 requires even though x402 v1 messages use names like "base-sepolia". */
const CAIP2_RE = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;

export interface ReceiptPayload {
  version: number;
  network: string;
  resourceUrl: string;
  payer: string;
  issuedAt: number;
  /** §5.3: absent means the empty string, because a fixed EIP-712 schema has no absent. */
  transaction: string;
}

export interface ReceiptInput {
  /** CAIP-2, e.g. "eip155:8453". A v1 name such as "base" is rejected rather than guessed at. */
  network: string;
  /** The paid resource. A verifier checks signer authorization against this host (§4.5.1). */
  resourceUrl: string;
  /** Who paid. Commonly an address. */
  payer: string;
  /** Unix seconds. Not milliseconds: a millisecond value would date the receipt to the year 56000. */
  issuedAt: number;
  /** Omit for the privacy-minimal default that §5.4 describes. */
  transaction?: string | undefined;
}

export function buildReceiptPayload(input: ReceiptInput): ReceiptPayload {
  if (!CAIP2_RE.test(input.network)) {
    throw new Error(
      `network must be CAIP-2 per section 5.2, e.g. "eip155:8453", not ${JSON.stringify(input.network)}`,
    );
  }
  if (!/^https?:\/\/.+/.test(input.resourceUrl)) {
    throw new Error("resourceUrl must be an absolute http(s) URL: a verifier checks signer authorization against its host");
  }
  if (input.payer.length === 0) throw new Error("payer is required (section 5.2)");
  if (!Number.isInteger(input.issuedAt) || input.issuedAt <= 0) {
    throw new Error("issuedAt must be a positive integer of unix SECONDS (section 5.2)");
  }
  // 1e12 seconds is the year 33658. Anything above it is a millisecond value,
  // which would sign a true-looking receipt dated tens of thousands of years out.
  if (input.issuedAt > 1e12) {
    throw new Error("issuedAt looks like milliseconds: section 5.2 defines it as unix seconds");
  }
  return {
    version: RECEIPT_PAYLOAD_VERSION,
    network: input.network,
    resourceUrl: input.resourceUrl,
    payer: input.payer,
    issuedAt: input.issuedAt,
    transaction: input.transaction ?? "",
  };
}

/** What a signer has to be able to do. An ethers Wallet satisfies it, and so does a remote signer. */
export interface TypedDataSigner {
  signTypedData(
    domain: typeof RECEIPT_EIP712_DOMAIN,
    types: typeof RECEIPT_EIP712_TYPES,
    value: ReceiptPayload,
  ): Promise<string>;
}

/**
 * Sign a payload and return the wire artifact as a JSON string.
 *
 * The string is what gets transmitted and what a buyer's `offerReceiptHash`
 * digests, so it is returned already serialised. Handing back an object would
 * invite the caller to re-serialise it, and a different key order is a different
 * digest.
 */
export async function issueReceipt(payload: ReceiptPayload, signer: TypedDataSigner): Promise<string> {
  const signature = await signer.signTypedData(RECEIPT_EIP712_DOMAIN, RECEIPT_EIP712_TYPES, payload);
  return JSON.stringify({ format: "eip712", payload, signature });
}

export type RecoveredSigner =
  | { ok: true; signer: string; payload: ReceiptPayload }
  | { ok: false; reason: "unparseable" | "unsupported_format" | "malformed" | "bad_signature" };

/**
 * Recover who signed an artifact. This answers signature validity only.
 *
 * §4.5.1 is explicit that validity is not authorization: anyone can sign a
 * receipt for any resourceUrl. Confirming the recovered signer is allowed to
 * speak for that host is a separate step, against a DNS TXT record, a did:web
 * document, or the payTo address, and is not done here.
 */
export function recoverReceiptSigner(artifact: string): RecoveredSigner {
  let parsed: unknown;
  try {
    parsed = JSON.parse(artifact);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "malformed" };
  const { format, payload, signature } = parsed as Record<string, unknown>;
  if (format !== "eip712") return { ok: false, reason: "unsupported_format" };
  if (typeof signature !== "string" || typeof payload !== "object" || payload === null) {
    return { ok: false, reason: "malformed" };
  }
  const p = payload as Record<string, unknown>;
  const shapeOk =
    typeof p.version === "number" &&
    typeof p.network === "string" &&
    typeof p.resourceUrl === "string" &&
    typeof p.payer === "string" &&
    typeof p.issuedAt === "number" &&
    typeof p.transaction === "string";
  if (!shapeOk) return { ok: false, reason: "malformed" };
  try {
    const signer = ethers.verifyTypedData(
      RECEIPT_EIP712_DOMAIN,
      RECEIPT_EIP712_TYPES as never,
      p,
      signature,
    );
    return { ok: true, signer, payload: p as unknown as ReceiptPayload };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
}
