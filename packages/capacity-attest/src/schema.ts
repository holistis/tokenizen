// schema.ts — the DeliveryClaim shape.
//
// A DeliveryClaim is a factual, signed receipt: "buyer X paid seller Y for
// asset Z under x402 settlement R, and here is whether what was promised
// actually arrived." It is deliberately NOT a score, rating, or judgment —
// see README.md "Wat dit NIET is".
//
// GUARDRAIL (design boundary): assetType is a closed enum of physical/compute
// capacity kinds. Do not add anything that looks like a financial instrument
// (credit, loan, yield, interest-bearing balance, invoice-financing) to this
// file — see the "DESIGN GUARDRAILS" section of the project brief. If a field
// or enum value even smells like that, leave it out.

import * as z from "zod/v4";
import { createHash } from "node:crypto";

export const ASSET_TYPES = ["gpu-hours", "storage", "api-credits", "bandwidth"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const DELIVERED_VALUES = ["yes", "no", "partial"] as const;
export type Delivered = (typeof DELIVERED_VALUES)[number];

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;
// Lower-case-only sha256 hex. Used for readingsHash (new in 0.2.0, so it can
// be strict from day one) and, at ingest only, for evidenceHash — see
// StrictClaimContentSchema below and the 0.1.3 section of CHANGELOG.md (S-3).
const LOWER_SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const CLAIM_ID_RE = /^0x[0-9a-fA-F]{64}$/;
// 65-byte ECDSA signature (r ++ s ++ v), hex-encoded with 0x prefix — the
// shape ethers.Signer#signMessage() / ethers.verifyMessage() produce.
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

/**
 * The part of a claim that is hashed to produce claimId and that gets
 * signed. Everything in here is chosen by the buyer at claim-creation time;
 * claimId and signature (in DeliveryClaimSchema below) are derived from it.
 */
// Guardrails against two verified bugs (2026-08-31 adversarial audit):
// - MAX_PROMISED_SPEC_STRING_LENGTH / MAX_SETTLEMENT_REF_LENGTH: without a
//   bound, a multi-megabyte string was accepted in ~6ms, letting any caller
//   grow the append-only ledger and every future read's memory footprint
//   without limit.
// - MAX_PROMISED_SPEC_JSON_BYTES: the object branch of promisedSpec has no
//   own length check, so it needs an explicit serialized-size cap instead.
const MAX_PROMISED_SPEC_STRING_LENGTH = 4_000;
const MAX_SETTLEMENT_REF_LENGTH = 512;
const MAX_PROMISED_SPEC_JSON_BYTES = 8_000;
// Shared with sortKeysDeep() below: how deep promisedSpec may nest.
const MAX_DEPTH = 32;

// Iterative (non-recursive) depth check for the object branch of
// promisedSpec, used at schema-parse time. This deliberately does NOT use
// recursion, and deliberately runs BEFORE any JSON.stringify of the raw
// input: an earlier version of this guard called JSON.stringify(v) directly
// inside the refine below to enforce MAX_PROMISED_SPEC_JSON_BYTES, and that
// call is itself a recursive walk that blew the call stack on the exact
// pathologically-deep input it was meant to reject (caught by this
// package's own fuzz tests). Checking depth first, with an explicit stack
// instead of language-level recursion, closes that gap for good.
function exceedsMaxDepth(value: unknown, maxDepth: number): boolean {
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  // TENTH FIX (2026-09-06, found by the same adversarial audit as the
  // ledger.ts SEVENTH/EIGHTH/NINTH fixes): promisedSpecIngestProblem() below
  // was hardened with exactly this `visited` guard after a real, measured
  // hang (an acyclic DAG of 41 shared-reference objects at depth 40 explored
  // ~2^40 nodes and ran past 55 seconds — see that function's own comment).
  // This sibling walker had the identical unguarded shape and was never
  // updated to match, even though it runs on the exact same promisedSpec
  // input, just earlier (this is the schema-level `.refine()`, which zod
  // runs before checkIngestHardening's superRefine). Not reachable over the
  // MCP wire protocol (JSON.parse of a JSON-RPC message can never produce
  // aliased object references — only a direct library caller building
  // ClaimContent by hand with real JS reference sharing can trigger it), but
  // left inconsistent otherwise: two functions walking the same data, one
  // hardened and one not, is exactly the kind of drift that turns into a
  // real bug the next time either one is copied as a template for a third.
  const visited = new Set<object>();
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (d > maxDepth) return true;
    if (v !== null && typeof v === "object") {
      if (visited.has(v as object)) continue;
      visited.add(v as object);
    }
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
    } else if (v !== null && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        stack.push({ v: (v as Record<string, unknown>)[key], d: d + 1 });
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// `measured` — the optional quantitative block, added in 0.2.0.
//
// Full, language-neutral rules: the 0.1.3 section of CHANGELOG.md. The
// short version of the architecture, because it is the thing that is easy to
// break by accident:
//
//   THE PREIMAGE FUNCTION IS FROZEN. canonicalize(), sortKeysDeep() and the
//   sha256 step do not change. Everything that gets stricter is a REFUSAL AT
//   INPUT, never a transformation on the hash route.
//
// `measured` is added to ClaimContentSchema (the schema computeClaimId()
// parses through) as exactly one `.optional()` key — no .default(), no
// .passthrough(), no .catchall(). A .default() would materialize the key and
// change the preimage of every already-recorded claim. Its validation lives
// here rather than only at ingest because it IS preimage-relevant: a
// non-canonical decimal must never be hashable.
//
// Its presence is the version marker; there is deliberately no `scheme`
// string inside the block. A 0.1.x node reading a 0.2 claim strips the
// unknown `measured` key, computes the v1 id, and answers claimId_mismatch —
// it refuses rather than silently accepting unverified measurement data,
// which is the safe failure direction and is the reason `measured` sits
// INSIDE the hashed content instead of next to it.
// ---------------------------------------------------------------------------

export const MEASURED_UNITS = ["gpu-second", "byte", "byte-second", "call", "token", "credit"] as const;
export type MeasuredUnit = (typeof MEASURED_UNITS)[number];

export const MEASURED_BASIS_VALUES = ["supplied", "consumed"] as const;
export type MeasuredBasis = (typeof MEASURED_BASIS_VALUES)[number];

// Provenance of the number, and nothing else. This enum is deliberately NOT
// ranked: nowhere in this codebase or its docs does "third-party" mean
// "better than seller". There is no reliability/quality/trust field and there
// will not be one — every field in a claim is an assertion by the buyer.
// `undisclosed` exists because attribution is mandatory: without an escape
// hatch, someone unwilling to name the source would just pick an untrue
// value. Withholding should be visible, not silent.
export const MEASURED_ATTRIBUTION_VALUES = ["buyer", "seller", "third-party", "undisclosed"] as const;
export type MeasuredAttribution = (typeof MEASURED_ATTRIBUTION_VALUES)[number];

/**
 * Which units are meaningful for which assetType. A literal 4-row table, not
 * a derivation: there is nothing here to infer, and therefore nothing that
 * can differ between reimplementations in other languages.
 */
export const UNITS_BY_ASSET_TYPE: Record<AssetType, readonly MeasuredUnit[]> = {
  "gpu-hours": ["gpu-second"],
  storage: ["byte", "byte-second"],
  bandwidth: ["byte"],
  "api-credits": ["call", "token", "credit"],
};

// CDEC — canonical decimal string. ASCII [0-9], never \d: Python's `re`
// matches \d on U+0664 (Arabic-Indic four) while JavaScript does not, so a
// spec written with \d is impossible to implement identically in both.
// No sign (quantities are non-negative, which also removes -0 entirely), no
// exponent, no leading zeros, integer part mandatory and at most 30 digits,
// optional fraction of 1..18 digits whose last digit is not 0. Exactly one
// legal string per value, in both directions.
const CDEC_RE = /^(0|[1-9][0-9]{0,29})(\.[0-9]{0,17}[1-9])?$/;

// CINST — canonical UTC instant, exactly 20 characters. No offsets (those are
// refused, not converted: converting would be a transformation on the hash
// route), no fractional seconds, no 24:00:00, no leap second :60, no
// date-only form. Every field is fixed-width and pinned to Z, so a plain
// lexicographic byte comparison of two CINST strings is identical to
// chronological ordering — which is why no time rule in this schema needs a
// date library.
const CINST_RE = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]Z$/;

// The form `timestamp` must have when `measured` is present (and, at ingest,
// the form it must have for every new claim — see S-2).
//
// EXACTLY three fractional digits, not one-to-nine. An earlier version of
// this rule allowed `(\.[0-9]{1,9})?`, which closed the four spellings named
// in the original defect report but left the whole family around them open:
// `…:00Z`, `…:00.0Z`, `…:00.00Z`, `…:00.000Z` and `…:00.000000000Z` are five
// spellings of one instant, and each hashed to its own claimId. That was
// demonstrated end to end, not theorised: one buyer, one seller, one
// settlementRef, one moment, five accepted ledger rows, and the duplicate
// check never fired because it keys on bytes the schema had not made
// canonical. A seller could inflate a delivery history tenfold without
// breaking a single rule. It is precisely the failure this file's own S-3
// message describes for evidence hashes ("upper-case hex mints a second
// claimId for the same evidence"), one field over.
//
// Three digits costs nothing: the only claim producer that has ever existed
// here is `new Date().toISOString()`, which always emits exactly three,
// including the real production claim in data-selftest/claims.jsonl
// (2026-08-31T18:06:48.102Z). One spelling per millisecond, no producer
// broken. `measured.period` already had this discipline via CINST; the
// claim's own timestamp did not.
const MEASURED_TIMESTAMP_RE =
  /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;

const MAX_INSTRUMENT_LENGTH = 200;

/**
 * Real calendar check for a YYYY-MM-DD prefix. The regexes above still let
 * 2026-02-30 through; this closes that without pulling in a date library, so
 * a reimplementation in any language can copy these six lines verbatim.
 */
function isRealCalendarDate(isoPrefix: string): boolean {
  const y = Number(isoPrefix.slice(0, 4));
  const m = Number(isoPrefix.slice(5, 7));
  const d = Number(isoPrefix.slice(8, 10));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  return d >= 1 && d <= daysInMonth;
}

/**
 * True if `s` contains a C0 control character (U+0000-U+001F), U+007F, or a
 * lone surrogate. Hygiene and log-injection safety, not a determinism
 * requirement — the escape rules in the spec already cover determinism
 * completely.
 */
function hasForbiddenTextChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++; // valid surrogate pair — skip the low half
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true; // lone low surrogate
    }
  }
  return false;
}

/**
 * True if `s` contains a LONE surrogate: an unpaired U+D800..U+DFFF code
 * unit. Deliberately NARROWER than hasForbiddenTextChars above, and used for
 * a different reason.
 *
 * hasForbiddenTextChars is hygiene (log-injection safety). This is a
 * PORTABILITY rule, and it is the only text property that makes a string
 * genuinely unrepresentable outside JavaScript: a lone surrogate has no UTF-8
 * encoding at all, so `Buffer.from(s, "utf8").toString("utf8") !== s` (this
 * package measured that directly). JavaScript hides the problem because
 * well-formed JSON.stringify escapes it to "\ud800" and JS strings are
 * UTF-16, but a verifier written in Rust (`String` is UTF-8 by definition),
 * Go, or Python cannot reconstruct the preimage bytes at all. That is the
 * same failure mode S-5 closes for object KEYS, left open for string VALUES.
 * See S-6 below.
 */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++; // valid surrogate pair — skip the low half
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true; // lone low surrogate
    }
  }
  return false;
}

const CinstSchema = z
  .string()
  .regex(CINST_RE, "must be a canonical UTC instant: YYYY-MM-DDTHH:MM:SSZ, exactly 20 chars, no offset, no fractional seconds")
  .refine(isRealCalendarDate, "must be a real calendar date (e.g. 2026-02-30 does not exist)");

const CdecSchema = z
  .string()
  .regex(
    CDEC_RE,
    "must be a canonical decimal string: no sign, no exponent, no leading zeros, at most 30 integer digits, optional 1..18 fraction digits not ending in 0",
  );

/**
 * The `measured` block. Strict: unknown keys are REFUSED, not stripped —
 * stripping would let a producer believe it is sending data that silently
 * falls out of the preimage. `readingsHash` is the only optional key in the
 * block, because its absence itself carries meaning (there either is a pinned
 * meter dump or there is not); making any other field optional would add a
 * branch to the canonicalization without absence saying anything.
 */
export const MeasuredSchema = z.strictObject({
  unit: z.enum(MEASURED_UNITS).describe("Unit of the quantities below — must be in this assetType's row of UNITS_BY_ASSET_TYPE"),
  basis: z
    .enum(MEASURED_BASIS_VALUES)
    .describe("Does the number count what the seller made available (`supplied`) or what the buyer actually drew (`consumed`)"),
  promisedAmount: CdecSchema.refine((v) => v !== "0", 'promisedAmount must not be "0" — a promise of nothing is meaningless').describe(
    "How much was promised, as a canonical decimal string",
  ),
  deliveredAmount: CdecSchema.describe("How much was measured, as a canonical decimal string"),
  period: z
    .strictObject({
      start: CinstSchema.describe("Start of the closed measurement window, canonical UTC instant"),
      end: CinstSchema.describe("End of the closed measurement window, canonical UTC instant"),
    })
    .refine((p) => p.start < p.end, "period.start must be strictly before period.end — a zero-length window is meaningless")
    .describe("The closed window this measurement covers"),
  method: z
    .strictObject({
      attribution: z
        .enum(MEASURED_ATTRIBUTION_VALUES)
        .describe("WHO produced the number — provenance only, never a quality or trust signal"),
      instrument: z
        .string()
        .min(1, "instrument is required and must not be empty")
        .max(MAX_INSTRUMENT_LENGTH)
        .refine((v) => !hasForbiddenTextChars(v), "instrument must not contain C0 control characters, U+007F, or lone surrogates")
        .describe('Free text about the measuring instrument, e.g. "nvidia-smi accounting, 10s polling"'),
      readingsHash: z
        .string()
        .regex(LOWER_SHA256_HEX_RE, "readingsHash must be a lower-case sha256 hex digest (64 chars, no 0x prefix)")
        .optional()
        .describe("sha256 of the raw meter dump — the dump itself is not stored. Separate from evidenceHash, which is about delivery evidence"),
    })
    .describe("How the number was obtained"),
});
export type Measured = z.infer<typeof MeasuredSchema>;

/**
 * Cross-field rules that need more than the `measured` block itself. All of
 * them only fire when `measured` is present, so no already-recorded claim can
 * be affected. Deliberately just two, and both are byte comparisons or table
 * lookups — no arithmetic, no date library, no clock, no network.
 *
 * There are ZERO rules between `delivered` and `measured`. `delivered` is the
 * buyer's summarizing judgment over ALL dimensions of promisedSpec (quantity,
 * timing, region, GPU model, throttling); `measured` covers exactly one of
 * them. Deriving one from the other mechanically would (a) create an
 * incentive to lie about the numbers to pass validation, (b) be the very
 * score this product refuses, baked into the validator, and (c) require exact
 * decimal comparison in every reimplementation, which is a real divergence
 * risk. See the 0.1.3 section of CHANGELOG.md.
 */
interface RefinementCtxLike {
  addIssue(issue: { code: "custom"; message: string; path?: (string | number)[] }): void;
}

function checkMeasuredConsistency(
  content: { assetType: AssetType; timestamp: string; measured?: Measured | undefined },
  ctx: RefinementCtxLike,
): void {
  const measured = content.measured;
  if (!measured) return;

  // §5.2 — unit must sit in this assetType's row. Pure lookup.
  const allowed = UNITS_BY_ASSET_TYPE[content.assetType];
  if (!allowed.includes(measured.unit)) {
    ctx.addIssue({
      code: "custom",
      path: ["measured", "unit"],
      message: `unit "${measured.unit}" is not valid for assetType "${content.assetType}" (allowed: ${allowed.join(", ")})`,
    });
  }

  // §5.3 — the period must be closed, i.e. it ended no later than the moment
  // the claim was made. Two parts.
  if (!MEASURED_TIMESTAMP_RE.test(content.timestamp) || !isRealCalendarDate(content.timestamp)) {
    ctx.addIssue({
      code: "custom",
      path: ["timestamp"],
      message:
        "when `measured` is present, timestamp must be a strict UTC instant YYYY-MM-DDTHH:MM:SS[.fff]Z with a real calendar date",
    });
    return;
  }
  // The 19-CHARACTER PREFIX RULE, and it has to be the prefix, not the whole
  // string. Comparing full strings is wrong the moment `timestamp` carries
  // fractional seconds inside the same second the period closed:
  // "2026-09-01T08:00:00Z" <= "2026-09-01T08:00:00.102Z" is FALSE, because
  // "." (0x2E) sorts before "Z" (0x5A). YYYY-MM-DDTHH:MM:SS is fixed-width
  // and zero-padded, so prefix-lexicographic IS chronological, and truncating
  // the fraction can only err conservatively (the fraction can only push the
  // timestamp later).
  if (measured.period.end.slice(0, 19) > content.timestamp.slice(0, 19)) {
    ctx.addIssue({
      code: "custom",
      path: ["measured", "period", "end"],
      message: "period.end must not be after timestamp (compared on the first 19 characters) — a claim covers a closed past window",
    });
  }
}

// ---------------------------------------------------------------------------
// `externalRefs` — optional, unverified pointers into other agent-economy
// infrastructure, added in 0.3.0.
//
// Background: a 2026-09-06 workflow checked the six layers that sit next to
// this package's own Evidence layer (Identity, Authority, Intent, Execution,
// Settlement, Discovery, Liability) against what the wider agent-economy
// ecosystem (ERC-8004, Google AP2, the x402 Foundation, the Legal Context
// Protocol, and others) already ships in production. Every one of them is
// already being built by parties with far more reach than this project —
// see knowledge/al-mizaan/... in wazir-al-ghanima for the sourced writeup.
// Building any of those layers ourselves would duplicate infrastructure that
// already exists and is better resourced. What DOES fit this package's own
// "verify yourself, we assert facts, never authority" philosophy: a place to
// CITE one of those external systems from inside a claim, without this
// package ever validating, resolving, or trusting what is cited. Same
// posture as `evidenceHash` (a hash of evidence that is never itself
// checked) and `settlementRef` (a payment reference that is never itself
// resolved on-chain).
//
// Same preimage discipline as `measured`: `externalRefs` is exactly one
// `.optional()` key on ClaimContentObject, never `.default()`. An older
// parser that does not know this key strips it and computes a different
// (mismatching) claimId rather than silently trusting an unverified
// reference — the same safe failure direction `measured`'s own comment
// describes. Claims that omit the key hash bit-for-bit identically to
// before this field existed; enforced by the frozen regression anchor in
// external-refs.test.ts.
//
// Every leaf string below is deliberately format-light: these reference
// external systems (DIDs, CAIP-10-style chain identifiers, AP2 mandate ids,
// LCP terms hashes) whose own syntax this package has no business policing
// beyond basic length and hygiene. `mandateIssuerDid` is the one exception —
// a real, narrow DID-syntax check — because W3C DID Core defines that
// syntax precisely and a malformed DID here is unambiguously a caller bug,
// not a valid-but-unusual value this package should let through.
// ---------------------------------------------------------------------------

const MAX_EXTERNAL_REF_LENGTH = 512;
const MAX_PROTOCOL_LABEL_LENGTH = 64;
// Minimal W3C DID Core syntax: `did:<method-name>:<method-specific-id>`.
// method-name is ASCII lowercase letters/digits; method-specific-id is left
// broad (colons separate additional segments across DID methods) but still
// restricted to a safe, portable character set — the same reasoning as
// hasForbiddenTextChars elsewhere in this file, applied via character class
// instead of a separate refine, since the regex already forbids the
// offending bytes outright.
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

function externalRefIssue(v: string): string | null {
  if (hasForbiddenTextChars(v)) {
    return "must not contain C0 control characters, U+007F, or lone surrogates";
  }
  return null;
}

const ExternalRefSchema = z
  .string()
  .min(1, "must not be empty — omit the field entirely instead")
  .max(MAX_EXTERNAL_REF_LENGTH)
  .refine((v) => externalRefIssue(v) === null, {
    message: "must not contain C0 control characters, U+007F, or lone surrogates",
  });

const MandateIssuerDidSchema = z
  .string()
  .max(MAX_EXTERNAL_REF_LENGTH)
  .regex(DID_RE, "mandateIssuerDid must be a syntactically valid DID: did:<method>:<method-specific-id>");

const DisputeContextSchema = z.strictObject({
  protocol: z
    .string()
    .min(1, "protocol is required and must not be empty")
    .max(MAX_PROTOCOL_LABEL_LENGTH)
    .refine((v) => externalRefIssue(v) === null, {
      message: "must not contain C0 control characters, U+007F, or lone surrogates",
    })
    .describe('Short label for the external dispute/liability protocol this claim can be evidence for, e.g. "LCP"'),
  termsHash: z
    .string()
    .regex(LOWER_SHA256_HEX_RE, "termsHash must be a lower-case sha256 hex digest (64 chars, no 0x prefix)")
    .describe("sha256 of the governing terms both parties accepted at settlement time — the terms themselves are not stored here"),
  resolutionRef: ExternalRefSchema.optional().describe(
    "Optional pointer to a resolution/case record in the external protocol named by `protocol`, once one exists",
  ),
});
export type DisputeContext = z.infer<typeof DisputeContextSchema>;

export const ExternalRefsSchema = z
  .strictObject({
    sellerAgentRef: ExternalRefSchema.optional().describe(
      "Unverified pointer to an external agent-identity record for the seller (e.g. an ERC-8004 agent id or a DID). Tokenizen does not resolve or verify this",
    ),
    buyerAgentRef: ExternalRefSchema.optional().describe(
      "Unverified pointer to an external agent-identity record for the buyer. Tokenizen does not resolve or verify this",
    ),
    mandateRef: ExternalRefSchema.optional().describe(
      "Unverified pointer to an externally issued authority/mandate object (e.g. an AP2 Payment/Cart Mandate) that the buyer claims covers this delivery. Tokenizen does not check scope, budget, or validity against it",
    ),
    mandateIssuerDid: MandateIssuerDidSchema.optional().describe(
      "DID of the principal who is claimed to have issued the mandate referenced by `mandateRef`. Not verified against the mandate itself",
    ),
    intentRef: ExternalRefSchema.optional().describe(
      "Unverified pointer to an externally issued, pre-signed intent object (e.g. an AP2 IntentMandate) describing what the buyer's principal originally asked for",
    ),
    disputeContext: DisputeContextSchema.optional().describe(
      "Present only if buyer and seller had already agreed to external dispute terms at settlement time. Makes a delivered:no claim usable as evidence in that external protocol instead of Tokenizen adjudicating anything itself",
    ),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "externalRefs must not be an empty object — omit the field entirely if there is nothing to reference",
  });
export type ExternalRefs = z.infer<typeof ExternalRefsSchema>;

export const ClaimContentObject = z.object({
  // .transform(toLowerCase): a fuzz-and-benchmark audit found that
  // computeClaimId() hashed addresses exactly as submitted while every other
  // address comparison in this codebase (signature recovery, seller
  // filtering) was already case-insensitive. That let the same real claim be
  // resubmitted under a different claimId by only re-casing a hex letter,
  // defeating appendClaim()'s claimId-based duplicate rejection. Normalizing
  // here, once, before anything is hashed or compared, closes that gap for
  // every consumer of this schema.
  sellerAddress: z
    .string()
    .regex(ETH_ADDRESS_RE, "sellerAddress must be a 0x-prefixed 20-byte address")
    .transform((v) => v.toLowerCase())
    .describe("0x address of the agent/service that was paid and was supposed to deliver"),
  buyerAddress: z
    .string()
    .regex(ETH_ADDRESS_RE, "buyerAddress must be a 0x-prefixed 20-byte address")
    .transform((v) => v.toLowerCase())
    .describe("0x address of the paying agent — must match the address recovered from `signature`"),
  assetType: z.enum(ASSET_TYPES).describe("What kind of capacity this claim is about"),
  promisedSpec: z
    .union([
      z.string().min(1).max(MAX_PROMISED_SPEC_STRING_LENGTH),
      z.record(z.string(), z.unknown()).refine((v) => {
        if (exceedsMaxDepth(v, MAX_DEPTH)) return false;
        // Only safe to JSON.stringify for the size check once depth is
        // bounded — see exceedsMaxDepth's comment above.
        return Buffer.byteLength(JSON.stringify(v), "utf8") <= MAX_PROMISED_SPEC_JSON_BYTES;
      }, `promisedSpec object exceeds the allowed nesting depth (${MAX_DEPTH}) or size (${MAX_PROMISED_SPEC_JSON_BYTES} bytes)`),
    ])
    .describe("What the seller promised to deliver — free text or a structured object"),
  delivered: z.enum(DELIVERED_VALUES).describe("Whether what was promised actually arrived"),
  evidenceHash: z
    .string()
    .regex(SHA256_HEX_RE, "evidenceHash must be a sha256 hex digest (64 hex chars, no 0x prefix)")
    .describe("sha256 hex digest of evidence for this claim (logs, response payload, etc.) — the evidence itself is not stored here"),
  settlementRef: z
    .string()
    .min(1, "settlementRef is required (x402 payment reference or on-chain tx hash)")
    .max(MAX_SETTLEMENT_REF_LENGTH)
    .describe("x402 payment reference or on-chain tx hash for the settlement this claim is about"),
  timestamp: z
    .string()
    // FROZEN, deliberately loose. Date.parse accepts "August 30, 2026" and
    // date-only forms, which is far more permissive than the field's own
    // documentation. It stays this way here so historical ledger lines remain
    // recomputable; StrictClaimContentSchema (S-2) tightens it for everything
    // new. This inconsistency is intentional and documented.
    .refine((v) => !Number.isNaN(Date.parse(v)), "timestamp must be a valid ISO-8601 date string")
    .describe("ISO-8601 timestamp of when this claim was made"),
  // The one and only addition of 0.2.0. Optional, never defaulted: an absent
  // key is absent from the preimage, so every claim recorded before 0.2.0
  // hashes bit-for-bit identically (proven in measured.test.ts against the real
  // production claim in data-selftest/claims.jsonl).
  measured: MeasuredSchema.optional().describe(
    "Optional quantitative record of how much was promised and how much was measured. Presence is the version marker; absence is the only encoding of 'not measured'",
  ),
  // Added in 0.3.0, same optional/never-defaulted discipline as `measured`
  // above — see the ExternalRefsSchema comment block for the full rationale.
  externalRefs: ExternalRefsSchema.optional().describe(
    "Optional, unverified pointers into other agent-economy infrastructure (identity, authority, intent, dispute). Tokenizen never resolves or trusts these — they are citations, not verified facts",
  ),
  // priorClaimId — the per-buyer, per-seller chain link. Added in 0.4.0, SAME
  // optional/never-defaulted discipline as `measured` and `externalRefs`: an
  // absent key is absent from the preimage, so every claim recorded before
  // 0.4.0 still hashes bit-for-bit identically (proven by the frozen-preimage
  // tests in completeness.test.ts, plus the real-production-claim anchors in
  // measured.test.ts / external-refs.test.ts / identity-hardening.test.ts,
  // all of which still hash to the stored id with priorClaimId in the schema).
  //
  // WHAT IT IS: the claimId of THIS buyer's immediately previous claim about
  // THE SAME sellerAddress. A buyer's very first claim about a seller omits it
  // (the chain's genesis). Each later claim references the one before it, so a
  // buyer's claims about one seller form a singly-linked chain the buyer
  // signs into existence link by link. This is the one thing a lone buyer CAN
  // commit to unilaterally — it needs no coordinator, no shared log, no
  // network — because a buyer always knows its own history with a seller.
  //
  // WHAT IT BUYS (see completeness.ts + DECISIONS.md D-006): because the link
  // sits INSIDE the signed content, a host serving get_delivery_history cannot
  // strip or alter it. So a host that hides one of a buyer's middle claims is
  // caught: the next shown claim in that buyer's chain references a priorClaimId
  // that is not in the result, a dangling back-reference that
  // analyzeCompleteness() flags. It is a DETECTION primitive, not prevention.
  //
  // WHAT IT DELIBERATELY DOES NOT DO, stated so it is never oversold: it does
  // NOT catch a host hiding a buyer's most RECENT claim (a tail truncation
  // leaves no dangling reference behind), and it does NOT catch a host hiding
  // an ENTIRE buyer's chain (you cannot miss a back-reference to a chain you
  // were never shown any link of). Those need the external witnesses that no
  // schema field can replace: the buyer's own retained copy (README "Je eigen
  // ingediende claims delen") and the on-chain payment record. Not validated
  // at ingest (a buyer may legitimately record on a fresh installation that
  // has never seen the prior claim), so this is a self-asserted pointer in
  // the same "cite, verify separately" posture as evidenceHash/settlementRef.
  priorClaimId: z
    .string()
    .regex(CLAIM_ID_RE, "priorClaimId must be a 0x-prefixed sha256 hex digest (the claimId of this buyer's previous claim about this seller)")
    .optional()
    .describe(
      "Optional chain link: the claimId of this buyer's immediately previous claim about the SAME sellerAddress. Omitted on a buyer's first claim about a seller. Lets a reader detect a host that hides a middle claim — see analyzeCompleteness and DECISIONS.md D-006",
    ),
});

const claimIdField = z
  .string()
  .regex(CLAIM_ID_RE, "claimId must be a 0x-prefixed sha256 hex digest")
  .describe("Content-addressed id: sha256 of the canonical JSON of this claim's content fields — see computeClaimId()");
const signatureField = z
  .string()
  .regex(SIGNATURE_RE, "signature must be a 0x-prefixed 65-byte ECDSA signature")
  .describe("Buyer's EIP-191 personal-sign signature over claimId");

export const DeliveryClaimObject = ClaimContentObject.extend({
  claimId: claimIdField,
  signature: signatureField,
});

// The cross-field checks are attached to each schema separately rather than
// inherited, because zod v4's .extend() DROPS checks from the schema it
// extends (measured directly: a .superRefine()'d object that is then
// .extend()ed no longer runs the refinement). Attaching per schema is the
// only shape that keeps ClaimContentSchema and DeliveryClaimSchema in
// agreement. Both keep a working `.shape` (index.ts's MCP tool registration
// depends on that), which .superRefine() on a ZodObject does preserve.
export const ClaimContentSchema = ClaimContentObject.superRefine(checkMeasuredConsistency);
export type ClaimContent = z.infer<typeof ClaimContentSchema>;

/** The full, stored, signed claim — ClaimContent plus its content-address and signature. */
export const DeliveryClaimSchema = DeliveryClaimObject.superRefine(checkMeasuredConsistency);
export type DeliveryClaim = z.infer<typeof DeliveryClaimSchema>;

/**
 * Deterministic JSON stringify: object keys sorted recursively so hashing
 * and signing are stable regardless of the original key insertion order.
 * Arrays keep their order (order is meaningful there); only object keys are
 * sorted.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value, 0));
}

// A fuzz audit found that a promisedSpec nested a few thousand levels deep
// (no valid signature required — this runs before signature verification)
// crashes the process with an uncaught RangeError instead of the normal
// {ok:false, reason} response every other invalid claim gets. MAX_DEPTH
// (declared above, shared with the schema-level guard on promisedSpec)
// turns that crash into a clean, catchable Error well before the engine's
// own call-stack limit, however it's shaped (objects or arrays) — kept here
// too as defense-in-depth in case computeClaimId is ever called on content
// that bypassed schema validation.
function sortKeysDeep(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error(`promisedSpec nesting exceeds max depth of ${MAX_DEPTH}`);
  }
  if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    // Object.create(null) has no inherited `__proto__` accessor, so a key
    // literally named "__proto__" becomes a normal own property instead of
    // silently reassigning out's prototype (and vanishing from the hashed
    // output) the way `out["__proto__"] = ...` would on a plain {} object.
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(input).sort()) {
      out[key] = sortKeysDeep(input[key], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * The EXACT bytes that get hashed for a claim, as a string.
 *
 * Exported because canonicalize() on its own is NOT the preimage, and that is
 * the single most likely thing to get wrong when reimplementing this in
 * another language: the preimage is `canonicalize(ClaimContentSchema.parse(content))`,
 * not `canonicalize(content)`. The parse step is what lower-cases the two
 * address fields and strips unknown top-level keys. Port only canonicalize()
 * and you will silently produce wrong ids for any claim submitted with
 * mixed-case addresses.
 */
export function claimPreimage(content: ClaimContent): string {
  return canonicalize(ClaimContentSchema.parse(content));
}

/**
 * Content-addressed id for a claim: sha256 of the canonical JSON of its
 * content fields (everything except claimId and signature themselves).
 * Validates+normalizes `content` first so a claimId can never be computed
 * over a shape that wouldn't itself pass ClaimContentSchema.
 */
export function computeClaimId(content: ClaimContent): string {
  const hash = createHash("sha256").update(claimPreimage(content)).digest("hex");
  return `0x${hash}`;
}

// ---------------------------------------------------------------------------
// StrictClaimContentSchema — ingest hardening (S-1 .. S-6).
//
// None of this touches the preimage and none of it changes any existing
// claimId. These rules apply ONLY to newly submitted claims, via
// recordDelivery(). Historical ledger lines are always recomputed through the
// FROZEN ClaimContentSchema above and therefore stay verifiable even when
// they contain something (a float in promisedSpec, a loose timestamp) that
// S-1/S-2 now refuse for new claims.
//
// Second reason these are refusals rather than normalizations: if the schema
// guarantees the incoming bytes are already canonical, a verifier in Rust or
// Go needs no arithmetic at all — no decimal library, no date parser, no ICU.
// It hashes what it gets. The only transformation left anywhere on the hash
// route is the ASCII lower-casing of the two address fields, which is v1
// legacy.
// ---------------------------------------------------------------------------

const MAX_SAFE_SPEC_INT = Number.MAX_SAFE_INTEGER; // 2^53 - 1

/** True if `key` contains a surrogate code unit — i.e. a lone surrogate OR any astral character (S-5). */
function keyHasSurrogate(key: string): boolean {
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) return true;
  }
  return false;
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * S-1 + S-5 + S-6, walked iteratively (never recursively — same reasoning as
 * exceedsMaxDepth above) over the object branch of promisedSpec.
 *
 * S-1 closes a REAL, MEASURED collision in 0.1.x, not a theoretical one:
 * today NaN, Infinity, -Infinity and null in promisedSpec all produce the
 * SAME claimId (JSON.stringify renders all four as `null`), and -0 and 0 do
 * too. Allowed value types are therefore: string, boolean, null, array,
 * plain object, and a number that is an INTEGER within [-(2^53-1), 2^53-1].
 * Anything needing a fraction goes in as a decimal string.
 *
 * S-5 refuses object keys containing surrogate code units — lone surrogates
 * and anything at or above U+10000. That kills the UTF-16-versus-code-point
 * key-sorting divergence at the source for everything new: JavaScript sorts
 * U+1F600 before U+FF01, while a code-point sort (Python `sorted()`, Go
 * string ordering, Rust BTreeMap) gives the opposite. The sort rule stays
 * normative for READING historical lines back.
 *
 * S-6 refuses LONE surrogates in promisedSpec STRINGS — both the string
 * branch of the union and every string value inside the object branch. S-5
 * closed this for keys only, which left the identical portability hole open
 * one field over: a lone surrogate has no UTF-8 encoding, so a Rust/Go/Python
 * verifier cannot reconstruct the preimage bytes even though JavaScript
 * happily round-trips it. Note what S-6 does NOT do: astral characters
 * (U+1F600 and friends) stay ALLOWED in string values, because they encode
 * fine in UTF-8 and only KEY ordering was ever ambiguous; and C0 control
 * characters stay ALLOWED in promisedSpec, unlike in settlementRef (S-4),
 * because JSON.stringify escapes them deterministically, they cost nothing in
 * portability, and promisedSpec is documented free text where a newline is a
 * legitimate thing for a caller to write. Refusing them here would be
 * unjustified scope creep with a real usability cost.
 *
 * Returns null when fine, or a human-readable reason.
 */
const LONE_SURROGATE_PROBLEM =
  "promisedSpec strings must not contain lone surrogates — an unpaired UTF-16 half has no UTF-8 encoding, so a verifier in another language cannot reconstruct the preimage bytes";

function promisedSpecIngestProblem(spec: unknown): string | null {
  // The string branch: S-1/S-5 do not apply to it, but S-6 does.
  if (typeof spec === "string") return hasLoneSurrogate(spec) ? LONE_SURROGATE_PROBLEM : null;
  // Depth AND visited tracking are both load-bearing, for a reason that is
  // easy to miss: in zod v4 a failing `.refine()` is NON-ABORTING, so the
  // MAX_DEPTH refine on promisedSpec does NOT stop this walker from also
  // running on the same raw, already-rejected input. Without the bounds
  // below, two ordinary inputs hang the process:
  //   - a cyclic object: infinite stack growth, RangeError after ~20s of a
  //     fully blocked event loop;
  //   - an acyclic DAG of just 41 objects at depth 40 (`let n={leaf:1};
  //     for(i<40) n={x:n,y:n}`): shared references get re-expanded once per
  //     path, so the walker explores ~2^40 nodes and never returns.
  // Both were measured against a real build; the frozen route rejects the
  // second in 4ms while this walker ran past 55 seconds. Bounding depth at
  // MAX_DEPTH costs nothing (anything deeper is rejected anyway) and the
  // visited set collapses shared references back to one visit each.
  const stack: Array<{ v: unknown; d: number }> = [{ v: spec, d: 0 }];
  const visited = new Set<object>();
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (d > MAX_DEPTH) continue; // the frozen route's own depth refine reports this
    if (v === null) continue;
    if (typeof v === "object") {
      if (visited.has(v as object)) continue;
      visited.add(v as object);
    }
    const t = typeof v;
    if (t === "string") {
      // S-6, for every string value at any depth.
      if (hasLoneSurrogate(v as string)) return LONE_SURROGATE_PROBLEM;
      continue;
    }
    if (t === "boolean") continue;
    if (t === "number") {
      const n = v as number;
      if (!Number.isFinite(n)) return "promisedSpec must not contain NaN or Infinity (all of NaN, Infinity, -Infinity and null hash identically)";
      if (!Number.isInteger(n)) return "promisedSpec numbers must be integers — use a decimal string for fractional values";
      if (Object.is(n, -0)) return "promisedSpec must not contain -0 (it hashes identically to 0)";
      if (n > MAX_SAFE_SPEC_INT || n < -MAX_SAFE_SPEC_INT) return "promisedSpec integers must be within [-(2^53-1), 2^53-1]";
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
      continue;
    }
    if (t === "object") {
      const obj = v as Record<string, unknown>;
      if (!isPlainObject(obj)) return "promisedSpec must contain only plain objects and arrays (no Date, Map, Set, RegExp or class instances)";
      if (typeof (obj as { toJSON?: unknown }).toJSON === "function") return "promisedSpec must not contain an object with its own toJSON";
      for (const key of Object.keys(obj)) {
        if (keyHasSurrogate(key)) {
          return "promisedSpec object keys must not contain surrogate code units (no lone surrogates and no characters at or above U+10000)";
        }
        stack.push({ v: obj[key], d: d + 1 });
      }
      continue;
    }
    return `promisedSpec must not contain a value of type ${t}`;
  }
  return null;
}

function checkIngestHardening(
  content: { promisedSpec: unknown; evidenceHash: string; settlementRef: string; timestamp: string },
  ctx: RefinementCtxLike,
): void {
  // S-1 + S-5 + S-6
  const specProblem = promisedSpecIngestProblem(content.promisedSpec);
  if (specProblem) ctx.addIssue({ code: "custom", path: ["promisedSpec"], message: specProblem });

  // S-2 — new claims must carry a strict UTC timestamp with a real calendar
  // date. Closes the gap where "August 30, 2026" and date-only forms were
  // accepted. Every producer in this codebase already emits
  // new Date().toISOString(), which satisfies this unchanged.
  if (!MEASURED_TIMESTAMP_RE.test(content.timestamp) || !isRealCalendarDate(content.timestamp)) {
    ctx.addIssue({
      code: "custom",
      path: ["timestamp"],
      message: "timestamp must be a strict UTC instant YYYY-MM-DDTHH:MM:SS[.fff]Z with a real calendar date",
    });
  }

  // S-3 — hex case. evidenceHash in upper case produces a DIFFERENT claimId
  // for the same evidence: exactly the duplicate-bypass that was closed for
  // addresses on 2026-08-31 and left open for evidence. Closed here for new
  // claims; the frozen schema still accepts either case so older lines keep
  // recomputing.
  if (!LOWER_SHA256_HEX_RE.test(content.evidenceHash)) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceHash"],
      message: "evidenceHash must be lower-case hex — upper-case hex mints a second claimId for the same evidence",
    });
  }

  // S-4 — settlementRef hygiene (log-line injection); the fuzz suite already
  // documented this gap.
  if (hasForbiddenTextChars(content.settlementRef)) {
    ctx.addIssue({
      code: "custom",
      path: ["settlementRef"],
      message: "settlementRef must not contain C0 control characters, U+007F, or lone surrogates",
    });
  }
}

/** ClaimContentSchema plus the ingest hardening of S-1..S-6. Used by recordDelivery(), never by computeClaimId(). */
export const StrictClaimContentSchema = ClaimContentObject.superRefine(checkMeasuredConsistency).superRefine(checkIngestHardening);

/** DeliveryClaimSchema plus the ingest hardening of S-1..S-6. This is what record_delivery validates against. */
export const StrictDeliveryClaimSchema = DeliveryClaimObject.superRefine(checkMeasuredConsistency).superRefine(checkIngestHardening);
