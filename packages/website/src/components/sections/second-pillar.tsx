import { ArrowRight } from "lucide-react";

import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/i18n/context";

export function SecondPillar() {
  const { t, locale } = useLocale();
  // The self-check page is served under the same locale prefix as the rest of
  // the site, so a Dutch visitor stays Dutch when they follow this button.
  const checkHref = locale === "en" ? "/en/check" : "/check";

  return (
    <Section id="controle" index="04" eyebrow={t.secondPillar.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.secondPillar.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.secondPillar.body}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {t.secondPillar.cards.map((card) => (
          <Card key={card.title}>
            <CardTitle>{card.title}</CardTitle>
            <CardContent className="text-muted-foreground">{card.body}</CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 rounded-lg border border-rule-yellow/30 bg-rule-yellow-soft p-4 text-sm leading-relaxed text-foreground/80">
        {t.secondPillar.honestNote}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <a
          href={checkHref}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 font-mono text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t.secondPillar.ctaLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
        <span className="font-mono text-xs text-muted-foreground">{t.secondPillar.ctaNote}</span>
      </div>
    </Section>
  );
}
