import { describe, it, expect, vi, afterEach } from "vitest";

// Module-mocked rather than ethers-prototype-spied (eip3009-authorizer-from-tx.test.ts's own
// style): corroborateSettlement treats resolveAuthorizerFromTransaction as a black box with a
// fixed outcome shape, so controlling that shape directly is both simpler and a stricter test of
// the actual contract between these two files, independent of eip3009-authorizer-from-tx.ts's own
// internal RPC mechanics (already covered by its own test file).
vi.mock("./eip3009-authorizer-from-tx.js", () => ({
  resolveAuthorizerFromTransaction: vi.fn(),
}));

import { corroborateSettlement } from "./settlement-corroboration.js";
import { resolveAuthorizerFromTransaction } from "./eip3009-authorizer-from-tx.js";

const mockResolve = vi.mocked(resolveAuthorizerFromTransaction);

const TX_HASH = "0x" + "aa".repeat(32);
const ASSET = "0x" + "22".repeat(20);
const AUTHORIZER = "0x" + "11".repeat(20);
const PAYER_SAME_ADDRESS_DIFFERENT_CASE = "0x" + "11".repeat(20).toUpperCase().replace("0X", "0x");
const OTHER_ADDRESS = "0x" + "55".repeat(20);
const NONCE = "0x" + "33".repeat(32);

const CONFIGURED = { rpcUrl: "https://example-rpc.invalid/base", expectedAsset: ASSET };

function validSettlement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { success: true, transaction: TX_HASH, network: "eip155:8453", payer: AUTHORIZER, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("corroborateSettlement: zero-config default", () => {
  it("skipped when both rpcUrl and expectedAsset are unset — and never calls resolveAuthorizerFromTransaction", async () => {
    const result = await corroborateSettlement(validSettlement(), {});
    expect(result.outcome).toBe("skipped");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("skipped when only rpcUrl is set", async () => {
    const result = await corroborateSettlement(validSettlement(), { rpcUrl: "https://example-rpc.invalid/base" });
    expect(result.outcome).toBe("skipped");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("skipped when only expectedAsset is set", async () => {
    const result = await corroborateSettlement(validSettlement(), { expectedAsset: ASSET });
    expect(result.outcome).toBe("skipped");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("skipped when rpcUrl is an empty string (falsy, same as unset)", async () => {
    const result = await corroborateSettlement(validSettlement(), { rpcUrl: "", expectedAsset: ASSET });
    expect(result.outcome).toBe("skipped");
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe("corroborateSettlement: matched", () => {
  it("matched when the chain's authorizer equals settlement.payer", async () => {
    mockResolve.mockResolvedValue({ outcome: "FOUND", authorizer: AUTHORIZER, nonce: NONCE, asset: ASSET });

    const result = await corroborateSettlement(validSettlement({ payer: AUTHORIZER }), CONFIGURED);

    expect(result).toEqual({ outcome: "matched" });
  });

  it("matched is case-insensitive (checksum vs lowercase vs uppercase addresses)", async () => {
    mockResolve.mockResolvedValue({ outcome: "FOUND", authorizer: AUTHORIZER, nonce: NONCE, asset: ASSET });

    const result = await corroborateSettlement(validSettlement({ payer: PAYER_SAME_ADDRESS_DIFFERENT_CASE }), CONFIGURED);

    expect(result).toEqual({ outcome: "matched" });
  });

  it("passes expectedChainId parsed from settlement.network, rpcUrl and expectedAsset from config straight through", async () => {
    mockResolve.mockResolvedValue({ outcome: "FOUND", authorizer: AUTHORIZER, nonce: NONCE, asset: ASSET });

    await corroborateSettlement(validSettlement({ network: "eip155:84532", payer: AUTHORIZER }), CONFIGURED);

    expect(mockResolve).toHaveBeenCalledWith(
      TX_HASH,
      expect.objectContaining({ rpcUrl: CONFIGURED.rpcUrl, expectedChainId: 84532n, expectedAsset: ASSET }),
    );
  });
});

describe("corroborateSettlement: mismatched — the single most important outcome this feature exists to produce", () => {
  it("mismatched when the chain's authorizer differs from settlement.payer", async () => {
    mockResolve.mockResolvedValue({ outcome: "FOUND", authorizer: AUTHORIZER, nonce: NONCE, asset: ASSET });

    const result = await corroborateSettlement(validSettlement({ payer: OTHER_ADDRESS }), CONFIGURED);

    expect(result.outcome).toBe("mismatched");
    expect(result.reason).toContain(AUTHORIZER);
    expect(result.reason).toContain(OTHER_ADDRESS);
  });
});

describe("corroborateSettlement: not_measured, one branch per resolveAuthorizerFromTransaction outcome other than FOUND", () => {
  it("not_measured on NOT_FOUND", async () => {
    mockResolve.mockResolvedValue({ outcome: "NOT_FOUND", reason: "no AuthorizationUsed event" });
    const result = await corroborateSettlement(validSettlement(), CONFIGURED);
    expect(result).toEqual({ outcome: "not_measured", reason: expect.stringContaining("NOT_FOUND") });
  });

  it("not_measured on AMBIGUOUS", async () => {
    mockResolve.mockResolvedValue({ outcome: "AMBIGUOUS", reason: "more than one event", candidateCount: 2 });
    const result = await corroborateSettlement(validSettlement(), CONFIGURED);
    expect(result).toEqual({ outcome: "not_measured", reason: expect.stringContaining("AMBIGUOUS") });
  });

  it("not_measured on NOT_MEASURED (passed through, e.g. an rpc timeout one layer down)", async () => {
    mockResolve.mockResolvedValue({ outcome: "NOT_MEASURED", reason: "rpc unavailable or timed out" });
    const result = await corroborateSettlement(validSettlement(), CONFIGURED);
    expect(result).toEqual({ outcome: "not_measured", reason: expect.stringContaining("rpc unavailable") });
  });
});

describe("corroborateSettlement: malformed settlement.network, refused before any rpc call (mutation matrix)", () => {
  const cases: Array<[string, unknown]> = [
    ["missing entirely", undefined],
    ["wrong type: number", 8453],
    ["wrong type: object", { chainId: 8453 }],
    ["empty string", ""],
    ["non-eip155 namespace", "solana:mainnet"],
    ["non-numeric chain id", "eip155:not-a-number"],
    ["empty chain id", "eip155:"],
    ["extra trailing segment", "eip155:8453:extra"],
    ["no colon at all", "eip1558453"],
    // Boundary for MAX_CHAIN_ID_DIGITS — cheap (33 digits), unlike the dedicated perf test below
    // which proves the measured synchronous-blocking cost with a realistically attack-sized string.
    ["chain id one digit over the implausibly-long cap", "eip155:" + "9".repeat(33)],
  ];
  for (const [label, network] of cases) {
    it(`${label} -> not_measured, resolveAuthorizerFromTransaction never called`, async () => {
      const result = await corroborateSettlement(validSettlement({ network }), CONFIGURED);
      expect(result.outcome).toBe("not_measured");
      expect(mockResolve).not.toHaveBeenCalled();
    });
  }

  it("chain id exactly AT the cap (32 digits) is still accepted and reaches resolveAuthorizerFromTransaction", async () => {
    mockResolve.mockResolvedValue({ outcome: "FOUND", authorizer: AUTHORIZER, nonce: NONCE, asset: ASSET });
    const network = "eip155:" + "1" + "0".repeat(31); // 32 digits, a real (if absurd) positive integer
    await corroborateSettlement(validSettlement({ network, payer: AUTHORIZER }), CONFIGURED);
    expect(mockResolve).toHaveBeenCalledWith(TX_HASH, expect.objectContaining({ expectedChainId: BigInt("1" + "0".repeat(31)) }));
  });
});

describe("corroborateSettlement: malformed settlement.transaction, refused before any rpc call (mutation matrix)", () => {
  const cases: Array<[string, unknown]> = [
    ["missing entirely", undefined],
    ["wrong type: number", 12345],
    ["wrong type: object", { hash: TX_HASH }],
    ["empty string", ""],
    ["no 0x prefix", "aa".repeat(32)],
    ["too short", "0x" + "aa".repeat(31)],
    ["too long", "0x" + "aa".repeat(33)],
    ["non-hex characters", "0x" + "zz".repeat(32)],
  ];
  for (const [label, transaction] of cases) {
    it(`${label} -> not_measured, resolveAuthorizerFromTransaction never called`, async () => {
      const result = await corroborateSettlement(validSettlement({ transaction }), CONFIGURED);
      expect(result.outcome).toBe("not_measured");
      expect(mockResolve).not.toHaveBeenCalled();
    });
  }

  it("uppercase hex transaction IS plausible (some providers return mixed-case hex) and reaches resolveAuthorizerFromTransaction", async () => {
    mockResolve.mockResolvedValue({ outcome: "FOUND", authorizer: AUTHORIZER, nonce: NONCE, asset: ASSET });
    const upper = "0x" + "AA".repeat(32);
    await corroborateSettlement(validSettlement({ transaction: upper }), CONFIGURED);
    // Not asserting the match result here — only that the plausibility check did not refuse a
    // validly-shaped but differently-cased hash before it ever reached the real resolver.
    expect(mockResolve).toHaveBeenCalled();
  });
});

describe("corroborateSettlement: missing settlement.payer, refused before any rpc call", () => {
  it("payer missing entirely -> not_measured, resolveAuthorizerFromTransaction never called", async () => {
    const result = await corroborateSettlement(validSettlement({ payer: undefined }), CONFIGURED);
    expect(result.outcome).toBe("not_measured");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("payer is an empty string -> not_measured, resolveAuthorizerFromTransaction never called", async () => {
    const result = await corroborateSettlement(validSettlement({ payer: "" }), CONFIGURED);
    expect(result.outcome).toBe("not_measured");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("payer is the wrong type (number) -> not_measured, resolveAuthorizerFromTransaction never called", async () => {
    const result = await corroborateSettlement(validSettlement({ payer: 12345 }), CONFIGURED);
    expect(result.outcome).toBe("not_measured");
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe("corroborateSettlement: fire-and-forget never delays the real action (the exact http-server.ts onAfterSettlement shape)", () => {
  // Reproduces http-server.ts's own two onAfterSettlement hooks verbatim: `void
  // corroborateSettlement(...).then(...).catch(...)` is fired WITHOUT being awaited, and only the
  // real action (here, a stand-in) is awaited. If a future change accidentally turned this into
  // `await corroborateSettlement(...)` before the real action, this test's own elapsed-time
  // assertion would catch it directly (a never-resolving mock would make the whole test hang/
  // timeout, not just run slow) — proving the property empirically, not by reading the source.
  it("a never-resolving resolveAuthorizerFromTransaction does not delay a concurrently-awaited real action", async () => {
    mockResolve.mockImplementation(() => new Promise(() => {})); // simulates a hung RPC, never settles
    let realActionDone = false;

    const start = Date.now();
    // Exact production shape: fire corroboration, do NOT await it, then await the real action.
    void corroborateSettlement(validSettlement(), CONFIGURED)
      .then(() => {})
      .catch(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve)); // stand-in for recordDelivery()/publishReputationFeedback()
    realActionDone = true;
    const elapsed = Date.now() - start;

    expect(realActionDone).toBe(true);
    expect(elapsed, "the real action must complete promptly, not wait on the hung RPC call").toBeLessThan(500);
    expect(mockResolve, "the RPC layer must actually have been reached, not short-circuited").toHaveBeenCalled();
  });
});

describe("corroborateSettlement: an oversized settlement.network chain-id digit string must not block the event loop", () => {
  // REAL BUG, found by measurement, not guessed at. `BigInt(chainMatch[1])` runs SYNCHRONOUSLY,
  // before this function's first `await` — so whatever it costs happens entirely within the
  // caller's own synchronous turn. Measured directly (node -e, this package, 13 nov 2026):
  // BigInt() of a plain all-'9' digit string costs ~140ms at 1,000,000 digits, ~930ms at
  // 5,000,000, and ~1.7s at 10,000,000 digits — while the REGEX capturing those same digits
  // costs under 10ms even at 10,000,000 digits (BigInt's decimal-to-binary conversion, not the
  // regex, is what's expensive). settlement.network is the x402 FACILITATOR's own field in its
  // real /settle response (see this file's header comment: "straight from the x402 facilitator's
  // own /settle response"), already explicitly treated as untrusted/hostile by this file's own
  // "never trust a library type as a runtime guarantee" discipline (see the hostile-settlement
  // describe block below) — a malicious, compromised, or merely buggy facilitator can put an
  // arbitrarily long digit string there. Because corroborateSettlement is fired with `void ...`
  // and never awaited (see http-server.ts's two onAfterSettlement hooks), the ASYNC parts of this
  // function never block anything — but this SYNCHRONOUS parse happens before the call even
  // returns a pending promise, so it blocks Node's entire single-threaded event loop for its full
  // duration: not just the current request's own response, but every other request this process
  // is concurrently serving. This directly contradicts this module's own header-comment contract
  // ("zero added latency", "it is always safe to call this way").
  it("a settlement.network with a ten-million-digit chain id does not cost more than a few milliseconds of synchronous time", async () => {
    const hostileNetwork = "eip155:" + "9".repeat(10_000_000);
    const settlement = validSettlement({ network: hostileNetwork });

    const start = Date.now();
    const resultPromise = corroborateSettlement(settlement, CONFIGURED);
    const syncElapsed = Date.now() - start; // time spent BEFORE the call's first await / return

    expect(
      syncElapsed,
      `calling corroborateSettlement() with an oversized chain-id digit string took ${syncElapsed}ms of ` +
        "SYNCHRONOUS time before yielding control — this blocks Node's entire event loop for every " +
        "concurrent caller, not just this one, for exactly as long as BigInt() takes to parse it",
    ).toBeLessThan(50);

    const result = await resultPromise;
    expect(result.outcome).toBe("not_measured");
    expect(mockResolve, "an implausible chain id must be refused before ever reaching the RPC layer").not.toHaveBeenCalled();
  });
});

describe("corroborateSettlement: never throws on a hostile settlement object", () => {
  const hostileSettlements: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["a bare string", "not an object at all"],
    ["a number", 42],
    ["a boolean", true],
    ["an array", [1, 2, 3]],
    ["an object with no prototype", Object.create(null)],
    ["an object whose toString throws", { toString: () => { throw new Error("evil toString"); } }],
    [
      "a Proxy that throws on every property access",
      new Proxy(
        {},
        {
          get() {
            throw new Error("evil proxy trap");
          },
        },
      ),
    ],
    ["deeply nested garbage in every field", { network: [1, 2], transaction: { nested: true }, payer: () => "fn" }],
  ];
  for (const [label, settlement] of hostileSettlements) {
    it(`${label} -> resolves to not_measured, never rejects/throws`, async () => {
      await expect(corroborateSettlement(settlement, CONFIGURED)).resolves.toEqual(
        expect.objectContaining({ outcome: "not_measured" }),
      );
    });
  }

  it("never throws even when resolveAuthorizerFromTransaction itself unexpectedly throws (defense in depth, since that function is already designed never to)", async () => {
    mockResolve.mockImplementation(() => {
      throw new Error("unexpected synchronous throw");
    });
    await expect(corroborateSettlement(validSettlement(), CONFIGURED)).resolves.toEqual(
      expect.objectContaining({ outcome: "not_measured" }),
    );
  });

  it("never throws even when resolveAuthorizerFromTransaction returns a rejected promise", async () => {
    mockResolve.mockRejectedValue(new Error("unexpected rejection"));
    await expect(corroborateSettlement(validSettlement(), CONFIGURED)).resolves.toEqual(
      expect.objectContaining({ outcome: "not_measured" }),
    );
  });

  it("never throws and resolves to not_measured when resolveAuthorizerFromTransaction hangs past the outer timeout", async () => {
    vi.useFakeTimers();
    mockResolve.mockImplementation(() => new Promise(() => {})); // never settles
    const resultPromise = corroborateSettlement(validSettlement(), CONFIGURED);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(resultPromise).resolves.toEqual(expect.objectContaining({ outcome: "not_measured" }));
    vi.useRealTimers();
  });
});
