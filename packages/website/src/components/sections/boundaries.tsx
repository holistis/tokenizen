import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

import { Section } from "@/components/section";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/context";

const ICONS = [CheckCircle2, ShieldAlert, XCircle] as const;
const KEYS = ["green", "yellow", "red"] as const;

const STYLES: Record<(typeof KEYS)[number], { border: string; bg: string; text: string }> = {
  green: { border: "border-rule-green/30", bg: "bg-rule-green-soft", text: "text-rule-green" },
  yellow: { border: "border-rule-yellow/30", bg: "bg-rule-yellow-soft", text: "text-rule-yellow" },
  red: { border: "border-rule-red/30", bg: "bg-rule-red-soft", text: "text-rule-red" },
};

export function Boundaries() {
  const { t } = useLocale();

  return (
    <Section id="ontwerpgrenzen" index="05" eyebrow={t.boundaries.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.boundaries.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.boundaries.body}</p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {t.boundaries.columns.map((column, i) => {
          const key = KEYS[i];
          const Icon = ICONS[i];
          const style = STYLES[key];
          return (
            <div key={column.label} className={cn("flex flex-col gap-4 rounded-lg border p-5", style.border, style.bg)}>
              <div className={cn("flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide", style.text)}>
                <Icon className="size-4" aria-hidden="true" />
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
