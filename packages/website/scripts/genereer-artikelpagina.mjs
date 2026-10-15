// genereer-artikelpagina.mjs — zet een markdown-notitie om in een artikelpagina.
//
// De eerste notitie op deze site is met de hand naar JSX omgezet. Dat is een
// keer prima en twee keer fout: elke volgende kost hetzelfde werk, en een
// handmatige omzetting is precies waar een typfout stil een geciteerd commando
// verandert. Dit leest de tekst zoals hij geschreven is en laat MarkdownLite
// het renderen.
//
// GEBRUIK: node scripts/genereer-artikelpagina.mjs <bron.md> <component-naam> <bestandsnaam.tsx> "<Titel>" "<Beschrijving>" <datum>

import { readFileSync, writeFileSync } from "node:fs";

const [bron, naam, bestand, titel, beschrijving, datum] = process.argv.slice(2);
if (!bron || !naam || !bestand || !titel || !beschrijving || !datum) {
  console.error("devto: geef bron, componentnaam, bestandsnaam, titel, beschrijving en datum mee");
  process.exit(2);
}

// De eerste regel van de bron is de titel en de tweede is leeg; die laten we
// weg omdat de pagina zijn eigen h1 zet.
const ruw = readFileSync(bron, "utf8").replace(/\r\n/g, "\n");
const body = ruw.split("\n").slice(2).join("\n").trim();

// Het lichaam gaat als template literal de JSX in, dus precies drie dingen
// moeten ontsnapt worden en verder niets.
const veilig = body.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const pagina = `import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { MarkdownLite } from "@/components/markdown-lite";

const TITLE = ${JSON.stringify(titel + " | tokenizen")};
const DESCRIPTION = ${JSON.stringify(beschrijving)};

const BODY = \`${veilig}\`;

export function ${naam}() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const tag = document.head.querySelector('meta[name="description"]');
    const prev = tag?.getAttribute("content") ?? null;
    tag?.setAttribute("content", DESCRIPTION);
    return () => {
      document.title = prevTitle;
      if (prev !== null) tag?.setAttribute("content", prev);
    };
  }, []);

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href="/notes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Notes
        </a>
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <time dateTime=${JSON.stringify(datum)}>${datum}</time>
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          ${titel}
        </h1>
        <MarkdownLite source={BODY} />
      </div>
    </article>
  );
}
`;

writeFileSync(`src/components/pages/${bestand}`, pagina);
console.log(`geschreven: src/components/pages/${bestand} (${pagina.length} tekens, ${body.split(/\s+/).length} woorden)`);
