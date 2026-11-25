import { useState, type KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";

import { Tilt } from "@/components/home/cinema";
import type { VerifiedFinding } from "@/data/verified-finds";

/**
 * One Verified Find coin: tilts toward the pointer (reuses Tilt from cinema.tsx, the same mechanic as the homepage offer tiles), and flips on
 * click or Enter/Space to show the facts on the back. The front never claims more than the project name and tier; the hard facts (CVE, GHSA
 * id, severity, date, link) only ever live on the back, next to their source.
 */
export function FindingCoin({ finding, linkLabel, flipHint }: { finding: VerifiedFinding; linkLabel: string; flipHint: string }) {
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
    <Tilt className="coin-tilt">
      <div
        className="coin"
        data-tier={finding.tier}
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
            <span className="coin-tier-label">{finding.tier}</span>
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
