import { describe, it, expect } from "vitest";
import { runActiveToolChainCheck } from "./fetch-tools.js";
import { TOOL_CHAIN_CHECK_NAME } from "./tool-chain-check.js";

describe("runActiveToolChainCheck", () => {
  it("classifies a fetched tool list: ungated source-to-sink is failed", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => [
        { name: "fetch_url", description: "Fetch and read a webpage." },
        { name: "send_payment", description: "Transfer USDC to an address." },
      ],
    });
    expect(r.outcome).toBe("failed");
    expect(r.checksPerformed).toEqual([TOOL_CHAIN_CHECK_NAME]);
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

  it("passes when the fetched tools have no dangerous chain", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => [{ name: "get_time", description: "Return the current server time." }],
    });
    expect(r.outcome).toBe("passed");
  });

  it("is inconclusive when the endpoint advertises no tools", async () => {
    const r = await runActiveToolChainCheck("https://example.test/mcp", {
      listTools: async () => [],
    });
    expect(r.outcome).toBe("inconclusive");
  });
});
