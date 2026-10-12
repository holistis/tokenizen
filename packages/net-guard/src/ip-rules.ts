// ip-rules.ts — the address blocklist and host-literal rules, lifted verbatim
// from self-check-server/network-guard.ts so there is now exactly ONE copy.
// Finding #1 of the trust-layer review was a guard that lived in one package
// and was not applied on another's road out; the fix is a single shared
// module every public road imports, not a second hand-maintained copy.
//
// This file is PURE (no network, no DNS). guarded-fetch.ts turns these rules
// into an actually-enforced, IP-pinned connection; this file only answers
// "is this literal address / hostname allowed to be reached at all".

import { isIP } from "node:net";

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
  { base: "0.0.0.0", bits: 8, label: '"this" network' },
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
  // fc00::/7 = unique local (fc/fd prefix).
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
 * Reject a hostname that is a blocked literal (localhost, 0.0.0.0, a .local
 * suffix, or an IP literal inside a blocked range) WITHOUT any DNS. Returns
 * normally when the hostname is a plain name that still needs resolving, or
 * an IP literal that is publicly routable. Throws UnsafeHostError otherwise.
 */
export function assertHostnameLiteralSafe(hostname: string): void {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAME_EXACT.has(lower)) {
    throw new UnsafeHostError(`"${hostname}" is not a publicly routable host`, hostname);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      throw new UnsafeHostError(`"${hostname}" (${suffix} suffix) is not a publicly routable host`, hostname);
    }
  }
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    const check = isBlockedAddress(hostname, literalFamily);
    if (check.blocked) {
      throw new UnsafeHostError(`"${hostname}" is a ${check.label} address, not publicly routable`, hostname);
    }
  }
}
