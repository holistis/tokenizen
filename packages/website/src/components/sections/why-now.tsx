import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

const REASONS: Array<{ date: string; title: string; body: string }> = [
  {
    date: "19 juli 2026",
    title: "EU Digital Product Passport verplicht",
    body: "Machineleesbaar asset-paspoort wordt de norm: financiën-vrij, maar wel bewijs over herkomst en staat van een asset.",
  },
  {
    date: "2 augustus 2026",
    title: "EU AI Act, Artikel 14 live",
    body: "Proof-of-authorization voor autonome systemen: een autonoom handelende agent moet aantoonbaar bevoegd zijn.",
  },
  {
    date: "doorlopend",
    title: "x402 en Google AP2 laten één vraag open",
    body: "Coinbase (nu Linux Foundation) en Google bouwden de betaal- en autorisatie-rails. “Wat koop ik precies, en mag de verkoper dit leveren?” blijft onbeantwoord.",
  },
];

export function WhyNow() {
  return (
    <Section id="waarom-nu" index="02" eyebrow="Waarom nu">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Drie ontwikkelingen vallen dit jaar samen.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Uit negen domeinscans (augustus 2026) volgt hetzelfde patroon: de koperskant van de agent-economie krijgt
        alle aandacht. De verkoperskant en het object zelf (het bewijs) blijft onderbelicht, precies op het
        moment dat regelgeving en betaalrails er wél om vragen.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {REASONS.map((reason) => (
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
