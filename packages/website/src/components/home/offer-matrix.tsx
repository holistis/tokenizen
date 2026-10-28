import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HOME, OFFERS, type Locale, type Offer } from "@/data/home-copy";

// 100 m: what we offer, as a matrix. Every row has the same three columns, so the limit of an offer always sits where its promise sits.

export function OfferCard({ offer, labels }: { offer: Offer; labels: { get: string; verify: string; not: string; price: string } }) {
  // The pages behind the cards exist in English only, so their own address is the /en one, also from the Dutch homepage.
  const href = offer.cta.href.startsWith("/") ? `/en${offer.cta.href}` : offer.cta.href;
  return (
    <article id={`aanbod-${offer.id}`} className="grid gap-6 border-t border-border py-8 lg:grid-cols-[17rem_1fr_1fr_1fr] lg:gap-8">
      <header>
        <p className="inline-flex rounded-sm border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-primary">{offer.status}</p>
        <h3 className="mt-3 font-display text-3xl leading-tight">{offer.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{offer.line}</p>
        <p className="mt-3 font-mono text-xs text-foreground">
          <span className="text-muted-foreground">{labels.price}: </span>
          {offer.price}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <a href={href}>
            {offer.cta.label}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </header>
      <Cell label={labels.get} text={offer.gets} />
      <Cell label={labels.verify} text={offer.verify} />
      <Cell label={labels.not} text={offer.not} />
    </article>
  );
}

function Cell({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <h4 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{label}</h4>
      <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
    </div>
  );
}

export function OfferMatrix({ locale }: { locale: Locale }) {
  const c = HOME[locale].offers;
  return (
    <div className="py-16 md:py-24">
      <div className="container">
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.15em] text-[color:var(--altitude)]">100 m</p>
        <h2 className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{c.intro}</p>
        <div className="mt-10 border-b border-border">
          {OFFERS[locale].map((offer) => (
            <OfferCard key={offer.id} offer={offer} labels={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
