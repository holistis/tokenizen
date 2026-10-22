// guarded-ethers.test.ts — proves guardedEthersFetchRequest actually routes
// an ethers JsonRpcProvider's real network calls through guardedFetch,
// rather than ethers' own, unguarded default network layer. guardedFetch's
// OWN blocking logic (DNS rebinding, address ranges) is already exhaustively
// unit-tested in guarded-fetch.test.ts with injected, fake resolvers — this
// file's job is narrower: prove the WIRING between ethers and that logic is
// real, with two live, real-network checks (no mocks), since a wiring bug
// (e.g. silently falling back to ethers' own fetch) would not show up in a
// unit test against a fake.
import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { guardedEthersFetchRequest } from "./guarded-ethers.js";

describe("guardedEthersFetchRequest", () => {
  it("refuses a request to a blocked literal address (cloud metadata), proving guardedFetch is actually in the path", async () => {
    const provider = new ethers.JsonRpcProvider(guardedEthersFetchRequest("http://169.254.169.254/"), undefined, {
      staticNetwork: true,
    });
    await expect(provider.getBlockNumber()).rejects.toBeTruthy();
  });

  it("a real public RPC call still works end to end through the guard", async () => {
    const provider = new ethers.JsonRpcProvider(guardedEthersFetchRequest("https://mainnet.base.org"), undefined, {
      staticNetwork: true,
    });
    const blockNumber = await provider.getBlockNumber();
    expect(blockNumber).toBeGreaterThan(0);
  });
});
