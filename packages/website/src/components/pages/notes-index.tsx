// notes-index.tsx — the index for /notes, which is also the blog (/blog opens it).
//
// The article pages existed before this did, with no index and no link in the
// navigation, so nothing on the site led to them. Writing something nobody can
// reach is the same as not writing it.
//
// Two kinds of entry live here. The older notes are one component each and are
// listed by hand in NOTES below. Newer posts are data in BLOG_POSTS and appear
// on their own: add the entry there and it shows up in this list, newest first,
// with the newest as the featured card.
//
// Article copy stays English while this index is bilingual. The articles are
// written for people implementing against a specification whose own text is
// English, and a translated copy would mean every correction has to be made
// twice, which is how one of two versions quietly goes stale. The Dutch index
// says that in a line rather than leaving a reader to wonder.

import { useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { MissionBlock } from "@/components/blog/mission-block";
import { BLOG_POSTS, postPath } from "@/data/blog-posts";
import { useLocale } from "@/i18n/context";

interface NoteEntry {
  slug: string;
  date: string;
  title: string;
  blurb: string;
  tags?: readonly string[];
  readMinutes?: number;
  pinned?: boolean;
}

const NOTES: NoteEntry[] = [
  {
    slug: "/notes/733203-attestations-were-taken-back",
    date: "2026-10-15",
    title: "733,203 attestations were taken back",
    blurb:
      "Counting revocations across the three largest EAS indexers to answer a fair objection: a signature does not make a statement true. Every one of them is an issuer withdrawing its own statement, and the counterparty has no move at all.",
  },
  {
    slug: "/notes/a-signed-receipt-that-cannot-name-its-own-payment",
    date: "2026-10-15",
    title: "A signed receipt that cannot name its own payment",
    blurb:
      "It verifies, the key is authorized, and it cannot tell you which payment it is about. Tracing why, being corrected in public by someone who checked the chain, and the verifier another project changed the same day.",
  },
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

const POST_ENTRIES: NoteEntry[] = BLOG_POSTS.map((post) => ({
  slug: postPath(post.slug),
  date: post.date,
  title: post.title,
  blurb: post.dek,
  tags: post.tags,
  readMinutes: post.readMinutes,
  pinned: post.pinned,
}));

// A pinned post first, then newest first. On the same date the data-driven posts
// come first, because they are the ones written after the hand-listed notes.
const ENTRIES: NoteEntry[] = [...POST_ENTRIES, ...NOTES].sort(
  (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.date.localeCompare(a.date),
);

const COPY = {
  en: {
    eyebrow: "Blog",
    heading: "Blog",
    intro:
      "Measurements, tools and working notes for engineers who build with AI agents that pay. Where there is a number, the commands that produced it are in the text, so you can get it yourself and disagree with us on the facts.",
    languageNote: null as string | null,
    back: "Back to the main page",
    readMore: "Read",
    latest: "Start here",
    earlier: "Earlier notes",
    minutes: "min read",
  },
  nl: {
    eyebrow: "Blog",
    heading: "Blog",
    intro:
      "Metingen, tools en werknotities voor engineers die bouwen met AI-agents die betalen. Staat er een getal, dan staan de commando's die het opleverden in de tekst, zodat je het zelf kunt natrekken en het op de feiten met ons oneens kunt zijn.",
    languageNote:
      "De artikelen zelf staan in het Engels. Ze zijn geschreven voor mensen die tegen een specificatie aan bouwen die zelf Engels is, en een tweede versie zou betekenen dat elke correctie twee keer moet.",
    back: "Terug naar de hoofdpagina",
    readMore: "Lezen",
    latest: "Begin hier",
    earlier: "Eerdere notities",
    minutes: "min lezen",
  },
} as const;

const TITLE_BY_LOCALE = {
  en: "Blog | tokenizen",
  nl: "Blog | tokenizen",
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

  const [featured, ...rest] = ENTRIES;

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

        <MissionBlock />

        {featured ? (
          <section className="mt-12" aria-label={copy.latest}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{copy.latest}</p>
            <div className="mt-3 rounded-lg border border-primary/40 bg-card p-6 md:p-8">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <time dateTime={featured.date}>{featured.date}</time>
                {featured.readMinutes ? (
                  <span>
                    {featured.readMinutes} {copy.minutes}
                  </span>
                ) : null}
                {(featured.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded border border-border px-1.5 py-0.5 tracking-wide">
                    {tag}
                  </span>
                ))}
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                <a href={`${prefix}${featured.slug}`} className="transition-colors hover:text-primary">
                  {featured.title}
                </a>
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{featured.blurb}</p>
              <a
                href={`${prefix}${featured.slug}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary transition-opacity hover:opacity-80"
              >
                {copy.readMore}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </section>
        ) : null}

        <h2 className="mt-14 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{copy.earlier}</h2>
        <ul className="mt-2 space-y-10">
          {rest.map((note) => (
            <li key={note.slug} className="border-t border-border pt-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <time dateTime={note.date}>{note.date}</time>
              </p>
              <h3 className="mt-3 font-display text-xl font-semibold tracking-tight md:text-2xl">
                <a href={`${prefix}${note.slug}`} className="transition-colors hover:text-primary">
                  {note.title}
                </a>
              </h3>
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
