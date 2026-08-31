import { Github } from "lucide-react";

import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";

const GITHUB_URL = "https://github.com/holistis/tokenizen";

const installSnippet = `git clone ${GITHUB_URL}.git
cd tokenizen/packages/capacity-attest
npm install
npm run build      # tsc -> dist/
npm test           # vitest run
npm run demo       # end-to-end lokale demo, TEST-sleutels, geen live infra`;

export function OpenSource() {
  return (
    <Section id="open-source" index="06" eyebrow="Open source & voor developers">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        De code is er. De npm-publicatie nog niet.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        <code className="font-mono text-foreground">capacity-attest</code> is een MCP-server, geschreven in
        TypeScript, met een dekkende testsuite. Het package staat op{" "}
        <code className="font-mono text-foreground">"private": true</code>. Dat is bewust, tot er buiten deze MVP-fase
        expliciet groen licht is om te publiceren. De structuur (bin, files, mcpName, server.json) is al wel
        publicatie-klaar.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Badge variant="neutral">MIT-licentie</Badge>
        <Badge variant="neutral">TypeScript</Badge>
        <Badge variant="neutral">Model Context Protocol</Badge>
        <Badge variant="yellow">nog niet op npm, binnenkort</Badge>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Lokaal draaien kan nu al: clone de repository, installeer, bouw, en draai de meegeleverde end-to-end
            demo, die gebruikt een wegwerpbare test-wallet en raakt geen live infrastructuur aan.
          </p>
          <Button asChild size="lg" className="w-fit">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              <Github className="size-4" aria-hidden="true" />
              Repository op GitHub
            </a>
          </Button>
        </div>
        <CodeBlock label="terminal" code={installSnippet} />
      </div>
    </Section>
  );
}
