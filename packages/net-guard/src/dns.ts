// dns.ts — the single place a DNS query is made on behalf of anonymous input.
//
// Two things live here. resolveTxtGuarded is NOT an SSRF primitive (a TXT
// lookup opens no connection to the named host), it is centralised only so
// there is one DNS choke-point rather than a node:dns import scattered across
// packages. assertPubliclyRoutableHost is the optional EARLY check a server
// can run to reject an obviously-internal host before any fetch is attempted;
// the real, pinning enforcement is guarded-fetch.ts, this just gives a
// friendlier, earlier error at the edge.

import { resolveTxt as resolveTxtCb, lookup as dnsLookupCb, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { UnsafeHostError, isBlockedAddress, assertHostnameLiteralSafe } from "./ip-rules.js";

// The hostname is attacker-chosen, so its DNS can be made to resolve slowly or
// never. Bound the default resolvers: the underlying OS query is abandoned
// rather than cancelled, but the promise rejects so the attester never hangs on
// a chosen host. Only the DEFAULT resolvers are bounded; an injected test stub
// is left alone.
const DEFAULT_DNS_TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface ResolveTxtDeps {
  /** Injectable for tests. Defaults to node:dns resolveTxt. */
  resolveTxtImpl?: (name: string) => Promise<string[][]>;
}

function defaultResolveTxt(name: string): Promise<string[][]> {
  return withTimeout(
    new Promise<string[][]>((resolve, reject) => {
      resolveTxtCb(name, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    }),
    DEFAULT_DNS_TIMEOUT_MS,
    `TXT lookup of "${name}"`,
  );
}

/**
 * Resolve TXT records for a DNS name. Rejects an IP literal (a TXT query for
 * an address is always a caller mistake) and an empty name; otherwise defers
 * to the resolver. No connection to the named host is ever opened.
 */
export async function resolveTxtGuarded(name: string, deps: ResolveTxtDeps = {}): Promise<string[][]> {
  const trimmed = name.trim();
  if (!trimmed) throw new UnsafeHostError("empty DNS name", name);
  if (isIP(trimmed) !== 0) throw new UnsafeHostError(`"${name}" is an IP literal, not a DNS name`, name);
  const impl = deps.resolveTxtImpl ?? defaultResolveTxt;
  return impl(trimmed);
}

export interface RoutableHostDeps {
  /** Injectable DNS resolver (all addresses). Defaults to node:dns. */
  dnsLookupAll?: (hostname: string) => Promise<LookupAddress[]>;
}

function defaultDnsLookupAll(hostname: string): Promise<LookupAddress[]> {
  return withTimeout(
    new Promise<LookupAddress[]>((resolve, reject) => {
      dnsLookupCb(hostname, { all: true }, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    }),
    DEFAULT_DNS_TIMEOUT_MS,
    `DNS lookup of "${hostname}"`,
  );
}

/**
 * Optional early edge check: throw UnsafeHostError if the hostname is a
 * blocked literal or resolves (now) to any blocked address. This does NOT
 * pin — guarded-fetch.ts does — so it is a friendly pre-filter, never the
 * sole defence.
 */
export async function assertPubliclyRoutableHost(hostname: string, deps: RoutableHostDeps = {}): Promise<void> {
  assertHostnameLiteralSafe(hostname);
  if (isIP(hostname) !== 0) return; // a routable IP literal already passed the literal check
  const lookupAll = deps.dnsLookupAll ?? defaultDnsLookupAll;
  let addresses: LookupAddress[];
  try {
    addresses = await lookupAll(hostname);
  } catch (e) {
    throw new UnsafeHostError(`could not resolve "${hostname}": ${(e as Error).message}`, hostname);
  }
  if (addresses.length === 0) {
    throw new UnsafeHostError(`"${hostname}" did not resolve to any address`, hostname);
  }
  for (const addr of addresses) {
    const family = addr.family === 6 ? 6 : 4;
    const check = isBlockedAddress(addr.address, family);
    if (check.blocked) {
      throw new UnsafeHostError(`"${hostname}" resolves to ${addr.address}, a ${check.label} address — not publicly routable`, hostname);
    }
  }
}
