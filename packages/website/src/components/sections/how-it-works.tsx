import { ArrowRight, FileCheck2, History, PenLine, Wallet } from "lucide-react";

import { Section } from "@/components/section";

const STEPS: Array<{ icon: typeof Wallet; title: string; body: string }> = [
  {
    icon: Wallet,
    title: "Agent betaalt via x402",
    body: "Een AI-agent koopt capaciteit (GPU-uren, opslag, API-credits, bandbreedte) bij een andere agent of dienst.",
  },
  {
    icon: PenLine,
    title: "Koper tekent een claim",
    body: "Na afwikkeling legt de betalende agent vast of het beloofde is aangekomen: yes / no / partial, plus een hash van het bewijs.",
  },
  {
    icon: FileCheck2,
    title: "Claim naar de ledger",
    body: "record_delivery valideert schema, claimId en handtekening, en schrijft de claim append-only weg. Niet te wijzigen achteraf.",
  },
  {
    icon: History,
    title: "Volgende koper checkt eerst",
    body: "Vóór hij zelf betaalt roept een agent get_delivery_history aan en ziet de ruwe leveringsgeschiedenis van die verkoper.",
  },
];

export function HowItWorks() {
  return (
    <Section id="hoe-het-werkt" index="04" eyebrow="Hoe het werkt">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Vier stappen, geen tussenpersoon.</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Tokenizen verifieert of settelt zelf geen betalingen, dat gebeurt al bij x402. De ledger registreert
        alleen de bon van een afwikkeling die al heeft plaatsgevonden.
      </p>

      <ol className="mt-10 grid gap-4 md:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-md bg-muted text-primary">
                <step.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            </div>
            <p className="font-display text-base font-semibold leading-snug">{step.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            {i < STEPS.length - 1 ? (
              <ArrowRight
                aria-hidden="true"
                className="absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 text-muted-foreground md:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
