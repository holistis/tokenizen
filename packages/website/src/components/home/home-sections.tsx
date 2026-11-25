import type { FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Clock, Flag, Link2, Mail, Ruler, UserCheck } from "lucide-react";

import { CinemaHero, Scene, Tilt, useReveal } from "@/components/home/cinema";
import { repoFromHash } from "@/components/pages/cra-check-page";
import { FindingCoin } from "@/components/ui/finding-coin";
import { CINEMA, CONTACT_EMAIL, HOME, OFFERS, type Locale, type Offer, type Pillar } from "@/data/home-copy";
import { formatMeasured, PROOF_COPY, PROOF_ROWS, proofAge, type CheckedBy } from "@/data/proof-matrix";
import { VERIFIED_FINDS, VERIFIED_FINDS_COPY } from "@/data/verified-finds";
import { localePath } from "@/lib/locale-paths";

// The sections of the homepage, from the first screen down. Each of them says one thing and has its own photograph.

const eyebrow = "mb-4 font-mono text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--glow)]";
const title = "font-display text-4xl leading-[1.05] sm:text-5xl";

/** The page behind a card, in the reader's language. */
function tileHref(offer: Offer, locale: Locale): string {
  return offer.cta.href.startsWith("/") ? localePath(locale, offer.cta.href) : offer.cta.href;
}

export function Hero({ locale }: { locale: Locale }) {
  const c = HOME[locale].hero;
  const reveal = useReveal<HTMLDivElement>();
  return (
    <CinemaHero image="keten">
      <div ref={reveal} className="reveal hero-copy">
        <p className={eyebrow}>{c.eyebrow}</p>
        {/* One heading in one style. Each sentence is a plain span: the stylesheet (.hero-title) sets them in lines as wide as the page allows, next to each other on a wide screen, so they stay above the photograph. */}
        <h1 className="hero-title font-display">
          <span>{c.h1a}</span> <span>{c.h1b}</span>
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
              {CINEMA[locale].tileStat[offer.id] ? (
                <p className="mt-5 flex items-baseline gap-3">
                  <span className="glow-text font-signage text-5xl font-bold leading-none">{CINEMA[locale].tileStat[offer.id]?.value}</span>
                  <span className="text-xs leading-snug text-[color:var(--soft)]">{CINEMA[locale].tileStat[offer.id]?.label}</span>
                </p>
              ) : null}
              <p className="mt-6 font-mono text-xs text-white/90">{CINEMA[locale].tilePrice[offer.id]}</p>
              <p className="mt-3 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)]">
                {c.open}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </p>
            </Tilt>
          ))}
          <WorkWithUsTile locale={locale} />
        </div>
      </div>
    </section>
  );
}

/** Replaces the old conversation card: what we do for a team that builds agents that pay, three first steps, and how fast we answer. No price is shown. */
function WorkWithUsTile({ locale }: { locale: Locale }) {
  const c = CINEMA[locale].workWithUs;
  return (
    <Tilt as="article" className="tile sm:col-span-2 lg:col-span-3">
      <h3 id="aanbod-talk" className="font-display text-3xl leading-tight">
        {c.title}
      </h3>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[color:var(--soft)]">{c.intro}</p>
      <p className="mt-6 text-sm leading-relaxed text-white/90">{c.stepsLead}</p>
      <ul className="mt-3 max-w-3xl space-y-3">
        {c.steps.map((s) => (
          <li key={s.name} className="flex gap-3 text-sm leading-relaxed text-[color:var(--soft)]">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-[color:var(--glow)]" />
            <span>
              <span className="text-white">{s.name}</span> {s.text}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm leading-relaxed text-white/90">{c.othersLead}</p>
      <ul className="mt-3 max-w-3xl space-y-3">
        {c.others.map((o) => (
          <li key={o.href} className="flex gap-3 text-sm leading-relaxed text-[color:var(--soft)]">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-[color:var(--glow)]" />
            <span>
              {o.text}{" "}
              <a href={o.href} aria-label={`${c.othersOpen}: ${o.source}`} className="text-[color:var(--glow)] underline underline-offset-2 hover:no-underline">
                {c.othersOpen}
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[color:var(--soft)]">{c.othersNote}</p>
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[color:var(--soft)]">{c.closing}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(c.subject)}`} className="btn-glow">
          <Mail className="size-4" aria-hidden="true" />
          {c.button}
        </a>
      </div>
    </Tilt>
  );
}

const CHECKED_BY_ICON: Record<CheckedBy, typeof Ruler> = { own: Ruler, outside: UserCheck, chain: Link2, limit: Flag };

/**
 * The numbers we show, one row each: the number, what it says, who checked it, when it was measured and where to run it again. A table from 900 px
 * up, one card per row below that. How old a row is is worked out here from its date; the days and the "due for a new measurement" line carry
 * data-capture-skip because they change every day, so the saved page text (share-bodies.json) keeps only the date.
 */
export function ProofMatrix({ locale }: { locale: Locale }) {
  const c = PROOF_COPY[locale];
  const reveal = useReveal<HTMLDivElement>();
  const now = new Date();
  return (
    <section id="bewijs" aria-labelledby="bewijs-titel" className="scroll-mt-16 py-20 md:py-28">
      <div className="container">
        <div ref={reveal} className="reveal">
          <h2 id="bewijs-titel" className={title}>
            {c.heading}
          </h2>
          <p id="bewijs-uitleg" className="mt-4 max-w-2xl text-base leading-relaxed text-[color:var(--soft)]">
            {c.subtitle}
          </p>
          <div className="proof-panel mt-12">
            <table className="proof-table" role="table" aria-describedby="bewijs-uitleg">
              <caption data-capture-skip>{c.heading}</caption>
              <thead className="proof-head" role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">{c.columns.number}</th>
                  <th role="columnheader" scope="col">{c.columns.says}</th>
                  <th role="columnheader" scope="col">{c.columns.checkedBy}</th>
                  <th role="columnheader" scope="col">{c.columns.measured}</th>
                  <th role="columnheader" scope="col">{c.columns.check}</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {PROOF_ROWS.map((row) => {
                  const age = proofAge(row, now);
                  const Icon = CHECKED_BY_ICON[row.checkedBy];
                  return (
                    <tr key={row.id} className="proof-row" role="row">
                      <th role="rowheader" scope="row" className="proof-number">
                        <span className="proof-figure">
                          {row.value[locale].split(/(\d+)/).map((part, i) =>
                            part && !/^\d+$/.test(part) ? (
                              <span key={i} className="proof-unit">
                                {part}
                              </span>
                            ) : (
                              part
                            ),
                          )}
                        </span>
                      </th>
                      <td role="cell" className="proof-says">
                        {row.claim[locale]}
                      </td>
                      <td role="cell" className="proof-by">
                        <span className="proof-chip" data-by={row.checkedBy}>
                          <Icon aria-hidden="true" />
                          {c.chips[row.checkedBy]}
                        </span>
                        {row.caveats.map((caveat) => (
                          <span key={caveat} className="proof-flag">
                            {c.chips[caveat]}
                          </span>
                        ))}
                      </td>
                      <td role="cell" className="proof-when">
                        <time dateTime={row.measuredAt}>
                          <span className="proof-measured-word">{c.measured} </span>
                          <span className="proof-date">{formatMeasured(row.measuredAt, locale)}</span>
                        </time>
                        <span className="proof-ago" data-capture-skip>
                          ({c.ago(age.days)})
                        </span>
                        {age.stale ? (
                          <span className="proof-stale" data-capture-skip>
                            <Clock aria-hidden="true" />
                            {c.stale(row.staleAfterDays)}
                          </span>
                        ) : null}
                      </td>
                      <td role="cell" className="proof-check">
                        <a href={row.checkUrl.startsWith("/") ? localePath(locale, row.checkUrl) : row.checkUrl} className="proof-link">
                          {c.check.slice(0, c.check.lastIndexOf(" ") + 1)}
                          <span className="whitespace-nowrap">
                            {c.check.slice(c.check.lastIndexOf(" ") + 1)}
                            <ArrowUpRight aria-hidden="true" />
                          </span>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
      {pillar.source ? (
        <p className="mt-6">
          <a href={pillar.source.href} className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)] underline-offset-2 hover:underline">
            {pillar.source.label}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </p>
      ) : null}
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

/** One coin per publicly published, credited security finding. See src/data/verified-finds.ts for how a new finding gets added. */
export function VerifiedFindsScene({ locale }: { locale: Locale }) {
  const c = VERIFIED_FINDS_COPY[locale];
  const featured = VERIFIED_FINDS.find((finding) => finding.featured);
  const rest = VERIFIED_FINDS.filter((finding) => !finding.featured);
  return (
    <Scene id="bevestigd" image="kluisdeur" side="left" label={c.heading} wide>
      <p className={eyebrow}>{c.eyebrow}</p>
      <h2 className={title}>{c.heading}</h2>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-[color:var(--soft)]">{c.intro}</p>
      {featured ? (
        <div className="mt-8 flex justify-center">
          <FindingCoin finding={featured} linkLabel={c.linkLabel} flipHint={c.flipHint} featuredLabel={c.featuredLabel} />
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-8">
        {rest.map((finding) => (
          <FindingCoin key={finding.id} finding={finding} linkLabel={c.linkLabel} flipHint={c.flipHint} />
        ))}
      </div>
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
