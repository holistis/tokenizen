import { useEffect, type ReactNode } from "react";

import { CinemaPage } from "@/components/home/cinema";
import { SignalLogBuy } from "@/components/pages/signal-log-buy";
import signalLogText from "@/data/legal/signal-log.txt?raw";
import termsText from "@/data/legal/terms.txt?raw";
import privacyText from "@/data/legal/privacy.txt?raw";
import signalLogTextNl from "@/data/legal/signal-log.nl.txt?raw";
import termsTextNl from "@/data/legal/terms.nl.txt?raw";
import privacyTextNl from "@/data/legal/privacy.nl.txt?raw";
import { useLocale } from "@/i18n/context";
import { localePath } from "@/lib/locale-paths";

// The three shop pages are rendered from the approved text files, so what is on the page is exactly what was approved.
// The file is cut into blocks at blank lines. The first block is the title. A short first line without a full stop at the end is a
// heading, whether it stands alone or sits directly above its paragraph; everything else is a paragraph, and single line breaks
// inside a paragraph stay visible. Web addresses and the email address become links; the words stay the same.
//
// THE TEXTS ARE ENGLISH ONLY, ON PURPOSE. A Dutch version of an approved legal text needs the owner's approval first, so nothing in the
// files is translated. A Dutch reader gets a Dutch head (chip, title and one line saying what the page is), a short Dutch notice that the
// text is English for now, and then the English text unchanged, marked lang="en". An English reader gets the English head: the title of
// the file is the title of the page and the first paragraph of the file is its lead, so that paragraph is shown once, in the head.

export interface LegalBlock {
  kind: "title" | "heading" | "paragraph";
  text: string;
}

const isHeadingLine = (line: string) => line.length <= 48 && !line.endsWith(".");

export function parseLegalText(raw: string): LegalBlock[] {
  const chunks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks: LegalBlock[] = [];
  chunks.forEach((text, i) => {
    if (i === 0) {
      blocks.push({ kind: "title", text });
      return;
    }
    const [first, ...rest] = text.split("\n");
    if (isHeadingLine(first.trim())) {
      blocks.push({ kind: "heading", text: first.trim() });
      const body = rest.join("\n").trim();
      if (body) blocks.push({ kind: "paragraph", text: body });
      return;
    }
    blocks.push({ kind: "paragraph", text });
  });
  return blocks;
}

const LINKABLE = /(tokenizen\.nl\/en\/[a-z-]+|info@tokenizen\.nl)/g;

export function linkify(text: string): ReactNode[] {
  return text.split(LINKABLE).map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.includes("@") ? `mailto:${part}` : `https://${part}`;
    return (
      <a key={i} className="underline underline-offset-2 hover:text-primary" href={href}>
        {part}
      </a>
    );
  });
}

export function useMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const tag = document.head.querySelector('meta[name="description"]');
    const previous = tag?.getAttribute("content") ?? null;
    tag?.setAttribute("content", description);
    return () => {
      document.title = previousTitle;
      if (previous !== null) tag?.setAttribute("content", previous);
    };
  }, [title, description]);
}

/** What a Dutch reader reads above the Dutch text. The English text is the one that was approved first and the one that counts. */
export const NOTE_NL = "Dit is de Nederlandse tekst. Bij een verschil met de Engelse tekst geldt de Engelse tekst.";
export const NOTE_NL_LINK = "Lees de Engelse tekst";

export interface LegalPageProps {
  /** The approved English text file, exactly as it is on disk. */
  raw: string;
  /** The Dutch text file. It says the same as the English one; where they differ, the English one counts. */
  rawNl: string;
  /** The page without a language prefix, to link a Dutch reader to the English text. */
  slug: string;
  /** English: the label in the head and what the browser tab and search results show. The title and lead come from the file. */
  en: { chip: string; metaTitle: string; metaDescription: string };
  /** Dutch: the label in the head and what the browser tab and search results show. The title and lead come from the Dutch file. */
  nl: { chip: string; metaTitle: string; metaDescription: string };
  /** Something that belongs above the text, such as the way to subscribe. Not part of the approved wording. */
  extra?: ReactNode;
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "heading" || block.kind === "title") {
    return <h2 className="pt-4 font-display text-xl font-semibold tracking-tight">{block.text}</h2>;
  }
  return <p className="whitespace-pre-line break-words">{linkify(block.text)}</p>;
}

export function LegalPage({ raw, rawNl, slug, en, nl, extra }: LegalPageProps) {
  const { locale } = useLocale();
  const dutch = locale === "nl";
  const meta = dutch ? nl : en;
  useMeta(meta.metaTitle, meta.metaDescription);

  const [fileTitle, ...rest] = parseLegalText(dutch ? rawNl : raw);
  const first = rest[0];
  // The first paragraph of the file is the lead of the head. It is lifted out of the text below, so it is on the page once.
  const lifted = first?.kind === "paragraph" && !first.text.includes("\n") ? first.text : null;
  const title = fileTitle?.text ?? "";
  const lead = lifted ?? "";
  const body = lifted === null ? rest : rest.slice(1);

  return (
    <CinemaPage image="logboek" chip={meta.chip} title={title} lead={lead}>
      {extra}
      <article className="max-w-2xl">
        {dutch ? (
          <p role="note" className="mb-8 rounded-lg border border-l-4 border-border border-l-primary bg-card px-5 py-4 text-base leading-relaxed text-foreground">
            {NOTE_NL}{" "}
            <a href={localePath("en", `/${slug}`)} className="underline underline-offset-2">
              {NOTE_NL_LINK}
            </a>
            .
          </p>
        ) : null}
        <div className="space-y-4 text-base leading-relaxed text-foreground/90">
          {body.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
      </article>
    </CinemaPage>
  );
}

/** The three pages: the approved text and the words around it, in both languages. Exported so a test can read the Dutch words. */
export const LEGAL_PAGES = {
  "signal-log": {
    raw: signalLogText,
    rawNl: signalLogTextNl,
    slug: "signal-log",
    en: {
      chip: "early access",
      metaTitle: "Signal log, early access | tokenizen",
      metaDescription: "A weekly record of the security signals of your public GitHub repositories that you can check without us. Early access.",
    },
    nl: {
      chip: "vroege toegang",
      metaTitle: "Signal log in vroege toegang | tokenizen",
      metaDescription:
        "Een wekelijks logboek van de beveiligingssignalen van je openbare GitHub-repositories, dat je zonder ons kunt controleren. Vroege toegang.",
    },
  },
  terms: {
    raw: termsText,
    rawNl: termsTextNl,
    slug: "terms",
    en: { chip: "terms", metaTitle: "Terms of the Signal log | tokenizen", metaDescription: "The terms of the Signal log subscription of AO Services." },
    nl: {
      chip: "voorwaarden",
      metaTitle: "Voorwaarden van het Signal log | tokenizen",
      metaDescription: "De voorwaarden voor het abonnement op het Signal log van AO Services.",
    },
  },
  privacy: {
    raw: privacyText,
    rawNl: privacyTextNl,
    slug: "privacy",
    en: { chip: "privacy", metaTitle: "Privacy statement | tokenizen", metaDescription: "How the free checks and the Signal log handle personal data." },
    nl: {
      chip: "privacy",
      metaTitle: "Privacyverklaring | tokenizen",
      metaDescription: "Zo gaan de gratis checks en het Signal log om met persoonsgegevens.",
    },
  },
} satisfies Record<string, LegalPageProps>;

export function SignalLogPage() {
  return <LegalPage {...LEGAL_PAGES["signal-log"]} extra={<SignalLogBuy />} />;
}

export function TermsPage() {
  return <LegalPage {...LEGAL_PAGES.terms} />;
}

export function PrivacyPage() {
  return <LegalPage {...LEGAL_PAGES.privacy} />;
}
