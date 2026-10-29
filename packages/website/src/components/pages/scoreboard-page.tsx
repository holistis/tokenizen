import { useEffect, type ReactNode } from "react";

import { CinemaPage } from "@/components/home/cinema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { SCORE_RUNS, SCORE_UPDATED, SEALED_SET_HASH, SEED_BLOCK, runText, tunedLabel, type ScoreRun } from "@/data/scoreboard";
import { useLocale, type Locale } from "@/i18n/context";

// The page is complete in English and in Dutch. The words of the rows come from data/scoreboard.ts (SCORE_RUNS and SCORE_RUNS_NL); the words
// of everything around the rows are in COPY below. The English texts carry numbers and caveats that were checked: change a digit or a caveat
// in one language only when you change it in the other, and in the same commit. The Dutch is "je", never "u", and has no long dashes.

interface InfoCard {
  title: string;
  description?: string;
  list: "ul" | "ol";
  items: ReactNode[];
}

interface Copy {
  metaTitle: string;
  metaDescription: string;
  /** The small label in the glass pane of the head. */
  chip: string;
  title: string;
  lead: string;
  eyebrow: string;
  updated: (date: string) => string;
  pending: string;
  measured: string;
  hypothesesReported: (n: number) => string;
  cards: InfoCard[];
  citeHeading: string;
  citeAs: string;
  copyLabel: string;
  copiedLabel: string;
  issueBefore: string;
  issueLink: string;
  issueAfter: string;
}

const hash = <span className="break-all font-mono text-xs">{SEALED_SET_HASH}</span>;

const COPY: Record<Locale, Copy> = {
  en: {
    metaTitle: "Scoreboard | tokenizen",
    metaDescription:
      "How many of the findings that human auditors already found in closed contests our smart contract scan finds. Rows link to their results and, where one exists, to the pre-registration written before the run. Version 3.1 has no public rule from before the run: it is only in our own notes.",
    chip: "public",
    title: "Scoreboard",
    lead: "How many of the findings that human auditors already found in closed contests does our smart contract scan find? Rows link to their results and, where one exists, to the pre-registration written before the run. A row without that link has no public rule from before the run: for version 3.1 the rule is only in our own notes, and the row says so. A row without a result is empty on purpose.",
    eyebrow: "Bug Bounty Intelligence · open scoreboard",
    updated: (date) => `Last updated ${date}. Newest and still open rows first.`,
    pending: "pending",
    measured: "measured",
    hypothesesReported: (n) => `. It reported ${n} hypotheses in total.`,
    cards: [
      {
        title: "How to read a number",
        description: "What is counted, and by whom.",
        list: "ul",
        items: [
          "A known finding is a unique valid High or Medium finding in the final report of a Sherlock or Code4rena contest. The number of wardens who found it is its difficulty: easy is found by 5 or more, middle by 3 or 4, hard by 1 or 2.",
          "A hit counts only when two judges of different model families both name the same known finding for the same root cause. A person reads every disagreement.",
          <>
            The contests were split into a development set and a sealed set by sorting them on a hash that includes the hash of Base block{" "}
            {SEED_BLOCK.number}, which nobody here could choose. The sealed set is committed with the hash {hash} and was run once, on 24 October 2026. The set
            is published now, so anyone can recompute that hash.
          </>,
        ],
      },
      {
        title: "What would count as proof",
        description: "Five steps, in the order we take them.",
        list: "ol",
        items: [
          "The sealed run: contests nobody here has seen, with the decision rule fixed in advance. Done on 24 October 2026; the bar was not met.",
          "Contests that appear after today, with the hash of our report committed before the results are published.",
          "A test that makes each reported flaw actually happen, so a finding does not rest on anyone's word.",
          "A flaw that a real owner confirms.",
          "Someone else re-scoring our published outputs with the open judges and getting our numbers.",
        ],
      },
      {
        title: "What is open and what is private",
        list: "ul",
        items: [
          "Open: the contests, the two judges and their check, the rules we wrote before each run, every output and every judge statement. Anyone can re-score them.",
          "Private: how the scan finds things. Before the sealed run we published the SHA-256 of the files it uses, so any later change would show.",
        ],
      },
      {
        title: "What this is not",
        list: "ul",
        items: [
          "It is not an audit, an approval or a certification. A scan that finds nothing does not make code safe.",
          "These contests may be in the training data of the models, so absolute numbers can be too high. Comparisons between systems on the same contests are paired and less affected.",
          "The judges are language models and we have a stake in the result. That is why every table and every judge statement is published.",
        ],
      },
    ],
    citeHeading: "Cite this page",
    citeAs: "tokenizen, scoreboard of the Bug Bounty Intelligence scan, https://tokenizen.nl/en/scoreboard",
    copyLabel: "Copy citation",
    copiedLabel: "Copied",
    issueBefore: "Found a mistake in how we count? Open an issue in the ",
    issueLink: "repository",
    issueAfter: ". We correct it in public.",
  },
  nl: {
    metaTitle: "Scorebord | tokenizen",
    metaDescription:
      "Hoeveel van de bevindingen die menselijke auditors al vonden in afgesloten wedstrijden onze smart-contractscan vindt. Rijen verwijzen naar hun uitslag en, waar die er is, naar de preregistratie die voor de run is opgeschreven. Versie 3.1 heeft geen openbare regel van vóór de run: hij staat alleen in onze eigen notities.",
    chip: "openbaar",
    title: "Scorebord",
    lead: "Hoeveel van de bevindingen die menselijke auditors al vonden in afgesloten wedstrijden vindt onze smart-contractscan? Rijen verwijzen naar hun uitslag en, waar die er is, naar de preregistratie die voor de run is opgeschreven. Een rij zonder die link heeft vooraf geen openbare regel: bij versie 3.1 staat de regel alleen in onze eigen notities, en de rij zegt dat. Een rij zonder uitslag is met opzet leeg.",
    eyebrow: "Bug Bounty Intelligence · open scorebord",
    updated: (date) => `Laatst bijgewerkt op ${date}. Eerst de nieuwste rijen en de rijen die nog open staan.`,
    pending: "nog open",
    measured: "gemeten",
    hypothesesReported: (n) => `. Er werden in totaal ${n} hypotheses gemeld.`,
    cards: [
      {
        title: "Zo lees je een getal",
        description: "Wat er wordt geteld, en door wie.",
        list: "ul",
        items: [
          "Een bekende bevinding is een unieke, geldige bevinding met ernst High of Medium in het eindrapport van een Sherlock- of Code4rena-wedstrijd. Het aantal deelnemers dat een bevinding vond is de moeilijkheid ervan: makkelijk is gevonden door 5 of meer, gemiddeld door 3 of 4, moeilijk door 1 of 2.",
          "Een treffer telt alleen als twee rechters uit verschillende modelfamilies allebei dezelfde bekende bevinding noemen voor dezelfde grondoorzaak. Een mens leest elk meningsverschil na.",
          <>
            De wedstrijden zijn verdeeld in een ontwikkelset en een verzegelde set door ze te sorteren op een hash waarin de hash van blok {SEED_BLOCK.number} van
            Base is verwerkt. Dat blok kon niemand hier kiezen. De verzegelde set is vastgelegd met de hash {hash} en is één keer gedraaid, op 24 oktober 2026.
            De set is nu gepubliceerd, dus iedereen kan die hash zelf narekenen.
          </>,
        ],
      },
      {
        title: "Wat als bewijs zou tellen",
        description: "Vijf stappen, in de volgorde waarin we ze zetten.",
        list: "ol",
        items: [
          "De verzegelde run: wedstrijden die niemand hier had gezien, met de beslisregel vooraf vastgelegd. Gedaan op 24 oktober 2026; de lat is niet gehaald.",
          "Wedstrijden die na vandaag verschijnen, waarbij de hash van ons rapport wordt vastgelegd voordat de uitslagen worden gepubliceerd.",
          "Een test die elke gemelde fout echt laat gebeuren, zodat een bevinding niet op iemands woord steunt.",
          "Een fout die een echte eigenaar bevestigt.",
          "Iemand anders die onze gepubliceerde uitvoer opnieuw beoordeelt met de open rechters en onze getallen krijgt.",
        ],
      },
      {
        title: "Wat open is en wat privé blijft",
        list: "ul",
        items: [
          "Open: de wedstrijden, de twee rechters en hun controle, de regels die we vóór elke run opschreven, elke uitvoer en elk oordeel van de rechters. Iedereen kan die opnieuw beoordelen.",
          "Privé: hoe de scan dingen vindt. Vóór de verzegelde run publiceerden we de SHA-256 van de bestanden die hij gebruikt, zodat elke latere wijziging zou opvallen.",
        ],
      },
      {
        title: "Wat dit niet is",
        list: "ul",
        items: [
          "Het is geen audit, geen goedkeuring en geen certificering. Een scan die niets vindt, maakt code niet veilig.",
          "Deze wedstrijden kunnen in de trainingsdata van de modellen zitten, dus absolute getallen kunnen te hoog zijn. Vergelijkingen tussen systemen op dezelfde wedstrijden zijn gepaard en worden hier minder door beïnvloed.",
          "De rechters zijn taalmodellen en wij hebben zelf belang bij de uitslag. Daarom publiceren we elke tabel en elk oordeel van de rechters.",
        ],
      },
    ],
    citeHeading: "Citeer deze pagina",
    citeAs: "tokenizen, scorebord van de Bug Bounty Intelligence-scan, https://tokenizen.nl/nl/scoreboard",
    copyLabel: "Kopieer de verwijzing",
    copiedLabel: "Gekopieerd",
    issueBefore: "Zie je een fout in hoe we tellen? Maak een issue aan in de ",
    issueLink: "repository",
    issueAfter: ". We corrigeren dat in het openbaar.",
  },
};

function useMeta(title: string, description: string) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const tag = document.head.querySelector('meta[name="description"]');
    const prev = tag?.getAttribute("content") ?? null;
    tag?.setAttribute("content", description);
    return () => {
      document.title = prevTitle;
      if (prev !== null) tag?.setAttribute("content", prev);
    };
  }, [title, description]);
}

/** "0 of 31" ("0 van de 31"), or a plain word while a row has no result. */
export function resultText(run: ScoreRun, locale: Locale = "en"): string {
  const nl = locale === "nl";
  if (run.status === "pending" || run.found === null || run.known === null) return nl ? "Nog niet gemeten" : "Not measured yet";
  return nl ? `${run.found} van de ${run.known}` : `${run.found} of ${run.known}`;
}

function RunCard({ run }: { run: ScoreRun }) {
  const { locale } = useLocale();
  const c = COPY[locale];
  const text = runText(run, locale);
  const pending = run.status === "pending";
  const evidence = run.tunedOn === "yes" || run.tunedOn === "partly" ? "yellow" : pending ? "neutral" : "green";
  return (
    <li className="rounded-lg border border-border bg-card p-5 md:p-6" data-testid="score-run">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={pending ? "neutral" : "primary"}>{pending ? c.pending : c.measured}</Badge>
        <Badge variant={evidence}>{tunedLabel(run.tunedOn, locale)}</Badge>
        {run.date ? (
          <time dateTime={run.date} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {run.date}
          </time>
        ) : null}
      </div>
      <h2 className="mt-3 font-display text-xl font-semibold tracking-tight">{text.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text.system}</p>
      <p className="mt-4 font-display text-3xl font-semibold tracking-tight">{resultText(run, locale)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {text.set}
        {run.hypotheses !== null ? c.hypothesesReported(run.hypotheses) : ""}
      </p>
      <p className="mt-3 text-sm leading-relaxed">{text.note}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {text.links.map((link) => (
          <li key={link.href}>
            <a className="underline underline-offset-2 hover:text-primary" href={link.href} target="_blank" rel="noreferrer noopener">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}

function InfoCardView({ card }: { card: InfoCard }) {
  const List = card.list;
  return (
    <Card className="mt-5 first:mt-10">
      <h2 className="font-display text-lg font-semibold leading-snug">{card.title}</h2>
      {card.description ? <CardDescription>{card.description}</CardDescription> : null}
      <CardContent>
        <List className={`${card.list === "ul" ? "list-disc" : "list-decimal"} space-y-2 pl-5 text-sm leading-relaxed`}>
          {card.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}

export function ScoreboardPage() {
  const { locale } = useLocale();
  const c = COPY[locale];
  useMeta(c.metaTitle, c.metaDescription);

  return (
    <CinemaPage image="weegschaal" chip={c.chip} title={c.title} lead={c.lead}>
      <div className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{c.eyebrow}</p>
        <p className="mt-3 text-sm text-muted-foreground">{c.updated(SCORE_UPDATED)}</p>

        <ul className="mt-8 space-y-5">
          {SCORE_RUNS.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </ul>

        <div>
          {c.cards.map((card) => (
            <InfoCardView key={card.title} card={card} />
          ))}
        </div>

        <div className="mt-8 text-sm text-muted-foreground">
          <p className="font-mono text-xs uppercase tracking-wide">{c.citeHeading}</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-words rounded border border-border bg-muted px-2 py-1.5 font-mono text-xs text-foreground">{c.citeAs}</code>
            <CopyButton value={c.citeAs} copyLabel={c.copyLabel} copiedLabel={c.copiedLabel} />
          </div>
          <p className="mt-3">
            {c.issueBefore}
            <a
              className="underline underline-offset-2 hover:text-primary"
              href="https://github.com/holistis/bug-bounty-intelligence-mcp"
              target="_blank"
              rel="noreferrer noopener"
            >
              {c.issueLink}
            </a>
            {c.issueAfter}
          </p>
        </div>
      </div>
    </CinemaPage>
  );
}
