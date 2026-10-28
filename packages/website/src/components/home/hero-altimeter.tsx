import { ArrowRight } from "lucide-react";

import { MeasureGrids } from "@/components/matrix/measure-grid";
import { Button } from "@/components/ui/button";
import { HOME, type Locale } from "@/data/home-copy";

// 1000 m: the overview. A dark panel (dark in both themes), the promise in two lines, three numbers that open their source, and the eight
// grids of the measurement.

export function HeroAltimeter({ locale }: { locale: Locale }) {
  const c = HOME[locale].hero;
  return (
    <div className="border-b border-border py-14 md:py-20">
      <div className="container">
        <p className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">{c.eyebrow}</p>
        <h1 className="max-w-4xl text-[2.75rem] font-semibold leading-[1.03] tracking-tight sm:text-6xl md:text-7xl">
          <span className="font-display">{c.h1a}</span>
          <br />
          <span className="font-signage font-bold uppercase tracking-tight text-primary">{c.h1b}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">{c.body}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <a href="/en/cra-check">
              {c.ctaPrimary}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#aanbod">{c.ctaSecondary}</a>
          </Button>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-3">
          {c.chips.map((chip) => (
            <li key={chip.label}>
              <a
                href={chip.href.startsWith("/") ? `/en${chip.href}` : chip.href}
                className="group flex h-full items-baseline gap-4 rounded-md border border-border bg-muted/60 px-4 py-3 transition-colors hover:border-primary"
              >
                <span className="font-signage text-5xl font-bold leading-none text-primary">{chip.value}</span>
                <span className="text-sm leading-snug text-muted-foreground group-hover:text-foreground">{chip.label}</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-14">
          <MeasureGrids locale={locale} />
        </div>
      </div>
    </div>
  );
}
