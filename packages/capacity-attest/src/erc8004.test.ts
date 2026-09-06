// erc8004.test.ts — tests for resolveAgentIdentity(). All tests inject a
// fake ContractFactory (see erc8004.ts), so none of them make a real network
// call or depend on any live chain being reachable in CI.

import { describe, it, expect, vi } from "vitest";
import { resolveAgentIdentity, type Erc721ReadContract, type ContractFactory } from "./erc8004.js";

const VALID_REF = "eip155:1:0x1234567890123456789012345678901234567890";
const OWNER = "0xF11ce7141dAeCEC9624Ec3Ccf49b437d40A0Ad20";
const TOKEN_URI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

function fakeFactory(overrides: Partial<Erc721ReadContract> = {}): ContractFactory {
  const contract: Erc721ReadContract = {
    ownerOf: vi.fn(async () => OWNER),
    tokenURI: vi.fn(async () => TOKEN_URI),
    ...overrides,
  };
  return () => contract;
}

describe("resolveAgentIdentity", () => {
  it("resolvet een geldige referentie via ownerOf + tokenURI", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "1234", rpcUrl: "https://rpc.example/eth" }, fakeFactory());
    expect(result).toEqual({
      ok: true,
      chainId: "1",
      registryAddress: "0x1234567890123456789012345678901234567890",
      agentId: "1234",
      owner: OWNER,
      tokenUri: TOKEN_URI,
    });
  });

  it("geeft de contract-aanroepen het agentId als bigint mee, niet als string", async () => {
    const ownerOf = vi.fn(async () => OWNER);
    const tokenURI = vi.fn(async () => TOKEN_URI);
    await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "42", rpcUrl: "https://rpc.example" }, fakeFactory({ ownerOf, tokenURI }));
    expect(ownerOf).toHaveBeenCalledWith(42n);
    expect(tokenURI).toHaveBeenCalledWith(42n);
  });

  it("normaliseert het registry-adres naar kleine letters, zoals sellerAddress/buyerAddress elders", async () => {
    const mixedCaseRef = "eip155:8453:0xAbCd567890123456789012345678901234567890";
    const result = await resolveAgentIdentity({ agentRegistryRef: mixedCaseRef, agentId: "1", rpcUrl: "https://rpc.example" }, fakeFactory());
    expect(result.ok).toBe(true);
    expect((result as { registryAddress: string }).registryAddress).toBe("0xabcd567890123456789012345678901234567890");
  });

  it("weigert een agentRegistryRef die niet aan eip155:<chainId>:<address> voldoet", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: "not-a-ref", agentId: "1", rpcUrl: "https://rpc.example" }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een niet-eip155-namespace", async () => {
    const result = await resolveAgentIdentity(
      { agentRegistryRef: "cosmos:1:0x1234567890123456789012345678901234567890", agentId: "1", rpcUrl: "https://rpc.example" },
      fakeFactory(),
    );
    expect(result.ok).toBe(false);
  });

  it("weigert een agentId met een leidende nul", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "007", rpcUrl: "https://rpc.example" }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een negatief agentId", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "-1", rpcUrl: "https://rpc.example" }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een agentId boven de uint256-grens (78 cijfers)", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "9".repeat(79), rpcUrl: "https://rpc.example" }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("accepteert agentId '0'", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "0", rpcUrl: "https://rpc.example" }, fakeFactory());
    expect(result.ok).toBe(true);
  });

  it("weigert een rpcUrl zonder http(s)-schema", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "1", rpcUrl: "file:///etc/passwd" }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("weigert een onzinnige rpcUrl", async () => {
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "1", rpcUrl: "not a url" }, fakeFactory());
    expect(result.ok).toBe(false);
  });

  it("geeft een net foutresultaat terug als de on-chain call reject (bv. agentId bestaat niet)", async () => {
    const factory = fakeFactory({
      ownerOf: vi.fn(async () => {
        throw new Error("execution reverted: ERC721NonexistentToken");
      }),
    });
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "999999", rpcUrl: "https://rpc.example" }, factory);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("on-chain lookup failed");
  });

  it("respecteert de timeout in plaats van voor altijd te hangen", async () => {
    const factory = fakeFactory({
      ownerOf: () => new Promise<string>(() => {}), // never resolves
    });
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example" }, factory);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("timed out");
  }, 10_000);

  it("gooit nooit een onafgevangen exceptie, ook niet bij een synchroon gooiende contract-factory", async () => {
    const throwingFactory: ContractFactory = () => {
      throw new Error("provider construction failed");
    };
    const result = await resolveAgentIdentity({ agentRegistryRef: VALID_REF, agentId: "1", rpcUrl: "https://rpc.example" }, throwingFactory);
    expect(result.ok).toBe(false);
  });
});
