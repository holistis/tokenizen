// network-guard.ts — refuses to let this PUBLIC, unauthenticated server make
// an outbound request or DNS query on behalf of a host that resolves inside
// a private, loopback, link-local, or otherwise non-public range.
//
// WHY THIS EXISTS AND IS NOT PART OF endpoint-attest: endpoint-attest's
// verifyOwnership() and trust-attest-server's checks.ts were built for an MCP
// tool call, where the caller is an agent acting on its own operator's
// endpoint. Wiring the same functions behind an anonymous web form changes
// the threat model: any visitor can now submit ANY http(s) URL and cause
// THIS server to make a real DNS lookup and/or HTTP GET to it. Without a
// guard, that is a classic SSRF primitive — a visitor could point `endpoint`
// at http://169.254.169.254/... (cloud metadata), http://localhost:<port>,
// or an internal-only host, and use this server as a blind network probe.
// Al-Mizaan's "exposure-check"/"data-check" (see wazir-al-ghanima CLAUDE.md)
// requires this to be handled explicitly rather than silently inherited from
// code that was never exposed to anonymous input before.
//
// WHAT THIS DOES NOT FULLY CLOSE, STATED HONESTLY: this resolves the
// hostname and checks the addresses returned AT THE TIME OF THE CHECK, then
// the caller proceeds to fetch/resolve again. A DNS server that returns a
// public IP on the first lookup and a private one moments later (classic DNS
// rebinding) is not defeated by this alone — that would require pinning the
// exact resolved IP into the outgoing request (a custom fetch dispatcher),
// which is a larger change deliberately left for a follow-up rather than
// silently claimed here. This guard still blocks the overwhelmingly common
// case: a visitor directly naming an internal/loopback/link-local host or IP
// literal.
//
// DI SEAM, same pattern as ownership.ts/checks.ts: dnsLookup is injectable so
// tests never perform a real DNS lookup.

import { isIP } from "node:net";
import { lookup as dnsLookupCb, type LookupAddress } from "node:dns";
import { promisify } from "node:util";

const defaultDnsLookup = promisify(dnsLookupCb);

export interface NetworkGuardDeps {
  /** Injectable stand-in for node:dns's lookup(hostname, {all:true}, cb), promisified shape. */
  dnsLookup?: (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;
}

export class UnsafeHostError extends Error {
  constructor(
    message: string,
    public readonly hostname: string,
  ) {
    super(message);
    this.name = "UnsafeHostError";
  }
}

/** IPv4 ranges that must never be reached from a public, unauthenticated request. */
const BLOCKED_IPV4_RANGES: Array<{ base: string; bits: number; label: string }> = [
  { base: "0.0.0.0", bits: 8, label: "\"this\" network" },
  { base: "10.0.0.0", bits: 8, label: "private (RFC1918)" },
  { base: "100.64.0.0", bits: 10, label: "carrier-grade NAT" },
  { base: "127.0.0.0", bits: 8, label: "loopback" },
  { base: "169.254.0.0", bits: 16, label: "link-local (incl. cloud metadata)" },
  { base: "172.16.0.0", bits: 12, label: "private (RFC1918)" },
  { base: "192.0.0.0", bits: 24, label: "IETF protocol assignments" },
  { base: "192.0.2.0", bits: 24, label: "documentation (TEST-NET-1)" },
  { base: "192.168.0.0", bits: 16, label: "private (RFC1918)" },
  { base: "198.18.0.0", bits: 15, label: "benchmarking" },
  { base: "198.51.100.0", bits: 24, label: "documentation (TEST-NET-2)" },
  { base: "203.0.113.0", bits: 24, label: "documentation (TEST-NET-3)" },
  { base: "224.0.0.0", bits: 4, label: "multicast" },
  { base: "240.0.0.0", bits: 4, label: "reserved" },
];

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".localhost", ".internal"];
const BLOCKED_HOSTNAME_EXACT = new Set(["localhost", "0.0.0.0"]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function isBlockedIPv4(ip: string): { blocked: true; label: string } | { blocked: false } {
  const n = ipv4ToInt(ip);
  if (n === null) return { blocked: false };
  for (const range of BLOCKED_IPV4_RANGES) {
    const baseN = ipv4ToInt(range.base);
    if (baseN === null) continue;
    const mask = range.bits === 0 ? 0 : (0xffffffff << (32 - range.bits)) >>> 0;
    if ((n & mask) === (baseN & mask)) return { blocked: true, label: range.label };
  }
  return { blocked: false };
}

function isBlockedIPv6(ip: string): { blocked: true; label: string } | { blocked: false } {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return { blocked: true, label: "loopback/unspecified" };
  if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return { blocked: true, label: "link-local" };
  }
  // fc00::/7 = first hex nibble in c-f with the low bit pattern fc/fd.
  if (lower.startsWith("fc") || lower.startsWith("fd")) return { blocked: true, label: "unique local (ULA)" };
  // IPv4-mapped (::ffff:a.b.c.d) — unwrap and re-check as IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const inner = mapped[1];
    if (inner) {
      const innerCheck = isBlockedIPv4(inner);
      if (innerCheck.blocked) return innerCheck;
    }
  }
  return { blocked: false };
}

/** Checks a single already-resolved IP literal against the blocklists. */
export function isBlockedAddress(address: string, family: 4 | 6): { blocked: true; label: string } | { blocked: false } {
  return family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
}

/**
 * Resolve `hostname` and throw UnsafeHostError if the hostname itself is a
 * blocked literal, OR if ANY of its resolved addresses fall in a blocked
 * range. Safe to call with an IP-literal hostname too (dns.lookup on an IP
 * literal just returns that IP).
 */
export async function assertPubliclyRoutableHost(hostname: string, deps: NetworkGuardDeps = {}): Promise<void> {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAME_EXACT.has(lower)) {
    throw new UnsafeHostError(`"${hostname}" is not a publicly routable host`, hostname);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      throw new UnsafeHostError(`"${hostname}" (${suffix} suffix) is not a publicly routable host`, hostname);
    }
  }

  // If the hostname is itself an IP literal, check it directly without a
  // DNS round-trip.
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    const check = isBlockedAddress(hostname, literalFamily);
    if (check.blocked) {
      throw new UnsafeHostError(`"${hostname}" is a ${check.label} address, not publicly routable`, hostname);
    }
    return;
  }

  const lookupFn = deps.dnsLookup ?? ((h: string, o: { all: true }) => defaultDnsLookup(h, o));
  let addresses: LookupAddress[];
  try {
    addresses = await lookupFn(hostname, { all: true });
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
