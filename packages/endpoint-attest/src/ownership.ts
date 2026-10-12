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
import { OWNERSHIP_METHODS, type OwnershipMethod } from "./schema.js";

/** The DNS label the token is published under, prefixed to the endpoint's host. Mirrors ACME's _acme-challenge convention. */
export const DNS_LABEL = "_endpoint-attest";
/** The path the token is published at for the file method. Standard well-known location per RFC 8615. */
export const WELL_KNOWN_PATH = "/.well-known/endpoint-attest.txt";

/**
 * A SECOND, distinct proof the owner publishes to opt IN to active testing.
 * Separate from the ownership proof on purpose: proving control of an endpoint
 * is not the same as consenting to have it actively connected-to and probed
 * (an MCP client handshake and tools/list), so each is its own published
 * token at its own location. Published at a distinct DNS label / well-known
 * path so it never collides with the ownership proof (a file holds one value).
 */
export const ACTIVE_CONSENT_DNS_LABEL = "_endpoint-attest-active-consent";
export const ACTIVE_CONSENT_WELL_KNOWN_PATH = "/.well-known/endpoint-attest-active-consent.txt";

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
  const bound = normalizeEndpoint(endpoint);
  const mac = createHmac("sha256", attesterSecret)
    .update(`${bound}\n${ownerAddress.toLowerCase()}`, "utf-8")
    .digest("hex");
  return `tok_${mac}`;
}

/**
 * Derive the ACTIVE-TEST consent token for one (endpoint, owner) pair — the
 * token the owner publishes to authorize active testing (an MCP client
 * handshake and tools/list), distinct from the ownership challenge token.
 *
 * Domain-separated from challengeToken: the HMAC message is prefixed with
 * "active-test-consent\n", so a consent token can never equal an ownership
 * token for the same pair, and neither can be replayed as the other. Because a
 * hostname cannot contain a newline and an owner address cannot either, the two
 * messages ("host\nowner" vs "active-test-consent\nhost\nowner") can never
 * collide. Same unguessable-without-the-secret property as the ownership token.
 */
export function activeTestConsentToken(endpoint: string, ownerAddress: string, attesterSecret: string): string {
  if (attesterSecret.length < 32) {
    throw new OwnershipError("attesterSecret must be at least 32 characters: a short secret makes every token guessable");
  }
  const bound = normalizeEndpoint(endpoint);
  const mac = createHmac("sha256", attesterSecret)
    .update(`active-test-consent\n${bound}\n${ownerAddress.toLowerCase()}`, "utf-8")
    .digest("hex");
  return `consent_${mac}`;
}

/** The exact host an endpoint's proof must be published under. Rejects anything that is not a plain http(s) URL, so a file:// or credential-bearing URL can never reach a DNS query or a fetch. */
export function endpointHost(endpoint: string): string {
  return parseEndpoint(endpoint).hostname;
}

/**
 * The canonical form a token binds to and an attestation records: scheme +
 * host + port + path, with credentials, query and fragment stripped and a
 * single trailing slash removed (but the root "/" kept). Computed from a
 * parsed URL, so a raw string can never smuggle a newline into the HMAC
 * message (new URL rejects/strips control characters).
 *
 * WHY THE FULL ENDPOINT, NOT JUST THE HOST: the challenge/consent tokens used
 * to bind only to the hostname, so one published proof (a single host-wide TXT
 * record, or a host-root well-known file) authorized an attestation — and the
 * consent-gated active probe — for EVERY scheme/port/path on that host. An
 * attacker who could read a victim's published proof could then point the
 * attester at http://victim:6379/anything and both mint a signed attestation
 * the owner never requested and use the attester as a non-blind port/path
 * probe. Binding the token to the normalized endpoint makes the token for
 * one endpoint useless for any other, so only the exact endpoints the owner
 * actually published a token for can be attested. The publish LOCATION stays
 * host/origin-based (a DNS name cannot carry a path); distinctness comes from
 * the token value, and verifyTokenPublished scans every record/finds the exact
 * match, so one host can carry many endpoints' tokens side by side.
 */
export function normalizeEndpoint(endpoint: string): string {
  const url = parseEndpoint(endpoint);
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  // url.host includes the port (unlike url.hostname) — the port is part of the
  // identity we bind to, so a different port is a different endpoint.
  return `${url.protocol}//${url.host}${path}`;
}

/** Parse + validate an endpoint as a plain, credential-free http(s) URL. Shared by endpointHost and normalizeEndpoint so both reject the same inputs identically. */
function parseEndpoint(endpoint: string): URL {
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
  return url;
}

/** Where a reader can re-check the proof themselves, per method. Recorded verbatim in the attestation's ownershipProof.location. */
export function proofLocation(method: OwnershipMethod, endpoint: string): string {
  const host = endpointHost(endpoint);
  if (method === "dns-txt") return `${DNS_LABEL}.${host}`;
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}${WELL_KNOWN_PATH}`;
}

/** Where the owner publishes the active-test consent token, per method. Distinct from proofLocation so the two proofs never share a file or DNS name. */
export function consentProofLocation(method: OwnershipMethod, endpoint: string): string {
  const host = endpointHost(endpoint);
  if (method === "dns-txt") return `${ACTIVE_CONSENT_DNS_LABEL}.${host}`;
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}${ACTIVE_CONSENT_WELL_KNOWN_PATH}`;
}

/**
 * The network operations this verifier performs, supplied by the CALLER
 * rather than defaulted here. endpoint-attest deliberately does not ship the
 * process that runs the check (see README "What this does not do"), and that
 * now extends to the network primitives: a public server must inject a guarded
 * fetch/resolver (net-guard) so an anonymous visitor cannot turn ownership
 * verification into an SSRF or DNS-rebinding probe. Both are REQUIRED, so a
 * caller physically cannot reach the network unguarded by forgetting to pass
 * one — the previous global-fetch/node:dns defaults were exactly how one road
 * stayed unguarded. Tests inject stubs, so this stays unit-testable offline.
 */
export interface OwnershipCheckDeps {
  resolveTxtRecords: (name: string) => Promise<string[][]>;
  fetchImpl: typeof fetch;
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
  deps: OwnershipCheckDeps,
): Promise<OwnershipResult> {
  if (!OWNERSHIP_METHODS.includes(method)) {
    throw new OwnershipError(`unknown ownership method: ${JSON.stringify(method)}`);
  }
  const expected = challengeToken(endpoint, ownerAddress, attesterSecret);
  const location = proofLocation(method, endpoint);
  return verifyTokenPublished(method, expected, location, deps);
}

/**
 * Verify the owner has published the ACTIVE-TEST consent token (opting in to
 * being actively connected-to and probed), using the same channel they used
 * for the ownership proof. Read-only, same posture as verifyOwnership. This is
 * a SEPARATE gate: proving control of an endpoint does not by itself authorize
 * active testing of it, so the attester runs the active path only when this
 * returns ok.
 */
export async function verifyActiveTestConsent(
  method: OwnershipMethod,
  endpoint: string,
  ownerAddress: string,
  attesterSecret: string,
  deps: OwnershipCheckDeps,
): Promise<OwnershipResult> {
  if (!OWNERSHIP_METHODS.includes(method)) {
    throw new OwnershipError(`unknown ownership method: ${JSON.stringify(method)}`);
  }
  const expected = activeTestConsentToken(endpoint, ownerAddress, attesterSecret);
  const location = consentProofLocation(method, endpoint);
  return verifyTokenPublished(method, expected, location, deps);
}

/**
 * The shared read-only check behind both verifyOwnership and
 * verifyActiveTestConsent: confirm that `expected` is exactly what is published
 * at `location` via `method`. Factored out so the two gates can never drift
 * apart in how they fetch, bound, and exact-match a published token.
 */
async function verifyTokenPublished(
  method: OwnershipMethod,
  expected: string,
  location: string,
  deps: OwnershipCheckDeps,
): Promise<OwnershipResult> {
  const now = () => new Date().toISOString();

  if (method === "dns-txt") {
    const resolver = deps.resolveTxtRecords;
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

  const fetchImpl = deps.fetchImpl;
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
