import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

import { Section } from "@/components/section";
import { cn } from "@/lib/utils";

interface Column {
  key: "green" | "yellow" | "red";
  label: string;
  icon: typeof CheckCircle2;
  items: string[];
}

const COLUMNS: Column[] = [
  {
    key: "green",
    label: "Wel: bouwen we",
    icon: CheckCircle2,
    items: [
      "Verificatie van levering (delivered: yes/no/partial + evidence hash)",
      "Append-only audit-trail, content-addressed, niet achteraf te wijzigen",
      "MCP-tools om vóór betaling de geschiedenis van een verkoper te checken",
      "Echte capaciteitshandel: GPU-uren, opslag, API-credits, bandbreedte",
    ],
  },
  {
    key: "yellow",
    label: "Met guardrail",
    icon: ShieldAlert,
    items: [
      "Settlement is spot-only, geen termijn- of derivatenconstructie",
      "Credits zijn inwisselbare vouchers voor capaciteit, geen verhandelbaar instrument",
      "Bewijsmateriaal wordt als hash opgeslagen, niet als data zelf",
    ],
  },
  {
    key: "red",
    label: "Nooit: hardcoded uitgesloten",
    icon: XCircle,
    items: [
      "Geen eigen token of munt",
      "Geen leningen",
      "Geen rente-op-betalingen",
      "Geen factoring / invoice-financing",
      "Geen yield-producten",
    ],
  },
];

const STYLES: Record<Column["key"], { border: string; bg: string; text: string }> = {
  green: { border: "border-halal-green/30", bg: "bg-halal-green-soft", text: "text-halal-green" },
  yellow: { border: "border-halal-yellow/30", bg: "bg-halal-yellow-soft", text: "text-halal-yellow" },
  red: { border: "border-halal-red/30", bg: "bg-halal-red-soft", text: "text-halal-red" },
};

export function HalalLine() {
  return (
    <Section id="halal-lijn" index="05" eyebrow="De halal-lijn">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Bewust géén token, géén rente, géén lening.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Dit is geen marketing-truc. Het is een principiële keuze (formele sharia-toetsing) én een strategische:
        het houdt Tokenizen buiten de zwaarst gereguleerde en meest gehypte hoek van crypto. Sharia-status is
        expliciet, niet weggemoffeld.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => {
          const style = STYLES[column.key];
          return (
            <div key={column.key} className={cn("flex flex-col gap-4 rounded-lg border p-5", style.border, style.bg)}>
              <div className={cn("flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide", style.text)}>
                <column.icon className="size-4" aria-hidden="true" />
                {column.label}
              </div>
              <ul className="flex flex-col gap-2.5">
                {column.items.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
