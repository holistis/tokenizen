import type { FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Mail } from "lucide-react";

import { CinemaHero, Scene, Tilt, useReveal } from "@/components/home/cinema";
import { repoFromHash } from "@/components/pages/cra-check-page";
import { CINEMA, CONTACT_EMAIL, HOME, OFFERS, type Locale, type Offer, type Pillar } from "@/data/home-copy";
import { localePath } from "@/lib/locale-paths";

// The sections of the homepage, from the first screen down. Each of them says one thing and has its own photograph.

const eyebrow = "mb-4 font-mono text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--glow)]";
const title = "font-display text-4xl leading-[1.05] sm:text-5xl";

/** The page behind a card, in the reader's language. The conversation card opens the page about it, not a mail window. */
function tileHref(offer: Offer, locale: Locale): string {
  if (offer.id === "talk") return localePath(locale, "/consultancy");
  return offer.cta.href.startsWith("/") ? localePath(locale, offer.cta.href) : offer.cta.href;
}

export function Hero({ locale }: { locale: Locale }) {
  const c = HOME[locale].hero;
  const reveal = useReveal<HTMLDivElement>();
  return (
    <CinemaHero image="keten">
      <div ref={reveal} className="reveal hero-copy">
        <p className={eyebrow}>{c.eyebrow}</p>
        <h1 className="text-[2.9rem] leading-[1] sm:text-7xl md:text-[5.5rem]">
          <span className="font-display">{c.h1a}</span>
          <br />
          <span className="glow-text font-signage font-bold uppercase tracking-tight">{c.h1b}</span>
        </h1>
        <div className="glass mt-6 max-w-xl">
          <p className="text-base leading-relaxed text-white md:text-lg">{c.body}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={localePath(locale, "/cra-check")} className="btn-glow">
              {c.ctaPrimary}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a href="#aanbod" className="btn-ghost">
              {c.ctaSecondary}
            </a>
          </div>
        </div>
      </div>
      <ul className="mt-12 grid gap-3 sm:grid-cols-3 lg:mt-16">
        {c.chips.map((chip) => (
          <li key={chip.label}>
            <a
              href={chip.href.startsWith("/") ? localePath(locale, chip.href) : chip.href}
              className="chip-glass group flex h-full items-baseline gap-4 px-5 py-4"
            >
              <span className="glow-text font-signage text-5xl font-bold leading-none">{chip.value}</span>
              <span className="text-sm leading-snug text-[color:var(--soft)] group-hover:text-white">{chip.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </CinemaHero>
  );
}

export function OfferTiles({ locale }: { locale: Locale }) {
  const c = CINEMA[locale].offers;
  const reveal = useReveal<HTMLDivElement>();
  return (
    <section id="aanbod" aria-label={c.heading} className="scroll-mt-16 py-20 md:py-28">
      <div className="container">
        <div ref={reveal} className="reveal">
          <p className={eyebrow}>tokenizen</p>
          <h2 className={title}>{c.heading}</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[color:var(--soft)]">{c.intro}</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {OFFERS[locale].map((offer) => (
            <Tilt key={offer.id} as="article" className="tile">
              <p id={`aanbod-${offer.id}`} className="inline-flex w-fit rounded-full border border-white/20 px-3 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[color:var(--glow)]">
                {offer.status}
              </p>
              <h3 className="mt-5 font-display text-3xl leading-tight">
                <a href={tileHref(offer, locale)} className="after:absolute after:inset-0 after:content-['']">
                  {CINEMA[locale].tileName[offer.id] ?? offer.name}
                </a>
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[color:var(--soft)]">{offer.line}</p>
              <p className="mt-6 font-mono text-xs text-white/90">{CINEMA[locale].tilePrice[offer.id]}</p>
              <p className="mt-3 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)]">
                {c.open}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </p>
            </Tilt>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PillarScene({ pillar, image, side }: { pillar: Pillar; image: string; side: "left" | "right" }) {
  return (
    <Scene id={pillar.id} image={image} side={side} label={pillar.label}>
      <p className={eyebrow}>{pillar.label}</p>
      <h2 className={title}>{pillar.title}</h2>
      <ul className="mt-6 space-y-4">
        {pillar.points.map((p) => (
          <li key={p} className="flex gap-3 text-base leading-relaxed text-[color:var(--soft)]">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-[color:var(--glow)]" />
            {p}
          </li>
        ))}
      </ul>
    </Scene>
  );
}

export function SecurityScene({ locale }: { locale: Locale }) {
  const c = HOME[locale].security;
  return (
    <Scene id="beveiliging" image="lek" side="right" label={c.heading} wide>
      <p className={eyebrow}>{locale === "nl" ? "Beveiliging" : "Security"}</p>
      <h2 className={title}>{c.heading}</h2>
      <p className="mt-4 text-base leading-relaxed text-[color:var(--soft)]">{c.intro}</p>
      <ul className="mt-6 space-y-5">
        {c.items.map((item) => (
          <li key={item.chip} className="border-t border-white/10 pt-4">
            <p className="inline-flex w-fit rounded-full border border-white/20 px-3 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[color:var(--glow)]">{item.chip}</p>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--soft)]">{item.text}</p>
            {item.href ? (
              <a href={item.href} className="mt-3 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)] underline-offset-2 hover:underline">
                {item.linkLabel}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <a href={localePath(locale, "/security")} className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)] underline-offset-2 hover:underline">
          {c.more}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </p>
    </Scene>
  );
}

export function MissionScene({ locale }: { locale: Locale }) {
  const c = CINEMA[locale].mission;
  return (
    <Scene id="missie" image="horizon" side="left" label={c.label} wide>
      <p className={eyebrow}>{c.label}</p>
      <div className="grid gap-8 sm:grid-cols-2">
        {[c.mission, c.vision].map((m) => (
          <div key={m.label}>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/70">{m.label}</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{m.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-[color:var(--soft)]">{m.text}</p>
          </div>
        ))}
      </div>
    </Scene>
  );
}

/** The reader's own repository. The name goes into the address fragment, which the browser never sends to a server. */
export function CheckScene({ locale }: { locale: Locale }) {
  const c = HOME[locale].check;
  function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const typed = String(new FormData(e.currentTarget).get("repo") ?? "").trim();
    const repo = repoFromHash(`#repo=${encodeURIComponent(typed)}`);
    if (repo) window.location.assign(`${localePath(locale, "/cra-check")}#repo=${encodeURIComponent(repo)}`);
  }
  return (
    <Scene id="nagaan" image="lens" side="right" label={c.heading}>
      <p className={eyebrow}>{locale === "nl" ? "Gratis" : "Free"}</p>
      <h2 className={title}>{c.heading}</h2>
      <p className="mt-4 text-base leading-relaxed text-[color:var(--soft)]">{c.body}</p>
      <form onSubmit={go} className="mt-6 flex flex-col gap-3">
        <label className="block">
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
            className="h-12 w-full rounded-full border border-white/25 bg-black/40 px-5 font-mono text-sm text-white placeholder:text-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--glow)]"
          />
        </label>
        <button type="submit" className="btn-glow w-fit">
          {c.button}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </form>
      <p className="mt-4 font-mono text-xs leading-relaxed text-white/70">{c.fine}</p>
    </Scene>
  );
}

export function Unknowns({ locale }: { locale: Locale }) {
  const c = HOME[locale].unknowns;
  const reveal = useReveal<HTMLDivElement>();
  return (
    <section id="onbekend" aria-label={c.heading} className="scroll-mt-16 py-20 md:py-28">
      <div className="container">
        <div ref={reveal} className="reveal">
          <h2 className={`${title} max-w-3xl`}>{c.heading}</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[color:var(--soft)]">{c.intro}</p>
          <ul className="mt-10 grid gap-4 lg:grid-cols-3">
            {[c.scan, c.pinned, c.warnings].map((text) => (
              <li key={text} className="glass-flat p-6 text-sm leading-relaxed text-[color:var(--soft)]">
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <a href={localePath(locale, "/scoreboard")} className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)] underline-offset-2 hover:underline">
              {c.scoreboard}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

export function TalkScene({ locale }: { locale: Locale }) {
  const c = CINEMA[locale].talk;
  return (
    <>
      <Scene id="praat" image="gesprek" side="left" label={c.heading}>
        <p className={eyebrow}>{locale === "nl" ? "Gesprek" : "Conversation"}</p>
        <h2 className={title}>{c.heading}</h2>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--soft)]">{c.body}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(c.subject)}`} className="btn-glow">
            <Mail className="size-4" aria-hidden="true" />
            {c.button}
          </a>
          <a href={localePath(locale, "/about")} className="btn-ghost">
            {c.secondary}
          </a>
        </div>
      </Scene>
      <p className="px-5 pb-8 pt-4 text-center font-mono text-xs text-white/60">{CINEMA[locale].note}</p>
    </>
  );
}
