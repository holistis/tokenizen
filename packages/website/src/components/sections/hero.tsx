import { ArrowRight, Github } from "lucide-react";

import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/holistis/tokenizen";

export function Hero() {
  return (
    <section id="top" className="border-b border-border py-16 md:py-24">
      <div className="container">
        <div className="md:grid md:grid-cols-[4.5rem_1fr] md:gap-8 lg:grid-cols-[5.5rem_1fr]">
          <div aria-hidden="true" className="mb-4 font-mono text-sm text-muted-foreground md:mb-0 md:pt-1">
            00
          </div>

          <div className="max-w-3xl">
            <p className="mb-4 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">
              Infrastructuur voor de AI-agent-economie · open source
            </p>

            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              Iedereen bouwt de koperskant.
              <br />
              Wij bouwen de verkoperskant.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Agent-identiteit, spend-limits en betaalrails zijn onderweg (x402, Google AP2, ERC-8004). Wat nog
              ontbreekt: het bewijs dat een verkoper het recht echt heeft, en dat wat geleverd is overeenkomt met
              wat beloofd was. Tokenizen bouwt precies dat, te beginnen met Capacity Attest: een ondertekende,
              feitelijke kwitantie voor x402-capaciteitshandel tussen agents.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
                  <Github className="size-4" aria-hidden="true" />
                  Bekijk de code op GitHub
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#hoe-het-werkt">
                  Hoe het werkt
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
