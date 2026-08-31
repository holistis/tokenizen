import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

const REASONS: Array<{ date: string; title: string; body: string }> = [
  {
    date: "20 juli 2026",
    title: "EU Digital Product Passport-register live",
    body: "De Europese Commissie opende het DPP-register; verplichte paspoorten volgen gefaseerd per productcategorie (batterijen vanaf feb. 2027). Bewijst dat een machineleesbaar, financiën-vrij asset-paspoort een reële EU-norm wordt, niet dat het nu al overal verplicht is.",
  },
  {
    date: "2 augustus 2026",
    title: "EU AI Act, Artikel 14 in werking",
    body: "Hoog-risico AI-systemen moeten aantoonbaar door mensen te overzien zijn. Dat vraagt om een controleerbaar spoor van wat een autonome agent deed, precies het soort auditeerbaarheid waar Tokenizen op inspeelt, zonder dat wij zelf een Artikel 14-nalevingsclaim doen.",
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
