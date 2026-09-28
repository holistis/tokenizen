import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { BadgeSnippet } from "@/components/trust-radar/badge-snippet";
import { StatusBadge } from "@/components/trust-radar/status-badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { TRUST_RADAR_ENTRIES } from "@/data/trust-radar-entries";

const TITLE = "Trust Radar | tokenizen";
const DESCRIPTION =
  "A free, public list of MCP servers and what each one's own discovery response reports about authentication. Not a security audit: a single passive HTTP check per server, nothing more.";

function useArticleMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;

    const descriptionTag = document.head.querySelector('meta[name="description"]');
    const prevDescription = descriptionTag?.getAttribute("content") ?? null;
    descriptionTag?.setAttribute("content", DESCRIPTION);

    return () => {
      document.title = prevTitle;
      if (prevDescription !== null) descriptionTag?.setAttribute("content", prevDescription);
    };
  }, []);
}

export function TrustRadarPage() {
  useArticleMeta();

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

        <p className="mt-8 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">Free & public</p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Trust Radar</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A running list of MCP servers, and what each one&rsquo;s own discovery response reports about
          authentication.
        </p>

        <div className="mt-6 rounded-lg border border-rule-yellow/30 bg-rule-yellow-soft p-4 text-sm leading-relaxed text-foreground/80">
          This is not a security audit. Status reflects only what a server volunteers on a single, passive HTTP
          request to its own public discovery endpoint, no login attempt, no tool call. &ldquo;Confirmed safe&rdquo;
          means the server itself rejected that request until credentials were supplied.
        </div>

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
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">Checked {entry.checkedAt}</p>
                <BadgeSnippet entry={entry} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </article>
  );
}
