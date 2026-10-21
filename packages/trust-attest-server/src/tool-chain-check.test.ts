import { describe, it, expect } from "vitest";
import { analyzeToolChains, TOOL_CHAIN_CHECK_NAME } from "./tool-chain-check.js";

describe("analyzeToolChains (facts-only, renders no verdict)", () => {
  it("is inconclusive with one finding when no tools are provided", () => {
    const r = analyzeToolChains([]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.checksPerformed).toEqual([TOOL_CHAIN_CHECK_NAME]);
    expect(r.findings).toHaveLength(1);
  });

  it("records a source-to-sink capability pairing as a fact, never as a verdict", () => {
    const r = analyzeToolChains([
      { name: "fetch_url", description: "Fetch and read the content of a webpage." },
      { name: "send_payment", description: "Transfer USDC to an address." },
    ]);
    // Facts-only: the outcome is always inconclusive, never "failed".
    expect(r.outcome).toBe("inconclusive");
    const pairing = r.findings.find(
      (f) => f.detail.includes("fetch_url") && f.detail.includes("send_payment"),
    );
    expect(pairing).toBeDefined();
    expect(pairing!.outcome).toBe("inconclusive");
    // Records the absence of a confirmation phrase as a fact, not a verdict.
    expect(pairing!.detail).toContain("no confirmation-gate phrase");
    // No safe/unsafe verdict language.
    expect(pairing!.detail.toLowerCase()).not.toContain("risky");
    expect(pairing!.detail.toLowerCase()).not.toContain("could steer");
  });

  it("records a single tool that is both a source and a sink as a fact", () => {
    const r = analyzeToolChains([
      { name: "run_goal_in_browser", description: "Browse to a page and submit actions on it." },
    ]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.findings.some((f) => f.detail.includes("BOTH") && f.detail.includes("run_goal_in_browser"))).toBe(true);
  });

  it("records the presence of a confirmation-gate phrase as a fact (still no verdict)", () => {
    const r = analyzeToolChains([
      { name: "read_inbox", description: "Read the user's email inbox." },
      {
        name: "wire_funds",
        description: "Send money. Requires the user's direct confirmation before any transfer.",
      },
    ]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.findings.every((f) => f.outcome === "inconclusive")).toBe(true);
    expect(r.findings.some((f) => f.detail.includes("confirmation-gate phrase"))).toBe(true);
  });

  it("records that no source-to-sink pairing was observed, rather than claiming 'passed'", () => {
    const r = analyzeToolChains([
      { name: "get_time", description: "Return the current server time." },
      { name: "ping", description: "Reply with pong." },
    ]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.findings.some((f) => f.detail.includes("no pairing was observed"))).toBe(true);
  });

  it("tolerates tools with no description", () => {
    const r = analyzeToolChains([{ name: "mystery_tool" }]);
    expect(r.outcome).toBe("inconclusive");
    expect(r.checksPerformed).toEqual([TOOL_CHAIN_CHECK_NAME]);
  });

  it("bounds work on an attacker-sized tool list and records the truncation as a fact", () => {
    // 600 tools, every one both a source and a sink: without bounds this is a
    // 600x600 pairing explosion. The DoS caps must hold: at most 500 tools
    // classified and at most 100 pairing findings, with both truncations
    // recorded.
    const many = Array.from({ length: 600 }, (_, i) => ({
      name: `fetch_and_send_${i}`,
      description: "Fetch a webpage and send the result.",
    }));
    const r = analyzeToolChains(many);
    expect(r.outcome).toBe("inconclusive");
    // 100 pairing findings + a pair-truncation note + a tool-count-truncation note.
    expect(r.findings.length).toBeLessThanOrEqual(102);
    expect(r.findings.some((f) => f.detail.includes("only the first 100 were recorded"))).toBe(true);
    expect(r.findings.some((f) => f.detail.includes("only the first 500 were classified"))).toBe(true);
  });
});
