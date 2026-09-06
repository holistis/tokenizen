import { ArrowRight, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { useLocale } from "@/i18n/context";

const GITHUB_PACKAGE_URL = "https://github.com/holistis/tokenizen/tree/main/packages/capacity-attest";
const INSTALL_COMMAND = "npm install capacity-attest";

export function Hero() {
  const { t } = useLocale();

  return (
    <section id="top" className="border-b border-border py-16 md:py-24">
      <div className="container">
        <div className="md:grid md:grid-cols-[4.5rem_1fr] md:gap-8 lg:grid-cols-[5.5rem_1fr]">
          <div
            aria-hidden="true"
            className="mb-4 font-signage text-xl font-bold leading-none text-muted-foreground md:mb-0 md:pt-1 md:text-2xl"
          >
            00
          </div>

          <div className="max-w-3xl">
            <p className="mb-4 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">
              {t.hero.eyebrow}
            </p>

            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              <span className="font-display">{t.hero.h1Line1}</span>
              <br />
              <span className="font-signage font-bold tracking-tight">{t.hero.h1Line2}</span>
            </h1>

            <p className="mt-3 font-mono text-xs uppercase tracking-wide text-rule-green">{t.hero.trustLine}</p>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">{t.hero.body}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={GITHUB_PACKAGE_URL} target="_blank" rel="noreferrer noopener">
                  <Github className="size-4" aria-hidden="true" />
                  {t.hero.ctaPrimary}
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#hoe-het-werkt">
                  {t.hero.ctaSecondary}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>{t.hero.installLabel}</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-foreground">
                {INSTALL_COMMAND}
                <CopyButton value={INSTALL_COMMAND} copyLabel={t.openSource.copyLabel} copiedLabel={t.openSource.copiedLabel} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
