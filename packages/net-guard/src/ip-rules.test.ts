import { describe, it, expect } from "vitest";
import { isBlockedAddress, assertHostnameLiteralSafe, UnsafeHostError } from "./ip-rules.js";

describe("isBlockedAddress", () => {
  it("blocks the private, loopback, link-local and metadata ranges", () => {
    expect(isBlockedAddress("10.0.0.1", 4).blocked).toBe(true);
    expect(isBlockedAddress("192.168.1.1", 4).blocked).toBe(true);
    expect(isBlockedAddress("172.16.5.5", 4).blocked).toBe(true);
    expect(isBlockedAddress("127.0.0.1", 4).blocked).toBe(true);
    expect(isBlockedAddress("169.254.169.254", 4).blocked).toBe(true); // cloud metadata
    expect(isBlockedAddress("100.64.0.1", 4).blocked).toBe(true); // CGNAT
    expect(isBlockedAddress("0.0.0.0", 4).blocked).toBe(true);
  });
  it("allows real public addresses", () => {
    expect(isBlockedAddress("8.8.8.8", 4).blocked).toBe(false);
    expect(isBlockedAddress("93.184.216.34", 4).blocked).toBe(false);
  });
  it("handles IPv6 loopback, link-local, ULA and IPv4-mapped", () => {
    expect(isBlockedAddress("::1", 6).blocked).toBe(true);
    expect(isBlockedAddress("fe80::1", 6).blocked).toBe(true);
    expect(isBlockedAddress("fd00::1", 6).blocked).toBe(true);
    expect(isBlockedAddress("::ffff:10.0.0.1", 6).blocked).toBe(true);
    expect(isBlockedAddress("2606:4700:4700::1111", 6).blocked).toBe(false); // public v6
  });

  it("blocks IPv4-mapped IPv6 in HEX spelling, which is how URL parsing and node:dns deliver it", () => {
    // These hex forms are exactly what the WHATWG URL serializer produces for
    // ::ffff:127.0.0.1 etc. The old dotted-only regex let them through to
    // loopback and cloud metadata (the HIGH finding from the audit).
    expect(isBlockedAddress("::ffff:7f00:1", 6).blocked).toBe(true); // 127.0.0.1
    expect(isBlockedAddress("::ffff:a9fe:a9fe", 6).blocked).toBe(true); // 169.254.169.254 metadata
    expect(isBlockedAddress("::ffff:a00:5", 6).blocked).toBe(true); // 10.0.0.5
    expect(isBlockedAddress("::ffff:c0a8:101", 6).blocked).toBe(true); // 192.168.1.1
    expect(isBlockedAddress("::ffff:808:808", 6).blocked).toBe(false); // 8.8.8.8 stays allowed
  });

  it("blocks NAT64, site-local, multicast and ::/96-compat embedded internal addresses", () => {
    expect(isBlockedAddress("64:ff9b::a9fe:a9fe", 6).blocked).toBe(true); // NAT64 -> 169.254.169.254
    expect(isBlockedAddress("fec0::1", 6).blocked).toBe(true); // site-local (deprecated)
    expect(isBlockedAddress("ff02::1", 6).blocked).toBe(true); // multicast
    expect(isBlockedAddress("::7f00:1", 6).blocked).toBe(true); // ::127.0.0.1 compat
    expect(isBlockedAddress("2001:4860:4860::8888", 6).blocked).toBe(false); // public v6 stays allowed
  });

  it("fails closed on an unparseable IPv6 literal", () => {
    expect(isBlockedAddress("::fffff:1:2:3:4:5:6:7:8", 6).blocked).toBe(true);
  });
});

describe("assertHostnameLiteralSafe with bracketed IPv6 literals", () => {
  it("strips the URL brackets so the range check actually runs", () => {
    expect(() => assertHostnameLiteralSafe("[::1]")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("[::ffff:7f00:1]")).toThrow(UnsafeHostError); // 127.0.0.1 mapped, hex
    expect(() => assertHostnameLiteralSafe("[fe80::1]")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("[2001:4860:4860::8888]")).not.toThrow(); // public v6
  });
});

describe("assertHostnameLiteralSafe", () => {
  it("throws on blocked literal hosts", () => {
    expect(() => assertHostnameLiteralSafe("localhost")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("foo.local")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("svc.internal")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("0.0.0.0")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("10.0.0.1")).toThrow(UnsafeHostError);
    expect(() => assertHostnameLiteralSafe("169.254.169.254")).toThrow(UnsafeHostError);
  });
  it("passes plain names and routable IP literals (resolution happens later)", () => {
    expect(() => assertHostnameLiteralSafe("example.com")).not.toThrow();
    expect(() => assertHostnameLiteralSafe("8.8.8.8")).not.toThrow();
  });
});
