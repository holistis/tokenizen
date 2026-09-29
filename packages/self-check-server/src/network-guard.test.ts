import { describe, expect, it } from "vitest";
import { assertPubliclyRoutableHost, isBlockedAddress, UnsafeHostError } from "./network-guard.js";

describe("isBlockedAddress", () => {
  it("blocks loopback IPv4", () => {
    expect(isBlockedAddress("127.0.0.1", 4)).toEqual({ blocked: true, label: "loopback" });
  });

  it("blocks the cloud metadata address", () => {
    expect(isBlockedAddress("169.254.169.254", 4)).toEqual({
      blocked: true,
      label: "link-local (incl. cloud metadata)",
    });
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isBlockedAddress("10.1.2.3", 4).blocked).toBe(true);
    expect(isBlockedAddress("172.16.5.5", 4).blocked).toBe(true);
    expect(isBlockedAddress("172.31.255.255", 4).blocked).toBe(true);
    expect(isBlockedAddress("192.168.1.1", 4).blocked).toBe(true);
  });

  it("does not block RFC1918 look-alikes just outside the range", () => {
    expect(isBlockedAddress("172.15.0.1", 4).blocked).toBe(false);
    expect(isBlockedAddress("172.32.0.1", 4).blocked).toBe(false);
  });

  it("allows an ordinary public IPv4 address", () => {
    expect(isBlockedAddress("93.184.216.34", 4)).toEqual({ blocked: false });
  });

  it("blocks IPv6 loopback and unique-local", () => {
    expect(isBlockedAddress("::1", 6).blocked).toBe(true);
    expect(isBlockedAddress("fd00::1", 6).blocked).toBe(true);
    expect(isBlockedAddress("fe80::1", 6).blocked).toBe(true);
  });

  it("unwraps an IPv4-mapped IPv6 loopback", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1", 6).blocked).toBe(true);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isBlockedAddress("2606:4700:4700::1111", 6)).toEqual({ blocked: false });
  });
});

describe("assertPubliclyRoutableHost", () => {
  it("rejects the literal hostname localhost without a DNS call", async () => {
    await expect(assertPubliclyRoutableHost("localhost")).rejects.toBeInstanceOf(UnsafeHostError);
  });

  it("rejects a .internal suffix without a DNS call", async () => {
    await expect(assertPubliclyRoutableHost("service.internal")).rejects.toBeInstanceOf(UnsafeHostError);
  });

  it("rejects an IP-literal hostname in a private range, without calling the injected resolver", async () => {
    let called = false;
    await expect(
      assertPubliclyRoutableHost("10.0.0.5", {
        dnsLookup: async () => {
          called = true;
          return [{ address: "10.0.0.5", family: 4 }];
        },
      }),
    ).rejects.toBeInstanceOf(UnsafeHostError);
    expect(called).toBe(false);
  });

  it("resolves a domain via the injected lookup and rejects when it points at a private address", async () => {
    await expect(
      assertPubliclyRoutableHost("attacker-controlled.example", {
        dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    ).rejects.toBeInstanceOf(UnsafeHostError);
  });

  it("accepts a domain that resolves only to public addresses", async () => {
    await expect(
      assertPubliclyRoutableHost("example.com", {
        dnsLookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ],
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects when ANY resolved address is private, even if others are public", async () => {
    await expect(
      assertPubliclyRoutableHost("mixed.example", {
        dnsLookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "169.254.169.254", family: 4 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsafeHostError);
  });

  it("wraps a DNS resolution failure as UnsafeHostError rather than an unhandled rejection", async () => {
    await expect(
      assertPubliclyRoutableHost("nonexistent.invalid", {
        dnsLookup: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).rejects.toBeInstanceOf(UnsafeHostError);
  });
});
