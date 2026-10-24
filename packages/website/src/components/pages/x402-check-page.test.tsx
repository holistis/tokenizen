import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { X402CheckPage, X402CheckResultView, reproduceCommand } from "@/components/pages/x402-check-page";
import type { X402CheckResult } from "@/lib/check-api";

const LONG_DASHES = /[–—]/;

const LEVELS = [
  { level: 0, name: "asks for payment the way x402 says", requirement: "r0", status: "pass", evidence: "exact on eip155:8453, 1000 to 0x2888" },
  { level: 1, name: "declares the offer-receipt extension", requirement: "r1", status: "fail", evidence: "no offer-receipt in extensions (no extensions)" },
  { level: 2, name: "signs its offer, and the signature verifies", requirement: "r2", status: "not_evaluated", evidence: "" },
  { level: 3, name: "level three", requirement: "r3", status: "not_measured", evidence: "needs a real settlement, not attempted" },
] as X402CheckResult["ladder"]["levels"];

function sample(overrides: Partial<X402CheckResult> = {}): X402CheckResult {
  return {
    ok: true,
    cached: false,
    url: "https://seller.example.com/api/route",
    method: "POST",
    measuredAt: "2026-10-24T12:00:00.000Z",
    summary: "It asks for payment in a form a buyer client accepts. On the receipt ladder it reaches level 0.",
    buyerCheck: { status: "pass", httpStatus: 402, source: "header", x402Version: 2, problems: [], warnings: [] },
    ladder: { highestLevel: 0, levels: LEVELS, methodRetried: null, definition: "https://github.com/holistis/agent-receipt-verify/blob/main/CONFORMANCE.md" },
    requestsMade: 1,
    limits: ["This check never pays.", "Nothing is stored on our side."],
    ...overrides,
  };
}

describe("X402CheckPage", () => {
  const html = renderToStaticMarkup(<X402CheckPage />);

  it("says up front that it never pays and stores nothing", () => {
    expect(html).toContain("never pays");
    expect(html).toContain("We store nothing");
  });

  it("offers a URL field and both methods, POST first", () => {
    expect(html).toContain('id="x402-url"');
    expect(html).toContain("POST (the usual case)");
    expect(html).toContain("GET");
    expect(html).toContain('name="x402-method"');
  });

  it("uses no long dashes and no double asterisks in text for readers", () => {
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("**");
  });

  it("links to the open source tool and its ladder definition only over https", () => {
    expect(html).toContain("https://github.com/holistis/agent-receipt-verify");
    expect(html).not.toMatch(/href="http:\/\//);
  });
});

describe("X402CheckResultView", () => {
  it("shows the summary, both checks and every level, and calls the unpaid levels not measured", () => {
    const html = renderToStaticMarkup(<X402CheckResultView result={sample()} />);
    expect(html).toContain("reaches level 0");
    expect(html).toContain("Would a buyer client accept your payment request?");
    expect(html).toContain("read from the header");
    expect(html).toContain("x402 version 2");
    for (const n of [0, 1, 2, 3]) expect(html).toContain(`Level ${n}`);
    expect(html).toContain("not measured");
    expect(html).toContain("not reached");
    expect(html).toContain("which is not the same as failed");
    expect(html).not.toMatch(LONG_DASHES);
  });

  it("lists the schema problems when the buyer check fails", () => {
    const html = renderToStaticMarkup(
      <X402CheckResultView
        result={sample({
          buyerCheck: { status: "fail", httpStatus: 402, source: "body", x402Version: null, problems: ["resource.serviceName: Too big: expected string to have <=32 characters"], warnings: [] },
        })}
      />,
    );
    expect(html).toContain("serviceName");
    expect(html).toContain(">fail<");
  });

  it("says when the second method was used and when the answer is cached", () => {
    const html = renderToStaticMarkup(
      <X402CheckResultView result={sample({ cached: true, requestsMade: 2, ladder: { ...sample().ladder, methodRetried: { from: "POST", to: "GET", firstStatus: 405 } } })} />,
    );
    expect(html).toContain("answered 405 to POST");
    expect(html).toContain("two minute cache");
    expect(html).toContain("2 requests");
  });

  it("renders text that came from the endpoint as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const levels = sample().ladder.levels.map((l, i) => (i === 0 ? { ...l, evidence: hostile } : l));
    const html = renderToStaticMarkup(
      <X402CheckResultView
        result={sample({
          ladder: { ...sample().ladder, levels },
          buyerCheck: { status: "fail", httpStatus: 402, source: "body", x402Version: null, problems: [hostile], warnings: [hostile] },
        })}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });

  it("hands out a command whose quoting cannot be broken out of by the URL", () => {
    expect(reproduceCommand("https://a.example.com/x")).toBe("npx -y agent-receipt-verify 'https://a.example.com/x'");
    expect(reproduceCommand("https://a.example.com/x'; rm -rf ~; echo '")).not.toContain("'; rm");
    expect(reproduceCommand("https://a.example.com/it's")).toContain("it%27s");
  });
});
