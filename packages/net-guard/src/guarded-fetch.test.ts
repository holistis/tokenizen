import { describe, it, expect } from "vitest";
import { createGuardedLookup, makeGuardedFetch } from "./guarded-fetch.js";
import { UnsafeHostError } from "./ip-rules.js";

function runLookup(
  lookup: ReturnType<typeof createGuardedLookup>,
  hostname: string,
): Promise<{ err: Error | null; addrs: Array<{ address: string; family: number }> }> {
  return new Promise((resolve) => {
    lookup(hostname, { all: true }, (err, addrs) => resolve({ err: err as Error | null, addrs: addrs as never }));
  });
}

describe("createGuardedLookup", () => {
  it("refuses when the resolved address is in a blocked range", async () => {
    const lookup = createGuardedLookup(async () => [{ address: "10.0.0.5", family: 4 }]);
    const { err } = await runLookup(lookup, "evil.example");
    expect(err).toBeInstanceOf(UnsafeHostError);
    expect(err!.message).toContain("10.0.0.5");
  });

  it("refuses when ANY of several resolved addresses is blocked (rebind spread)", async () => {
    const lookup = createGuardedLookup(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const { err } = await runLookup(lookup, "mixed.example");
    expect(err).toBeInstanceOf(UnsafeHostError);
  });

  it("passes the validated addresses through for a public host", async () => {
    const lookup = createGuardedLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    const { err, addrs } = await runLookup(lookup, "ok.example");
    expect(err).toBeNull();
    expect(addrs).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses a blocked literal host without ever calling the resolver", async () => {
    let called = false;
    const lookup = createGuardedLookup(async () => {
      called = true;
      return [{ address: "93.184.216.34", family: 4 }];
    });
    const { err } = await runLookup(lookup, "localhost");
    expect(err).toBeInstanceOf(UnsafeHostError);
    expect(called).toBe(false);
  });

  it("dials a routable IP literal directly without resolving", async () => {
    let called = false;
    const lookup = createGuardedLookup(async () => {
      called = true;
      return [];
    });
    const { err, addrs } = await runLookup(lookup, "8.8.8.8");
    expect(err).toBeNull();
    expect(addrs).toEqual([{ address: "8.8.8.8", family: 4 }]);
    expect(called).toBe(false);
  });

  it("refuses when the host does not resolve to anything", async () => {
    const lookup = createGuardedLookup(async () => []);
    const { err } = await runLookup(lookup, "nxdomain.example");
    expect(err).toBeInstanceOf(UnsafeHostError);
    expect(err!.message).toContain("did not resolve");
  });
});

describe("makeGuardedFetch url guard", () => {
  const gf = makeGuardedFetch();

  it("rejects a non-http(s) scheme", async () => {
    await expect(gf("ftp://example.com/x")).rejects.toBeInstanceOf(UnsafeHostError);
  });

  it("rejects a URL that carries embedded userinfo (user:pass@host)", async () => {
    await expect(gf("http://u:p@example.com/x")).rejects.toBeInstanceOf(UnsafeHostError);
  });

  it("refuses a loopback target at connect time (offline, real undici path)", async () => {
    let threw: unknown;
    try {
      await gf("http://127.0.0.1:48888/x", { signal: AbortSignal.timeout(3000) });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeDefined();
    const chain = [
      (threw as Error)?.message,
      ((threw as { cause?: Error })?.cause)?.message,
      ((threw as { cause?: { cause?: Error } })?.cause?.cause)?.message,
    ]
      .filter(Boolean)
      .join(" | ");
    expect(chain.toLowerCase()).toContain("loopback");
  });

  it("refuses an IPv4-mapped IPv6 literal in hex form (the audit's HIGH bypass)", async () => {
    let threw: unknown;
    try {
      await gf("http://[::ffff:7f00:1]/x", { signal: AbortSignal.timeout(3000) }); // 127.0.0.1
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeDefined();
    const chain = [
      (threw as Error)?.message,
      ((threw as { cause?: Error })?.cause)?.message,
      ((threw as { cause?: { cause?: Error } })?.cause?.cause)?.message,
    ]
      .filter(Boolean)
      .join(" | ");
    expect(chain.toLowerCase()).toContain("loopback");
  });
});

describe("makeGuardedFetch connector-stage (the real gate, defeats DNS rebinding)", () => {
  it("blocks a public-looking hostname that resolves to a private address, via the connector lookup", async () => {
    // The URL host is NOT a blocked literal, so this passes the early URL
    // check and only the connector/lookup can stop it — exactly the rebinding
    // case. The injected resolver returns loopback; the guard must refuse at
    // connect, with no real outbound socket.
    const gf = makeGuardedFetch({ dnsLookupAll: async () => [{ address: "127.0.0.1", family: 4 }] });
    let threw: unknown;
    try {
      await gf("http://public-looking-host.example/x", { signal: AbortSignal.timeout(3000) });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeDefined();
    const chain = [
      (threw as Error)?.message,
      ((threw as { cause?: Error })?.cause)?.message,
      ((threw as { cause?: { cause?: Error } })?.cause?.cause)?.message,
    ]
      .filter(Boolean)
      .join(" | ");
    expect(chain.toLowerCase()).toContain("loopback");
  });
});
