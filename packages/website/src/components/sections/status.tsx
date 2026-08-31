import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

const CHECKPOINTS: Array<{ title: string; body: string }> = [
  {
    title: "Eerste externe clone/install",
    body: "Iemand buiten dit project die de repository kloont en de demo draait, zonder dat wij het voordoen.",
  },
  {
    title: "Eerste externe agent-integratie",
    body: "Een agent van een andere partij die record_delivery of get_delivery_history daadwerkelijk aanroept.",
  },
  {
    title: "Eerste npm-publicatie",
    body: "Zodra de MVP-fase voorbij is en er expliciet groen licht is om 'private' los te laten.",
  },
];

export function Status() {
  return (
    <Section id="status" index="07" eyebrow="Status, eerlijk">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Nieuw project. Geen klanten. Wel bewezen fundament.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Tokenizen is net gelanceerd, open source, en in actieve ontwikkeling. Er zijn nog geen externe gebruikers,
        geen partnerships, geen klanten. Dat zeggen we gewoon zo. Wat er wél staat: dit is gebouwd bovenop
        bewezen eigen betaal- en MCP-infrastructuur (x402, meerdere eerder gepubliceerde npm/MCP-packages). De
        eerste externe validatie is het enige dat hierna telt.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {CHECKPOINTS.map((point) => (
          <Card key={point.title}>
            <CardTitle>{point.title}</CardTitle>
            <CardContent className="text-muted-foreground">{point.body}</CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
