import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

export function Problem() {
  return (
    <Section id="probleem" index="01" eyebrow="Het probleem">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Een agent betaalt, krijgt minder, en heeft niets om dat te bewijzen.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Een AI-agent betaalt via x402 voor capaciteit bij een andere agent of dienst: GPU-uren, opslag,
        API/inference-credits, bandbreedte. De levering valt tegen: minder uren dan toegezegd, lagere kwaliteit,
        minder opslag. Er is geen kwitantie die dat vastlegt.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>De koper weet het</CardTitle>
          <CardContent className="text-muted-foreground">
            Hij zag de output, of zag hem niet. Maar die kennis gaat verloren zodra de sessie eindigt.
          </CardContent>
        </Card>
        <Card>
          <CardTitle>De volgende koper niet</CardTitle>
          <CardContent className="text-muted-foreground">
            Die begint blind bij dezelfde verkoper, zonder geschiedenis om op te checken vóór hij zelf betaalt.
          </CardContent>
        </Card>
        <Card>
          <CardTitle>De verkoper draagt geen bewijslast</CardTitle>
          <CardContent className="text-muted-foreground">
            Zonder ondertekend bewijs is er niets dat een belofte aan een levering koppelt.
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
