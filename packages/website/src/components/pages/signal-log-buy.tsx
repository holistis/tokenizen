import { SIGNAL_LOG_LINKS } from "@/data/signal-log-links";
import { useLocale } from "@/i18n/context";

// The way to subscribe, above the approved text of the Signal log offer. It repeats the prices of that text and nothing else: no new promise.

const COPY = {
  en: {
    heading: "Subscribe",
    intro: "Early access. Prices include VAT. You pay through Stripe. What you get and what is not included yet is in the text below.",
    plans: {
      solo: { name: "Solo", limit: "up to 3 repositories", month: "9.95 euro per month", year: "99 euro per year" },
      team: { name: "Team", limit: "up to 25 repositories", month: "29.95 euro per month", year: "299 euro per year" },
    },
    monthButton: "Subscribe monthly",
    yearButton: "Subscribe yearly",
  },
  nl: {
    heading: "Abonneren",
    intro: "Vroege toegang. Prijzen zijn inclusief btw. Je betaalt via Stripe. Wat je krijgt en wat nog niet is inbegrepen staat in de tekst hieronder.",
    plans: {
      solo: { name: "Solo", limit: "tot 3 repositories", month: "9,95 euro per maand", year: "99 euro per jaar" },
      team: { name: "Team", limit: "tot 25 repositories", month: "29,95 euro per maand", year: "299 euro per jaar" },
    },
    monthButton: "Abonneer per maand",
    yearButton: "Abonneer per jaar",
  },
};

export function SignalLogBuy() {
  const { locale } = useLocale();
  const c = COPY[locale === "nl" ? "nl" : "en"];
  return (
    <section id="abonneren" aria-label={c.heading} className="mb-10 max-w-3xl">
      <h2 className="font-display text-3xl leading-tight">{c.heading}</h2>
      <p className="mt-3 text-base leading-relaxed text-[color:var(--soft)]">{c.intro}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(["solo", "team"] as const).map((plan) => (
          <div key={plan} className="glass-flat flex flex-col p-6">
            <h3 className="font-display text-2xl">{c.plans[plan].name}</h3>
            <p className="mt-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)]">{c.plans[plan].limit}</p>
            <p className="mt-4 text-sm text-[color:var(--soft)]">{c.plans[plan].month}</p>
            <a href={SIGNAL_LOG_LINKS[plan].month} className="btn-glow mt-2 w-fit">
              {c.monthButton}
            </a>
            <p className="mt-5 text-sm text-[color:var(--soft)]">{c.plans[plan].year}</p>
            <a href={SIGNAL_LOG_LINKS[plan].year} className="btn-ghost mt-2 w-fit">
              {c.yearButton}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
