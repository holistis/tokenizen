// guarded-fetch.ts — the single enforced egress choke-point.
//
// network-guard.ts's own honest note said it did NOT defeat DNS rebinding,
// because it validated at check-time and then let the caller fetch again
// (a second, unvalidated resolution). This closes that gap AND a second one
// found while building it: a custom DNS lookup alone is NOT enough, because
// net.connect skips DNS entirely for an IP-literal host — so a URL or a
// redirect pointing straight at http://169.254.169.254 would never reach a
// lookup-based guard. The validation therefore lives on the undici CONNECTOR,
// which runs for EVERY connection: initial or redirect, hostname or IP
// literal. Hostnames are resolved, every returned address is validated, and
// the validated addresses are the ones dialed (pinning, so rebinding cannot
// swap in a private address between check and connect). IP literals are range-
// checked directly. The DNS resolver is injectable so the decision logic is
// unit-testable without a real network.

import { Agent, fetch as undiciFetch, buildConnector } from "undici";
import { lookup as dnsLookupCb, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { UnsafeHostError, isBlockedAddress, assertHostnameLiteralSafe } from "./ip-rules.js";

/** Promisified node:dns lookup with all addresses. The production resolver. */
function defaultDnsLookupAll(hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    dnsLookupCb(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses);
    });
  });
}

type NetLookupCallback = (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void;

export interface GuardedFetchDeps {
  /** Injectable DNS resolver (all addresses). Defaults to node:dns. Tests supply a fake so no real lookup happens. */
  dnsLookupAll?: (hostname: string) => Promise<LookupAddress[]>;
  connectTimeoutMs?: number;
  headersTimeoutMs?: number;
  bodyTimeoutMs?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 15_000;
const DEFAULT_BODY_TIMEOUT_MS = 15_000;

/**
 * A net-style lookup (hostname, options, callback) for undici's connector.
 * undici calls it with { all: true } and expects an array of {address,
 * family}. We resolve, validate EVERY returned address, and refuse the whole
 * connection if any one is blocked — then hand undici exactly those validated
 * addresses to dial, so no unvalidated address can be substituted (pinning).
 * Note: net.connect never calls this for an IP-literal host; those are caught
 * by the connector's assertHostnameLiteralSafe instead.
 */
export function createGuardedLookup(
  dnsLookupAll: (hostname: string) => Promise<LookupAddress[]> = defaultDnsLookupAll,
) {
  return function guardedLookup(hostname: string, _options: unknown, callback: NetLookupCallback): void {
    try {
      assertHostnameLiteralSafe(hostname);
    } catch (e) {
      callback(e as NodeJS.ErrnoException, []);
      return;
    }
    const literalFamily = isIP(hostname);
    if (literalFamily === 4 || literalFamily === 6) {
      callback(null, [{ address: hostname, family: literalFamily }]);
      return;
    }
    dnsLookupAll(hostname)
      .then((addresses) => {
        if (!addresses || addresses.length === 0) {
          callback(new UnsafeHostError(`"${hostname}" did not resolve to any address`, hostname), []);
          return;
        }
        for (const addr of addresses) {
          const family = addr.family === 6 ? 6 : 4;
          const check = isBlockedAddress(addr.address, family);
          if (check.blocked) {
            callback(
              new UnsafeHostError(
                `"${hostname}" resolves to ${addr.address}, a ${check.label} address — not publicly routable`,
                hostname,
              ),
              [],
            );
            return;
          }
        }
        callback(null, addresses);
      })
      .catch((e: Error) => {
        callback(new UnsafeHostError(`could not resolve "${hostname}": ${e.message}`, hostname), []);
      });
  };
}

function assertSafeRequestUrl(input: string | URL): void {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    throw new UnsafeHostError(`not a valid URL: ${String(input)}`, String(input));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeHostError(`refusing non-http(s) URL scheme "${url.protocol}"`, url.hostname);
  }
  if (url.username || url.password) {
    throw new UnsafeHostError("refusing URL that carries embedded userinfo", url.hostname);
  }
  // Early, friendly rejection of an obviously-blocked initial host. The
  // connector below is the real per-hop enforcement (incl. redirects).
  assertHostnameLiteralSafe(url.hostname);
}

/**
 * Build a fetch-shaped function whose connections are IP-validated and pinned
 * on EVERY hop. Returned value is typed as the global fetch so it drops into
 * existing `fetchImpl?: typeof fetch` seams; at runtime it is undici's spec-
 * compliant fetch bound to a guarded connector.
 */
export function makeGuardedFetch(deps: GuardedFetchDeps = {}): typeof fetch {
  const lookup = createGuardedLookup(deps.dnsLookupAll);
  const baseConnector = buildConnector({ timeout: deps.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS, lookup });

  // Runs for every connection undici opens — initial request and every
  // redirect hop, hostname or IP literal. IP literals skip the lookup, so the
  // literal range check must happen here, not only in the lookup.
  const connect: typeof baseConnector = (options, callback) => {
    try {
      assertHostnameLiteralSafe(options.hostname);
    } catch (e) {
      callback(e as Error, null);
      return;
    }
    baseConnector(options, callback);
  };

  const agent = new Agent({
    connect,
    headersTimeout: deps.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS,
    bodyTimeout: deps.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS,
  });

  const guarded = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = typeof input === "string" || input instanceof URL ? input : (input as Request).url;
    assertSafeRequestUrl(target);
    return undiciFetch(target as string | URL, { ...(init as object), dispatcher: agent } as never) as unknown as Promise<Response>;
  };

  return guarded as unknown as typeof fetch;
}

/** The default guarded fetch: node:dns resolver, default timeouts. */
export const guardedFetch: typeof fetch = makeGuardedFetch();
