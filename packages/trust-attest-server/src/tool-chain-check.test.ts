import { describe, it, expect } from "vitest";
import { analyzeToolChains, TOOL_CHAIN_CHECK_NAME } from "./tool-chain-check.js";

describe("analyzeToolChains", () => {
  it("is inconclusive when no tools are provided", () => {
    const r = analyzeToolChains([]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.checksPerformed).toEqual([TOOL_CHAIN_CHECK_NAME]);
    expect(r.findings).toHaveLength(1);
  });

  it("flags a source-to-sink chain with no gate as failed", () => {
    const r = analyzeToolChains([
      { name: "fetch_url", description: "Fetch and read the content of a webpage." },
      { name: "send_payment", description: "Transfer USDC to an address." },
    ]);
    expect(r.outcome).toBe("failed");
    expect(
      r.findings.some((f) => f.detail.includes("fetch_url") && f.detail.includes("send_payment")),
    ).toBe(true);
  });

  it("flags a single tool that is both a source and a sink", () => {
    const r = analyzeToolChains([
      { name: "run_goal_in_browser", description: "Browse to a page and submit actions on it." },
    ]);
    expect(r.outcome).toBe("failed");
  });

  it("downgrades to inconclusive when the sink claims a confirmation gate", () => {
    const r = analyzeToolChains([
      { name: "read_inbox", description: "Read the user's email inbox." },
      {
        name: "wire_funds",
        description: "Send money. Requires the user's direct confirmation before any transfer.",
      },
    ]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.findings.every((f) => f.outcome === "inconclusive")).toBe(true);
  });

  it("passes when there is no source-to-sink chain", () => {
    const r = analyzeToolChains([
      { name: "get_time", description: "Return the current server time." },
      { name: "ping", description: "Reply with pong." },
    ]);
    expect(r.outcome).toBe("passed");
  });

  it("tolerates tools with no description", () => {
    const r = analyzeToolChains([{ name: "mystery_tool" }]);
    expect(["passed", "inconclusive", "failed"]).toContain(r.outcome);
    expect(r.checksPerformed).toEqual([TOOL_CHAIN_CHECK_NAME]);
  });
});
