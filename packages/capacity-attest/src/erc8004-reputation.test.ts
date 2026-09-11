// erc8004-reputation.test.ts — tests for publishReputationFeedback(). All
// tests inject a fake ReputationContractFactory (see erc8004-reputation.ts),
// so none of them make a real network call or depend on any live chain
// being reachable in CI. Real, live verification against Base mainnet is a
// separate step (examples/verify-erc8004-reputation-live.mjs), same split
// as erc8004.ts/erc8004.test.ts.

import { describe, it, expect, vi } from "vitest";
import { publishReputationFeedback, type ReputationWriteContract, type ReputationContractFactory, type IdentityResolver } from "./erc8004-reputation.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

const VALID_REF = "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
// A distinct Identity Registry reference — deliberately a different address than the
// Reputation Registry's, matching how ERC-8004 actually deploys these as separate contracts.
const AGENT_REF = "eip155:8453:0x00000000000000000000000000000000A11DEE";
const TX_HASH = "0x" + "aa".repeat(32);
// Matches buildSignedClaim()'s own default sellerAddress in test-helpers.ts — every test below
// that doesn't override sellerAddress needs its fake identityResolver to resolve to this owner,
// since publishReputationFeedback (adversarial review 2026-09-11) now verifies agentId's
// registered owner matches claim.sellerAddress before writing anything on-chain.
const DEFAULT_SELLER = "0x00000000000000000000000000000000000000aa";

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

function fakeIdentityResolver(owner: string = DEFAULT_SELLER): IdentityResolver {
  return (async () => ({
    ok: true,
    chainId: "8453",
    registryAddress: "0x00000000000000000000000000000000a11dee",
    agentId: "1",
    owner,
    tokenUri: "ipfs://fake",
  })) as IdentityResolver;
}

describe("publishReputationFeedback", () => {
  it("publiceert delivered:yes als value 10 met 1 decimaal (dus 1.0)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "yes", assetType: "gpu-hours" });
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "42", rpcUrl: "https://rpc.example/base", claim },
      fakeFactory(),
      fakeIdentityResolver(),
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
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      fakeFactory(),
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(true);
    expect((result as { value: number }).value).toBe(0);
  });

  it("publiceert delivered:partial als value 5 (dus 0.5)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "partial" });
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      fakeFactory(),
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(true);
    expect((result as { value: number }).value).toBe(5);
  });

  it("verzint nooit een eigen waarde: value hangt uitsluitend af van claim.delivered, nooit van assetType/promisedSpec/evidenceHash", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet, { delivered: "yes", assetType: "bandwidth", promisedSpec: "iets heel anders" });
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "7", rpcUrl: "https://rpc.example", claim },
      fakeFactory({ giveFeedback }),
      fakeIdentityResolver(),
    );
    expect(giveFeedback).toHaveBeenCalledWith(7n, 10n, 1, "capacity-attest:delivered", "bandwidth", "", "", expect.stringMatching(/^0x0+$/));
  });

  it("geeft agentId als bigint mee, niet als string", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "9999", rpcUrl: "https://rpc.example", claim },
      fakeFactory({ giveFeedback }),
      fakeIdentityResolver(),
    );
    expect(giveFeedback.mock.calls[0]![0]).toBe(9999n);
  });

  it("geeft caller-supplied feedbackURI en feedbackHash door", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    const hash = "0x" + "bb".repeat(32);
    await publishReputationFeedback(
      wallet,
      {
        reputationRegistryRef: VALID_REF,
        agentRegistryRef: AGENT_REF,
        agentId: "1",
        rpcUrl: "https://rpc.example",
        claim,
        feedbackURI: "https://base.easscan.org/attestation/view/0x1",
        feedbackHash: hash,
      },
      fakeFactory({ giveFeedback }),
      fakeIdentityResolver(),
    );
    expect(giveFeedback).toHaveBeenCalledWith(1n, 10n, 1, "capacity-attest:delivered", claim.assetType, "", "https://base.easscan.org/attestation/view/0x1", hash);
  });

  it("weigert een reputationRegistryRef die niet aan eip155:<chainId>:<address> voldoet", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: "not-a-ref", agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      fakeFactory(),
    );
    expect(result.ok).toBe(false);
  });

  it("weigert een agentId met een leidende nul", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "007", rpcUrl: "https://rpc.example", claim },
      fakeFactory(),
    );
    expect(result.ok).toBe(false);
  });

  it("weigert een agentId boven de uint256-grens (78 cijfers)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "9".repeat(79), rpcUrl: "https://rpc.example", claim },
      fakeFactory(),
    );
    expect(result.ok).toBe(false);
  });

  it("weigert een rpcUrl zonder http(s)-schema", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "file:///etc/passwd", claim },
      fakeFactory(),
    );
    expect(result.ok).toBe(false);
  });

  it("weigert een claim met een claimId die niet bij de inhoud past (tamper-poging)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const tampered = { ...claim, promisedSpec: "iets anders dan wat ondertekend is" };
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim: tampered },
      fakeFactory({ giveFeedback }),
    );
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
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim: forged },
      fakeFactory({ giveFeedback }),
    );
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("refusing to publish an unverifiable claim");
    expect(giveFeedback).not.toHaveBeenCalled();
  });

  it("weigert netjes i.p.v. te crashen bij een claim met een pathologisch diep genest promisedSpec (adversarial review 2026-09-11: computeClaimId() kan gooien, en dit was de ene aanroeper zonder de try/catch die elke buur wel heeft)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    let nested: unknown = "leaf";
    for (let i = 0; i < 40; i++) nested = { child: nested };
    const pathological = { ...claim, promisedSpec: nested as unknown as string };
    const giveFeedback = vi.fn(async () => fakeTx() as never);
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim: pathological },
      fakeFactory({ giveFeedback }),
    );
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
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      factory,
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("on-chain giveFeedback failed");
  });

  it("respecteert de timeout in plaats van voor altijd te hangen", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const factory = fakeFactory({
      giveFeedback: () => new Promise<never>(() => {}), // never resolves
    });
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      factory,
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("timed out");
    expect((result as { txHash?: string }).txHash).toBeUndefined();
  }, 20_000);

  it("geeft de txHash terug bij een timeout op tx.wait(), i.p.v. hem stil te laten vallen (adversarial review 2026-09-11: giveFeedback zelf slaagde, alleen bevestiging hing, en zonder hash kon een aanroeper niet checken voor hij opnieuw probeerde)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const factory = fakeFactory({
      giveFeedback: async () => fakeTx({ wait: () => new Promise(() => {}) }) as never, // broadcast lukt, bevestiging hangt
    });
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      factory,
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain(TX_HASH);
    expect((result as { reason: string }).reason).toContain("double-count");
    expect((result as { txHash?: string }).txHash).toBe(TX_HASH);
  }, 20_000);

  it("geeft geen txHash terug als giveFeedback zelf al mislukt (er is dan niks om op te checken)", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const factory = fakeFactory({
      giveFeedback: vi.fn(async () => {
        throw new Error("insufficient funds for gas");
      }),
    });
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      factory,
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(false);
    expect((result as { txHash?: string }).txHash).toBeUndefined();
  });

  it("gooit nooit een onafgevangen exceptie, ook niet bij een synchroon gooiende contract-factory", async () => {
    const wallet = testWallet();
    const claim = await buildSignedClaim(wallet);
    const throwingFactory: ReputationContractFactory = () => {
      throw new Error("provider construction failed");
    };
    const result = await publishReputationFeedback(
      wallet,
      { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
      throwingFactory,
      fakeIdentityResolver(),
    );
    expect(result.ok).toBe(false);
  });

  describe("agentId-ownership guard (adversarial review 2026-09-11)", () => {
    it("weigert als agentId's geregistreerde eigenaar niet overeenkomt met claim.sellerAddress, en roept giveFeedback niet eens aan", async () => {
      const wallet = testWallet();
      const claim = await buildSignedClaim(wallet); // sellerAddress = DEFAULT_SELLER
      const someoneElse = "0x00000000000000000000000000000000000000bb";
      const giveFeedback = vi.fn(async () => fakeTx() as never);
      const result = await publishReputationFeedback(
        wallet,
        { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
        fakeFactory({ giveFeedback }),
        fakeIdentityResolver(someoneElse), // agentId 1 blijkt geregistreerd op een ANDER adres
      );
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("does not match the claim's sellerAddress");
      expect(giveFeedback).not.toHaveBeenCalled();
    });

    it("publiceert gewoon als agentId's eigenaar wel overeenkomt met claim.sellerAddress (geen regressie op het normale pad)", async () => {
      const wallet = testWallet();
      const claim = await buildSignedClaim(wallet, { sellerAddress: "0x00000000000000000000000000000000000000cc" });
      const result = await publishReputationFeedback(
        wallet,
        { reputationRegistryRef: VALID_REF, agentRegistryRef: AGENT_REF, agentId: "1", rpcUrl: "https://rpc.example", claim },
        fakeFactory(),
        fakeIdentityResolver("0x00000000000000000000000000000000000000cc"),
      );
      expect(result.ok).toBe(true);
    });

    it("geeft een net foutresultaat als het identiteitsonderzoek zelf mislukt (bv. agentRegistryRef ongeldig)", async () => {
      const wallet = testWallet();
      const claim = await buildSignedClaim(wallet);
      const giveFeedback = vi.fn(async () => fakeTx() as never);
      const failingResolver: IdentityResolver = (async () => ({ ok: false, reason: "agentRegistryRef must match ..." })) as IdentityResolver;
      const result = await publishReputationFeedback(
        wallet,
        { reputationRegistryRef: VALID_REF, agentRegistryRef: "not-a-ref", agentId: "1", rpcUrl: "https://rpc.example", claim },
        fakeFactory({ giveFeedback }),
        failingResolver,
      );
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("could not verify agentId's registered identity");
      expect(giveFeedback).not.toHaveBeenCalled();
    });
  });
});
