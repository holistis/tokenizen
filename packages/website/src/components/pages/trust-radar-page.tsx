import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight, Radar } from "lucide-react";

import { BadgeSnippet } from "@/components/trust-radar/badge-snippet";
import { StatusBadge } from "@/components/trust-radar/status-badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { TRUST_RADAR_ENTRIES } from "@/data/trust-radar-entries";
import { useLocale } from "@/i18n/context";

const CONTACT_EMAIL = "info@tokenizen.nl";

function useArticleMeta(title: string, description: string) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const descriptionTag = document.head.querySelector('meta[name="description"]');
    const prevDescription = descriptionTag?.getAttribute("content") ?? null;
    descriptionTag?.setAttribute("content", description);

    return () => {
      document.title = prevTitle;
      if (prevDescription !== null) descriptionTag?.setAttribute("content", prevDescription);
    };
  }, [title, description]);
}

function EmptyState() {
  const { t } = useLocale();

  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Radar className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-base font-medium text-foreground">{t.trustRadar.empty.title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{t.trustRadar.empty.body}</p>
      <a
        href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t.trustRadar.mailSubject)}`}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-mono text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t.trustRadar.empty.cta}
      </a>
    </div>
  );
}

export function TrustRadarPage() {
  const { t } = useLocale();
  useArticleMeta(t.trustRadar.metaTitle, t.trustRadar.metaDescription);

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          tokenizen.nl
        </a>

        <p className="mt-8 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">
          {t.trustRadar.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {t.trustRadar.h1}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.trustRadar.intro}</p>

        <div className="mt-6 rounded-lg border border-rule-yellow/30 bg-rule-yellow-soft p-4 text-sm leading-relaxed text-foreground/80">
          {t.trustRadar.disclaimer}
        </div>

        {TRUST_RADAR_ENTRIES.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-8 space-y-4">
            {TRUST_RADAR_ENTRIES.map((entry) => (
              <Card key={entry.domain} id={entry.domain}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{entry.name}</CardTitle>
                    <a
                      href={`https://${entry.domain}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      {entry.domain}
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>
                <CardContent>
                  <p>{entry.note}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {t.trustRadar.checkedLabel} {entry.checkedAt}
                  </p>
                  <BadgeSnippet entry={entry} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
