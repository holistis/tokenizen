import { describe, it, expect } from "vitest";
import { resolveTxtGuarded, assertPubliclyRoutableHost, UnsafeHostError } from "./index.js";

describe("resolveTxtGuarded", () => {
  it("returns records from the injected resolver", async () => {
    const records = await resolveTxtGuarded("_endpoint-attest.example.com", {
      resolveTxtImpl: async () => [["endpoint-attest-token-abc"]],
    });
    expect(records).toEqual([["endpoint-attest-token-abc"]]);
  });
  it("rejects an IP literal and an empty name", async () => {
    await expect(resolveTxtGuarded("1.2.3.4")).rejects.toBeInstanceOf(UnsafeHostError);
    await expect(resolveTxtGuarded("   ")).rejects.toBeInstanceOf(UnsafeHostError);
  });
});

describe("assertPubliclyRoutableHost (early edge check)", () => {
  it("throws when the host resolves to a blocked address", async () => {
    await expect(
      assertPubliclyRoutableHost("evil.example", { dnsLookupAll: async () => [{ address: "10.0.0.1", family: 4 }] }),
    ).rejects.toBeInstanceOf(UnsafeHostError);
  });
  it("passes a host that resolves public", async () => {
    await expect(
      assertPubliclyRoutableHost("ok.example", { dnsLookupAll: async () => [{ address: "8.8.8.8", family: 4 }] }),
    ).resolves.toBeUndefined();
  });
  it("throws on a blocked literal without resolving", async () => {
    let called = false;
    await expect(
      assertPubliclyRoutableHost("localhost", {
        dnsLookupAll: async () => {
          called = true;
          return [{ address: "8.8.8.8", family: 4 }];
        },
      }),
    ).rejects.toBeInstanceOf(UnsafeHostError);
    expect(called).toBe(false);
  });
});
