import { describe, it, expect } from "vitest";
import {
  challengeToken,
  activeTestConsentToken,
  endpointHost,
  normalizeEndpoint,
  proofLocation,
  consentProofLocation,
  verifyOwnership,
  verifyActiveTestConsent,
  OwnershipError,
  DNS_LABEL,
  WELL_KNOWN_PATH,
  ACTIVE_CONSENT_DNS_LABEL,
  ACTIVE_CONSENT_WELL_KNOWN_PATH,
} from "./ownership.js";

const SECRET = "s".repeat(48);
const OWNER = "0x00000000000000000000000000000000000000aa";
const OTHER_OWNER = "0x00000000000000000000000000000000000000bb";
const ENDPOINT = "https://mcp.example.com/sse";

// fetchImpl and resolveTxtRecords are now REQUIRED (the caller owns all egress,
// see OwnershipCheckDeps). These stubs stand in for the one a test does not
// exercise, so each test only has to supply the single seam it cares about.
const STUB_FETCH = (async () => new Response("", { status: 404 })) as typeof fetch;
const STUB_RESOLVE = async (): Promise<string[][]> => [];
function verify(
  method: Parameters<typeof verifyOwnership>[0],
  endpoint: string,
  owner: string,
  secret: string,
  partial: Partial<Parameters<typeof verifyOwnership>[4]> = {},
) {
  return verifyOwnership(method, endpoint, owner, secret, {
    fetchImpl: STUB_FETCH,
    resolveTxtRecords: STUB_RESOLVE,
    ...partial,
  });
}

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

  it("differs per path, so a proof for one endpoint cannot be replayed for another route/port on the same host", () => {
    expect(challengeToken("https://mcp.example.com/a", OWNER, SECRET)).not.toBe(challengeToken("https://mcp.example.com/b", OWNER, SECRET));
    // ...and per port, which is the core of the confused-deputy probe fix.
    expect(challengeToken("https://mcp.example.com/a", OWNER, SECRET)).not.toBe(challengeToken("https://mcp.example.com:6379/a", OWNER, SECRET));
  });

  it("is stable across the spellings normalizeEndpoint folds together (trailing slash, query, fragment, credentials)", () => {
    const base = challengeToken("https://mcp.example.com/sse", OWNER, SECRET);
    expect(challengeToken("https://mcp.example.com/sse/", OWNER, SECRET)).toBe(base); // trailing slash stripped
    expect(challengeToken("https://mcp.example.com/sse?x=1", OWNER, SECRET)).toBe(base); // query ignored
    expect(challengeToken("https://mcp.example.com/sse#f", OWNER, SECRET)).toBe(base); // fragment ignored
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
    const r = await verify("dns-txt", ENDPOINT, OWNER, SECRET, {
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
    const r = await verify("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [[expected.slice(0, mid), expected.slice(mid)]],
    });
    expect(r.ok).toBe(true);
  });

  it("fails when no record matches", async () => {
    const r = await verify("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [["something-else"]],
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("no TXT record") });
  });

  it("fails cleanly when DNS lookup throws, instead of propagating", async () => {
    const r = await verify("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("dns lookup failed") });
  });

  it("fails when the record holds ANOTHER owner's token", async () => {
    const othersToken = challengeToken(ENDPOINT, OTHER_OWNER, SECRET);
    const r = await verify("dns-txt", ENDPOINT, OWNER, SECRET, {
      resolveTxtRecords: async () => [[othersToken]],
    });
    expect(r.ok).toBe(false);
  });
});

describe("verifyOwnership, well-known-file", () => {
  const expected = challengeToken(ENDPOINT, OWNER, SECRET);

  it("passes on an exact match, trailing whitespace tolerated", async () => {
    const r = await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => new Response(expected + "\n", { status: 200 }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.location).toBe(`https://mcp.example.com${WELL_KNOWN_PATH}`);
  });

  it("fetches the well-known path, not the endpoint's own path", async () => {
    let seen = "";
    await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async (input) => {
        seen = String(input);
        return new Response(expected, { status: 200 });
      },
    });
    expect(seen).toBe(`https://mcp.example.com${WELL_KNOWN_PATH}`);
  });

  it("refuses a token merely BURIED in a larger page, because that does not show deliberate publication", async () => {
    const r = await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => new Response(`<html>junk ${expected} more junk</html>`, { status: 200 }),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("did not exactly match") });
  });

  it("fails on a non-2xx status", async () => {
    const r = await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => new Response("nope", { status: 404, statusText: "Not Found" }),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("404") });
  });

  it("refuses an oversized file before reading it all", async () => {
    const r = await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      maxFileBytes: 50,
      fetchImpl: async () => new Response("x".repeat(5000), { status: 200 }),
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("exceeded 50 bytes") });
  });

  it("bounds a stalled body by its own timeout instead of hanging", async () => {
    const r = await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
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
    const r = await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      },
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("fetch failed") });
  });

  it("does not follow redirects on the proof fetch (passes redirect:error)", async () => {
    let seenInit: RequestInit | undefined;
    await verify("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: (async (_url: unknown, init: RequestInit) => {
        seenInit = init;
        return new Response("x", { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(seenInit?.redirect).toBe("error");
  });
});

describe("normalizeEndpoint", () => {
  it("keeps scheme, host, port and path", () => {
    expect(normalizeEndpoint("https://mcp.example.com:8443/sse")).toBe("https://mcp.example.com:8443/sse");
  });
  it("strips query and fragment", () => {
    expect(normalizeEndpoint("https://mcp.example.com/sse?x=1#frag")).toBe("https://mcp.example.com/sse");
  });
  it("rejects embedded credentials outright rather than silently stripping them", () => {
    expect(() => normalizeEndpoint("https://u:p@mcp.example.com/sse")).toThrow(OwnershipError);
  });
  it("strips a single trailing slash but keeps the root path", () => {
    expect(normalizeEndpoint("https://mcp.example.com/sse/")).toBe("https://mcp.example.com/sse");
    expect(normalizeEndpoint("https://mcp.example.com")).toBe("https://mcp.example.com/");
    expect(normalizeEndpoint("https://mcp.example.com/")).toBe("https://mcp.example.com/");
  });
  it("is case-sensitive on the path (paths are) but lower-cases the host (URLs do)", () => {
    expect(normalizeEndpoint("https://MCP.Example.COM/SSE")).toBe("https://mcp.example.com/SSE");
  });
  it("rejects non-http(s) and credential-only-host junk", () => {
    expect(() => normalizeEndpoint("ftp://mcp.example.com/x")).toThrow(OwnershipError);
    expect(() => normalizeEndpoint("not a url")).toThrow(OwnershipError);
  });
});

describe("activeTestConsentToken", () => {
  it("is deterministic and case-insensitive on the owner, like the ownership token", () => {
    expect(activeTestConsentToken(ENDPOINT, OWNER, SECRET)).toBe(activeTestConsentToken(ENDPOINT, OWNER, SECRET));
    const upper = "0x" + OWNER.slice(2).toUpperCase();
    expect(activeTestConsentToken(ENDPOINT, upper, SECRET)).toBe(activeTestConsentToken(ENDPOINT, OWNER, SECRET));
  });

  it("is DOMAIN-SEPARATED from the ownership token: the two never collide for the same pair", () => {
    expect(activeTestConsentToken(ENDPOINT, OWNER, SECRET)).not.toBe(challengeToken(ENDPOINT, OWNER, SECRET));
  });

  it("differs per owner and per host, so one owner's consent never authorizes another's endpoint", () => {
    expect(activeTestConsentToken(ENDPOINT, OTHER_OWNER, SECRET)).not.toBe(activeTestConsentToken(ENDPOINT, OWNER, SECRET));
    expect(activeTestConsentToken("https://other.example.com/sse", OWNER, SECRET)).not.toBe(
      activeTestConsentToken(ENDPOINT, OWNER, SECRET),
    );
  });

  it("refuses a short secret instead of silently producing guessable tokens", () => {
    expect(() => activeTestConsentToken(ENDPOINT, OWNER, "tooshort")).toThrow(OwnershipError);
  });
});

describe("consentProofLocation", () => {
  it("is published at a DISTINCT location from the ownership proof, per method", () => {
    expect(consentProofLocation("dns-txt", ENDPOINT)).toContain(ACTIVE_CONSENT_DNS_LABEL);
    expect(consentProofLocation("well-known-file", ENDPOINT)).toContain(ACTIVE_CONSENT_WELL_KNOWN_PATH);
    expect(consentProofLocation("dns-txt", ENDPOINT)).not.toBe(proofLocation("dns-txt", ENDPOINT));
    expect(consentProofLocation("well-known-file", ENDPOINT)).not.toBe(proofLocation("well-known-file", ENDPOINT));
  });
});

describe("verifyActiveTestConsent", () => {
  const consentTok = (endpoint: string, owner: string, secret: string) => activeTestConsentToken(endpoint, owner, secret);

  it("passes when the consent token is published at the consent well-known file", async () => {
    const r = await verifyActiveTestConsent("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: (async () => new Response(consentTok(ENDPOINT, OWNER, SECRET), { status: 200 })) as typeof fetch,
      resolveTxtRecords: STUB_RESOLVE,
    });
    expect(r).toMatchObject({ ok: true, method: "well-known-file" });
    if (r.ok) expect(r.location).toBe(consentProofLocation("well-known-file", ENDPOINT));
  });

  it("does NOT accept the ownership token in place of the consent token (the separation is real)", async () => {
    const r = await verifyActiveTestConsent("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: (async () => new Response(challengeToken(ENDPOINT, OWNER, SECRET), { status: 200 })) as typeof fetch,
      resolveTxtRecords: STUB_RESOLVE,
    });
    expect(r.ok).toBe(false);
  });

  it("passes via dns-txt when the consent TXT record matches", async () => {
    const r = await verifyActiveTestConsent("dns-txt", ENDPOINT, OWNER, SECRET, {
      fetchImpl: STUB_FETCH,
      resolveTxtRecords: async (name) => {
        expect(name).toBe(consentProofLocation("dns-txt", ENDPOINT));
        return [[consentTok(ENDPOINT, OWNER, SECRET)]];
      },
    });
    expect(r.ok).toBe(true);
  });

  it("fails when nothing is published at the consent location", async () => {
    const r = await verifyActiveTestConsent("well-known-file", ENDPOINT, OWNER, SECRET, {
      fetchImpl: (async () => new Response("", { status: 404, statusText: "Not Found" })) as typeof fetch,
      resolveTxtRecords: STUB_RESOLVE,
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("404") });
  });
});
