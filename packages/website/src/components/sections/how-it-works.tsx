import { ArrowRight, FileCheck2, History, PenLine, Wallet } from "lucide-react";

import { Section } from "@/components/section";
import { useLocale } from "@/i18n/context";

const ICONS = [Wallet, PenLine, FileCheck2, History];

export function HowItWorks() {
  const { t } = useLocale();

  return (
    <Section id="hoe-het-werkt" index="04" eyebrow={t.howItWorks.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.howItWorks.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.howItWorks.body}</p>

      <ol className="mt-10 grid gap-4 md:grid-cols-4">
        {t.howItWorks.steps.map((step, i) => {
          const Icon = ICONS[i];
          return (
            <li key={step.title} className="relative flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-md bg-muted text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <p className="font-display text-base font-semibold leading-snug">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {i < t.howItWorks.steps.length - 1 ? (
                <ArrowRight
                  aria-hidden="true"
                  className="absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 text-muted-foreground md:block"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
