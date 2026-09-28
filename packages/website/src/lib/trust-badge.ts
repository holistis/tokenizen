import type { TrustRadarEntry } from "@/data/trust-radar-entries";

const BADGE_TEXT = "Trust checked by tokenizen.nl";
const BADGE_WIDTH = 190;
const BADGE_HEIGHT = 20;

/** Works in both the browser (btoa) and vitest's Node environment (Buffer). */
function toBase64(input: string): string {
  if (typeof btoa === "function") {
    return btoa(input);
  }
  return Buffer.from(input, "utf-8").toString("base64");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Raw, self-contained inline SVG markup for the "Trust checked by
 * tokenizen.nl" badge. No external image request and no backend needed, so
 * the badge keeps rendering on an owner's site even if tokenizen.nl itself
 * is briefly unreachable.
 */
export function buildTrustBadgeSvg(): string {
  const label = escapeXml(BADGE_TEXT);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" role="img" aria-label="${label}">` +
    `<rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" rx="3" fill="#0f172a"/>` +
    `<text x="${BADGE_WIDTH / 2}" y="14" fill="#4ade80" font-family="ui-monospace,Menlo,monospace" font-size="11" text-anchor="middle">${label}</text>` +
    `</svg>`
  );
}

export interface TrustBadgeSnippetOptions {
  /** Defaults to the production site; override for staging/preview builds. */
  baseUrl?: string;
}

/**
 * Generates the embeddable HTML snippet an owner can paste on their own
 * site. Only issued for a "confirmed-safe" entry (the server's own
 * discovery response rejected the request until credentials were given) —
 * an open or self-declared-unsafe server has nothing to display a badge
 * for, so this throws rather than silently issuing one.
 */
export function generateTrustBadgeSnippet(entry: TrustRadarEntry, options: TrustBadgeSnippetOptions = {}): string {
  if (entry.status !== "confirmed-safe") {
    throw new Error(
      `generateTrustBadgeSnippet: "${entry.name}" has status "${entry.status}", not "confirmed-safe". ` +
        "A badge is only issued for a confirmed-safe server.",
    );
  }

  const baseUrl = options.baseUrl ?? "https://tokenizen.nl";
  const svgDataUri = `data:image/svg+xml;base64,${toBase64(buildTrustBadgeSvg())}`;
  const targetUrl = `${baseUrl}/trust-radar#${encodeURIComponent(entry.domain)}`;

  return `<a href="${targetUrl}" target="_blank" rel="noopener noreferrer"><img src="${svgDataUri}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" alt="${BADGE_TEXT}" /></a>`;
}
