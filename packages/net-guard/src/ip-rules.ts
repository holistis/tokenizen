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

/**
 * Expand any valid IPv6 literal to its eight 16-bit groups. Handles `::`
 * compression, an optional `%zone` suffix, and a trailing dotted-IPv4 tail
 * (the `::ffff:1.2.3.4` form). Returns null only for genuinely unparseable
 * input. This replaces the earlier string-prefix matching, which classified
 * only ONE textual spelling of an address and so let the hex form of an
 * IPv4-mapped literal (`::ffff:7f00:1`, which is how the WHATWG URL parser and
 * node:dns actually hand us `::ffff:127.0.0.1`) slip through to loopback and
 * cloud metadata. Numeric normalisation makes the spelling irrelevant.
 */
function parseIPv6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const pct = s.indexOf("%");
  if (pct !== -1) s = s.slice(0, pct); // drop zone id
  if (s.length === 0) return null;

  // A trailing dotted IPv4 ("::ffff:1.2.3.4") becomes two hextets.
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const afterLastColon = lastColon === -1 ? s : s.slice(lastColon + 1);
  if (afterLastColon.includes(".")) {
    const v4 = ipv4ToInt(afterLastColon);
    if (v4 === null) return null;
    tail = [(v4 >>> 16) & 0xffff, v4 & 0xffff];
    s = lastColon === -1 ? "" : s.slice(0, lastColon + 1);
    if (s.endsWith(":") && !s.endsWith("::")) s = s.slice(0, -1);
  }

  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  let head: number[];
  let rest: number[];
  const dbl = s.indexOf("::");
  if (dbl !== -1) {
    if (s.indexOf("::", dbl + 1) !== -1) return null; // only one `::` allowed
    const left = parseGroups(s.slice(0, dbl));
    const right = parseGroups(s.slice(dbl + 2));
    if (left === null || right === null) return null;
    const fill = 8 - (left.length + right.length + tail.length);
    if (fill < 0) return null;
    head = left;
    rest = [...Array(fill).fill(0), ...right];
  } else {
    const groups = parseGroups(s);
    if (groups === null) return null;
    head = groups;
    rest = [];
  }

  const full = [...head, ...rest, ...tail];
  if (full.length !== 8) return null;
  return full;
}

function hextetsToEmbeddedV4(h: number[]): string {
  const h6 = h[6] ?? 0;
  const h7 = h[7] ?? 0;
  return `${(h6 >> 8) & 0xff}.${h6 & 0xff}.${(h7 >> 8) & 0xff}.${h7 & 0xff}`;
}

function isBlockedIPv6(ip: string): { blocked: true; label: string } | { blocked: false } {
  const h = parseIPv6Hextets(ip);
  // A family-6 literal we cannot parse is treated as blocked (fail-closed):
  // every normal valid address parses, so an unparseable one is a red flag,
  // never a reason to wave it through.
  if (h === null) return { blocked: true, label: "unparseable IPv6" };

  const allZeroExceptLast = h.slice(0, 7).every((x) => x === 0);
  if (allZeroExceptLast && h[7] === 0) return { blocked: true, label: "unspecified (::)" };
  if (allZeroExceptLast && h[7] === 1) return { blocked: true, label: "loopback (::1)" };

  const first = h[0] ?? 0;
  if ((first & 0xff00) === 0xff00) return { blocked: true, label: "multicast" };
  if ((first & 0xffc0) === 0xfe80) return { blocked: true, label: "link-local" };
  if ((first & 0xffc0) === 0xfec0) return { blocked: true, label: "site-local (deprecated)" };
  if ((first & 0xfe00) === 0xfc00) return { blocked: true, label: "unique local (ULA)" };

  // Embedded-IPv4 forms: check the embedded 32 bits as IPv4 regardless of the
  // textual spelling. IPv4-mapped ::ffff:0:0/96, IPv4-compatible ::/96, and
  // NAT64 64:ff9b::/96 all carry a v4 address in the last two groups.
  const isMapped = h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff;
  const isCompat = h.slice(0, 6).every((x) => x === 0); // ::a.b.c.d (deprecated)
  const isNat64 = h[0] === 0x0064 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0);
  if (isMapped || isCompat || isNat64) {
    const embedded = hextetsToEmbeddedV4(h);
    const inner = isBlockedIPv4(embedded);
    if (inner.blocked) return { blocked: true, label: `${inner.label} (embedded IPv4 ${embedded})` };
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
  // A URL's .hostname keeps the brackets around an IPv6 literal (e.g.
  // "[::1]"), and isIP("[::1]") === 0, so without stripping them every IPv6
  // literal would skip the range check entirely. The connector path hands us
  // the unbracketed form, so stripping here is a no-op there and a fix on the
  // URL path.
  const bare = hostname.replace(/^\[/, "").replace(/\]$/, "");
  const lower = bare.toLowerCase();
  if (BLOCKED_HOSTNAME_EXACT.has(lower)) {
    throw new UnsafeHostError(`"${hostname}" is not a publicly routable host`, hostname);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      throw new UnsafeHostError(`"${hostname}" (${suffix} suffix) is not a publicly routable host`, hostname);
    }
  }
  const literalFamily = isIP(bare);
  if (literalFamily === 4 || literalFamily === 6) {
    const check = isBlockedAddress(bare, literalFamily);
    if (check.blocked) {
      throw new UnsafeHostError(`"${hostname}" is a ${check.label} address, not publicly routable`, hostname);
    }
  }
}
