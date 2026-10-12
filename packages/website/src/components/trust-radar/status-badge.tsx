import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/i18n/context";
import type { TrustRadarStatus } from "@/data/trust-radar-entries";

// The status key is an identifier, not a claim: "confirmed-safe" is what the
// attester returns for a check where nothing failed. The LABEL is what a reader
// actually sees, and it deliberately says only that, because a passed check can
// never prove a server is safe. Keep the two apart when editing either one.
const VISUALS: Record<TrustRadarStatus, { variant: "green" | "yellow" | "red"; Icon: LucideIcon }> = {
  "confirmed-safe": { variant: "green", Icon: ShieldCheck },
  "open-unclear": { variant: "yellow", Icon: ShieldQuestion },
  "self-declared-unsafe": { variant: "red", Icon: ShieldAlert },
};

export function StatusBadge({ status }: { status: TrustRadarStatus }) {
  const { t } = useLocale();
  const { variant, Icon } = VISUALS[status];
  const labels: Record<TrustRadarStatus, string> = {
    "confirmed-safe": t.trustRadar.badges.checksPassed,
    "open-unclear": t.trustRadar.badges.openUnclear,
    "self-declared-unsafe": t.trustRadar.badges.selfDeclaredUnsafe,
  };

  return (
    <Badge variant={variant}>
      <Icon className="size-3" aria-hidden="true" />
      {labels[status]}
    </Badge>
  );
}
