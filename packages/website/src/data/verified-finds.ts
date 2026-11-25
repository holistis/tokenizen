import type { Locale } from "./home-copy";

/**
 * Tiers for a Verified Find. Bronze: a merged pull request, no security angle. Silver: a published security advisory, no CVE assigned.
 * Gold: a CVE assigned, or the project is widely known. Platinum: credited by a top-tier security research firm (for example Trail of Bits).
 * The tier is kept for the record and shows up in the facts on the back; it no longer changes the coin's front color, so the wall reads as
 * one equal set of confirmed findings rather than a ranking. At most one finding should be `featured`, shown larger above the row.
 */
export type FindingTier = "bronze" | "silver" | "gold" | "platinum";

export interface VerifiedFinding {
  id: string;
  tier: FindingTier;
  /** Shown larger, above the row, instead of inside the equal grid. At most one finding should set this. */
  featured?: boolean;
  /** Short name on the coin face. */
  project: string;
  /** Hard facts shown on the back, in order. Keep these verified and dated; never list a finding that is not yet publicly confirmed. */
  facts: string[];
  href: string;
}

export const VERIFIED_FINDS: VerifiedFinding[] = [
  {
    id: "pydantic-ai-2026-11-25",
    tier: "gold",
    featured: true,
    project: "pydantic-ai",
    facts: ["CVE-2026-136642", "GHSA-gm2p-369w-rcgv", "Severity Medium, CVSS 6.5", "Published 25 November 2026"],
    href: "https://github.com/pydantic/pydantic-ai/security/advisories/GHSA-gm2p-369w-rcgv",
  },
  {
    id: "puppeteer-2026-11-13",
    tier: "gold",
    project: "Puppeteer",
    facts: ["3 bugs fixed: cookies, waitForSelector, abort signal", "Pull requests 15790, 15791, 15792", "Merged within 14 hours", "95,828 stars"],
    href: "https://github.com/puppeteer/puppeteer/pull/15790",
  },
  {
    id: "playwright-2026",
    tier: "gold",
    project: "Playwright",
    facts: ["Gap found in CI guidance, issue 42533", "Fixed by a maintainer the next day, pull request 42563", "Microsoft-maintained"],
    href: "https://github.com/microsoft/playwright/pull/42563",
  },
  {
    id: "autoharness-2026-10-28",
    tier: "silver",
    project: "autoharness",
    facts: ["Secret redaction gap, issue 277", "Fix merged, pull request 278", "Merged 28 October 2026", "10,442 stars"],
    href: "https://github.com/tigerless-labs/autoharness/pull/278",
  },
  {
    id: "mcp-inspector-2026-11-18",
    tier: "silver",
    project: "MCP Inspector",
    facts: ["Control characters leaking to the terminal, issue 2984", "Fixed by the maintainer, pull request 3015", "Merged 4 days after the report", "11,331 stars"],
    href: "https://github.com/modelcontextprotocol/inspector/issues/2984",
  },
  {
    id: "nirium-2026",
    tier: "silver",
    project: "Nirium",
    facts: ["Fail-open bug in verify-audit-cid, pull request 396", "21 test cases adopted into their CI, pull request 398", "Cited in an added signature requirement, pull request 399"],
    href: "https://github.com/nirium-protocol/nirium/pull/396",
  },
  {
    id: "x402-core-2026",
    tier: "silver",
    project: "x402 protocol",
    facts: ["A 402 response overwrote a route's own extensions declaration", "Fixed in the core library", "Merged by the maintainers, pull request 3826"],
    href: "https://github.com/x402-foundation/x402/pull/3826",
  },
  {
    id: "nginx-ui-2026-10-22",
    tier: "silver",
    project: "nginx-ui",
    facts: ["GHSA-qpxq-mr8m-wcf2", "Severity High", "Published 22 October 2026", "Fixed in 2.9.0"],
    href: "https://github.com/0xJacky/nginx-ui/security/advisories/GHSA-qpxq-mr8m-wcf2",
  },
  {
    id: "pymc-marketing-2026-09-10",
    tier: "silver",
    project: "pymc-marketing",
    facts: ["GHSA-72xh-gfpr-v9hx", "Severity High", "Published 10 September 2026"],
    href: "https://github.com/pymc-labs/pymc-marketing/security/advisories/GHSA-72xh-gfpr-v9hx",
  },
  {
    id: "langroid-2026-11-21",
    tier: "silver",
    project: "langroid",
    facts: ["GHSA-599m-2rw9-c28w", "Severity Low", "Published 21 November 2026", "Fixed in 0.70.3"],
    href: "https://github.com/langroid/langroid/security/advisories/GHSA-599m-2rw9-c28w",
  },
  {
    id: "velocity-2026-11-22",
    tier: "bronze",
    project: "Velocity",
    facts: ["Broken UK sanctions source, issue 119", "Fixed, pull request 126", "Thanked in the v1.3.0 release notes", "693 ships now matched, up from 81"],
    href: "https://github.com/AndrewCTF/velocity/releases/tag/v1.3.0",
  },
  {
    id: "shell-mcp-2026-09-18",
    tier: "silver",
    project: "shell-mcp",
    facts: ["find's -exec/-execdir/-ok/-okdir/-delete bypassed the default allowlist", "Fixed, pull request 1", "Merged 18 September 2026", "2 stars"],
    href: "https://github.com/devrelopers/shell-mcp/pull/1",
  },
];

export const VERIFIED_FINDS_COPY: Record<
  Locale,
  { eyebrow: string; heading: string; intro: string; linkLabel: string; flipHint: string; featuredLabel: string }
> = {
  en: {
    eyebrow: "Verified Finds",
    heading: "Confirmed, not just claimed.",
    intro: "Each coin is one publicly published, credited security finding. Click a coin to see the record behind it.",
    linkLabel: "Open the advisory",
    flipHint: "Click to flip",
    featuredLabel: "Most recent",
  },
  nl: {
    eyebrow: "Bevestigde vondsten",
    heading: "Bevestigd, niet alleen beweerd.",
    intro: "Elke munt is een publiek gepubliceerde, bij naam gecrediteerde beveiligingsvondst. Klik op een munt voor het bewijs erachter.",
    linkLabel: "Open het advisory",
    flipHint: "Klik om om te draaien",
    featuredLabel: "Meest recent",
  },
};
