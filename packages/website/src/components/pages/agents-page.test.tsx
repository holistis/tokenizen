import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AGENT_CALL, AGENTS, AgentsPage } from "@/components/pages/offer-pages";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { BILINGUAL_PATHS } from "@/lib/page-head";
import { readableText } from "@/test-utils/readable-text";

import llms from "../../../public/llms.txt?raw";
import sitemap from "../../../public/sitemap.xml?raw";

function render(locale: Locale): string {
  return readableText(
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <AgentsPage />
      </LocaleProvider>,
    ),
  );
}

// Everything on the page was read from the running services on 1 November 2026. These are those facts, pinned, so a change on the page
// that no longer matches what the services say fails here and not in front of a reader.
const FREE_ENDPOINT = "https://api.tokenizen.nl/mcp";
const PAID_ENDPOINT = "https://x402-mcp.tokenizen.nl/mcp";
const FREE_TOOL = "check_github_repo";
const PAID_TOOL = "verify_ownership";
const REGISTRY_NAMES = ["io.github.holistis/capacity-attest", "io.github.holistis/agent-receipt-verify"];

describe("the page for AI agents", () => {
  for (const locale of ["en", "nl"] as const) {
    it(`names both endpoints, both tools and the price in ${locale}`, () => {
      const text = render(locale);
      expect(text).toContain(FREE_ENDPOINT);
      expect(text).toContain(PAID_ENDPOINT);
      expect(text).toContain(FREE_TOOL);
      expect(text).toContain(PAID_TOOL);
      expect(text).toContain(locale === "nl" ? "0,001 dollar" : "0.001 dollar");
    });

    it(`lists the registry names and the limits in ${locale}`, () => {
      const text = render(locale);
      for (const name of REGISTRY_NAMES) expect(text).toContain(name);
      // the limits are stated, and the page never promises safety
      expect(text).toMatch(locale === "nl" ? /geen certificaat/ : /not a certificate/);
      expect(text).not.toMatch(/guarantee|garantie|gegarandeerd|guaranteed/i);
    });

    it(`names every registry entry the page talks about, in the latest wording, in ${locale}`, () => {
      const text = render(locale);
      // read from registry.modelcontextprotocol.io on 1 November 2026 (isLatest true): the free endpoint, the scan and both packages
      for (const name of ["io.github.holistis/cra-check", "io.github.holistis/bug-bounty-intelligence-mcp", ...REGISTRY_NAMES]) expect(text).toContain(name);
      // agent-receipt-verify 0.2.0 had another description; 0.2.1 is the latest
      expect(text).not.toContain("then link the receipt to one on-chain settlement");
      expect(text).not.toContain("naar een betaling op de keten");
    });

    it(`states the limits of the payments honestly in ${locale}`, () => {
      const text = render(locale);
      expect(text).toContain(locale === "nl" ? "gedaan als test" : "made as a test");
      expect(text).toContain(locale === "nl" ? "standaard" : "By default");
      expect(text).toContain(locale === "nl" ? "5 dollar" : "5 dollars");
      expect(text).toContain(locale === "nl" ? "IP-adres" : "IP address");
    });

    it(`has no long dashes and no double asterisks in ${locale}`, () => {
      const text = render(locale);
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toContain("**");
    });

    it(`links to the scan page in the reader's own language in ${locale}`, () => {
      const html = renderToStaticMarkup(
        <LocaleProvider locale={locale}>
          <AgentsPage />
        </LocaleProvider>,
      );
      expect(html).toContain(locale === "nl" ? 'href="/nl/scan"' : 'href="/scan"');
    });
  }

  it("shows one example call that is valid JSON-RPC for the free tool", () => {
    const body = AGENT_CALL.match(/-d '(.+)'$/s)?.[1];
    expect(body).toBeDefined();
    const call = JSON.parse(body as string);
    expect(call.jsonrpc).toBe("2.0");
    expect(call.method).toBe("tools/call");
    expect(call.params.name).toBe(FREE_TOOL);
    expect(call.params.arguments).toEqual({ repo: "holistis/tokenizen" });
    expect(AGENT_CALL).toContain(FREE_ENDPOINT);
    expect(AGENT_CALL).toContain("application/json, text/event-stream");
  });

  it("has the same number of installable packages in both languages, each with a registry name", () => {
    expect(AGENTS.en.installs.map((i) => i.name)).toEqual(REGISTRY_NAMES);
    expect(AGENTS.nl.installs.map((i) => i.name)).toEqual(REGISTRY_NAMES);
  });

  it("is a bilingual page, in the sitemap in both languages and in llms.txt", () => {
    expect(BILINGUAL_PATHS).toContain("/agents");
    expect(sitemap).toContain("<loc>https://tokenizen.nl/agents</loc>");
    expect(sitemap).toContain("<loc>https://tokenizen.nl/nl/agents</loc>");
    expect(llms).toContain("https://tokenizen.nl/agents");
    expect(llms).toContain("two packages in the official MCP registry");
  });

  it("does not claim a discovery file the site does not serve", () => {
    for (const locale of ["en", "nl"] as const) {
      // "well-known file" is how the ownership check works and is fine; a claimed MCP discovery file or server card is not
      expect(render(locale)).not.toMatch(/\.well-known\/mcp|server[- ]card/i);
    }
    expect(llms).not.toMatch(/\.well-known\/mcp/);
  });
});
