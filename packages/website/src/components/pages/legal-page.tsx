import { useEffect, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import signalLogText from "@/data/legal/signal-log.txt?raw";
import termsText from "@/data/legal/terms.txt?raw";
import privacyText from "@/data/legal/privacy.txt?raw";

// The three shop pages are rendered from the approved text files, so what is on the page is exactly what was approved.
// The file is cut into blocks at blank lines. The first block is the title. A short first line without a full stop at the end is a
// heading, whether it stands alone or sits directly above its paragraph; everything else is a paragraph, and single line breaks
// inside a paragraph stay visible. Web addresses and the email address become links; the words stay the same.

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

function useMeta(title: string, description: string) {
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

export function LegalPage({ raw, title, description }: { raw: string; title: string; description: string }) {
  useMeta(title, description);
  const blocks = parseLegalText(raw);
  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-2xl">
        <a
          href="/en"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          tokenizen.nl
        </a>
        <div className="mt-8 space-y-4 text-base leading-relaxed text-foreground/90">
          {blocks.map((b, i) =>
            b.kind === "title" ? (
              <h1 key={i} className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {b.text}
              </h1>
            ) : b.kind === "heading" ? (
              <h2 key={i} className="pt-4 font-display text-xl font-semibold tracking-tight">
                {b.text}
              </h2>
            ) : (
              <p key={i} className="whitespace-pre-line break-words">
                {linkify(b.text)}
              </p>
            ),
          )}
        </div>
      </div>
    </article>
  );
}

export function SignalLogPage() {
  return (
    <LegalPage
      raw={signalLogText}
      title="Signal log, early access | tokenizen"
      description="A weekly record of the security signals of your public GitHub repositories that you can check without us. Early access."
    />
  );
}

export function TermsPage() {
  return <LegalPage raw={termsText} title="Terms of the Signal log | tokenizen" description="The terms of the Signal log subscription of AO Services." />;
}

export function PrivacyPage() {
  return <LegalPage raw={privacyText} title="Privacy statement | tokenizen" description="How the free checks and the Signal log handle personal data." />;
}
