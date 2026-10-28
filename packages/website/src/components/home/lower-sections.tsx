import { ArrowUpRight, Mail } from "lucide-react";

import { ChainDemo } from "@/components/matrix/chain-demo";
import { MissStrip, SCAN_FOUND, SCAN_KNOWN } from "@/components/matrix/miss-strip";
import { Portrait } from "@/components/portrait";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, HOME, type Locale } from "@/data/home-copy";

const eyebrow = "mb-3 font-mono text-xs font-medium uppercase tracking-[0.15em] text-[color:var(--altitude)]";

/** 10 m: the reader's own repository. A plain form: pressing the button opens the check page with the name filled in. */
export function CheckYours({ locale }: { locale: Locale }) {
  const c = HOME[locale].check;
  return (
    <div className="border-t border-border py-16 md:py-24">
      <div className="container">
        <p className={eyebrow}>10 m</p>
        <h2 className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{c.body}</p>
        <form action="/en/cra-check" method="get" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
          <label className="block flex-1">
            <span className="sr-only">{c.label}</span>
            <input
              name="repo"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={c.placeholder}
              pattern="[A-Za-z0-9._\-]+/[A-Za-z0-9._\-]+"
              required
              className="h-12 w-full rounded-md border border-input bg-card px-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--altitude)]"
            />
          </label>
          <Button type="submit" size="lg" className="h-12">
            {c.button}
          </Button>
        </form>
        <p className="mt-4 max-w-2xl font-mono text-xs leading-relaxed text-muted-foreground">{c.fine}</p>
      </div>
    </div>
  );
}

/** 1 m: down to one line and its hash. */
export function Proof({ locale }: { locale: Locale }) {
  const c = HOME[locale].proof;
  return (
    <div className="border-t border-border py-16 md:py-24">
      <div className="container">
        <p className={eyebrow}>1 m</p>
        <h2 className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{c.body}</p>
        <div className="mt-8 max-w-4xl">
          <ChainDemo locale={locale} />
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {c.sealed}{" "}
          <a href="/en/scoreboard" className="whitespace-nowrap underline underline-offset-2 hover:text-foreground">
            {c.scoreboard}
          </a>
        </p>
      </div>
    </div>
  );
}

export function Brothers({ locale, level = 2 }: { locale: Locale; level?: 1 | 2 }) {
  const c = HOME[locale].brothers;
  const Heading = level === 1 ? "h1" : "h2";
  const people = [c.abdellah, c.ahmed];
  return (
    <section id="wie" aria-label={c.heading} className="scroll-mt-16 border-t border-border py-16 md:py-24">
      <div className="container">
        <Heading className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</Heading>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{c.body}</p>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:max-w-4xl">
          {people.map((p) => (
            <li key={p.name}>
              <Portrait name={p.name} />
              <h3 className="mt-4 font-display text-2xl">{p.name}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-wide text-[color:var(--altitude)]">{p.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.line}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <Mail className="size-4" aria-hidden="true" />
              {c.contact}
            </a>
          </Button>
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            AO Services · Eindhoven · KvK 86816632 · {CONTACT_EMAIL}
          </p>
        </div>
      </div>
    </section>
  );
}

export function SecurityRecord({ locale }: { locale: Locale }) {
  const c = HOME[locale].security;
  return (
    <section id="beveiliging" aria-label={c.heading} className="scroll-mt-16 border-t border-border py-16 md:py-24">
      <div className="container">
        <h2 className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{c.intro}</p>
        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {c.items.map((item) => (
            <li key={item.chip} className="flex flex-col rounded-md border border-border bg-card p-5">
              <p className="inline-flex w-fit rounded-sm border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-primary">{item.chip}</p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">{item.text}</p>
              {item.href ? (
                <a href={item.href} className="mt-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-primary underline-offset-2 hover:underline">
                  {item.linkLabel}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <a href="/en/security" className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-primary underline-offset-2 hover:underline">
            {c.more}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </p>
      </div>
    </section>
  );
}

export function Unknowns({ locale }: { locale: Locale }) {
  const c = HOME[locale].unknowns;
  return (
    <section id="onbekend" aria-label={c.heading} className="scroll-mt-16 border-t border-border py-16 md:py-24">
      <div className="container">
        <h2 className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{c.intro}</p>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <MissStrip label={c.scan} />
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/90">{c.scan}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {SCAN_FOUND} / {SCAN_KNOWN} ·{" "}
              <a href="/en/scoreboard" className="underline underline-offset-2 hover:text-foreground">
                {c.scoreboard}
              </a>
            </p>
          </div>
          <ul className="space-y-4 text-sm leading-relaxed text-foreground/90">
            <li className="border-l-2 border-border pl-4">{c.pinned}</li>
            <li className="border-l-2 border-border pl-4">{c.warnings}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
