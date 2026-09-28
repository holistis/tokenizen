import { useMemo } from "react";

import { CopyButton } from "@/components/copy-button";
import type { TrustRadarEntry } from "@/data/trust-radar-entries";
import { generateTrustBadgeSnippet } from "@/lib/trust-badge";

/**
 * Renders nothing for anything but a "confirmed-safe" entry — the hook still
 * runs on every render so it never becomes a conditional hook call.
 */
export function BadgeSnippet({ entry }: { entry: TrustRadarEntry }) {
  const snippet = useMemo(() => {
    if (entry.status !== "confirmed-safe") return null;
    return generateTrustBadgeSnippet(entry);
  }, [entry]);

  if (!snippet) return null;

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-muted-foreground">{snippet}</code>
      <CopyButton value={snippet} copyLabel="Copy badge snippet" copiedLabel="Copied" />
    </div>
  );
}
