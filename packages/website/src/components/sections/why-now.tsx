import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/i18n/context";

export function WhyNow() {
  const { t } = useLocale();

  return (
    <Section id="waarom-nu" index="02" eyebrow={t.whyNow.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.whyNow.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.whyNow.body}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {t.whyNow.reasons.map((reason) => (
          <Card key={reason.title}>
            <Badge variant="neutral" className="w-fit">
              {reason.date}
            </Badge>
            <CardTitle>{reason.title}</CardTitle>
            <CardContent className="text-muted-foreground">{reason.body}</CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
