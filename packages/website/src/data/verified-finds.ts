import type { Locale } from "./home-copy";

/**
 * Tiers for a Verified Find coin. Bronze: a merged pull request, no security angle. Silver: a published security advisory, no CVE assigned.
 * Gold: a CVE assigned, or the project is widely known. Platinum: credited by a top-tier security research firm (for example Trail of Bits).
 * The tier only changes which CSS gradient a coin gets (see .coin[data-tier=...] in index.css); add a new finding here, the coin template
 * does the rest.
 */
export type FindingTier = "bronze" | "silver" | "gold" | "platinum";

export interface VerifiedFinding {
  id: string;
  tier: FindingTier;
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
    project: "pydantic-ai",
    facts: ["CVE-2026-136642", "GHSA-gm2p-369w-rcgv", "Severity Medium, CVSS 6.5", "Published 25 November 2026"],
    href: "https://github.com/pydantic/pydantic-ai/security/advisories/GHSA-gm2p-369w-rcgv",
  },
];

export const VERIFIED_FINDS_COPY: Record<Locale, { eyebrow: string; heading: string; intro: string; linkLabel: string; flipHint: string }> = {
  en: {
    eyebrow: "Verified Finds",
    heading: "Confirmed, not just claimed.",
    intro: "Each coin is one publicly published, credited security finding. Click a coin to see the record behind it.",
    linkLabel: "Open the advisory",
    flipHint: "Click to flip",
  },
  nl: {
    eyebrow: "Bevestigde vondsten",
    heading: "Bevestigd, niet alleen beweerd.",
    intro: "Elke munt is een publiek gepubliceerde, bij naam gecrediteerde beveiligingsvondst. Klik op een munt voor het bewijs erachter.",
    linkLabel: "Open het advisory",
    flipHint: "Klik om om te draaien",
  },
};
