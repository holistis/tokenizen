import { describe, expect, it, vi } from "vitest";

import {
  buildPrecheckUrl,
  formatCount,
  formatKb,
  formatUsd,
  interpretPrecheck,
  parseRepoInput,
  runRepoCheck,
  usdToCents,
} from "@/lib/repo-price-check";

// The live answer for holistis/tokenizen, measured once on 31 October 2026: no Solidity, so no quote whatever the price switch says.
const LIVE_NO_SOLIDITY = {
  ok: false,
  repo: "holistis/tokenizen",
  reason: "no_in_scope_solidity",
  message: "No Solidity files that count as the project's own logic were found.",
  solidityFiles: 0,
  inScopeFiles: 0,
  inScopeKb: 0,
  skipped: {},
  submodules: { declared: 0, fetchable: 0, gitmodulesBlob: false },
  estimate: null,
};

const OK_NO_QUOTE = { ok: true, repo: "owner/name", solidityFiles: 4, inScopeFiles: 3, inScopeKb: 42, estimate: { readKb: 42, coveragePct: 100 } };

const OK_WITH_QUOTE = {
  ...OK_NO_QUOTE,
  estimatedLines: 1176,
  quote: {
    usd: "5.00",
    amountUnits: "5000000",
    tier: "full",
    validForSeconds: 900,
    basis: { inScopeKb: 42, perMbUsd: "20.00", minimumUsd: "5.00", minimumApplied: true },
  },
};

const json = (v: unknown) => JSON.stringify(v);

describe("parseRepoInput", () => {
  it.each([
    ["owner/name", "owner/name"],
    ["  holistis/tokenizen  ", "holistis/tokenizen"],
    ["a-b/c_d.e-f", "a-b/c_d.e-f"],
    ["https://github.com/OpenZeppelin/openzeppelin-contracts", "OpenZeppelin/openzeppelin-contracts"],
    ["https://github.com/owner/name/", "owner/name"],
    ["https://github.com/owner/name.git", "owner/name"],
    ["http://www.github.com/owner/name", "owner/name"],
    [`${"a".repeat(39)}/${"b".repeat(100)}`, `${"a".repeat(39)}/${"b".repeat(100)}`],
    ["owner/...", "owner/..."],
  ])("accepts %j", (input, expected) => {
    expect(parseRepoInput(input)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    ["owner"],
    ["owner/name/extra"],
    ["/name"],
    ["owner/"],
    ["owner/."],
    ["owner/.."],
    [".."],
    ["../.."],
    ["own er/name"],
    ["owner/na me"],
    ["owner/na\nme"],
    ["owner/name x"],
    ["owner\t/name"],
    ["own_er/name"],
    ["own.er/name"],
    [`${"a".repeat(40)}/name`],
    [`owner/${"b".repeat(101)}`],
    ["owner/name?x=1"],
    ["owner/name#frag"],
    ["owner/<script>"],
    ["<script>alert(1)</script>/x"],
    ["https://gitlab.com/owner/name"],
    ["https://github.com.evil.example/owner/name"],
    ["https://github.com/owner/name/tree/main"],
    ["https://github.com/owner/name?tab=readme"],
    ["javascript:alert(1)"],
    ["ftp://github.com/owner/name"],
    ["github.com/owner/name"],
    ["owner%2Fname"],
    ["éowner/name"],
  ])("rejects %j", (input) => {
    expect(parseRepoInput(input)).toBeNull();
  });

  it("rejects what is not a string", () => {
    expect(parseRepoInput(undefined)).toBeNull();
    expect(parseRepoInput(null)).toBeNull();
    expect(parseRepoInput(42)).toBeNull();
    expect(parseRepoInput({ toString: () => "owner/name" })).toBeNull();
  });
});

describe("buildPrecheckUrl", () => {
  it("builds the free precheck address on the scan server", () => {
    expect(buildPrecheckUrl("owner/name")).toBe("https://x402.tokenizen.nl/api/bug-intel/precheck?repo=owner%2Fname");
    expect(buildPrecheckUrl("a/b", "https://example.test/")).toBe("https://example.test/api/bug-intel/precheck?repo=a%2Fb");
  });
});

describe("interpretPrecheck", () => {
  it("reads the live answer with no Solidity as a measurement of 0 KB, with no lines and no price", () => {
    expect(interpretPrecheck(200, json(LIVE_NO_SOLIDITY), "holistis/tokenizen")).toEqual({
      kind: "measured",
      repo: "holistis/tokenizen",
      sizeKb: 0,
      estimatedLines: null,
      noSolidity: true,
      quote: null,
    });
  });

  it("reads an answer without a quote (switch off) and makes up no price and no lines", () => {
    const o = interpretPrecheck(200, json(OK_NO_QUOTE), "owner/name");
    expect(o).toEqual({ kind: "measured", repo: "owner/name", sizeKb: 42, estimatedLines: null, noSolidity: false, quote: null });
  });

  it("reads a quote with its basis", () => {
    const o = interpretPrecheck(200, json(OK_WITH_QUOTE), "owner/name");
    expect(o).toEqual({
      kind: "measured",
      repo: "owner/name",
      sizeKb: 42,
      estimatedLines: 1176,
      noSolidity: false,
      quote: { cents: 500, basisKb: 42, perMbCents: 2000, minimumCents: 500, minimumApplied: true, validForSeconds: 900 },
    });
  });

  it("shows no price when the quote says it is not available, or is malformed", () => {
    const variants: unknown[] = [
      { available: false, reason: "config_invalid", message: "x" },
      { usd: 5, basis: {} },
      { usd: "5.00" },
      { usd: "5.00", basis: "x" },
      { usd: "-5.00", basis: {} },
      { usd: "5.000", basis: {} },
      { usd: "0.00", basis: {} },
      { usd: "<script>alert(1)</script>", basis: {} },
      { usd: "99999999.00", basis: {} },
      [],
      "5.00",
      null,
    ];
    for (const quote of variants) {
      const o = interpretPrecheck(200, json({ ...OK_NO_QUOTE, quote }), "owner/name");
      expect(o.kind === "measured" && o.quote, json(quote)).toBeNull();
    }
  });

  it("does not take a price from an answer that found no Solidity", () => {
    const o = interpretPrecheck(200, json({ ...LIVE_NO_SOLIDITY, quote: OK_WITH_QUOTE.quote }), "holistis/tokenizen");
    expect(o.kind === "measured" && o.quote).toBeNull();
  });

  it("keeps the name the visitor asked for, not what the server echoes", () => {
    const o = interpretPrecheck(200, json({ ...OK_NO_QUOTE, repo: "<script>alert(1)</script>" }), "owner/name");
    expect(o.kind === "measured" && o.repo).toBe("owner/name");
  });

  it("treats huge, negative, fractional or non-number sizes as unreadable", () => {
    for (const inScopeKb of [1e300, -1, 1.5, "42", null, Number.MAX_SAFE_INTEGER + 2]) {
      expect(interpretPrecheck(200, json({ ...OK_NO_QUOTE, inScopeKb }), "owner/name"), String(inScopeKb)).toEqual({ kind: "error", code: "bad_response" });
    }
    expect(interpretPrecheck(200, json({ ok: true }), "owner/name")).toEqual({ kind: "error", code: "bad_response" });
  });

  it("drops a huge or odd line count instead of showing it", () => {
    for (const estimatedLines of [1e300, -3, 2.5, "1176", "<script>"]) {
      const o = interpretPrecheck(200, json({ ...OK_NO_QUOTE, estimatedLines }), "owner/name");
      expect(o.kind === "measured" && o.estimatedLines).toBeNull();
    }
    const big = interpretPrecheck(200, json({ ...OK_NO_QUOTE, inScopeKb: 9_007_199_254_740_991 }), "owner/name");
    expect(big.kind === "measured" && big.sizeKb).toBe(9_007_199_254_740_991);
  });

  it("maps every known error shape to its own code", () => {
    expect(interpretPrecheck(429, json({ error: "Too many prechecks from this address. Try again in a minute." }), "a/b")).toEqual({ kind: "error", code: "rate_limited" });
    expect(interpretPrecheck(429, "<html>nginx</html>", "a/b")).toEqual({ kind: "error", code: "rate_limited" });
    expect(interpretPrecheck(400, json({ ok: false, reason: "invalid_repo", message: "Use owner/repo." }), "a/b")).toEqual({ kind: "error", code: "invalid" });
    expect(interpretPrecheck(200, json({ ok: false, repo: "a/b", reason: "not_found_or_private", message: "x" }), "a/b")).toEqual({ kind: "error", code: "not_found" });
    expect(interpretPrecheck(200, json({ ok: null, repo: "a/b", reason: "busy", message: "x" }), "a/b")).toEqual({ kind: "error", code: "busy" });
    expect(interpretPrecheck(200, json({ ok: null, repo: "a/b", reason: "unavailable", message: "x" }), "a/b")).toEqual({ kind: "error", code: "unavailable" });
    expect(interpretPrecheck(502, json({ error: "Bad gateway" }), "a/b")).toEqual({ kind: "error", code: "unavailable" });
    expect(interpretPrecheck(200, json({ ok: "yes" }), "a/b")).toEqual({ kind: "error", code: "bad_response" });
  });

  it("treats malformed JSON and non-object JSON as unreadable", () => {
    for (const body of ["", "{", "not json", "<script>alert(1)</script>", "null", "[]", "42", '"text"']) {
      expect(interpretPrecheck(200, body, "a/b"), body).toEqual({ kind: "error", code: "bad_response" });
    }
  });
});

describe("runRepoCheck", () => {
  const reply = (status: number, body: string) => vi.fn(async () => ({ status, text: async () => body }));

  it("sends only the repository name, with no credentials, no referrer and no headers", async () => {
    const fetchImpl = reply(200, json(OK_NO_QUOTE));
    const o = await runRepoCheck("https://github.com/owner/name", fetchImpl, "https://example.test");
    expect(o.kind).toBe("measured");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/api/bug-intel/precheck?repo=owner%2Fname");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("does not call the server for input that fails the rule", async () => {
    const fetchImpl = reply(200, json(OK_NO_QUOTE));
    for (const input of ["", "owner/..", "https://evil.example/owner/name", "a b/c", "owner/<script>"]) {
      expect(await runRepoCheck(input, fetchImpl)).toEqual({ kind: "error", code: "invalid" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("turns a network failure into a network error, without throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await runRepoCheck("owner/name", fetchImpl)).toEqual({ kind: "error", code: "network" });
  });

  it("turns a body that cannot be read into an unreadable answer", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      text: async () => {
        throw new Error("stream broke");
      },
    }));
    expect(await runRepoCheck("owner/name", fetchImpl)).toEqual({ kind: "error", code: "bad_response" });
  });

  it("passes 429 and malformed JSON through as their own outcomes", async () => {
    expect(await runRepoCheck("owner/name", reply(429, json({ error: "Too many" })))).toEqual({ kind: "error", code: "rate_limited" });
    expect(await runRepoCheck("owner/name", reply(200, "{oops"))).toEqual({ kind: "error", code: "bad_response" });
  });

  it("reads a quote end to end", async () => {
    const o = await runRepoCheck("owner/name", reply(200, json(OK_WITH_QUOTE)));
    expect(o.kind === "measured" && o.quote?.cents).toBe(500);
  });
});

describe("formatting", () => {
  it("formats whole numbers with its own separators", () => {
    expect(formatCount(0, "en")).toBe("0");
    expect(formatCount(999, "en")).toBe("999");
    expect(formatCount(1234567, "en")).toBe("1,234,567");
    expect(formatCount(1234567, "nl")).toBe("1.234.567");
    expect(formatCount(9_007_199_254_740_991, "en")).toBe("9,007,199,254,740,991");
  });

  it("formats sizes and dollars", () => {
    expect(formatKb(1024, "en")).toBe("1,024 KB");
    expect(formatKb(1024, "nl")).toBe("1.024 KB");
    expect(formatUsd(500, "en")).toBe("$5.00");
    expect(formatUsd(500, "nl")).toBe("$5,00");
    expect(formatUsd(7, "en")).toBe("$0.07");
    expect(formatUsd(123456789, "en")).toBe("$1,234,567.89");
    expect(formatUsd(123456789, "nl")).toBe("$1.234.567,89");
  });

  it("reads dollar strings to cents", () => {
    expect(usdToCents("5")).toBe(500);
    expect(usdToCents("5.5")).toBe(550);
    expect(usdToCents("5.05")).toBe(505);
    expect(usdToCents("9999999.99")).toBe(999999999);
    for (const bad of ["", "5.", ".5", "5.555", "1e3", "-1", " 5", "5 ", "10000000", 5, null]) expect(usdToCents(bad), String(bad)).toBeNull();
  });
});
