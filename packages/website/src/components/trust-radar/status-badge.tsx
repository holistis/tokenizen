import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { TrustRadarStatus } from "@/data/trust-radar-entries";

const STATUS_CONFIG: Record<TrustRadarStatus, { label: string; variant: "green" | "yellow" | "red"; Icon: LucideIcon }> = {
  "confirmed-safe": { label: "Confirmed safe", variant: "green", Icon: ShieldCheck },
  "open-unclear": { label: "Open, unclear", variant: "yellow", Icon: ShieldQuestion },
  "self-declared-unsafe": { label: "Self-declared unsafe", variant: "red", Icon: ShieldAlert },
};

export function StatusBadge({ status }: { status: TrustRadarStatus }) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
