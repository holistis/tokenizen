import { describe, it, expect, vi, afterEach } from "vitest";
import { ethers } from "ethers";
import { resolveAuthorizerFromTransaction, AUTHORIZATION_USED_TOPIC0 } from "./eip3009-authorizer-from-tx.js";

const TX_HASH = "0x" + "aa".repeat(32);
const ASSET = "0x" + "22".repeat(20);
const OTHER_ASSET = "0x" + "44".repeat(20);
const AUTHORIZER = "0x" + "11".repeat(20);
const OTHER_AUTHORIZER = "0x" + "55".repeat(20);
const NONCE = "0x" + "33".repeat(32);
const CHAIN_ID = 8453n;

function topicFromAddress(address: string): string {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function authorizationUsedLog(overrides: Partial<{ address: string; authorizer: string; nonce: string }> = {}) {
  return {
    address: overrides.address ?? ASSET,
    topics: [AUTHORIZATION_USED_TOPIC0, topicFromAddress(overrides.authorizer ?? AUTHORIZER), overrides.nonce ?? NONCE],
    data: "0x",
  };
}

function mockNetworkAndReceipt(receipt: unknown, chainId: bigint = CHAIN_ID) {
  vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockResolvedValue({ chainId } as ethers.Network);
  vi.spyOn(ethers.JsonRpcProvider.prototype, "getTransactionReceipt").mockResolvedValue(receipt as ethers.TransactionReceipt);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveAuthorizerFromTransaction", () => {
  it("FOUND: resolves the real authorizer from a single AuthorizationUsed log, not from tx.from", async () => {
    mockNetworkAndReceipt({ status: 1, logs: [authorizationUsedLog()] });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result).toEqual({ outcome: "FOUND", authorizer: ethers.getAddress(AUTHORIZER), nonce: NONCE, asset: ASSET });
  });

  it("FOUND: expectedAsset picks the right log out of a batched transaction with several transfers", async () => {
    mockNetworkAndReceipt({
      status: 1,
      logs: [
        authorizationUsedLog({ address: OTHER_ASSET, authorizer: OTHER_AUTHORIZER }),
        authorizationUsedLog({ address: ASSET, authorizer: AUTHORIZER }),
      ],
    });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: "http://example.invalid",
      expectedChainId: CHAIN_ID,
      expectedAsset: ASSET,
    });

    expect(result).toEqual({ outcome: "FOUND", authorizer: ethers.getAddress(AUTHORIZER), nonce: NONCE, asset: ASSET });
  });

  it("AMBIGUOUS: two matching logs for the SAME expectedAsset in one transaction are refused, never guessed", async () => {
    mockNetworkAndReceipt({
      status: 1,
      logs: [authorizationUsedLog({ address: ASSET }), authorizationUsedLog({ address: ASSET, authorizer: OTHER_AUTHORIZER })],
    });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result).toEqual({
      outcome: "AMBIGUOUS",
      reason: expect.stringContaining("more than one"),
      candidateCount: 2,
    });
  });

  it("NOT_FOUND: zero AuthorizationUsed logs in the transaction", async () => {
    mockNetworkAndReceipt({ status: 1, logs: [] });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("NOT_FOUND");
  });

  it("NOT_FOUND: a log for a different topic0 (not AuthorizationUsed) does not count", async () => {
    mockNetworkAndReceipt({
      status: 1,
      logs: [{ address: ASSET, topics: ["0x" + "77".repeat(32), topicFromAddress(AUTHORIZER), NONCE], data: "0x" }],
    });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("NOT_FOUND");
  });

  it("NOT_FOUND: expectedAsset filters out a real AuthorizationUsed log on a different contract", async () => {
    mockNetworkAndReceipt({ status: 1, logs: [authorizationUsedLog({ address: OTHER_ASSET })] });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: "http://example.invalid",
      expectedChainId: CHAIN_ID,
      expectedAsset: ASSET,
    });

    expect(result.outcome).toBe("NOT_FOUND");
  });

  it("NOT_FOUND: reverted transaction, named reason rather than a bare zero-candidates result", async () => {
    mockNetworkAndReceipt({ status: 0, logs: [] });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result).toEqual({ outcome: "NOT_FOUND", reason: expect.stringContaining("reverted") });
  });

  it("NOT_FOUND: no transaction receipt at all (unmined, dropped, or wrong chain)", async () => {
    mockNetworkAndReceipt(null);

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("NOT_FOUND");
  });

  it("NOT_MEASURED: rpc is on a different chain than claimed, refuses rather than answering about the wrong chain", async () => {
    mockNetworkAndReceipt({ status: 1, logs: [authorizationUsedLog()] }, 1n);

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result).toEqual({ outcome: "NOT_MEASURED", reason: expect.stringContaining("chain 1") });
  });

  it("NOT_MEASURED: getNetwork rejects (rpc unavailable)", async () => {
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("NOT_MEASURED");
  });

  it("NOT_MEASURED: getTransactionReceipt hangs past the timeout", async () => {
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockResolvedValue({ chainId: CHAIN_ID } as ethers.Network);
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getTransactionReceipt").mockImplementation(() => new Promise(() => {}));

    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: "http://example.invalid",
      expectedChainId: CHAIN_ID,
      expectedAsset: ASSET,
      timeoutMs: 20,
    });

    expect(result).toEqual({ outcome: "NOT_MEASURED", reason: expect.stringContaining("timed out") });
  });

  it("NOT_MEASURED: malformed txHash is refused before any rpc call is made", async () => {
    const getNetworkSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork");

    const result = await resolveAuthorizerFromTransaction("not-a-hash", { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("NOT_MEASURED");
    expect(getNetworkSpy).not.toHaveBeenCalled();
  });

  it("NOT_MEASURED: malformed expectedAsset is refused before any rpc call is made", async () => {
    const getNetworkSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork");

    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: "http://example.invalid",
      expectedChainId: CHAIN_ID,
      expectedAsset: "not-an-address",
    });

    expect(result.outcome).toBe("NOT_MEASURED");
    expect(getNetworkSpy).not.toHaveBeenCalled();
  });

  it("NOT_MEASURED: expectedAsset omitted entirely (a JS caller ignoring the TS type) is refused, not treated as unset/optional", async () => {
    const getNetworkSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork");
    const opts = { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID } as Parameters<typeof resolveAuthorizerFromTransaction>[1];

    const result = await resolveAuthorizerFromTransaction(TX_HASH, opts);

    expect(result.outcome).toBe("NOT_MEASURED");
    expect(getNetworkSpy).not.toHaveBeenCalled();
  });

  it("NOT_MEASURED: expectedChainId is not a valid integer (e.g. a non-numeric string from unvalidated config)", async () => {
    const getNetworkSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork");

    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: "http://example.invalid",
      expectedChainId: "not-a-number" as unknown as number,
      expectedAsset: ASSET,
    });

    expect(result.outcome).toBe("NOT_MEASURED");
    expect(getNetworkSpy).not.toHaveBeenCalled();
  });

  it("NOT_MEASURED: expectedChainId is a non-positive integer (e.g. an unparsed empty-string config value coerced to 0)", async () => {
    const getNetworkSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork");

    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: "http://example.invalid",
      expectedChainId: 0,
      expectedAsset: ASSET,
    });

    expect(result.outcome).toBe("NOT_MEASURED");
    expect(getNetworkSpy).not.toHaveBeenCalled();
  });

  it("NOT_MEASURED: rpcUrl of the wrong type throws synchronously inside the provider constructor, caught rather than crashing the caller", async () => {
    const result = await resolveAuthorizerFromTransaction(TX_HASH, {
      rpcUrl: {} as unknown as string,
      expectedChainId: CHAIN_ID,
      expectedAsset: ASSET,
    });

    expect(result.outcome).toBe("NOT_MEASURED");
  });

  it("NOT_MEASURED: a log with the right topic0 but a missing indexed topic is rejected rather than crashing", async () => {
    mockNetworkAndReceipt({ status: 1, logs: [{ address: ASSET, topics: [AUTHORIZATION_USED_TOPIC0], data: "0x" }] });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("NOT_MEASURED");
  });

  it("topic0 matching is case-insensitive (some providers return mixed-case hex)", async () => {
    mockNetworkAndReceipt({
      status: 1,
      logs: [{ ...authorizationUsedLog(), topics: [AUTHORIZATION_USED_TOPIC0.toUpperCase().replace("0X", "0x"), topicFromAddress(AUTHORIZER), NONCE] }],
    });

    const result = await resolveAuthorizerFromTransaction(TX_HASH, { rpcUrl: "http://example.invalid", expectedChainId: CHAIN_ID, expectedAsset: ASSET });

    expect(result.outcome).toBe("FOUND");
  });
});
