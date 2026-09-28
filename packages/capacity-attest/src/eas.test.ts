import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import {
  encodeClaimData,
  decodeClaimData,
  computeSchemaUID,
  SCHEMA_UID,
  easSource,
  blockWindows,
  rpcAttestationReader,
  ensureSchema,
  publishClaim,
  EAS_ADDRESS,
  SCHEMA_REGISTRY_ADDRESS,
  EAS_DEPLOYMENTS,
  EAS_EXPLORER,
  type AttestationReader,
  type EasWriteContractFactory,
  type SchemaRegistryContractFactory,
} from "./eas.js";
import { discoverDeliveryHistory } from "./discovery.js";
import { verifyClaim } from "./signing.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

const SELLER = "0x00000000000000000000000000000000000000aa";

describe("EAS encode/decode round-trip (offline, real ABI types)", () => {
  it("encodes a claim and decodes it back to a claim that still verifies", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "01".repeat(32) });
    const data = encodeClaimData(claim);
    const back = decodeClaimData(data);
    expect(back).not.toBeNull();
    expect(back!.claimId).toBe(claim.claimId);
    expect(verifyClaim(back!).ok).toBe(true);
  });

  it("preserves an optional priorClaimId through the round-trip", async () => {
    const buyer = testWallet();
    const c1 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "02".repeat(32) });
    const c2 = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "03".repeat(32), priorClaimId: c1.claimId });
    const back = decodeClaimData(encodeClaimData(c2));
    expect(back?.priorClaimId).toBe(c1.claimId);
    expect(verifyClaim(back!).ok).toBe(true);
  });

  it("returns null for undecodable data", () => {
    expect(decodeClaimData("0x1234")).toBeNull();
  });

  it("returns null when the on-chain bytes32 claimId disagrees with the JSON claim", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "04".repeat(32) });
    const coder = (await import("ethers")).ethers.AbiCoder.defaultAbiCoder();
    // Encode with a claimId that does not match the JSON's own claimId.
    const mismatched = coder.encode(["bytes32", "string"], ["0x" + "ab".repeat(32), JSON.stringify(claim)]);
    expect(decodeClaimData(mismatched)).toBeNull();
  });

  it("schema UID is deterministic and matches the exported constant", () => {
    expect(computeSchemaUID()).toBe(SCHEMA_UID);
  });
});

describe("easSource + discovery (offline, injected reader)", () => {
  it("surfaces a genuine EAS-published claim and rejects a tampered one", async () => {
    const buyer = testWallet();
    const genuine = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "05".repeat(32) });
    const tampered = { ...genuine, delivered: "no" as const }; // claimId no longer matches content

    const coder = (await import("ethers")).ethers.AbiCoder.defaultAbiCoder();
    // Two on-chain attestations: one genuine, one tampered (re-encoded with the
    // tampered content but keeping the original claimId so it still decodes).
    const store: Record<string, string> = {
      "0xuid-genuine": encodeClaimData(genuine),
      "0xuid-tampered": coder.encode(["bytes32", "string"], [genuine.claimId, JSON.stringify(tampered)]),
    };
    const reader: AttestationReader = {
      uidsForSeller: async () => Object.keys(store),
      dataForUid: async (uid) => store[uid]!,
    };

    const result = await discoverDeliveryHistory(SELLER, [easSource(reader, "eas-test")]);
    // Only the genuine claim survives verification.
    expect(result.count).toBe(1);
    expect(result.claims[0]?.claimId).toBe(genuine.claimId);
    // The tampered attestation decoded (same claimId) but failed verifyClaim in discovery.
    expect(result.sources[0]?.rejected).toBe(1);
  });

  it("drops an unreadable attestation without failing the others", async () => {
    const buyer = testWallet();
    const good = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "06".repeat(32) });
    const store: Record<string, string> = { "0xok": encodeClaimData(good), "0xbad": "0xdeadbeef" };
    const reader: AttestationReader = {
      uidsForSeller: async () => ["0xok", "0xbad"],
      dataForUid: async (uid) => store[uid]!,
    };
    const result = await discoverDeliveryHistory(SELLER, [easSource(reader)]);
    expect(result.count).toBe(1);
    expect(result.claims[0]?.claimId).toBe(good.claimId);
  });
});

describe("blockWindows (pure block-range chunking, no RPC needed)", () => {
  it("returns a single window when the range fits inside blockRange", () => {
    expect(blockWindows(100, 150, 2_000)).toEqual([[100, 150]]);
  });

  it("chunks a range wider than blockRange into consecutive, non-overlapping windows", () => {
    // 0..4999 at blockRange=2000: [0,1999] [2000,3999] [4000,4999], gap-free and non-overlapping.
    expect(blockWindows(0, 4_999, 2_000)).toEqual([
      [0, 1_999],
      [2_000, 3_999],
      [4_000, 4_999],
    ]);
  });

  it("handles a range that divides evenly with no short trailing window", () => {
    expect(blockWindows(0, 3_999, 2_000)).toEqual([
      [0, 1_999],
      [2_000, 3_999],
    ]);
  });

  it("returns a single-block window when fromBlock === latest", () => {
    expect(blockWindows(500, 500, 2_000)).toEqual([[500, 500]]);
  });

  it("returns no windows when fromBlock is already past latest", () => {
    expect(blockWindows(600, 500, 2_000)).toEqual([]);
  });

  it("rejects a non-positive blockRange instead of looping forever", () => {
    expect(() => blockWindows(0, 100, 0)).toThrow(/blockRange/);
    expect(() => blockWindows(0, 100, -1)).toThrow(/blockRange/);
  });
});

describe("easSource concurrency (bounded fan-out over dataForUid)", () => {
  it("never has more than the configured concurrency in flight, and still returns every claim", async () => {
    const buyer = testWallet();
    const claims = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + String(i + 10).padStart(2, "0").repeat(32).slice(0, 64) }),
      ),
    );
    const store = new Map(claims.map((c, i) => [`0xuid-${i}`, encodeClaimData(c)]));
    const uids = [...store.keys()];

    let inFlight = 0;
    let maxInFlight = 0;
    const CONCURRENCY = 4;
    const reader: AttestationReader = {
      uidsForSeller: async () => uids,
      concurrency: CONCURRENCY,
      dataForUid: async (uid) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Yield control so overlapping calls actually interleave instead of
        // resolving synchronously one after another.
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return store.get(uid)!;
      },
    };

    const result = await easSource(reader).fetchForSeller(SELLER);
    expect(result.length).toBe(25);
    expect(new Set(result.map((c) => c.claimId)).size).toBe(25); // every claim present, no duplicates or drops
    expect(maxInFlight).toBeLessThanOrEqual(CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1); // proves this genuinely ran concurrently, not accidentally serial
  });

  it("falls back to DEFAULT_CONCURRENCY when the reader does not set one", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "07".repeat(32) });
    const reader: AttestationReader = {
      uidsForSeller: async () => ["0xonly"],
      dataForUid: async () => encodeClaimData(claim),
    };
    const result = await easSource(reader).fetchForSeller(SELLER);
    expect(result.length).toBe(1);
    expect(result[0]?.claimId).toBe(claim.claimId);
  });
});

describe("EAS_DEPLOYMENTS (WP2: multi-chain addresses, each independently verified 2026-09-28)", () => {
  it("Base and Base Sepolia use the pre-existing EAS_ADDRESS/SCHEMA_REGISTRY_ADDRESS constants, unchanged", () => {
    expect(EAS_DEPLOYMENTS[8453]?.easAddress).toBe(EAS_ADDRESS);
    expect(EAS_DEPLOYMENTS[8453]?.schemaRegistryAddress).toBe(SCHEMA_REGISTRY_ADDRESS);
    expect(EAS_DEPLOYMENTS[84532]?.easAddress).toBe(EAS_ADDRESS);
    expect(EAS_DEPLOYMENTS[84532]?.schemaRegistryAddress).toBe(SCHEMA_REGISTRY_ADDRESS);
  });

  it("Optimism shares Base's exact OP-Stack predeploy addresses (confirmed true, not assumed from the general OP-Stack pattern)", () => {
    expect(EAS_DEPLOYMENTS[10]?.easAddress).toBe(EAS_ADDRESS);
    expect(EAS_DEPLOYMENTS[10]?.schemaRegistryAddress).toBe(SCHEMA_REGISTRY_ADDRESS);
  });

  it("Ethereum mainnet uses its own, distinct addresses, NOT the OP-Stack predeploy pattern (it is not an OP-Stack chain)", () => {
    const eth = EAS_DEPLOYMENTS[1];
    expect(eth?.easAddress).toBe("0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587");
    expect(eth?.schemaRegistryAddress).toBe("0xA7b39296258348C78294F95B872b282326A97BDF");
    expect(eth?.easAddress).not.toBe(EAS_ADDRESS);
    expect(eth?.schemaRegistryAddress).not.toBe(SCHEMA_REGISTRY_ADDRESS);
  });

  it("every known deployment's addresses are well-formed 0x + 40 hex addresses (catches a copy-paste truncation/typo)", () => {
    const ADDR = /^0x[0-9a-fA-F]{40}$/;
    for (const d of Object.values(EAS_DEPLOYMENTS)) {
      expect(d.easAddress).toMatch(ADDR);
      expect(d.schemaRegistryAddress).toMatch(ADDR);
    }
  });

  it("EAS_EXPLORER stays derived from EAS_DEPLOYMENTS (one source of truth, cannot silently drift apart)", () => {
    for (const [chainId, d] of Object.entries(EAS_DEPLOYMENTS)) {
      expect(EAS_EXPLORER[Number(chainId)]).toBe(d.explorer);
    }
  });
});

describe("ensureSchema / publishClaim target the chain they are told to, not always Base (WP2, injected contract factory, no live network key needed)", () => {
  function fakeAccount(): ethers.Signer {
    return {} as ethers.Signer; // never actually used: the injected contractFactory ignores it and returns a fake contract
  }

  it("ensureSchema calls the SchemaRegistry contract at the ADDRESS PASSED IN, not the Base default, when the schema is already registered", async () => {
    const seenAddresses: string[] = [];
    const targetAddress = EAS_DEPLOYMENTS[1]!.schemaRegistryAddress; // Ethereum mainnet's, deliberately different from Base's
    const factory: SchemaRegistryContractFactory = (schemaRegistryAddress) => {
      seenAddresses.push(schemaRegistryAddress);
      return {
        getSchema: async () => ({ uid: SCHEMA_UID }), // already registered: register() must NOT be called
        register: async () => {
          throw new Error("should not be called: schema already registered");
        },
      };
    };

    const uid = await ensureSchema(fakeAccount(), { schemaRegistryAddress: targetAddress, contractFactory: factory });

    expect(uid).toBe(SCHEMA_UID);
    expect(seenAddresses).toEqual([targetAddress]);
    expect(seenAddresses[0]).not.toBe(SCHEMA_REGISTRY_ADDRESS); // proves it did NOT silently fall back to Base
  });

  it("ensureSchema defaults to SCHEMA_REGISTRY_ADDRESS (Base) when no address is passed, unchanged from before this option existed", async () => {
    const seenAddresses: string[] = [];
    const factory: SchemaRegistryContractFactory = (schemaRegistryAddress) => {
      seenAddresses.push(schemaRegistryAddress);
      return { getSchema: async () => ({ uid: SCHEMA_UID }), register: async () => { throw new Error("unreachable"); } };
    };
    await ensureSchema(fakeAccount(), { contractFactory: factory });
    expect(seenAddresses).toEqual([SCHEMA_REGISTRY_ADDRESS]);
  });

  it("publishClaim attests via the EAS ADDRESS PASSED IN, not the Base default", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "20".repeat(32) });
    const seenAddresses: string[] = [];
    const targetAddress = EAS_DEPLOYMENTS[1]!.easAddress; // Ethereum mainnet's, deliberately different from Base's

    const iface = new ethers.Interface(["event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)"]);
    const fakeUid = "0x" + "cd".repeat(32);
    const fakeLog = iface.encodeEventLog("Attested", [claim.sellerAddress, "0x0000000000000000000000000000000000000001", fakeUid, SCHEMA_UID]);

    const factory: EasWriteContractFactory = (easAddress) => {
      seenAddresses.push(easAddress);
      return {
        attest: async () => ({
          wait: async () => ({
            hash: "0x" + "ab".repeat(32),
            logs: [{ topics: fakeLog.topics, data: fakeLog.data }],
          }),
        }),
      } as unknown as ReturnType<EasWriteContractFactory>;
    };

    const result = await publishClaim(fakeAccount(), claim, { easAddress: targetAddress, contractFactory: factory });

    expect(seenAddresses).toEqual([targetAddress]);
    expect(seenAddresses[0]).not.toBe(EAS_ADDRESS); // proves it did NOT silently fall back to Base
    expect(result.uid).toBe(fakeUid);
    expect(result.recipient).toBe(claim.sellerAddress);
  });

  it("publishClaim defaults to EAS_ADDRESS (Base) when no address is passed, unchanged from before this option existed", async () => {
    const buyer = testWallet();
    const claim = await buildSignedClaim(buyer, { sellerAddress: SELLER, settlementRef: "0x" + "21".repeat(32) });
    const seenAddresses: string[] = [];
    const factory: EasWriteContractFactory = (easAddress) => {
      seenAddresses.push(easAddress);
      return { attest: async () => ({ wait: async () => ({ hash: "0x" + "ab".repeat(32), logs: [] }) }) } as unknown as ReturnType<EasWriteContractFactory>;
    };
    await publishClaim(fakeAccount(), claim, { contractFactory: factory });
    expect(seenAddresses).toEqual([EAS_ADDRESS]);
  });
});

describe("rpcAttestationReader targets the EAS address it is told to (WP2), via a spied-on provider, no live network call made", () => {
  it("reads Attested logs at the PASSED-IN easAddress, not the Base default", async () => {
    const getLogsSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getLogs").mockResolvedValue([]);
    const getBlockNumberSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getBlockNumber").mockResolvedValue(100);

    const targetAddress = EAS_DEPLOYMENTS[1]!.easAddress; // Ethereum mainnet's
    const reader = rpcAttestationReader("https://example.invalid/rpc", { easAddress: targetAddress, blockRange: 1000 });
    await reader.uidsForSeller(SELLER);

    expect(getLogsSpy).toHaveBeenCalled();
    const calls = getLogsSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [filter] of calls) {
      expect((filter as { address?: string }).address).toBe(targetAddress);
      expect((filter as { address?: string }).address).not.toBe(EAS_ADDRESS); // proves it did NOT silently read Base's contract
    }

    getLogsSpy.mockRestore();
    getBlockNumberSpy.mockRestore();
  });

  it("defaults to reading EAS_ADDRESS (Base) when no easAddress is passed, unchanged from before this option existed", async () => {
    const getLogsSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getLogs").mockResolvedValue([]);
    const getBlockNumberSpy = vi.spyOn(ethers.JsonRpcProvider.prototype, "getBlockNumber").mockResolvedValue(100);

    const reader = rpcAttestationReader("https://example.invalid/rpc", { blockRange: 1000 });
    await reader.uidsForSeller(SELLER);

    const calls = getLogsSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [filter] of calls) {
      expect((filter as { address?: string }).address).toBe(EAS_ADDRESS);
    }

    getLogsSpy.mockRestore();
    getBlockNumberSpy.mockRestore();
  });
});
