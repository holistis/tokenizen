import { describe, it, expect } from "vitest";
import { runActiveToolChainCheck, byteCappedFetch } from "./fetch-tools.js";
import { TOOL_CHAIN_CHECK_NAME } from "./tool-chain-check.js";

describe("byteCappedFetch (bounds an attacker-controlled tools/list body)", () => {
  it("passes a body under the cap through unchanged", async () => {
    const base = (async () => new Response("hello", { status: 200 })) as typeof fetch;
    const res = await byteCappedFetch(base, 1000)("https://x.test");
    expect(await res.text()).toBe("hello");
  });

  it("errors while reading a body that exceeds the cap, instead of buffering it all", async () => {
    const base = (async () => new Response("x".repeat(10_000), { status: 200 })) as typeof fetch;
    const res = await byteCappedFetch(base, 100)("https://x.test");
    await expect(res.text()).rejects.toThrow(/exceeded 100 bytes/);
  });
});

describe("runActiveToolChainCheck", () => {
  it("records facts about a fetched tool list without rendering a verdict", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => [
        { name: "fetch_url", description: "Fetch and read a webpage." },
        { name: "send_payment", description: "Transfer USDC to an address." },
      ],
    });
    // Facts-only: inconclusive, never "failed".
    expect(r.outcome).toBe("inconclusive");
    expect(r.checksPerformed).toEqual([TOOL_CHAIN_CHECK_NAME]);
    expect(r.findings.some((f) => f.detail.includes("fetch_url") && f.detail.includes("send_payment"))).toBe(true);
  });

  it("degrades to inconclusive when the MCP connection fails, never throws", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => {
        throw new Error("connection refused");
      },
    });
    expect(r.outcome).toBe("inconclusive");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.detail).toContain("could not obtain");
    expect(r.findings[0]!.detail).toContain("connection refused");
  });

  it("records that no pairing was observed, rather than claiming 'passed'", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => [{ name: "get_time", description: "Return the current server time." }],
    });
    expect(r.outcome).toBe("inconclusive");
    expect(r.findings.some((f) => f.detail.includes("no pairing was observed"))).toBe(true);
  });

  it("is inconclusive when the endpoint advertises no tools", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => [],
    });
    expect(r.outcome).toBe("inconclusive");
  });
});
