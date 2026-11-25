import { useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Github } from "lucide-react";

import { Tilt } from "@/components/home/cinema";
import type { VerifiedFinding } from "@/data/verified-finds";

/**
 * One Verified Find coin: tilts toward the pointer (reuses Tilt from cinema.tsx, the same mechanic as the homepage offer tiles), and flips on
 * click or Enter/Space to show the facts on the back. Every coin in the row shares the same front styling, regardless of tier, so the wall
 * reads as one equal set of confirmed findings rather than a ranking; `finding.tier` only ever shows up in the facts on the back. A coin
 * marked `featured` renders larger with its own finish, and `featuredLabel` names why it stands apart (e.g. "Most recent") rather than
 * implying the rest are worth less.
 */
export function FindingCoin({
  finding,
  linkLabel,
  flipHint,
  featuredLabel,
}: {
  finding: VerifiedFinding;
  linkLabel: string;
  flipHint: string;
  featuredLabel?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  function toggle() {
    setFlipped((v) => !v);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <Tilt className="coin-tilt" data-featured={finding.featured ? "true" : undefined}>
      <div
        className="coin"
        data-tier={finding.tier}
        data-featured={finding.featured ? "true" : undefined}
        data-flipped={flipped}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${finding.project}. ${flipHint}`}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <div className="coin-inner">
          <div className="coin-face coin-face--front">
            <span aria-hidden="true" className="coin-shine" />
            {finding.featured && featuredLabel ? <span className="coin-featured-label">{featuredLabel}</span> : null}
            <span className="coin-project-name font-display">{finding.project}</span>
          </div>
          <div className="coin-face coin-face--back">
            {finding.facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
            <a
              href={finding.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex items-center gap-1"
            >
              {linkLabel}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </Tilt>
  );
}

/**
 * The row never grows past 10 regular coins (see VerifiedFindsScene): once there are more
 * confirmed findings than that, the oldest ones fold into this one coin instead of a longer
 * and longer row. Same gold material and shape as a regular coin, no flip, links straight to
 * the full, growing list on the profile.
 */
export function MoreFindingsCoin({ label }: { label: string }) {
  return (
    <Tilt className="coin-tilt">
      <a href="https://github.com/holistis" target="_blank" rel="noreferrer noopener" className="coin" aria-label={label}>
        <div className="coin-face coin-face--front">
          <span aria-hidden="true" className="coin-shine" />
          <Github className="size-6" aria-hidden="true" />
          <span className="coin-project-name font-display">{label}</span>
        </div>
      </a>
    </Tilt>
  );
}
