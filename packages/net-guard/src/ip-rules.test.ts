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
