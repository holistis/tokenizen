import type { ReactNode } from "react";

/**
 * Vertaalstrings mogen `code`-termen bevatten die niet vertaald worden
 * (veldnamen, bestandspaden, "delivered"). Backtick-notatie zodat
 * vertalers de term letterlijk kunnen laten staan zonder JSX te schrijven.
 */
export function withInlineCode(text: string): ReactNode {
  const parts = text.split(/`([^`]+)`/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="font-mono text-foreground">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
