// http-source.ts — a ClaimSource over a plain HTTP endpoint: "another
// installation's public endpoint", one of the substrate examples named in
// discovery.ts's own header comment. This is WP1's second, non-EAS,
// production-grade source: it proves discoverDeliveryHistory's aggregation
// logic against a genuinely different SOURCE TYPE (plain HTTP, no chain, no
// ethers), not just a second EAS deployment. Like every ClaimSource, this is
// UNTRUSTED: discoverDeliveryHistory re-verifies every claim it returns,
// regardless of what this module does or does not check first.
//
// Convention (deliberately the simplest defensible one, not a full
// paginated/authenticated protocol): GET `${endpointUrl}?seller=<address>`
// returns a JSON array of claims for that seller. DECISIONS.md D-005
// explicitly defers designing a full decentralized-findability PROTOCOL
// until a real second installation exists to standardize with; inventing
// cursor-based pagination or auth here now would be protocol surface nobody
// has agreed to yet. A single bounded JSON response, capped the same way any
// other source is capped downstream, is the right-sized amount of protocol
// for a substrate that has no live second party yet.
//
// Native fetch only (Node >=20 ships it as a global) — no new dependency,
// same minimal-dependency stance eas.ts states for itself ("plain ethers
// only, no eas-sdk dependency").

import type { ClaimSource } from "./discovery.js";
import { ETH_ADDRESS_RE, type DeliveryClaim } from "./schema.js";

export class HttpSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpSourceError";
  }
}

// discoverDeliveryHistory's own MAX_CLAIMS_PER_SOURCE only bounds the claims
// ARRAY, after it is already fully parsed into memory. A raw response body
// far larger than any real claim set (an oversized or hostile response)
// would pay the cost of buffering and JSON.parse BEFORE that cap gets a
// chance to help. This bounds the raw bytes read, before parsing, closing
// that gap specifically for this transport (EAS does not have this exposure:
// its equivalent bound is the block-range windowing in eas.ts). 16 MiB is
// generous for thousands of real claims (each a few hundred bytes) while
// still refusing a source that tries to exhaust memory.
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

// Independent of discoverDeliveryHistory's own sourceTimeoutMs (default
// 30s): this source is also usable standalone, outside discoverDeliveryHistory,
// so it carries its own, tighter default rather than relying entirely on a
// caller that may not exist.
const DEFAULT_TIMEOUT_MS = 10_000;

// Reuses schema.ts's own canonical address shape (the same one
// DeliveryClaimSchema enforces on sellerAddress/buyerAddress) rather than a
// separately invented, looser check. sellerAddress is caller-supplied here
// (same trust level as every other source's argument), but validating its
// shape before string-building a URL from it is nearly free, and matching
// the one canonical format means a malformed address fails fast, right
// here, with a clear message, instead of surfacing later as an opaque
// low-level exception from whatever eventually tries to use it (e.g. an
// ethers "invalid BytesLike value" a couple of layers downstream).
const ADDRESS_SHAPE = ETH_ADDRESS_RE;

export interface HttpClaimSourceOptions {
  name?: string;
  /** Per-request timeout in ms. Independent of, and typically tighter than, discoverDeliveryHistory's own sourceTimeoutMs. */
  timeoutMs?: number;
  /** Refuse a response body larger than this many bytes, checked WHILE streaming, before JSON.parse ever runs. */
  maxResponseBytes?: number;
  /** Injection seam for tests: a fetch-shaped function. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Read a Response body up to maxBytes, throwing HttpSourceError the moment
 * the limit is crossed instead of buffering the rest. Cancels the underlying
 * stream on overflow so the connection is not left dangling.
 */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HttpSourceError(`response exceeded ${maxBytes} bytes, refused before parsing`);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

/**
 * A ClaimSource over a plain HTTP endpoint. GETs
 * `${endpointUrl}?seller=<sellerAddress>` and expects a JSON array back.
 * Deliberately does NO verification and NO per-entry shape checking itself
 * (same division of responsibility as staticSource/easSource):
 * discoverDeliveryHistory re-verifies every claim from every source
 * uniformly. A malformed sellerAddress, a non-2xx status, a request that
 * times out or fails at the network level, a body over the size cap, or a
 * body that is not JSON or not a JSON array, all become a thrown
 * HttpSourceError — which discoverDeliveryHistory's existing per-source
 * try/catch already turns into a SourceReport.error, never a crash of the
 * whole aggregation.
 */
export function httpClaimSource(endpointUrl: string, opts: HttpClaimSourceOptions = {}): ClaimSource {
  const name = opts.name ?? "http";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    name,
    fetchForSeller: async (sellerAddress: string): Promise<DeliveryClaim[]> => {
      if (!ADDRESS_SHAPE.test(sellerAddress)) {
        throw new HttpSourceError(`refusing to build a URL from a malformed sellerAddress: ${JSON.stringify(sellerAddress)}`);
      }
      const url = new URL(endpointUrl);
      url.searchParams.set("seller", sellerAddress);

      let response: Response;
      try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        throw new HttpSourceError(`request to ${url} failed: ${(e as Error).message}`);
      }
      if (!response.ok) {
        throw new HttpSourceError(`${url} responded ${response.status} ${response.statusText}`);
      }

      // A stall DURING body streaming (headers already arrived, response.ok
      // already true, but the body never finishes within timeoutMs) is a
      // SEPARATE failure moment from the connect-phase catch above: the same
      // AbortSignal also governs the body read, so it rejects too, but with
      // a raw DOMException (name "TimeoutError"), not HttpSourceError. Wrap
      // it here so every documented failure mode really does surface as
      // HttpSourceError, matching this function's own doc comment.
      let text: string;
      try {
        text = await readBounded(response, maxResponseBytes);
      } catch (e) {
        if (e instanceof HttpSourceError) throw e; // already correct: the byte-cap-exceeded case
        throw new HttpSourceError(`reading response body from ${url} failed: ${(e as Error).message}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new HttpSourceError(`response from ${url} was not valid JSON: ${(e as Error).message}`);
      }
      if (!Array.isArray(parsed)) {
        throw new HttpSourceError(`response from ${url} was valid JSON but not an array`);
      }
      // Untyped cast is deliberate: every entry is untrusted input regardless
      // of shape, exactly like staticSource's fixed list and easSource's
      // decoded attestations. discoverDeliveryHistory's own per-entry
      // computeClaimId/verifyClaim/DeliveryClaimSchema.parse chain is what
      // actually validates each one; duplicating that here would just be a
      // second, redundant copy of logic that already lives in one place.
      return parsed as DeliveryClaim[];
    },
  };
}
