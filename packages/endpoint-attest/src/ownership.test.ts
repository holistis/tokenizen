import { describe, it, expect } from "vitest";
import {
  challengeToken,
  endpointHost,
  proofLocation,
  verifyOwnership,
  OwnershipError,
  DNS_LABEL,
  WELL_KNOWN_PATH,
} from "./ownership.js";

const SECRET = "s".repeat(48);
const OWNER = "0x00000000000000000000000000000000000000aa";
const OTHER_OWNER = "0x00000000000000000000000000000000000000bb";
const ENDPOINT = "https://mcp.example.com/sse";

describe("challengeToken", () => {
  it("is deterministic for the same endpoint, owner and secret", () => {
    expect(challengeToken(ENDPOINT, OWNER, SECRET)).toBe(challengeToken(ENDPOINT, OWNER, SECRET));
  });

  it("is case-insensitive on the owner address, so the same owner never gets two different tokens", () => {
    const upper = "0x" + OWNER.slice(2).toUpperCase();
    expect(challengeToken(ENDPOINT, upper, SECRET)).toBe(challengeToken(ENDPOINT, OWNER, SECRET));
  });

  it("differs per owner, so publishing one owner's token never proves another owner's control", () => {
    expect(challengeToken(ENDPOINT, OTHER_OWNER, SECRET)).not.toBe(challengeToken(ENDPOINT, OWNER, SECRET));
  });

  it("differs per host, so a token for one endpoint is useless on another", () => {
    expect(challengeToken("https://other.example.com/sse", OWNER, SECRET)).not.toBe(challengeToken(ENDPOINT, OWNER, SECRET));
  });

  it("ignores the path, because control is proven at host level, not per route", () => {
    expect(challengeToken("https://mcp.example.com/a", OWNER, SECRET)).toBe(challengeToken("https://mcp.example.com/b", OWNER, SECRET));
  });

  it("refuses a short secret instead of silently producing guessable tokens", () => {
    expect(() => challengeToken(ENDPOINT, OWNER, "tooshort")).toThrow(OwnershipError);
  });
});

describe("endpointHost: refuses anything that should never reach a DNS query or a fetch", () => {
  it("accepts plain http and https", () => {
    expect(endpointHost("https://mcp.example.com/sse")).toBe("mcp.example.com");
    expect(endpointHost("http://mcp.example.com")).toBe("mcp.example.com");
  });

  it("rejects a non-URL", () => {
    expect(() => endpointHost("not a url")).toThrow(/not a valid URL/);
  });

  it("rejects a non-http scheme, so file:// or data: can never be probed", () => {
    expect(() => endpointHost("file:///etc/passwd")).toThrow(/must be http or https/);
    expect(() => endpointHost("ftp://example.com")).toThrow(/must be http or https/);
  });

  it("rejects an endpoint carrying credentials", () => {
    expect(() => endpointHost("https://user:pass@mcp.example.com")).toThrow(/must not contain credentials/);
  });
});

describe("proofLocation", () => {
  it("puts the DNS proof under the standard prefixed label", () => {
    expect(proofLocation("dns-txt", ENDPOINT)).toBe(`${DNS_LABEL}.mcp.example.com`);
  });

  it("puts the file proof at the RFC 8615 well-known path, ignoring the endpoint's own path", () => {
    expect(proofLocation("well-known-file", ENDPOINT)).toBe(`https://mcp.example.com${WELL_KNOWN_PATH}`);
  });
});

describe("verifyOwnership, dns-txt", () => {
  const expected = challengeToken(ENDPOINT, OWNER, SECRET);

  it("passes when a TXT record matches exactly", async () => {
    const r = await verifyOwnership("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [["unrelated"], [expected]],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.location).toBe(`${DNS_LABEL}.mcp.example.com`);
      expect(Date.parse(r.verifiedAt)).not.toBeNaN();
    }
  });

  it("reassembles a TXT record that the resolver split into chunks", async () => {
    const mid = Math.floor(expected.length / 2);
    const r = await verifyOwnership("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [[expected.slice(0, mid), expected.slice(mid)]],
    });
    expect(r.ok).toBe(true);
  });

  it("fails when no record matches", async () => {
    const r = await verifyOwnership("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [["something-else"]],
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("no TXT record") });
  });

  it("fails cleanly when DNS lookup throws, instead of propagating", async () => {
    const r = await verifyOwnership("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("dns lookup failed") });
  });

  it("fails when the record holds ANOTHER owner's token", async () => {
    const othersToken = challengeToken(ENDPOINT, OTHER_OWNER, SECRET);
    const r = await verifyOwnership("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [[othersToken]],
    });
    expect(r.ok).toBe(false);
  });
});

describe("verifyOwnership, well-known-file", () => {
  const expected = challengeToken(ENDPOINT, OWNER, SECRET);

  it("passes on an exact match, trailing whitespace tolerated", async () => {
    const r = await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => new Response(expected + "\n", { status: 200 }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.location).toBe(`https://mcp.example.com${WELL_KNOWN_PATH}`);
  });

  it("fetches the well-known path, not the endpoint's own path", async () => {
    let seen = "";
    await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async (input) => {
        seen = String(input);
        return new Response(expected, { status: 200 });
      },
    });
    expect(seen).toBe(`https://mcp.example.com${WELL_KNOWN_PATH}`);
  });

  it("refuses a token merely BURIED in a larger page, because that does not show deliberate publication", async () => {
    const r = await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => new Response(`<html>junk ${expected} more junk</html>`, { status: 200 }),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("did not exactly match") });
  });

  it("fails on a non-2xx status", async () => {
    const r = await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => new Response("nope", { status: 404, statusText: "Not Found" }),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("404") });
  });

  it("refuses an oversized file before reading it all", async () => {
    const r = await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      maxFileBytes: 50,
      fetchImpl: async () => new Response("x".repeat(5000), { status: 200 }),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("exceeded 50 bytes") });
  });

  it("bounds a stalled body by its own timeout instead of hanging", async () => {
    const r = await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      timeoutMs: 30,
      fetchImpl: async (_input, init) => {
        const signal = (init as RequestInit).signal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener("abort", () => controller.error(signal.reason));
          },
        });
        return new Response(stream, { status: 200 });
      },
    });
    expect(r.ok).toBe(false);
  });

  it("fails cleanly on a network error", async () => {
    const r = await verifyOwnership("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      },
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("fetch failed") });
  });
});
