import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/i18n/context";

/**
 * De metingen-sectie.
 *
 * Elke regel draagt een DATUM en een methode, want een cijfer zonder die twee is een
 * bewering. En de regels die tegen ons pleiten staan er met opzet tussen: nul betalende
 * klanten, en honderd mensen die keken zonder te installeren. Een pagina die alleen de
 * goede cijfers toont, is precies de pagina die niemand gelooft.
 */
export function Metingen() {
  const { t } = useLocale();

  return (
    <Section id="metingen" index="09" eyebrow={t.metingen.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.metingen.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.metingen.body}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {t.metingen.rows.map((row) => (
          <Card key={row.title}>
            <Badge variant="neutral" className="w-fit">
              {row.date}
            </Badge>
            <CardTitle>{row.title}</CardTitle>
            <CardContent className="text-muted-foreground">{row.body}</CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.metingen.footer}</p>
    </Section>
  );
}
