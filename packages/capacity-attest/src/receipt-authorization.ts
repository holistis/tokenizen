// receipt-authorization.ts — the salted commitment that ties a receipt to one settlement.
//
// Written against specs/extensions/extension-offer-and-receipt.md §5.6 at commit
// 0e492d6730bef14b9c722428386c114f3475a914 of the receipt-authorization-commitment
// branch. That PR is open, so the preimage can still change: the commit is pinned
// here on purpose, and the test asserts the vector published with it. If the spec
// moves, the test fails rather than the signature quietly changing meaning.
//
// WHY A COMMITMENT AND NOT THE TRANSACTION HASH. A receipt with an empty
// `transaction` can be matched to a settlement only by payer, payee, amount and
// time. Two payments with the same terms in the same block cannot be ordered at
// all. The ERC-3009 authorization already carries a nonce that is unique per
// settlement and that the server holds before settlement runs, so a salted hash of
// it lets whoever holds the salt recompute the link to exactly one settlement, and
// tells everyone else nothing.
//
// AND WHY IT MATTERS TO US SPECIFICALLY: §5.6.5 says a consumer that counts
// settlements MUST count opened commitments only. A receipt whose commitment
// nobody can open does not count. That is the category our own receipts were in.

import { createHash, randomBytes } from "node:crypto";

/** §5.6.2. ASCII, and the trailing /0 is the preimage version, not the payload version. */
const DOMAIN_TAG = Buffer.from("x402-receipt-authorization/0", "ascii");
const NUL = Buffer.from([0]);

/**
 * §5.6.2's table. Each method fixes the byte length of `asset` and `authorizer`;
 * `identifier` and `salt` are 32 bytes for every method. Fixed lengths are what
 * make the preimage unambiguous without any separators, so they are enforced
 * rather than assumed: a field of the wrong length would hash to a commitment
 * that opens to nothing, and would do so silently.
 */
export const AUTHORIZATION_METHODS = {
  eip3009: { asset: 20, authorizer: 20 },
} as const;

export type AuthorizationMethod = keyof typeof AUTHORIZATION_METHODS;

export interface CommitmentInput {
  /** Currently only "eip3009". Equals the receipt's `authorizationMethod`. */
  method: AuthorizationMethod;
  /** Token contract of the accepts entry that was paid. Not carried by the receipt. */
  asset: string;
  /** `from` of the authorization. §5.6.4 step 1 takes this from the receipt's signed payer. */
  authorizer: string;
  /** The ERC-3009 nonce, 32 bytes. */
  identifier: string;
  /** 32 bytes of CSPRNG output, per payment. Never signed, never in the receipt. */
  salt: string;
}

function fixedBytes(value: string, name: string, expected: number): Buffer {
  if (typeof value !== "string") throw new Error(`${name} must be a hex string`);
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error(`${name} is not hex: ${JSON.stringify(value)}`);
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes per section 5.6.2, got ${buf.length}`);
  }
  return buf;
}

/** §5.6.3: 32 bytes from a CSPRNG, independent per payment, never derived from anything. */
export function generateAuthorizationSalt(): string {
  return "0x" + randomBytes(32).toString("hex");
}

/** §5.6.2, the whole construction. Hex inputs are case-insensitive; bytes are hashed. */
export function computeAuthorizationCommitment(input: CommitmentInput): string {
  const lengths = AUTHORIZATION_METHODS[input.method];
  if (!lengths) throw new Error(`unknown authorizationMethod: ${String(input.method)}`);
  const preimage = Buffer.concat([
    DOMAIN_TAG,
    NUL,
    Buffer.from(input.method, "ascii"),
    NUL,
    fixedBytes(input.asset, "asset", lengths.asset),
    fixedBytes(input.authorizer, "authorizer", lengths.authorizer),
    fixedBytes(input.identifier, "identifier", 32),
    fixedBytes(input.salt, "salt", 32),
  ]);
  return "0x" + createHash("sha256").update(preimage).digest("hex");
}

export type OpenResult =
  | { linked: true; identifier: string }
  | { linked: false; reason: string };

export interface OpenInput {
  /** The signed receipt payload. `payer` is the authorizer; nothing else is trusted. */
  payload: { payer: string; authorizationMethod?: string; authorizationCommitment?: string };
  salt: string;
  /** The asset of the accepts entry that was paid. §5.6.4: salt alone cannot link. */
  asset: string;
  /** Nonces from AuthorizationUsed(authorizer, nonce) logs on that asset. */
  candidateIdentifiers: readonly string[];
}

/**
 * §5.6.4 steps 1 and 3. Fails closed on both nothing and ambiguity.
 *
 * Two matches is not "probably the first one": if an identifier can repeat across
 * settlements the commitment genuinely opens to several, and the spec says that
 * case does not link. Reporting a guess there would turn a fail-closed design into
 * a false link, which is the one outcome the whole construction exists to avoid.
 */
export function openAuthorizationCommitment(input: OpenInput): OpenResult {
  const { payload, salt, asset, candidateIdentifiers } = input;
  const method = payload?.authorizationMethod;
  const commitment = payload?.authorizationCommitment;
  if (!method || !commitment) return { linked: false, reason: "receipt carries no commitment" };
  if (!(method in AUTHORIZATION_METHODS)) {
    return { linked: false, reason: `unknown authorizationMethod: ${method}` };
  }

  const hits: string[] = [];
  for (const identifier of candidateIdentifiers ?? []) {
    let computed: string;
    try {
      computed = computeAuthorizationCommitment({
        method: method as AuthorizationMethod,
        asset,
        // §5.6.4 step 1: the authorizer comes from the SIGNED payer field, never
        // from a value handed over next to the salt. Otherwise a commitment can be
        // opened against someone else's settlement.
        authorizer: payload.payer,
        identifier,
        salt,
      });
    } catch {
      continue;
    }
    if (computed.toLowerCase() === String(commitment).toLowerCase()) hits.push(identifier);
  }

  if (hits.length === 1) return { linked: true, identifier: hits[0]! };
  if (hits.length === 0) return { linked: false, reason: "no candidate opens this commitment" };
  return { linked: false, reason: `${hits.length} candidates open the same commitment, ambiguous` };
}

/**
 * The vector published with the spec, kept here so our own test has an external
 * anchor. The independent verifier in agent-receipt-verify asserts the same
 * constant from its own implementation: two implementations anchored to the same
 * published number cannot drift silently, two anchored to each other can.
 */
export const SPEC_VECTOR = {
  source:
    "x402-foundation/x402 PR #3827, specs/extensions/extension-offer-and-receipt.md §5.6.2, commit 0e492d6730bef14b9c722428386c114f3475a914",
  input: {
    method: "eip3009",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    authorizer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    identifier: "0x5135a00b531830a13a751f3c48944d7a5fdfde7a3b87f73493591cd77efdef4f",
    salt: "0x10d2ae5f0c8536e82d882bf3d2c31a663597e890ca6c3fede0d278fd2a78f655",
  },
  expected: "0x5d905bbf08a97e04ab551d276d8e94b1abaff7d0737324d360e983c2796af23b",
} as const;
