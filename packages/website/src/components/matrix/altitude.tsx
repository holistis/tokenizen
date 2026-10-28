import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// The homepage is read from above downwards in four altitudes: 1000 m (the overview), 100 m (what we offer), 10 m (check your own
// repository), 1 m (the proof, down to one line with its hash). Every offer page follows the same four steps in the same order.

export interface AltitudeStep {
  id: string;
  meters: number;
  en: string;
  nl: string;
}

export const ALTITUDES: AltitudeStep[] = [
  { id: "top", meters: 1000, en: "Overview", nl: "Overzicht" },
  { id: "aanbod", meters: 100, en: "What we offer", nl: "Wat wij bieden" },
  { id: "nagaan", meters: 10, en: "Check yours", nl: "Check de jouwe" },
  { id: "bewijs", meters: 1, en: "The proof", nl: "Het bewijs" },
];

export function altitudeLabel(step: AltitudeStep, locale: "en" | "nl"): string {
  return `${step.meters} m · ${locale === "nl" ? step.nl : step.en}`;
}

/** A section of the homepage that belongs to one altitude. The rail reads which one is on screen. */
export function Altitude({
  step,
  children,
  className,
  panel = false,
  locale,
}: {
  step: AltitudeStep;
  children: ReactNode;
  className?: string;
  panel?: boolean;
  locale: "en" | "nl";
}) {
  return (
    <section id={step.id} data-altitude={step.meters} aria-label={altitudeLabel(step, locale)} className={cn("scroll-mt-16", panel && "panel", className)}>
      {children}
    </section>
  );
}

export function AltitudeRail({ locale }: { locale: "en" | "nl" }) {
  const [current, setCurrent] = useState(ALTITUDES[0].id);

  useEffect(() => {
    const els = ALTITUDES.map((a) => document.getElementById(a.id)).filter((e): e is HTMLElement => e !== null);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    // The section that crosses the middle band of the screen is the one we are "at".
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const now = ALTITUDES.find((a) => a.id === current) ?? ALTITUDES[0];

  return (
    <>
      <nav
        aria-label={locale === "nl" ? "Hoogte op de pagina" : "Altitude on the page"}
        className="fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 rounded-md border border-border bg-background/85 px-3 py-3 backdrop-blur lg:block"
      >
        <ol className="flex flex-col gap-3">
          {ALTITUDES.map((a) => {
            const here = a.id === current;
            return (
              <li key={a.id}>
                <a
                  href={`#${a.id}`}
                  aria-current={here ? "location" : undefined}
                  className={cn(
                    "group flex items-baseline justify-end gap-2 font-signage leading-none transition-colors",
                    here ? "text-[color:var(--altitude)]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("font-mono text-[11px] font-normal uppercase tracking-wide", here ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
                    {locale === "nl" ? a.nl : a.en}
                  </span>
                  <span className="text-xl font-bold">{a.meters} m</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <p
        aria-hidden="true"
        className="fixed bottom-4 left-4 z-30 rounded-md border border-border bg-background/85 px-3 py-1.5 font-signage text-lg font-bold leading-none text-[color:var(--altitude)] backdrop-blur lg:hidden"
      >
        {now.meters} m
      </p>
    </>
  );
}
