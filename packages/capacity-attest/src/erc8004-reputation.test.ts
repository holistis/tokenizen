// erc8004-reputation.test.ts — tests for publishReputationFeedback(). All
// tests inject a fake ReputationContractFactory (see erc8004-reputation.ts),
// so none of them make a real network call or depend on any live chain
// being reachable in CI. Real, live verification against Base mainnet is a
// separate step (examples/verify-erc8004-reputation-live.mjs), same split
// as erc8004.ts/erc8004.test.ts.

import { describe, it, expect, vi } from "vitest";
import { publishReputationFeedback, type ReputationWriteContract, type ReputationContractFactory } from "./erc8004-reputation.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

const VALID_REF = "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
const TX_HASH = "0x" + "aa".repeat(32);

function fakeTx(overrides: Partial<{ hash: string; wait: () => Promise<unknown> }> = {}) {
  return {
    hash: overrides.hash ?? TX_HASH,
    wait: overrides.wait ?? (async () => ({ status: 1 })),
  };
}

function fakeFactory(overrides: Partial<ReputationWriteContract> = {}): ReputationContractFactory {
  const contract: ReputationWriteContract = {
    giveFeedback: vi.fn(async () => fakeTx() as never),
    ...overrides,
  };
  return () => contract;
}

describe("publishReputationFeedback", () => {
  it("publiceert delivered:yes als value 10 met 1 decimaal (dus 1.0)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "yes", assetType: "gpu-hours" });
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentId: "42", rpcUrl: "https://rpc.example/base", claim },
      fakeFactory(),
    );
    expect(result).toEqual({
      ok: true,
      chainId: "8453",
      registryAddress: "0x8004baa17c55a88189ae136b182e5fda19de9b63",
      agentId: "42",
      txHash: TX_HASH,
      value: 10,
      valueDecimals: 1,
    });
  });

  it("publiceert delivered:no als value 0", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "no" });
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim }, fakeFactory());
    expect(result.ok).toBe(true);
    expect((result as { value: number }).value).toBe(0);
  });

  it("publiceert delivered:partial als value 5 (dus 0.5)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "partial" });
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim }, fakeFactory());
    expect(result.ok).toBe(true);
    expect((result as { value: number }).value).toBe(5);
  });

  it("verzint nooit een eigen waarde: value hangt uitsluitend af van claim.delivered, nooit van assetType/promisedSpec/evidenceHash", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "yes", assetType: "bandwidth", promisedSpec: "iets heel anders" });
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "7", rpcUrl: "https://rpc.example", claim }, fakeFactory({ giveFeedback }));
    expect(giveFeedback).toHaveBeenCalledWith(7n, 10n, 1, "capacity-attest:delivered", "bandwidth", "", "", expect.stringMatching(/^0x0+$/));
  });

  it("geeft agentId als bigint mee, niet als string", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "9999", rpcUrl: "https://rpc.example", claim }, fakeFactory({ giveFeedback }));
    expect(giveFeedback.mock.calls[0]![0]).toBe(9999n);
  });

  it("geeft caller-supplied feedbackURI en feedbackHash door", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    const hash = "0x" + "bb".repeat(32);
    await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim, feedbackURI: "https://base.easscan.org/attestation/view/0x1", feedbackHash: hash },
      fakeFactory({ giveFeedback }),
    );
    expect(giveFeedback).toHaveBeenCalledWith(1n, 10n, 1, "capacity-attest:delivered", claim.assetType, "", "https://base.easscan.org/attestation/view/0x1", hash);
  });

  it("weigert een reputationRegistryRef die niet aan eip155:<chainId>:<address> voldoet", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: "not-a-ref", agentId: "1", rpcUrl: "https://rpc.example", claim }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een agentId met een leidende nul", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "007", rpcUrl: "https://rpc.example", claim }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een agentId boven de uint256-grens (78 cijfers)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "9".repeat(79), rpcUrl: "https://rpc.example", claim }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een rpcUrl zonder http(s)-schema", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "file:///etc/passwd", claim }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een claim met een claimId die niet bij de inhoud past (tamper-poging)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const tampered = { ...claim, promisedSpec: "iets anders dan wat ondertekend is" };
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim: tampered }, fakeFactory({ giveFeedback }));
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("claimId_mismatch");
    expect(giveFeedback).not.toHaveBeenCalled();
  });

  it("weigert een claim waarvan de handtekening niet bij buyerAddress hoort", async () => {
    const wallet = testWallet();
    const impostor = testWallet();
    const claim = await buildSignedClaim(wallet);
    const forged = { ...claim, buyerAddress: impostor.address };
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim: forged }, fakeFactory({ giveFeedback }));
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("refusing to publish an unverifiable claim");
    expect(giveFeedback).not.toHaveBeenCalled();
  });

  it("geeft een net foutresultaat terug als de on-chain call reverts (bv. Self-feedback not allowed)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const factory = fakeFactory({
      giveFeedback: vi.fn(async () => {
        throw new Error("execution reverted: Self-feedback not allowed");
      }),
    });
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim }, factory);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("on-chain giveFeedback failed");
  });

  it("respecteert de timeout in plaats van voor altijd te hangen", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const factory = fakeFactory({
      giveFeedback: () => new Promise<never>(() => {}), // never resolves
    });
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim }, factory);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("timed out");
  }, 20_000);

  it("gooit nooit een onafgevangen exceptie, ook niet bij een synchroon gooiende contract-factory", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const throwingFactory: ReputationContractFactory = () => {
      throw new Error("provider construction failed");
    };
    const result = await publishReputationFeedback(wallet, { reputationRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example", claim }, throwingFactory);
    expect(result.ok).toBe(false);
  });
});
