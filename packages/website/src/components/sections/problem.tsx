import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/i18n/context";

export function Problem() {
  const { t } = useLocale();

  return (
    <Section id="probleem" index="01" eyebrow={t.problem.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.problem.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.problem.body}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {t.problem.cards.map((card) => (
          <Card key={card.title}>
            <CardTitle>{card.title}</CardTitle>
            <CardContent className="text-muted-foreground">{card.body}</CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
