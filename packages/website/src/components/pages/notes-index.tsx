// notes-index.tsx — the two indexes: /blog lists the blogs, /notes lists the notes.
//
// A BLOG IS A DECISION, NOT A DEFAULT. The owner of this site decides what is a blog; everything
// else we write is a note. Until 2026-10-24 both lived on one page that was called the blog, which
// is how two working notes of that day ended up in front of readers as blogs. A post is a blog only
// when its `kind` in data/blog-posts.ts says so, and that line is written when the owner has said
// "make this a blog", never on our own initiative.
//
// Two kinds of note live here. The older ones are one component each and are listed by hand in
// NOTES below. Newer ones are data in BLOG_POSTS (kind "note") and appear on their own: add the entry
// there and it shows up, newest first. A pinned post is shown first whatever its date.
//
// The blog index carries no mission block. The mission stays at the end of every post, where a reader
// who landed on one page sees what the work is for; an index should show the posts and nothing else.
//
// Article copy stays English while these indexes are bilingual. The articles are written for people
// implementing against a specification whose own text is English, and a translated copy would mean
// every correction has to be made twice, which is how one of two versions quietly goes stale. The
// Dutch index says that in a line rather than leaving a reader to wonder.

import { useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { BLOG_POSTS, postPath, type PostKind } from "@/data/blog-posts";
import { useLocale } from "@/i18n/context";

interface Entry {
  slug: string;
  date: string;
  title: string;
  blurb: string;
  tags?: readonly string[];
  readMinutes?: number;
  pinned?: boolean;
}

const OLDER_NOTES: Entry[] = [
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

/** The entries of one kind: pinned first, then newest first. On the same date the data posts come first. */
export function entriesOfKind(kind: PostKind): Entry[] {
  const fromData: Entry[] = BLOG_POSTS.filter((post) => post.kind === kind).map((post) => ({
    slug: postPath(post.slug),
    date: post.date,
    title: post.title,
    blurb: post.dek,
    tags: post.tags,
    readMinutes: post.readMinutes,
    pinned: post.pinned,
  }));
  const all = kind === "note" ? [...fromData, ...OLDER_NOTES] : fromData;
  return all.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.date.localeCompare(a.date));
}

const COPY = {
  en: {
    blog: {
      heading: "Blog",
      intro:
        "Longer pieces with a story and a point of view. The measurements, tools and working notes are kept apart, under Notes.",
      other: "Notes",
      otherHint: "Looking for the measurements and working notes?",
      otherHref: "/notes",
      latest: "Start here",
      more: "More blogs",
      empty: "Nothing else here yet.",
    },
    note: {
      heading: "Notes",
      intro:
        "Measurements, tools and working notes for engineers who build with AI agents that pay. Where there is a number, the commands that produced it are in the text, so you can get it yourself and disagree with us on the facts.",
      other: "Blog",
      otherHint: "Looking for the longer pieces?",
      otherHref: "/blog",
      latest: "Newest",
      more: "Earlier notes",
      empty: "Nothing here yet.",
    },
    languageNote: null as string | null,
    back: "Back to the main page",
    readMore: "Read",
    pinned: "Pinned",
    minutes: "min read",
  },
  nl: {
    blog: {
      heading: "Blog",
      intro:
        "Langere stukken met een verhaal en een standpunt. De metingen, tools en werknotities staan apart, onder Notities.",
      other: "Notities",
      otherHint: "Zoek je de metingen en werknotities?",
      otherHref: "/notes",
      latest: "Begin hier",
      more: "Meer blogs",
      empty: "Hier staat verder nog niets.",
    },
    note: {
      heading: "Notities",
      intro:
        "Metingen, tools en werknotities voor engineers die bouwen met AI-agents die betalen. Staat er een getal, dan staan de commando's die het opleverden in de tekst, zodat je het zelf kunt natrekken en het op de feiten met ons oneens kunt zijn.",
      other: "Blog",
      otherHint: "Zoek je de langere stukken?",
      otherHref: "/blog",
      latest: "Nieuwste",
      more: "Eerdere notities",
      empty: "Hier staat nog niets.",
    },
    languageNote:
      "De artikelen zelf staan in het Engels. Ze zijn geschreven voor mensen die tegen een specificatie aan bouwen die zelf Engels is, en een tweede versie zou betekenen dat elke correctie twee keer moet gebeuren.",
    back: "Terug naar de hoofdpagina",
    readMore: "Lezen",
    pinned: "Vastgepind",
    minutes: "min lezen",
  },
} as const;

function PostIndex({ kind }: { kind: PostKind }) {
  const { locale } = useLocale();
  const lang = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const copy = lang[kind === "blog" ? "blog" : "note"];
  // The Dutch site lives under /nl, and App.tsx strips that prefix before it
  // looks a slug up. A bare href would therefore drop a Dutch reader onto
  // the English page without saying so.
  const prefix = locale === "nl" ? "/nl" : "";

  // The description is the page's own intro, in the reader's language. Without it the page kept the
  // homepage's description (in Dutch, from index.html), which told a search engine nothing about the list.
  useEffect(() => {
    const previous = document.title;
    document.title = `${copy.heading} | tokenizen`;
    const descriptionTag = document.head.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute("content") ?? null;
    descriptionTag?.setAttribute("content", copy.intro);
    return () => {
      document.title = previous;
      if (previousDescription !== null) descriptionTag?.setAttribute("content", previousDescription);
    };
  }, [copy.heading, copy.intro]);

  const [featured, ...rest] = entriesOfKind(kind);

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href={prefix || "/"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {lang.back}
        </a>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{copy.heading}</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">{copy.heading}</h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">{copy.intro}</p>
        {lang.languageNote ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{lang.languageNote}</p> : null}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {copy.otherHint}{" "}
          <a href={`${prefix}${copy.otherHref}`} className="font-medium text-primary underline underline-offset-2">
            {copy.other}
          </a>
        </p>

        {featured ? (
          <section className="mt-12" aria-label={copy.latest}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{featured.pinned ? lang.pinned : copy.latest}</p>
            <div className="mt-3 rounded-lg border border-primary/40 bg-card p-6 md:p-8">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <time dateTime={featured.date}>{featured.date}</time>
                {featured.readMinutes ? (
                  <span>
                    {featured.readMinutes} {lang.minutes}
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
                {lang.readMore}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </section>
        ) : (
          <p className="mt-12 text-base text-muted-foreground">{copy.empty}</p>
        )}

        {rest.length > 0 ? (
          <>
            <h2 className="mt-14 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{copy.more}</h2>
            <ul className="mt-2 space-y-10">
              {rest.map((entry) => (
                <li key={entry.slug} className="border-t border-border pt-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    <time dateTime={entry.date}>{entry.date}</time>
                  </p>
                  <h3 className="mt-3 font-display text-xl font-semibold tracking-tight md:text-2xl">
                    <a href={`${prefix}${entry.slug}`} className="transition-colors hover:text-primary">
                      {entry.title}
                    </a>
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">{entry.blurb}</p>
                  <a
                    href={`${prefix}${entry.slug}`}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-opacity hover:opacity-80"
                  >
                    {lang.readMore}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </article>
  );
}

/** /blog: only what the owner has called a blog, the pinned one first. */
export function BlogIndex() {
  return <PostIndex kind="blog" />;
}

/** /notes: the measurements and working notes. */
export function NotesIndex() {
  return <PostIndex kind="note" />;
}
