import { describe, it, expect, vi, afterEach } from "vitest";
import { errorResult, logEvent, requestKind } from "./http-server.js";

// The request log exists so that, afterwards, somebody can tell whether a route was misused. It must never hold what a caller sent:
// no address, no parameter, no IP, no secret. These tests keep it that way.

function captured(run: () => void): string[] {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    run();
    return spy.mock.calls.map((c) => String(c[0]));
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe("requestKind reads only the tool name or the method, nothing else of the body", () => {
  it("returns the tool name of a tools/call", () => {
    expect(requestKind({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_delivery_history", arguments: { sellerAddress: "0x" + "a".repeat(40) } } })).toEqual({ tool: "get_delivery_history" });
  });

  it("returns only the method for other calls", () => {
    expect(requestKind({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toEqual({ method: "tools/list" });
    expect(requestKind({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({ method: "notifications/initialized" });
  });

  it("never logs a tool name that is not a plain name, so a hostile name cannot smuggle text into the log", () => {
    for (const name of ["get_x\nfake log line", "http://169.254.169.254/latest", "a".repeat(65), "tool name with spaces", "0xAbC"]) {
      expect(requestKind({ method: "tools/call", params: { name } })).toEqual({ method: "tools/call" });
    }
  });

  it("answers unknown for a body that is not a call at all", () => {
    for (const body of [undefined, null, "text", 5, [], [{ method: "tools/call" }], { method: 7 }, { method: "tools/call; drop" }]) {
      expect(requestKind(body)).toEqual({ method: "unknown" });
    }
  });
});

describe("a refusal by the outbound guard shows in the log as a refusal, without the address", () => {
  it("logs guard_refused true and nothing of the address for a link-local target", () => {
    const lines = captured(() => {
      errorResult("address 169.254.169.254 is link-local and not publicly routable");
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).guard_refused).toBe(true);
    expect(lines[0]).not.toContain("169.254");
    expect(lines[0]).not.toContain("link-local");
  });

  it("logs guard_refused false for an ordinary error, again without its text", () => {
    const lines = captured(() => {
      errorResult("sellerAddress must be a 0x-prefixed 20-byte address: 0xdeadbeef");
    });
    expect(JSON.parse(lines[0]).guard_refused).toBe(false);
    expect(lines[0]).not.toContain("0xdeadbeef");
  });

  it("still returns the error to the caller unchanged", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = errorResult("something failed");
    spy.mockRestore();
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe("Error: something failed");
  });
});

describe("logEvent writes one line of JSON with the time, the kind of event and the fields given", () => {
  it("is a single parseable line with only the expected keys", () => {
    const lines = captured(() => logEvent("request", { tool: "get_delivery_history" }));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(Object.keys(parsed).sort()).toEqual(["event", "t", "tool"]);
    expect(parsed.event).toBe("request");
    expect(Number.isNaN(Date.parse(parsed.t))).toBe(false);
  });

  it(
    "truncates a string field far longer than any real value logged today, instead of writing it unbounded — found by muraqib-al-khasm's review, 13 nov 2026 (settlement.transaction/network/payer come from the facilitator, typed as a bare string with no runtime length check anywhere in @x402)",
    () => {
      const huge = "x".repeat(5000);
      const lines = captured(() => logEvent("record_delivery_settled", { settlementTx: huge }));
      const parsed = JSON.parse(lines[0]);
      expect(parsed.settlementTx.length).toBeLessThan(600);
      expect(parsed.settlementTx).toContain("(truncated)");
      expect(parsed.settlementTx.startsWith("x")).toBe(true);
    },
  );

  it("never truncates a short, realistic field (a tx hash, a network id, a uuid)", () => {
    const lines = captured(() =>
      logEvent("record_delivery_settled", { settlementTx: "0x" + "a".repeat(64), settlementNetwork: "eip155:8453" }),
    );
    const parsed = JSON.parse(lines[0]);
    expect(parsed.settlementTx).toBe("0x" + "a".repeat(64));
    expect(parsed.settlementNetwork).toBe("eip155:8453");
  });
});
