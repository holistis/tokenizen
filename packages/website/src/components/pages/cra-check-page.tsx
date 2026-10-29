import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from "lucide-react";

import { CinemaPage } from "@/components/home/cinema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { craToDutch } from "@/components/pages/cra-nl";
import { useLocale, type Locale } from "@/i18n/context";
import { CheckApiError, checkCraRepo, type CraCheckResult, type CraControl, type CraStatus } from "@/lib/check-api";

/**
 * Every sentence of this page, in both languages. What the server sends back is English. For a Dutch reader the fixed sentences of
 * cra-repo-check.ts (topic, evidence, explanation and fix of each signal, the advisories line, the notice, the rule basis and the list of
 * what is not measured) go through the phrasebook in cra-nl.ts; whatever it does not know, and the parts that vary (file names, scanner
 * names, licence ids) and the server's own error sentences, are shown as the server sent them. None of that is part of this table.
 */
interface Copy {
  title: string;
  description: string;
  chip: string;
  heading: string;
  lead: string;
  context: string;
  privacy: string;
  formTitle: string;
  formHint: string;
  fieldLabel: string;
  placeholder: string;
  emptyError: string;
  genericError: string;
  button: string;
  whyThisExists: string;
  indicationOnly: string;
  status: Record<CraStatus, string>;
  outcome: Record<string, string>;
  makeVisible: string;
  signalsTitle: string;
  signalsHint: string;
  summary: (repo: string, s: CraCheckResult["summary"]) => string;
  measured: (when: string, version: string, reviewedOn: string, cached: boolean) => string;
  regulationBefore: string;
  regulationLink: string;
  notMeasuredTitle: string;
  sourcesTitle: string;
  sourcesIntro: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    title: "Free check of eight security signals in a GitHub repository, related to the EU Cyber Resilience Act | tokenizen",
    description:
      "Name a public GitHub repository and see which of eight selected security signals, related to topics in the EU Cyber Resilience Act, are visible in it, and what would make the rest visible. An indication, not a compliance check. Free, read only, no reports stored.",
    chip: "free",
    heading: "Which security signals can be seen in your GitHub repository? Free, live, a repository name is enough.",
    lead:
      "Name a public GitHub repository. Our server reads a handful of its public pages, up to about thirty small requests, and tells you which of eight selected signals are visible: a security policy that names a contact, a software bill of materials, signed releases, pinned dependencies, automatic updates, security scans, recent maintenance and a licence. For each signal that is not visible you get what would make it visible, and a signal we could not read completely is marked as not measured, never as a gap.",
    context:
      "The EU Cyber Resilience Act (Regulation 2024/2847) puts duties on makers of software that is sold in the EU. The reporting duties of Article 14 apply from 11 September 2026, the rules on conformity assessment bodies from 11 June 2026 and most other duties from 11 December 2027. Many teams do not know where they stand, and most of what the Regulation asks is not visible from outside. These eight signals are our selection: some relate to Annex I part II of the Regulation, others are general good practice. They are not one signal for each legal requirement, and they do not tell you whether you comply.",
    privacy:
      "We do not store reports. An answer is kept in server memory for up to an hour (five minutes when part of it could not be read) so that the same repository is not read twice, and the server logs no repository names. Only public repositories can be checked, and a private repository looks the same as one that does not exist.",
    formTitle: "Your repository",
    formHint: "A public repository on github.com, as owner/name or its address.",
    fieldLabel: "Repository",
    placeholder: "owner/name",
    emptyError: "Type a public repository first, for example owner/name or https://github.com/owner/name",
    genericError: "Something went wrong. Please try again.",
    button: "Check this repository",
    whyThisExists:
      "Why this exists: we ran the same check on our own repositories first. One of them showed four signals that were not visible (no security policy, no automatic updates, no security scan, no software bill of materials), we added them, and the check now shows all eight as visible.",
    indicationOnly:
      "An indication from public data about eight selected signals is all this is. It is not a check against the legal requirements, not a conformity assessment, not legal advice, and not a certificate.",
    status: { visible: "visible", not_visible: "not visible", not_measured: "not measured" },
    outcome: { read: "read", partial: "partly read", not_found: "not found", moved: "moved", failed: "failed" },
    makeVisible: "To make it visible ",
    signalsTitle: "The eight signals",
    signalsHint:
      'Each signal relates to a topic in the Regulation around vulnerability handling and distribution of updates, or to general good practice. "Not visible" means we did not find it in the places we looked (the list of files in the repository, up to 12 workflow files and 6 pipeline files read in full, and its latest releases), not that you do not do it. "Not measured" means we could not read enough to say.',
    summary: (repo, s) =>
      `For ${repo}, ${s.visible} of the ${s.measured} public-repository signals we could check are visible` +
      (s.notVisible > 0 ? `, and ${s.notVisible} ${s.notVisible === 1 ? "is" : "are"} not visible in the places we looked` : "") +
      "." +
      (s.notMeasured > 0 ? ` ${s.notMeasured} could not be checked completely.` : "") +
      " This is not a compliance score.",
    measured: (when, version, reviewedOn, cached) =>
      `Measured ${when}. Rule set ${version}, reviewed on ${reviewedOn}.` +
      (cached ? " This answer comes from a short cache kept in server memory, because a repository does not change by the minute." : ""),
    regulationBefore: "The Regulation itself is",
    regulationLink: "on EUR-Lex",
    notMeasuredTitle: "What this does not tell you",
    sourcesTitle: "Check our facts yourself",
    sourcesIntro: "These are the public pages our server asked for, and what came of each. Open them and compare.",
  },
  nl: {
    title: "Gratis check van acht beveiligingssignalen in een GitHub-repository, verwant aan de EU Cyber Resilience Act | tokenizen",
    description:
      "Geef een openbare GitHub-repository op en zie welke van acht gekozen beveiligingssignalen, verwant aan onderwerpen uit de EU Cyber Resilience Act, erin zichtbaar zijn en wat de rest zichtbaar zou maken. Een indicatie, geen toets op naleving. Gratis, alleen lezen, geen rapporten opgeslagen.",
    chip: "gratis",
    heading: "Welke beveiligingssignalen zijn te zien in jouw GitHub-repository? Gratis, live, een repositorynaam is genoeg.",
    lead:
      "Geef een openbare GitHub-repository op. Onze server leest een handvol openbare pagina's ervan, hooguit zo'n dertig kleine verzoeken, en vertelt je welke van acht gekozen signalen zichtbaar zijn: een beveiligingsbeleid dat een contact noemt, een software bill of materials, ondertekende releases, vastgezette afhankelijkheden, automatische updates, beveiligingsscans, recent onderhoud en een licentie. Bij elk signaal dat niet zichtbaar is, lees je wat het zichtbaar zou maken. Een signaal dat we niet helemaal konden lezen, staat als niet gemeten, nooit als gat.",
    context:
      "De EU Cyber Resilience Act (verordening (EU) 2024/2847) legt verplichtingen op aan makers van software die in de EU wordt verkocht. De meldplichten van artikel 14 gelden vanaf 11 september 2026, de regels over instanties voor conformiteitsbeoordeling vanaf 11 juni 2026 en de meeste andere verplichtingen vanaf 11 december 2027. Veel teams weten niet waar ze staan, en het meeste van wat de verordening vraagt is van buitenaf niet te zien. Deze acht signalen zijn onze selectie: sommige hangen samen met bijlage I deel II van de verordening, andere zijn algemene goede praktijk. Het is niet één signaal per wettelijke eis, en ze vertellen je niet of je aan de verordening voldoet.",
    privacy:
      "We slaan geen rapporten op. Een antwoord blijft hooguit een uur in het geheugen van de server staan (vijf minuten als een deel ervan niet te lezen was), zodat dezelfde repository niet twee keer wordt gelezen, en de server logt geen repositorynamen. Alleen openbare repositories kunnen worden gecheckt, en een privérepository ziet er hetzelfde uit als een repository die niet bestaat.",
    formTitle: "Jouw repository",
    formHint: "Een openbare repository op github.com, als owner/name of met het adres ervan.",
    fieldLabel: "Repository",
    placeholder: "owner/name",
    emptyError: "Typ eerst een openbare repository, bijvoorbeeld owner/name of https://github.com/owner/name",
    genericError: "Er ging iets mis. Probeer het opnieuw.",
    button: "Check deze repository",
    whyThisExists:
      "Waarom dit bestaat: we hebben dezelfde check eerst op onze eigen repositories gedraaid. Bij een ervan waren vier signalen niet zichtbaar (geen beveiligingsbeleid, geen automatische updates, geen beveiligingsscan, geen software bill of materials). Die hebben we toegevoegd, en de check laat nu alle acht als zichtbaar zien.",
    indicationOnly:
      "Dit is niet meer dan een indicatie op basis van openbare gegevens over acht gekozen signalen. Het is geen toets aan de wettelijke eisen, geen conformiteitsbeoordeling, geen juridisch advies en geen certificaat.",
    status: { visible: "zichtbaar", not_visible: "niet zichtbaar", not_measured: "niet gemeten" },
    outcome: { read: "gelezen", partial: "deels gelezen", not_found: "niet gevonden", moved: "verplaatst", failed: "mislukt" },
    makeVisible: "Zo maak je het zichtbaar ",
    signalsTitle: "De acht signalen",
    signalsHint:
      'Elk signaal hoort bij een onderwerp uit de verordening rond het omgaan met kwetsbaarheden en het verspreiden van updates, of bij algemene goede praktijk. "Niet zichtbaar" betekent dat we het niet hebben gevonden op de plekken waar we keken (de lijst met bestanden in de repository, tot 12 workflowbestanden en 6 pipelinebestanden die helemaal zijn gelezen, en de laatste releases), niet dat jij het niet doet. "Niet gemeten" betekent dat we te weinig konden lezen om iets te zeggen.',
    summary: (repo, s) =>
      `Voor ${repo} ${s.visible === 1 ? "is" : "zijn"} ${s.visible} van de ${s.measured} signalen die we in de openbare repository konden controleren zichtbaar` +
      (s.notVisible > 0 ? `, en ${s.notVisible === 1 ? "is" : "zijn"} er ${s.notVisible} niet zichtbaar op de plekken waar we keken` : "") +
      "." +
      (s.notMeasured > 0 ? ` ${s.notMeasured} ${s.notMeasured === 1 ? "signaal kon" : "signalen konden"} niet volledig worden gecontroleerd.` : "") +
      " Dit is geen compliancescore.",
    measured: (when, version, reviewedOn, cached) =>
      `Gemeten op ${when}. Regelversie ${version}, beoordeeld op ${reviewedOn}.` +
      (cached ? " Dit antwoord komt uit een korte cache in het geheugen van de server, omdat een repository niet van minuut tot minuut verandert." : ""),
    regulationBefore: "De verordening zelf staat",
    regulationLink: "op EUR-Lex",
    notMeasuredTitle: "Wat dit je niet vertelt",
    sourcesTitle: "Controleer onze feiten zelf",
    sourcesIntro: "Dit zijn de openbare pagina's die onze server heeft opgevraagd, met per pagina de uitkomst. Open ze en vergelijk.",
  },
};

/** The title and description of the page in a language, for the browser tab and for search engines. */
export function craPageMeta(locale: Locale): { title: string; description: string } {
  const { title, description } = COPY[locale];
  return { title, description };
}

/**
 * The sentences check-api.ts itself writes when a request fails before or around the server's answer (the server's own error sentences
 * are not these, and stay as the server sends them). English passes through untouched; Dutch maps the four known sentences, keeps the HTTP
 * status number, and falls back to the generic Dutch sentence for anything it does not recognise. It depends on the exact wording in
 * check-api.ts: a test pins that wording.
 */
export function clientErrorText(locale: Locale, message: string): string {
  if (locale === "en") return message;
  if (message === "Could not reach the check service. It may be offline, or your connection dropped.") {
    return "De checkservice is niet bereikbaar. Misschien is hij offline, of is je verbinding weggevallen.";
  }
  if (message === "Too many attempts from this connection. Please wait a few minutes and try again.") {
    return "Te veel pogingen vanaf deze verbinding. Wacht een paar minuten en probeer het opnieuw.";
  }
  const unreadable = /^The check service returned an unreadable response \(HTTP (\d{1,3})\)\.$/.exec(message);
  if (unreadable) return `De checkservice gaf een onleesbaar antwoord (HTTP ${unreadable[1]}).`;
  const plain = /^The check service returned HTTP (\d{1,3})\.$/.exec(message);
  if (plain) return `De checkservice antwoordde met HTTP ${plain[1]}.`;
  return COPY.nl.genericError;
}

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

function StatusIcon({ status }: { status: CraStatus }) {
  if (status === "visible") return <CheckCircle2 className="size-5 shrink-0 text-rule-green" aria-hidden="true" />;
  if (status === "not_visible") return <AlertCircle className="size-5 shrink-0 text-rule-yellow" aria-hidden="true" />;
  return <MinusCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function StatusBadge({ status, word }: { status: CraStatus; word: string }) {
  const variant = status === "visible" ? "green" : status === "not_visible" ? "yellow" : "neutral";
  return <Badge variant={variant}>{word}</Badge>;
}

/** The addresses we list are ones our server built from a strictly validated owner/repo, but a link is only made for the two hosts it can ever be. */
const GITHUB_URL = /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\/[A-Za-z0-9._~%/?=&:-]+$/;

const LINK = "text-primary underline underline-offset-2 hover:text-foreground";

function ControlRow({ control, copy, tr }: { control: CraControl; copy: Copy; tr: (text: string) => string }) {
  return (
    <li className="flex gap-3 border-t border-border py-3 first:border-t-0">
      <StatusIcon status={control.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{tr(control.topic)}</p>
          <StatusBadge status={control.status} word={copy.status[control.status]} />
        </div>
        {control.evidence ? <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{tr(control.evidence)}</p> : null}
        <p className="mt-1 break-words text-sm text-muted-foreground">{tr(control.explanation)}</p>
        {control.fix ? (
          <p className="mt-1 break-words text-sm">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{copy.makeVisible}</span>
            {tr(control.fix)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Everything that came from the repository is rendered as a text node, never as markup. */
export function CraCheckResultView({ result }: { result: CraCheckResult }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  // English is what the server writes. Dutch gets the phrasebook; what it does not know stays as sent.
  const tr = locale === "nl" ? craToDutch : (text: string) => text;
  const { summary } = result;
  const measured = new Date(result.measuredAt);
  const when = Number.isNaN(measured.getTime()) ? result.measuredAt : measured.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <div className="mt-8 space-y-6" data-testid="cra-check-result">
      <div className="flex gap-3 rounded-md border border-border bg-card p-4">
        <StatusIcon status={summary.notVisible === 0 ? "visible" : "not_visible"} />
        <p className="text-base leading-relaxed">{copy.summary(result.repo, summary)}</p>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold leading-snug">{copy.signalsTitle}</h2>
        <CardDescription>{copy.signalsHint}</CardDescription>
        <CardContent>
          <ul>
            {result.controls.map((control) => (
              <ControlRow key={control.id} control={control} copy={copy} tr={tr} />
            ))}
          </ul>
          <p className="mt-3 break-words text-sm text-muted-foreground">{tr(result.advisories)}</p>
        </CardContent>
      </Card>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{copy.measured(when, result.rules.version, result.rules.reviewedOn, result.cached)}</p>
        <p>
          {tr(result.rules.basis)} {copy.regulationBefore}{" "}
          <a className={LINK} href={result.rules.regulation} target="_blank" rel="noreferrer noopener">
            {copy.regulationLink}
          </a>
          .
        </p>
        <p>{tr(result.notice)}</p>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">{copy.notMeasuredTitle}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.whatThisDoesNotMeasure.map((l) => (
              <li key={l}>{tr(l)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">{copy.sourcesTitle}</p>
          <p className="mt-1">{copy.sourcesIntro}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.sources.map((src) => (
              <li key={src.url} className="break-all font-mono text-xs">
                <span className="mr-2 rounded border border-border bg-card px-1.5 py-0.5">{copy.outcome[src.outcome] ?? src.outcome}</span>
                {GITHUB_URL.test(src.url) ? (
                  <a className={LINK} href={src.url} target="_blank" rel="noreferrer noopener">
                    {src.url}
                  </a>
                ) : (
                  src.url
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * The repository named in the address fragment (#repo=owner/name), for the field on the homepage that sends people here. A fragment is
 * never sent to a server, so the name of a repository does not appear in any request or log; a query (?repo=) would. Only a plain
 * owner/name or a github.com address is taken over; anything else leaves the field empty. It is only filled in, never sent: the check
 * runs when the person presses the button.
 */
export function repoFromHash(hash: string): string {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get("repo")?.trim() ?? "";
  if (/^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/.test(raw)) return raw;
  if (/^https:\/\/github\.com\/[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}\/?$/.test(raw)) return raw;
  return "";
}

export function CraCheckPage() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  useArticleMeta(copy.title, copy.description);

  const [repo, setRepo] = useState(() => (typeof window === "undefined" ? "" : repoFromHash(window.location.hash)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CraCheckResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (repo.trim().length === 0) {
      setError(copy.emptyError);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const answer = await checkCraRepo(repo.trim());
      if (answer.ok) setResult(answer);
      else setError(answer.error);
    } catch (err) {
      setError(err instanceof CheckApiError ? clientErrorText(locale, err.message) : copy.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <CinemaPage image="signalen" chip={copy.chip} title={copy.heading} lead={copy.lead}>
      <div className="max-w-3xl">
        <div className="space-y-4 text-base leading-relaxed text-foreground/90">
          <p>{copy.context}</p>
          <p className="text-sm text-muted-foreground">{copy.privacy}</p>
        </div>

        <Card className="mt-8">
          <h2 className="font-display text-lg font-semibold leading-snug">{copy.formTitle}</h2>
          <CardDescription>{copy.formHint}</CardDescription>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="cra-repo" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {copy.fieldLabel}
                </label>
                <input
                  id="cra-repo"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={copy.placeholder}
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </div>

              {error ? (
                <p className="text-sm text-rule-red" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {copy.button}
              </Button>
            </form>
          </CardContent>
        </Card>

        {result ? <CraCheckResultView result={result} /> : null}

        <div className="mt-10 space-y-3 text-sm text-muted-foreground">
          <p>{copy.whyThisExists}</p>
          <p>{copy.indicationOnly}</p>
        </div>
      </div>
    </CinemaPage>
  );
}
