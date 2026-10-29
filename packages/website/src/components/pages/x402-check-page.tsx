import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { CinemaPage } from "@/components/home/cinema";
import { useLocale, type Locale } from "@/i18n/context";
import { CheckApiError, checkX402Endpoint, type X402CheckResult, type X402Level, type X402Status } from "@/lib/check-api";

type Shown = X402Status | "not_evaluated";

interface ResultCopy {
  buyerTitle: string;
  buyerDescription: string;
  httpBadge: (status: number) => string;
  versionBadge: (version: number) => string;
  sourceBadge: (source: string) => string;
  warningsLabel: string;
  ladderTitle: string;
  /** The sentence(s) before the link to the definition; the link and the closing full stop follow. */
  ladderDescription: string;
  ladderLink: string;
  levelLabel: (level: number) => string;
  methodRetried: (firstStatus: number, from: string, to: string) => string;
  measured: (when: string, requests: number, cached: boolean) => string;
  limitsLabel: string;
  reproduceLabel: string;
  copyCommand: string;
  copied: string;
  reproduceNote: string;
  status: Record<Shown, string>;
}

interface Copy {
  title: string;
  description: string;
  chip: string;
  h1: string;
  lead: string;
  schemaParagraph: string;
  storageParagraph: string;
  routeTitle: string;
  routeHint: string;
  urlLabel: string;
  methodLegend: string;
  methodPost: string;
  methodGet: string;
  submit: string;
  emptyUrl: string;
  genericError: string;
  whyThisExists: string;
  openSource: (link: ReactNode) => ReactNode;
  result: ResultCopy;
}

// Every sentence of the page, in both languages. A key missing in one of them fails the type check. The English is the approved wording
// and stays as it is. Text that comes from the check server (the summary, the schema problems and warnings, the names and evidence of the
// levels, the limits, the server's own error sentences) is not here: it is shown as the server sent it.
export const X402_CHECK_COPY: Record<Locale, Copy> = {
  en: {
    title: "Free x402 endpoint check | tokenizen",
    description:
      "Paste the URL of an x402 route you run and see what a buyer's client would see: whether the payment request passes the official schema, and how far up the receipt ladder it gets. Free, never pays, nothing to install.",
    chip: "free",
    h1: "Check your x402 endpoint. Free, live, nothing to install.",
    lead: "Paste the URL of an x402 route you run. Our server sends it one anonymous request, never pays, and tells you what a buyer client would see.",
    schemaParagraph:
      "Two answers come from that one response. First: does the payment request pass the official x402 schema, the check a real buyer client runs before it pays. A request that fails it is usually not recognised as a payment request at all, and the seller sees no error. Second: how far up the receipt ladder you get, for the levels that need no payment.",
    storageParagraph:
      "We store nothing. The answer is kept in memory for two minutes so that a double click does not hit your server twice. A route can be checked a limited number of times per hour, and you may check only routes you run or have permission to test.",
    routeTitle: "Your route",
    routeHint: "A public https URL on the standard port. IP addresses and internal names are refused.",
    urlLabel: "Endpoint URL",
    methodLegend: "Method the route answers",
    methodPost: "POST (the usual case)",
    methodGet: "GET",
    submit: "Check this route",
    emptyUrl: "Paste the URL of your x402 route first, for example https://api.example.com/v1/route",
    genericError: "Something went wrong. Please try again.",
    whyThisExists:
      "Why this exists: a payment request can look fine to the person who wrote it and still fail every real buyer, silently. We shipped exactly that ourselves on 2026-10-22: a field 53 characters long where the buyer schema allows 32, with no error anywhere on our side. This page runs the check we wished we had had.",
    openSource: (link) => (
      <>
        The ladder and its definition are open source in {link}. Found a wrong verdict? Open an issue there with the URL and we will look at the response together.
      </>
    ),
    result: {
      buyerTitle: "Would a buyer client accept your payment request?",
      buyerDescription:
        "The answer is checked with the official x402 schema (the one real buyer clients validate with), on the very response the ladder below judged.",
      httpBadge: (status) => `HTTP ${status}`,
      versionBadge: (version) => `x402 version ${version}`,
      sourceBadge: (source) => `read from the ${source}`,
      warningsLabel: "Worth a look, not a failure",
      ladderTitle: "The receipt ladder",
      ladderDescription:
        "Levels 0 to 2 can be measured without paying. Levels 3 to 5 need a real settlement, so they come back as not measured, which is not the same as failed.",
      ladderLink: "What each level means",
      levelLabel: (level) => `Level ${level}`,
      methodRetried: (firstStatus, from, to) =>
        `Your route answered ${firstStatus} to ${from}, so we asked once more with ${to}. The verdicts above are about that second answer.`,
      measured: (when, requests, cached) =>
        `Measured ${when}. ${requests} ${requests === 1 ? "request" : "requests"} from our server.` +
        (cached ? " This answer comes from a two minute cache, so a double click does not hit your server twice." : ""),
      limitsLabel: "What this does not tell you",
      reproduceLabel: "Run the ladder yourself",
      copyCommand: "Copy command",
      copied: "Copied",
      reproduceNote: "The open source tool gives the ladder part. The schema part is the official parser run on the same response.",
      status: { pass: "pass", fail: "fail", not_measured: "not measured", not_evaluated: "not reached" },
    },
  },
  nl: {
    title: "Gratis x402-endpointcheck | tokenizen",
    description:
      "Plak de URL van een x402-route die je zelf draait en zie wat de client van een koper zou zien: of het betaalverzoek door het officiële schema komt en hoe hoog het op de receipt-ladder komt. Gratis, betaalt nooit, niets te installeren.",
    chip: "gratis",
    h1: "Check je x402-endpoint. Gratis, live, niets te installeren.",
    lead: "Plak de URL van een x402-route die je zelf draait. Onze server stuurt er één anoniem verzoek naartoe, betaalt nooit en laat je zien wat de client van een koper zou zien.",
    schemaParagraph:
      "Uit dat ene antwoord komen twee uitkomsten. Ten eerste: komt het betaalverzoek door het officiële x402-schema, de controle die een echte koperclient doet voordat er betaald wordt. Een verzoek dat daar niet doorheen komt, wordt meestal helemaal niet als betaalverzoek herkend, en de verkoper ziet geen enkele foutmelding. Ten tweede: hoe hoog je op de receipt-ladder komt, voor de niveaus waarvoor je niets hoeft te betalen.",
    storageParagraph:
      "We slaan niets op. Het antwoord blijft twee minuten in het geheugen staan, zodat een dubbele klik je server niet twee keer raakt. Een route kan een beperkt aantal keer per uur worden gecontroleerd, en je mag alleen routes controleren die je zelf draait of waarvoor je toestemming hebt om ze te testen.",
    routeTitle: "Jouw route",
    routeHint: "Een openbare https-URL op de standaardpoort. IP-adressen en interne namen worden geweigerd.",
    urlLabel: "Endpoint-URL",
    methodLegend: "Methode waarmee de route antwoordt",
    methodPost: "POST (het gebruikelijke geval)",
    methodGet: "GET",
    submit: "Controleer deze route",
    emptyUrl: "Plak eerst de URL van je x402-route, bijvoorbeeld https://api.example.com/v1/route",
    genericError: "Er ging iets mis. Probeer het opnieuw.",
    whyThisExists:
      "Waarom dit bestaat: een betaalverzoek kan er voor degene die het schreef prima uitzien en toch bij elke echte koper stilletjes mislukken. Precies dat hebben wij zelf live gezet op 22 oktober 2026: een veld van 53 tekens, terwijl het koperschema er maar 32 toestaat, zonder dat er aan onze kant ergens een foutmelding verscheen. Deze pagina draait de controle die wij toen graag hadden gehad.",
    openSource: (link) => (
      <>
        De ladder en de definitie ervan zijn open source in {link}. Een verkeerde uitkomst gezien? Open daar een issue met de URL, dan bekijken we het antwoord samen.
      </>
    ),
    result: {
      buyerTitle: "Zou een koperclient je betaalverzoek accepteren?",
      buyerDescription:
        "Dit wordt gecontroleerd met het officiële x402-schema (het schema waarmee echte koperclients valideren), op precies hetzelfde antwoord van je route waar de ladder hieronder over oordeelde.",
      httpBadge: (status) => `HTTP ${status}`,
      versionBadge: (version) => `x402-versie ${version}`,
      sourceBadge: (source) => `gelezen uit de ${source}`,
      warningsLabel: "Even naar kijken, maar geen fout",
      ladderTitle: "De receipt-ladder",
      ladderDescription:
        "Niveau 0 tot en met 2 kun je meten zonder te betalen. Niveau 3 tot en met 5 hebben een echte settlement nodig, dus die komen terug als niet gemeten, en dat is niet hetzelfde als mislukt.",
      ladderLink: "Wat elk niveau betekent",
      levelLabel: (level) => `Niveau ${level}`,
      methodRetried: (firstStatus, from, to) =>
        `Je route antwoordde ${firstStatus} op ${from}, dus we vroegen het nog één keer met ${to}. De uitkomsten hierboven gaan over dat tweede antwoord.`,
      measured: (when, requests, cached) =>
        `Gemeten op ${when}. ${requests} ${requests === 1 ? "verzoek" : "verzoeken"} vanaf onze server.` +
        (cached ? " Dit antwoord komt uit een cache van twee minuten, zodat een dubbele klik je server niet twee keer raakt." : ""),
      limitsLabel: "Wat dit je niet vertelt",
      reproduceLabel: "Draai de ladder zelf",
      copyCommand: "Kopieer commando",
      copied: "Gekopieerd",
      reproduceNote: "De open source tool levert het ladderdeel. Het schemadeel is de officiële parser, gedraaid op hetzelfde antwoord.",
      status: { pass: "geslaagd", fail: "mislukt", not_measured: "niet gemeten", not_evaluated: "niet bereikt" },
    },
  },
};

/**
 * The messages check-api.ts throws, in the reader's language. They arrive as plain English sentences, so they are matched by their wording;
 * anything unknown is shown as it came. (A code on CheckApiError would make this unnecessary.)
 */
export function localizeApiError(message: string, locale: Locale): string {
  if (locale === "en") return message;
  if (message === "Could not reach the check service. It may be offline, or your connection dropped.") {
    return "De check-dienst is niet bereikbaar. Mogelijk is hij offline of is je verbinding weggevallen.";
  }
  if (message === "Too many attempts from this connection. Please wait a few minutes and try again.") {
    return "Te veel pogingen vanaf deze verbinding. Wacht een paar minuten en probeer het opnieuw.";
  }
  const unreadable = /^The check service returned an unreadable response \(HTTP (\d+)\)\.$/.exec(message);
  if (unreadable) return `De check-dienst gaf een onleesbaar antwoord (HTTP ${unreadable[1]}).`;
  const plain = /^The check service returned HTTP (\d+)\.$/.exec(message);
  if (plain) return `De check-dienst gaf HTTP ${plain[1]} terug.`;
  return message;
}

function usePageMeta(title: string, description: string) {
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

function StatusIcon({ status }: { status: Shown }) {
  if (status === "pass") return <CheckCircle2 className="size-5 shrink-0 text-rule-green" aria-hidden="true" />;
  if (status === "fail") return <XCircle className="size-5 shrink-0 text-rule-red" aria-hidden="true" />;
  if (status === "not_measured") return <AlertCircle className="size-5 shrink-0 text-rule-yellow" aria-hidden="true" />;
  return <MinusCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function StatusBadge({ status, words }: { status: Shown; words: Record<Shown, string> }) {
  const variant = status === "pass" ? "green" : status === "fail" ? "red" : status === "not_measured" ? "yellow" : "neutral";
  return <Badge variant={variant}>{words[status]}</Badge>;
}

/** Single quotes inside a URL would end the quoting of the command we hand out, so they are percent-encoded. */
export function reproduceCommand(url: string): string {
  return `npx -y agent-receipt-verify '${url.replace(/'/g, "%27")}'`;
}

function LevelRow({ level, copy }: { level: X402Level; copy: ResultCopy }) {
  return (
    <li className="flex gap-3 border-t border-border py-3 first:border-t-0">
      <StatusIcon status={level.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{copy.levelLabel(level.level)}</span>
          <StatusBadge status={level.status} words={copy.status} />
        </div>
        <p className="mt-1 text-sm font-medium">{level.name}</p>
        {level.evidence ? <p className="mt-1 break-words text-sm text-muted-foreground">{level.evidence}</p> : null}
      </div>
    </li>
  );
}

/**
 * Everything text that came from the endpoint is rendered as a text node, never as markup. The sentences of the page itself come in the
 * reader's language; the ones the check server wrote (summary, problems, warnings, level names and evidence, limits) are shown as sent.
 */
export function X402CheckResultView({ result, locale = "en" }: { result: X402CheckResult; locale?: Locale }) {
  const copy = X402_CHECK_COPY[locale].result;
  const { buyerCheck, ladder } = result;
  const headline: Shown = buyerCheck.status === "fail" || ladder.levels[0]?.status === "fail" ? "fail" : buyerCheck.status;
  const measured = new Date(result.measuredAt);
  const when = Number.isNaN(measured.getTime()) ? result.measuredAt : measured.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <div className="mt-8 space-y-6" data-testid="x402-check-result">
      <div className="flex gap-3 rounded-md border border-border bg-muted/40 p-4">
        <StatusIcon status={headline} />
        <p className="text-base leading-relaxed">{result.summary}</p>
      </div>

      <Card>
        <CardTitle>{copy.buyerTitle}</CardTitle>
        <CardDescription>{copy.buyerDescription}</CardDescription>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={buyerCheck.status} words={copy.status} />
            {buyerCheck.httpStatus !== null ? <Badge>{copy.httpBadge(buyerCheck.httpStatus)}</Badge> : null}
            {buyerCheck.x402Version !== null ? <Badge>{copy.versionBadge(buyerCheck.x402Version)}</Badge> : null}
            {buyerCheck.source ? <Badge>{copy.sourceBadge(buyerCheck.source)}</Badge> : null}
          </div>
          {buyerCheck.problems.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {buyerCheck.problems.map((p) => (
                <li key={p} className="break-words">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
          {buyerCheck.warnings.length > 0 ? (
            <div className="mt-3">
              <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{copy.warningsLabel}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {buyerCheck.warnings.map((w) => (
                  <li key={w} className="break-words">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardTitle>{copy.ladderTitle}</CardTitle>
        <CardDescription>
          {copy.ladderDescription}{" "}
          <a className="underline underline-offset-2 hover:text-foreground" href={ladder.definition} target="_blank" rel="noreferrer noopener">
            {copy.ladderLink}
          </a>
          .
        </CardDescription>
        <CardContent>
          <ul>
            {ladder.levels.map((level) => (
              <LevelRow key={level.level} level={level} copy={copy} />
            ))}
          </ul>
          {ladder.methodRetried ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {copy.methodRetried(ladder.methodRetried.firstStatus, ladder.methodRetried.from, ladder.methodRetried.to)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{copy.measured(when, result.requestsMade, result.cached)}</p>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">{copy.limitsLabel}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">{copy.reproduceLabel}</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{reproduceCommand(result.url)}</code>
            <CopyButton value={reproduceCommand(result.url)} copyLabel={copy.copyCommand} copiedLabel={copy.copied} />
          </div>
          <p className="mt-1">{copy.reproduceNote}</p>
        </div>
      </div>
    </div>
  );
}

export function X402CheckPage() {
  const { locale } = useLocale();
  const c = X402_CHECK_COPY[locale];
  usePageMeta(c.title, c.description);

  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"POST" | "GET">("POST");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<X402CheckResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (url.trim().length === 0) {
      setError(c.emptyUrl);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const answer = await checkX402Endpoint(url.trim(), method);
      if (answer.ok) setResult(answer);
      // The server's own sentence, as it sent it.
      else setError(answer.error);
    } catch (err) {
      setError(err instanceof CheckApiError ? localizeApiError(err.message, locale) : c.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <CinemaPage image="betaling" chip={c.chip} title={c.h1} lead={c.lead}>
      <div className="max-w-2xl [color-scheme:dark]">
        <div className="space-y-4 text-base leading-relaxed text-foreground/90">
          <p>{c.schemaParagraph}</p>
          <p className="text-sm text-muted-foreground">{c.storageParagraph}</p>
        </div>

        <Card className="mt-8">
          <CardTitle>{c.routeTitle}</CardTitle>
          <CardDescription>{c.routeHint}</CardDescription>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="x402-url" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {c.urlLabel}
                </label>
                <input
                  id="x402-url"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://api.example.com/v1/route"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </div>
              <fieldset>
                <legend className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">{c.methodLegend}</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="x402-method" className="accent-primary" checked={method === "POST"} onChange={() => setMethod("POST")} />
                    {c.methodPost}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="x402-method" className="accent-primary" checked={method === "GET"} onChange={() => setMethod("GET")} />
                    {c.methodGet}
                  </label>
                </div>
              </fieldset>

              {error ? (
                <p className="text-sm text-rule-red" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {c.submit}
              </Button>
            </form>
          </CardContent>
        </Card>

        {result ? <X402CheckResultView result={result} locale={locale} /> : null}

        <div className="mt-10 space-y-3 text-sm text-muted-foreground">
          <p>{c.whyThisExists}</p>
          <p>
            {c.openSource(
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/holistis/agent-receipt-verify"
                target="_blank"
                rel="noreferrer noopener"
              >
                agent-receipt-verify
              </a>,
            )}
          </p>
        </div>
      </div>
    </CinemaPage>
  );
}
