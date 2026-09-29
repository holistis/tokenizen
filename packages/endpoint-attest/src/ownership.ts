// ownership.ts — prove that whoever requested an attestation actually
// controls the endpoint it is about.
//
// This is the part that keeps the whole system voluntary. Without it, an
// "attestation" about an endpoint is an unsolicited report about a bystander
// who never asked and gets no say. With it, the only attestations that can
// exist are ones the operator asked for and proved they had the right to ask
// for.
//
// DELIBERATELY NOT INVENTED HERE: the two challenge methods mirror ACME
// (the protocol every certificate authority on the internet uses) rather
// than a third scheme of our own. dns-txt is ACME's DNS-01, well-known-file
// is ACME's HTTP-01 shape, and /.well-known/ is the standard location for
// exactly this (RFC 8615). A reviewer who knows ACME needs no new concepts
// to audit this.
//
// STATELESS ON PURPOSE: the challenge token is derived with HMAC from an
// attester-held secret plus the (endpoint, owner) pair, so nothing has to be
// stored between issuing a challenge and verifying it. No database, no
// expiring session, no cleanup job. The token is not a credential: publishing
// it grants nothing, it only demonstrates control at the moment it is read.
//
// HONEST LIMIT, stated here rather than discovered later: a DNS record or a
// well-known file that stays in place after a domain changes hands keeps
// proving the OLD owner's control. This is inherent to every control-proof
// scheme built on DNS or HTTP, including ACME's, and it is the reason
// certificates expire rather than the reason not to use them. Our mandatory
// attestation expiry (schema.ts) is the same answer: control is re-proven at
// every renewal, so a stale record can only carry a claim for the remaining
// life of one attestation, not indefinitely.

import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { OWNERSHIP_METHODS, type OwnershipMethod } from "./schema.js";

/** The DNS label the token is published under, prefixed to the endpoint's host. Mirrors ACME's _acme-challenge convention. */
export const DNS_LABEL = "_endpoint-attest";
/** The path the token is published at for the file method. Standard well-known location per RFC 8615. */
export const WELL_KNOWN_PATH = "/.well-known/endpoint-attest.txt";

const DEFAULT_TIMEOUT_MS = 10_000;
// A well-known file only ever needs to hold one short token. Anything larger
// is either a misconfiguration or an attempt to make the verifier chew
// through a large body, so it is refused while streaming rather than
// buffered first (same posture as capacity-attest's http-source.ts).
const MAX_FILE_BYTES = 8 * 1024;

export class OwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnershipError";
  }
}

/**
 * Derive the challenge token for one (endpoint, owner) pair.
 *
 * Deterministic, so the same pair always yields the same token and no state
 * needs to be kept between issuing and verifying. Unguessable without
 * `attesterSecret`, so an outsider cannot publish a valid token for someone
 * else's endpoint and claim to be its owner.
 */
export function challengeToken(endpoint: string, ownerAddress: string, attesterSecret: string): string {
  if (attesterSecret.length < 32) {
    throw new OwnershipError("attesterSecret must be at least 32 characters: a short secret makes every token guessable");
  }
  const host = endpointHost(endpoint);
  const mac = createHmac("sha256", attesterSecret)
    .update(`${host}\n${ownerAddress.toLowerCase()}`, "utf-8")
    .digest("hex");
  return `tok_${mac}`;
}

/** The exact host an endpoint's proof must be published under. Rejects anything that is not a plain http(s) URL, so a file:// or credential-bearing URL can never reach a DNS query or a fetch. */
export function endpointHost(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new OwnershipError(`endpoint is not a valid URL: ${JSON.stringify(endpoint)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OwnershipError(`endpoint must be http or https, got ${url.protocol}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new OwnershipError("endpoint must not contain credentials");
  }
  if (url.hostname === "") {
    throw new OwnershipError("endpoint has no host");
  }
  return url.hostname;
}

/** Where a reader can re-check the proof themselves, per method. Recorded verbatim in the attestation's ownershipProof.location. */
export function proofLocation(method: OwnershipMethod, endpoint: string): string {
  const host = endpointHost(endpoint);
  if (method === "dns-txt") return `${DNS_LABEL}.${host}`;
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}${WELL_KNOWN_PATH}`;
}

/** Injection seams so verification is unit-testable without real DNS or a real network, the same DI pattern capacity-attest uses for its chain reads. */
export interface OwnershipCheckDeps {
  resolveTxtRecords?: (name: string) => Promise<string[][]>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxFileBytes?: number;
}

export type OwnershipResult =
  | { ok: true; method: OwnershipMethod; location: string; verifiedAt: string }
  | { ok: false; method: OwnershipMethod; location: string; reason: string };

/**
 * Verify control of `endpoint` by the holder of `ownerAddress`, using one
 * named method. Read-only: this queries DNS or fetches one file, and never
 * writes to, logs into, or probes anything on the operator's system.
 */
export async function verifyOwnership(
  method: OwnershipMethod,
  endpoint: string,
  ownerAddress: string,
  attesterSecret: string,
  deps: OwnershipCheckDeps = {},
): Promise<OwnershipResult> {
  if (!OWNERSHIP_METHODS.includes(method)) {
    throw new OwnershipError(`unknown ownership method: ${JSON.stringify(method)}`);
  }
  const expected = challengeToken(endpoint, ownerAddress, attesterSecret);
  const location = proofLocation(method, endpoint);
  const now = () => new Date().toISOString();

  if (method === "dns-txt") {
    const resolver = deps.resolveTxtRecords ?? resolveTxt;
    let records: string[][];
    try {
      records = await resolver(location);
    } catch (e) {
      return { ok: false, method, location, reason: `dns lookup failed: ${(e as Error).message}` };
    }
    // A TXT record can be split into multiple strings by the resolver; the
    // published value is their concatenation, which is how every DNS client
    // reassembles long records.
    const values = records.map((chunks) => chunks.join("").trim());
    if (!values.includes(expected)) {
      return { ok: false, method, location, reason: "no TXT record at that name matched the expected token" };
    }
    return { ok: true, method, location, verifiedAt: now() };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxFileBytes = deps.maxFileBytes ?? MAX_FILE_BYTES;

  let response: Response;
  try {
    response = await fetchImpl(location, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, method, location, reason: `fetch failed: ${(e as Error).message}` };
  }
  if (!response.ok) {
    return { ok: false, method, location, reason: `responded ${response.status} ${response.statusText}` };
  }

  let body: string;
  try {
    body = await readBounded(response, maxFileBytes);
  } catch (e) {
    return { ok: false, method, location, reason: (e as Error).message };
  }
  // Exact match on the trimmed content, not a substring search: a token
  // buried in an otherwise unrelated page does not demonstrate that the
  // operator deliberately published it.
  if (body.trim() !== expected) {
    return { ok: false, method, location, reason: "file content did not exactly match the expected token" };
  }
  return { ok: true, method, location, verifiedAt: now() };
}

/** Read a response body up to maxBytes, refusing the moment the limit is crossed instead of buffering the rest. */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const stream = response.body;
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new OwnershipError(`proof file exceeded ${maxBytes} bytes, refused before reading further`);
        }
        chunks.push(value);
      }
    }
  } catch (e) {
    if (e instanceof OwnershipError) throw e;
    throw new OwnershipError(`reading proof file failed: ${(e as Error).message}`);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}
