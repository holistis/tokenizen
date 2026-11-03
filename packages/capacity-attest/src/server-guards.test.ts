// server-guards.test.ts — the fixes from the adversarial read of 2026-11-03, kept as tests so they cannot quietly come undone.
//
// 1. The HTTP server's free routes that take an rpcUrl from an anonymous caller (resolve_agent_identity, get_agent_snapshot) must
//    reach the network only through net-guard. They used the unguarded library defaults, which connect to any address the caller
//    names and send the error text back.
// 2. The paid publish route writes with the SERVER's wallet, so the contract it calls must not be chosen by the caller: only the
//    canonical registries are accepted, the RPC is the server's own, and the gas is capped.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveAgentIdentity, guardedContractFactory, guardedChainIdFactory } from "./erc8004.js";
import { publishReputationFeedback, type ReputationWriteContract, type ReputationContractFactory, type IdentityResolver } from "./erc8004-reputation.js";
import { checkPublishFeedbackRegistries } from "./http-server.js";
import { buildSignedClaim, testWallet } from "./test-helpers.js";

const REPUTATION = "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
const IDENTITY = "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const SOURCE = readFileSync(fileURLToPath(new URL("./http-server.ts", import.meta.url)), "utf8");

describe("the free routes reach the network only through net-guard", () => {
  for (const url of ["http://127.0.0.1:9/rpc", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/rpc", "http://localhost:8545"]) {
    it(`refuses ${url} and says why, instead of connecting to it`, async () => {
      const r = await resolveAgentIdentity({ agentRegistryRef: IDENTITY, agentId: "1", rpcUrl: url }, guardedContractFactory, guardedChainIdFactory);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/on-chain lookup failed/);
      expect(r.reason).not.toMatch(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/);
    });
  }

  // A tripwire in the same spirit as net-guard's own no-raw-egress test: nobody can add a new route or call that goes around the guard.
  it("every resolveAgentIdentity call in http-server.ts passes both guarded factories", () => {
    const calls = SOURCE.split("\n").filter((l) => /\bresolveAgentIdentity\(/.test(l) && !/^\s*(\/\/|import)/.test(l));
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const line of calls) {
      expect(line, line.trim()).toContain("guardedContractFactory");
      expect(line, line.trim()).toContain("guardedChainIdFactory");
    }
  });

  it("http-server.ts builds exactly one JsonRpcProvider by hand: the signer's, from the server's own configured RPC", () => {
    const hits = SOURCE.split("\n").filter((l) => /new ethers\.JsonRpcProvider\(/.test(l) && !/^\s*\/\//.test(l));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("rpcUrl");
  });
});

describe("the paid publish route does not let the caller choose the contract, the RPC or the gas", () => {
  it("accepts the canonical Reputation and Identity registries, whatever the case of the address", () => {
    expect(checkPublishFeedbackRegistries({ reputationRegistryRef: REPUTATION, agentRegistryRef: IDENTITY })).toBeNull();
    expect(checkPublishFeedbackRegistries({ reputationRegistryRef: REPUTATION.toLowerCase(), agentRegistryRef: IDENTITY.toUpperCase().replace("EIP155", "eip155").replace("0X", "0x") })).toBeNull();
  });

  it("refuses a reputation registry the caller chose, and a wrong chain", () => {
    for (const ref of ["eip155:8453:0x0000000000000000000000000000000000000bad", "eip155:1:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63", "garbage"]) {
      expect(checkPublishFeedbackRegistries({ reputationRegistryRef: ref, agentRegistryRef: IDENTITY })).toMatch(/^registry_not_allowed: .*Reputation Registries/);
    }
  });

  it("refuses an identity registry the caller chose, because it would be asked who owns the agent", () => {
    expect(checkPublishFeedbackRegistries({ reputationRegistryRef: REPUTATION, agentRegistryRef: "eip155:8453:0x0000000000000000000000000000000000000bad" })).toMatch(/^registry_not_allowed: .*Identity Registries/);
  });

  it("checks the registries both before payment (refuse) and again after settlement (throw, the authoritative gate)", () => {
    expect(SOURCE.match(/checkPublishFeedbackRegistries\(parsed\.data\)/g)).toHaveLength(2);
    expect(SOURCE).toContain("if (refusedRegistry) return errorResult(refusedRegistry);");
    expect(SOURCE).toContain("if (refusedRegistry) throw new Error(refusedRegistry);");
  });

  it("uses the server's own RPC for the route, never the caller's", () => {
    expect(SOURCE).toMatch(/publishReputationFeedback\(\s*signer,\s*\{ \.\.\.parsed\.data, rpcUrl: REPUTATION_PUBLISHER_RPC_URL \}/);
  });

  describe("the gas limit reaches giveFeedback", () => {
    const makeFactory = () => {
      const giveFeedback = vi.fn(async () => ({ hash: "0x" + "aa".repeat(32), wait: async () => ({ status: 1 }) }) as never);
      const factory: ReputationContractFactory = () => ({ giveFeedback }) as unknown as ReputationWriteContract;
      return { giveFeedback, factory };
    };
    const resolver = (async () => ({ ok: true, chainId: "8453", registryAddress: "0x0", agentId: "1", owner: "0x00000000000000000000000000000000000000aa", tokenUri: "x" })) as IdentityResolver;

    it("passes an explicit gasLimit as the last argument when one is given", async () => {
      const wallet = testWallet();
      const claim = await buildSignedClaim(wallet, { delivered: "yes" });
      const { giveFeedback, factory } = makeFactory();
      const r = await publishReputationFeedback(wallet, { reputationRegistryRef: REPUTATION, agentRegistryRef: IDENTITY, agentId: "1", rpcUrl: "https://rpc.example", claim }, factory, resolver, { gasLimit: 600000n });
      expect(r.ok).toBe(true);
      const args = giveFeedback.mock.calls[0] as unknown[];
      expect(args).toHaveLength(9);
      expect(args[8]).toEqual({ gasLimit: 600000n });
    });

    it("keeps the old call shape (no extra argument) when none is given", async () => {
      const wallet = testWallet();
      const claim = await buildSignedClaim(wallet, { delivered: "yes" });
      const { giveFeedback, factory } = makeFactory();
      await publishReputationFeedback(wallet, { reputationRegistryRef: REPUTATION, agentRegistryRef: IDENTITY, agentId: "1", rpcUrl: "https://rpc.example", claim }, factory, resolver);
      expect(giveFeedback.mock.calls[0]).toHaveLength(8);
    });
  });
});
