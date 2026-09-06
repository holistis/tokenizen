import { ExternalLink, Github } from "lucide-react";

import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import { useLocale } from "@/i18n/context";
import { withInlineCode } from "@/i18n/inline-code";

const GITHUB_PACKAGE_URL = "https://github.com/holistis/tokenizen/tree/main/packages/capacity-attest";
const NPM_URL = "https://www.npmjs.com/package/capacity-attest";
const INSTALL_COMMAND = "npm install capacity-attest";

export function OpenSource() {
  const { t } = useLocale();

  const localDevSnippet = `git clone ${GITHUB_PACKAGE_URL.replace("/tree/main/packages/capacity-attest", "")}.git
cd tokenizen/packages/capacity-attest
npm install
npm run build      # ${t.openSource.commentBuild}
npm test           # ${t.openSource.commentTest}
npm run demo       # ${t.openSource.commentDemo}`;

  return (
    <Section id="open-source" index="06" eyebrow={t.openSource.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.openSource.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        {withInlineCode(t.openSource.body)}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{t.openSource.badges.mit}</Badge>
        <Badge variant="neutral">{t.openSource.badges.typescript}</Badge>
        <Badge variant="neutral">{t.openSource.badges.mcp}</Badge>
        <a
          href={NPM_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-md border border-transparent bg-rule-green-soft px-2.5 py-0.5 font-mono text-xs font-medium tracking-wide text-rule-green transition-opacity hover:opacity-80"
        >
          {t.openSource.badges.status}
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3">
            <CodeBlock
              label={t.openSource.terminalLabel}
              code={INSTALL_COMMAND}
              copyLabel={t.openSource.copyLabel}
              copiedLabel={t.openSource.copiedLabel}
            />
            <p className="font-mono text-xs text-muted-foreground">{t.openSource.npmLabel}</p>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{withInlineCode(t.openSource.installIntro)}</p>
          <Button asChild size="lg" className="w-fit">
            <a href={GITHUB_PACKAGE_URL} target="_blank" rel="noreferrer noopener">
              <Github className="size-4" aria-hidden="true" />
              {t.openSource.repoButton}
            </a>
          </Button>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{t.openSource.localDevLabel}</p>
          <CodeBlock label={t.openSource.localTerminalLabel} code={localDevSnippet} />
        </div>
      </div>
    </Section>
  );
}
