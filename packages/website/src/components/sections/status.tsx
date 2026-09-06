import { ArrowUpRight, CheckCircle2, Circle } from "lucide-react";

import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/i18n/context";
import { cn } from "@/lib/utils";

const TX_URL = "https://basescan.org/tx/0xc00a638491986962ca125c01da4e3df8a07d715216694bb0a59ff257c88e6880";
const VERIFICATION_URL = "https://github.com/modelcontextprotocol/registry/discussions/1300";

export function Status() {
  const { t } = useLocale();

  return (
    <Section id="status" index="07" eyebrow={t.status.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.status.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t.status.body}</p>

      <div className="mt-8 flex flex-col gap-3 rounded-lg border border-rule-green/30 bg-rule-green-soft p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-rule-green" aria-hidden="true" />
          <div>
            <p className="font-display text-base font-semibold text-foreground">{t.status.proof.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/80">{t.status.proof.body}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 pl-8 sm:items-end sm:pl-0">
          <a
            href={TX_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-mono text-xs text-rule-green underline-offset-2 hover:underline"
          >
            {t.status.proof.txLabel}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
          <a
            href={VERIFICATION_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-mono text-xs text-rule-green underline-offset-2 hover:underline"
          >
            {t.status.proof.verificationLabel}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {t.status.checkpoints.map((point) => (
          <Card
            key={point.title}
            className={cn(point.achieved && "border-rule-green/30 bg-rule-green-soft")}
          >
            <div className="flex items-center gap-2">
              {point.achieved ? (
                <CheckCircle2 className="size-4 shrink-0 text-rule-green" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <CardTitle>{point.title}</CardTitle>
            </div>
            <CardContent className={cn(point.achieved ? "text-foreground/80" : "text-muted-foreground")}>
              {point.body}
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
