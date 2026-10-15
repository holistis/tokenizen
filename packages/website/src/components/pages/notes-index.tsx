// notes-index.tsx — the index for /notes.
//
// The article pages existed before this did, with no index and no link in the
// navigation, so nothing on the site led to them. Writing something nobody can
// reach is the same as not writing it.
//
// Article copy stays English while this index is bilingual. The articles are
// written for people implementing against a specification whose own text is
// English, and a translated copy would mean every correction has to be made
// twice, which is how one of two versions quietly goes stale. The Dutch index
// says that in a line rather than leaving a reader to wonder.

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { useLocale } from "@/i18n/context";

interface NoteEntry {
  slug: string;
  date: string;
  title: string;
  blurb: string;
}

const NOTES: NoteEntry[] = [
  {
    slug: "/notes/zero-of-600-x402-services-sign-a-receipt",
    date: "2026-10-15",
    title: "I checked 600 live x402 services. None of them signs a receipt.",
    blurb:
      "Six samples of a hundred across an index of 20,462 live resources, and the offer-receipt extension appeared in none of them. The method, the commands, the limits of the number, and a live endpoint that does sign one.",
  },
  {
    slug: "/notes/nine-ways-to-fake-a-delivery-claim",
    date: "2026-09-21",
    title: "Nine ways to fake a delivery claim, and why none of them fully worked",
    blurb:
      "A buyer signs a factual claim after an x402 payment. The obvious hole: what stops the buyer from lying? Nine independent designs, each built and broken against the real code.",
  },
  {
    slug: "/notes/the-hierarchy-of-agent-trust",
    date: "2026-09-14",
    title: "The hierarchy of agent trust",
    blurb:
      "Identity, authority, intent and delivery are four different questions. Most of the agent-economy stack answers the first three and stops.",
  },
];

const COPY = {
  en: {
    eyebrow: "Notes",
    heading: "Notes",
    intro:
      "Working notes, each one built on something measured rather than argued. Where there is a number, the commands that produced it are in the text so you can get it yourself and disagree with me on the facts.",
    languageNote: null as string | null,
    back: "Back to the main page",
    readMore: "Read",
  },
  nl: {
    eyebrow: "Notities",
    heading: "Notities",
    intro:
      "Werknotities, elk gebouwd op iets dat gemeten is in plaats van beweerd. Staat er een getal, dan staan de commando's die het opleverden in de tekst, zodat je het zelf kunt natrekken en het op de feiten met me oneens kunt zijn.",
    languageNote:
      "De artikelen zelf staan in het Engels. Ze zijn geschreven voor mensen die tegen een specificatie aan bouwen die zelf Engels is, en een tweede versie zou betekenen dat elke correctie twee keer moet.",
    back: "Terug naar de hoofdpagina",
    readMore: "Lezen",
  },
} as const;

const TITLE_BY_LOCALE = {
  en: "Notes | tokenizen",
  nl: "Notities | tokenizen",
} as const;

export function NotesIndex() {
  const { locale } = useLocale();
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.en;
  // The English site lives under /en, and App.tsx strips that prefix before it
  // looks a slug up. A bare href would therefore drop an English reader onto
  // the Dutch page without saying so.
  const prefix = locale === "en" ? "/en" : "";

  useEffect(() => {
    const previous = document.title;
    document.title = TITLE_BY_LOCALE[locale as keyof typeof TITLE_BY_LOCALE] ?? TITLE_BY_LOCALE.en;
    return () => {
      document.title = previous;
    };
  }, [locale]);

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href={prefix || "/"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.back}
        </a>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{copy.eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">{copy.heading}</h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">{copy.intro}</p>
        {copy.languageNote ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.languageNote}</p>
        ) : null}

        <ul className="mt-12 space-y-10">
          {NOTES.map((note) => (
            <li key={note.slug} className="border-t border-border pt-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <time dateTime={note.date}>{note.date}</time>
              </p>
              <h2 className="mt-3 font-display text-xl font-semibold tracking-tight md:text-2xl">
                <a href={`${prefix}${note.slug}`} className="transition-colors hover:text-primary">
                  {note.title}
                </a>
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{note.blurb}</p>
              <a
                href={`${prefix}${note.slug}`}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-opacity hover:opacity-80"
              >
                {copy.readMore}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
