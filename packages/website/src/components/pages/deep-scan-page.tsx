import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { CinemaPage } from "@/components/home/cinema";
import { Button } from "@/components/ui/button";
import { useLocale, type Locale } from "@/i18n/context";
import {
  getQuote, getReport, getStatus, isStripeUrl, startCheckout, withdraw, type ApiFailure, type Hypothesis, type OrderStatus, type Quote, type Report,
} from "@/lib/deep-scan-api";
import {
  CONSENT, confirmationFor, euros, forgetToken, formatMoment, keepPolling, normaliseRepo, privateLink, readToken, savedOrders, saveToken, TERMS_VERSION, type OrderState, type SavedOrder,
} from "@/lib/deep-scan-logic";
import { localePath } from "@/lib/locale-paths";

/** Every sentence of both pages, in both languages. What the server sends (names, numbers, the hypotheses) is shown as text, never as markup. */
export interface Copy {
  title: string;
  description: string;
  chip: string;
  heading: string;
  lead: string;
  priceRule: string;
  refundRule: string;
  honest: string;
  scoreboard: string;
  formTitle: string;
  fieldLabel: string;
  placeholder: string;
  hint: string;
  quoteButton: string;
  busy: string;
  errors: { empty: string; invalid: string; notFound: string; tooBig: string; noSolidity: string; busy: string; rate: string; network: string; generic: string; unknownKey: string };
  quoted: (repo: string, lines: number, price: string) => string;
  consent: string;
  consentLinks: { terms: string; privacy: string };
  pay: (price: string) => string;
  payNote: string;
  paying: string;
  linkTitle: string;
  linkText: string;
  copy: string;
  copied: string;
  statusTitle: string;
  statusChip: string;
  statusLead: string;
  noKey: string;
  states: Record<OrderState, string>;
  refundMade: string;
  refundBusy: string;
  checking: string;
  reportTitle: string;
  reportMeta: (lines: number, read: number, total: number) => string;
  partial: string;
  unread: string;
  nothingFound: string;
  hypothesisCount: (n: number) => string;
  labels: { where: string; abuse: string; impact: string; fix: string; confidence: string };
  reportNote: string;
  download: string;
  confirmation: string;
  withdrawLead: string;
  withdrawButton: string;
  withdrawBusy: string;
  withdrawError: string;
  withdrawn: (time: string) => string;
  withdrawLate: string;
  savedTitle: string;
  forget: string;
}

export const COPY: Record<Locale, Copy> = {
  en: {
    title: "Deep scan of a smart contract repository | tokenizen",
    description:
      "Name a public GitHub repository, see the price before you pay, and get hypotheses about its Solidity code to check by hand. 0.02 euro per line, minimum 2 euro, a full refund if the scan fails, finds nothing or reads less than half of your code.",
    chip: "deep scan",
    heading: "Hypotheses about your Solidity code, with the price shown first.",
    lead:
      "Name a public GitHub repository. We count the lines of Solidity the scan will read and show the price before you pay. After your payment an AI reader goes through the code, and you get a list of hypotheses to check by hand.",
    priceRule:
      "0.02 euro per line of Solidity in scope, minimum 2 euro, maximum 12,000 lines, VAT included. Blank lines and comments count. Files in test, mock, script, interface and library folders do not count, and neither do files with Mock or Test in their name. The scan reads the code as it is when it starts, and a smaller repository does not lower the price.",
    refundRule:
      "You get your money back in full if the scan fails, if the report has no hypotheses, if part of the scan failed or it read less than half of the code in scope, or if it has not started within 6 hours after Stripe confirmed your payment to us.",
    honest:
      "What this is not: an audit, a certificate or a promise that nothing else is wrong. The deep scan misses real problems and names some that are not real. We have run this deep scan once on one public contest, which is too little for a quality figure, so we give none. How our earlier scans did is on the scoreboard, with the judge named next to every number.",
    scoreboard: "The scoreboard",
    formTitle: "Your repository",
    fieldLabel: "Repository",
    placeholder: "owner/name",
    hint: "A public repository on github.com, as owner/name or its address. Private repositories cannot be scanned.",
    quoteButton: "Show the price",
    busy: "Counting lines, this can take a minute",
    errors: {
      empty: "Type a public repository first, for example owner/name or the address of a repository on github.com.",
      invalid: "That does not look like a public GitHub repository. Use owner/name or the address of the repository on github.com.",
      notFound: "We could not find that repository, or it is not public.",
      tooBig: "That repository is too big for an automatic scan. Email info@tokenizen.nl and we will see what we can do.",
      noSolidity: "We found no Solidity contracts in scope in that repository.",
      busy: "We are busy right now. Try again in a minute.",
      rate: "Too many requests from your address. Try again in a few minutes.",
      network: "We could not reach the scan service. Check your connection and try again.",
      generic: "Something went wrong. Please try again.",
      unknownKey: "We do not recognise this key. Check that you opened the whole private link.",
    },
    quoted: (repo, lines, price) => `${repo}: ${lines.toLocaleString("en-IE")} lines of Solidity in scope. Price: ${price}.`,
    consent: CONSENT[TERMS_VERSION].en,
    consentLinks: { terms: "Terms of the deep scan", privacy: "Privacy statement" },
    pay: (price) => `Pay ${price}`,
    payNote: "You pay on the page of Stripe, by card or iDEAL. Once we receive your payment the scan starts, and the report appears at your private link.",
    paying: "Taking you to the payment page",
    linkTitle: "Keep your private link",
    linkText:
      "Your report can only be opened with this link, and anyone who has it can read the report. We save it in this browser when you go to the payment page. Copy it somewhere you will find it again.",
    copy: "Copy the link",
    copied: "Copied",
    statusTitle: "Your deep scan",
    statusChip: "deep scan",
    statusLead: "This page follows your scan and shows the report when it is ready. You can close it and come back with your private link.",
    noKey: "We cannot find the key of your report in this browser. Open the private link you kept: it ends with # and a long code.",
    states: {
      OFFERTE: "A price was shown, but no payment has been made.",
      WACHT_OP_BETALING: "Waiting for the confirmation of your payment.",
      BETAALD: "Paid. Your scan is in the queue.",
      BEZIG: "Your scan is running. This usually takes a few minutes.",
      KLAAR: "Your report is ready.",
      MISLUKT: "Something went wrong with the scan. You get your money back in full.",
      AFWIJKEND: "Your payment did not match the price that was shown, so nothing was started and your payment is refunded. Questions: info@tokenizen.nl.",
      VERLOPEN: "This price has expired without a payment. Ask for a new price.",
      INGETROKKEN: "You cancelled this purchase. The full price is refunded and no report is made.",
    },
    refundMade: "We have asked Stripe to refund you. It usually reaches your account within 5 to 10 working days.",
    refundBusy: "The refund is being made.",
    checking: "Checking where your scan is",
    reportTitle: "Report",
    reportMeta: (lines, read, total) => `${lines.toLocaleString("en-IE")} lines of Solidity in scope. ${read} of ${total} contract files read.`,
    partial: "Part of the scan failed, so your payment is refunded in full and you keep this report.",
    unread: "Not read:",
    nothingFound:
      "Nothing turned up that the scan could defend with a code path. That does not mean nothing is wrong. Your payment is refunded in full.",
    hypothesisCount: (n) => (n === 1 ? "1 hypothesis" : `${n} hypotheses`),
    labels: { where: "Where", abuse: "How it could be abused", impact: "Impact", fix: "Suggested fix", confidence: "The AI's own estimate, not a probability" },
    reportNote: "These are hypotheses from an AI reader, to be checked by hand. This is not an audit and not a guarantee that nothing else is wrong.",
    download: "Download as JSON",
    confirmation: "Download your order confirmation",
    withdrawLead: "You can cancel this purchase until your report is delivered. Then the full price is refunded and no report is made.",
    withdrawButton: "Cancel purchase",
    withdrawBusy: "Cancelling",
    withdrawError: "The cancellation did not go through. If your report is already delivered, the right of withdrawal has ended, as you agreed before paying. Questions: info@tokenizen.nl.",
    withdrawn: (time) => `Your cancellation was received on ${time}. No report will be made and the full price is refunded.`,
    withdrawLate: "Your report was delivered, so the right of withdrawal ended, as you agreed before paying.",
    savedTitle: "Other reports saved in this browser",
    forget: "Remove the saved keys from this browser",
  },
  nl: {
    title: "Diepe scan van een smart-contractrepository | tokenizen",
    description:
      "Geef een openbare GitHub-repository op, zie de prijs voor je betaalt en krijg hypotheses over de Solidity-code om met de hand na te lopen. 0,02 euro per regel, minimum 2 euro, volledige terugbetaling als de scan mislukt, niets vindt of minder dan de helft van je code leest.",
    chip: "diepe scan",
    heading: "Hypotheses over je Solidity-code, met eerst de prijs.",
    lead:
      "Geef een openbare GitHub-repository op. We tellen de regels Solidity die de scan leest en tonen de prijs voor je betaalt. Na je betaling loopt een AI-lezer door de code en krijg je een lijst hypotheses om met de hand na te lopen.",
    priceRule:
      "0,02 euro per regel Solidity in scope, minimum 2 euro, maximum 12.000 regels, inclusief btw. Lege regels en commentaar tellen mee. Bestanden in mappen voor tests, mocks, scripts, interfaces en bibliotheken tellen niet mee, en bestanden met Mock of Test in de naam ook niet. De scan leest de code zoals hij is als hij start, en een kleinere repository verlaagt de prijs niet.",
    refundRule:
      "Je krijgt je geld volledig terug als de scan mislukt, als het rapport geen hypothese bevat, als een deel van de scan mislukte of hij minder dan de helft van de code in scope las, of als hij niet binnen 6 uur nadat Stripe je betaling aan ons bevestigde is gestart.",
    honest:
      "Wat dit niet is: een audit, een certificaat of een belofte dat er verder niets mis is. De diepe scan mist echte problemen en noemt er een paar die niet echt zijn. We hebben deze diepe scan één keer op één openbare wedstrijd laten draaien, wat te weinig is voor een kwaliteitscijfer, dus we geven er geen. Hoe onze eerdere scans het deden staat op het scorebord, met de rechter erbij bij elk getal.",
    scoreboard: "Het scorebord",
    formTitle: "Jouw repository",
    fieldLabel: "Repository",
    placeholder: "owner/name",
    hint: "Een openbare repository op github.com, als owner/name of met het adres ervan. Privérepository's kunnen niet worden gescand.",
    quoteButton: "Toon de prijs",
    busy: "Regels tellen, dit kan een minuut duren",
    errors: {
      empty: "Typ eerst een openbare repository, bijvoorbeeld owner/name of het adres van een repository op github.com.",
      invalid: "Dat lijkt niet op een openbare GitHub-repository. Gebruik owner/name of het adres van de repository op github.com.",
      notFound: "We konden die repository niet vinden, of hij is niet openbaar.",
      tooBig: "Die repository is te groot voor een automatische scan. Mail info@tokenizen.nl en we kijken wat er kan.",
      noSolidity: "We vonden geen Solidity-contracten in scope in die repository.",
      busy: "Het is nu druk. Probeer het over een minuut opnieuw.",
      rate: "Te veel aanvragen vanaf je adres. Wacht een paar minuten en probeer het dan nog eens.",
      network: "We konden de scandienst niet bereiken. Controleer je verbinding en probeer nog eens.",
      generic: "Er ging iets mis. Probeer het opnieuw.",
      unknownKey: "We herkennen deze sleutel niet. Controleer of je de hele privélink hebt geopend.",
    },
    quoted: (repo, lines, price) => `${repo}: ${lines.toLocaleString("nl-NL")} regels Solidity in scope. Prijs: ${price}.`,
    consent: CONSENT[TERMS_VERSION].nl,
    consentLinks: { terms: "Voorwaarden van de diepe scan", privacy: "Privacyverklaring" },
    pay: (price) => `Betaal ${price}`,
    payNote: "Je betaalt op de pagina van Stripe, met kaart of iDEAL. Zodra we je betaling hebben ontvangen start de scan, en het rapport staat dan op je privélink.",
    paying: "We brengen je naar de betaalpagina",
    linkTitle: "Bewaar je privélink",
    linkText:
      "Je rapport is alleen te openen met deze link, en wie hem heeft kan het rapport lezen. We bewaren hem in deze browser zodra je naar de betaalpagina gaat. Kopieer hem naar een plek waar je hem terugvindt.",
    copy: "Kopieer de link",
    copied: "Gekopieerd",
    statusTitle: "Jouw diepe scan",
    statusChip: "diepe scan",
    statusLead: "Deze pagina volgt je scan en toont het rapport zodra het klaar is. Je kunt hem sluiten en terugkomen met je privélink.",
    noKey: "We vinden de sleutel van je rapport niet in deze browser. Open de privélink die je bewaarde: hij eindigt op # en een lange code.",
    states: {
      OFFERTE: "Er is een prijs getoond, maar er is niet betaald.",
      WACHT_OP_BETALING: "Wachten op de bevestiging van je betaling.",
      BETAALD: "Betaald. Je scan staat in de rij.",
      BEZIG: "Je scan loopt. Dit duurt meestal een paar minuten.",
      KLAAR: "Je rapport is klaar.",
      MISLUKT: "Er ging iets mis met de scan. Je krijgt je geld volledig terug.",
      AFWIJKEND: "Je betaling kwam niet overeen met de getoonde prijs, dus er is niets gestart en je betaling wordt terugbetaald. Vragen: info@tokenizen.nl.",
      VERLOPEN: "Deze prijs is verlopen zonder betaling. Vraag een nieuwe prijs aan.",
      INGETROKKEN: "Je hebt deze aankoop ongedaan gemaakt. De volledige prijs wordt terugbetaald en er komt geen rapport.",
    },
    refundMade: "We hebben Stripe gevraagd je terug te betalen. Het staat meestal binnen 5 tot 10 werkdagen op je rekening.",
    refundBusy: "De terugbetaling wordt gedaan.",
    checking: "We kijken hoe het met je scan staat",
    reportTitle: "Rapport",
    reportMeta: (lines, read, total) => `${lines.toLocaleString("nl-NL")} regels Solidity in scope. ${read} van ${total} contractbestanden gelezen.`,
    partial: "Een deel van de scan mislukte, dus je betaling wordt volledig terugbetaald en je houdt dit rapport.",
    unread: "Niet gelezen:",
    nothingFound:
      "Er kwam niets boven wat de scan met een codepad kon verdedigen. Dat betekent niet dat er niets mis is. Je betaling wordt volledig terugbetaald.",
    hypothesisCount: (n) => (n === 1 ? "1 hypothese" : `${n} hypotheses`),
    labels: { where: "Waar", abuse: "Hoe het misbruikt kan worden", impact: "Gevolg", fix: "Voorgestelde oplossing", confidence: "De eigen inschatting van de AI, geen kans" },
    reportNote: "Dit zijn hypotheses van een AI-lezer, om met de hand na te lopen. Dit is geen audit en geen garantie dat er verder niets mis is.",
    download: "Download als JSON",
    confirmation: "Download je bestelbevestiging",
    withdrawLead: "Je kunt deze aankoop ongedaan maken tot je rapport is geleverd. Dan wordt de volledige prijs terugbetaald en er komt geen rapport.",
    withdrawButton: "Koop ongedaan maken",
    withdrawBusy: "Bezig met annuleren",
    withdrawError: "De annulering is niet gelukt. Is je rapport al geleverd, dan is het herroepingsrecht vervallen, zoals je voor je betaling hebt aanvaard. Vragen: info@tokenizen.nl.",
    withdrawn: (time) => `Je herroeping is ontvangen op ${time}. Er komt geen rapport en de volledige prijs wordt terugbetaald.`,
    withdrawLate: "Je rapport is geleverd, dus het herroepingsrecht is vervallen, zoals je voor je betaling hebt aanvaard.",
    savedTitle: "Andere rapporten bewaard in deze browser",
    forget: "Haal de bewaarde sleutels uit deze browser",
  },
};

/** Maps what the server says (its sentences are Dutch) to a sentence in the reader's language. */
export function failureText(f: ApiFailure, c: Copy): string {
  if (f.status === 0) return c.errors.network;
  if (f.status === 429) return c.errors.rate;
  if (f.status === 503) return c.errors.busy;
  if (/niet gevonden of niet openbaar/.test(f.error)) return c.errors.notFound;
  if (/te groot/.test(f.error)) return c.errors.tooBig;
  if (/geen Solidity/.test(f.error)) return c.errors.noSolidity;
  return c.errors.generic;
}

const useLang = (): Locale => (useLocale().locale === "nl" ? "nl" : "en");
const storage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

function ConsentLinks({ c, locale }: { c: Copy; locale: Locale }) {
  return (
    <p className="text-sm">
      <a className="underline underline-offset-2 hover:text-primary" href={localePath(locale, "/deep-scan-terms")}>{c.consentLinks.terms}</a>
      {" · "}
      <a className="underline underline-offset-2 hover:text-primary" href={localePath(locale, "/privacy")}>{c.consentLinks.privacy}</a>
    </p>
  );
}

export function DeepScanPage() {
  const locale = useLang();
  const c = COPY[locale];
  const [repo, setRepo] = useState("");
  const [phase, setPhase] = useState<"idle" | "quoting" | "quoted" | "paying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = c.title;
    return () => { document.title = previous; };
  }, [c.title]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!repo.trim()) return setError(c.errors.empty);
    const name = normaliseRepo(repo);
    if (!name) return setError(c.errors.invalid);
    setPhase("quoting");
    setAgreed(false);
    const r = await getQuote(name);
    if (!r.ok) { setPhase("idle"); setQuote(null); return setError(failureText(r, c)); }
    setQuote(r);
    setPhase("quoted");
  }

  async function pay() {
    if (!quote || !agreed) return;
    setError(null);
    setPhase("paying");
    const r = await startCheckout(quote.token, TERMS_VERSION, locale);
    if (!r.ok) { setPhase("quoted"); return setError(failureText(r, c)); }
    if (!isStripeUrl(r.url)) { setPhase("quoted"); return setError(c.errors.generic); }
    saveToken(storage(), quote.token);
    window.location.assign(r.url);
  }

  const link = quote ? privateLink(window.location.origin, locale, quote.token) : "";
  const price = quote ? euros(quote.prijsCenten, locale) : "";

  return (
    <CinemaPage image="lens" chip={c.chip} title={c.heading} lead={c.lead}>
      <div className="max-w-2xl space-y-6">
        <p>{c.priceRule}</p>
        <p>{c.refundRule}</p>
        <p>{c.honest} <a className="underline underline-offset-2 hover:text-primary" href={localePath(locale, "/scoreboard")}>{c.scoreboard}</a></p>

        <form onSubmit={ask} className="space-y-3" aria-labelledby="deep-scan-form-title">
          <h2 id="deep-scan-form-title" className="font-display text-xl font-semibold tracking-tight">{c.formTitle}</h2>
          <label className="block text-sm" htmlFor="deep-scan-repo">{c.fieldLabel}</label>
          <input
            id="deep-scan-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={c.placeholder} maxLength={200}
            autoComplete="off" spellCheck={false} disabled={phase === "quoting" || phase === "paying"}
            className="w-full rounded-md border border-white/20 bg-black/20 px-3 py-2 font-mono text-sm"
          />
          <p className="text-sm opacity-80">{c.hint}</p>
          <Button type="submit" disabled={phase === "quoting" || phase === "paying"}>
            {phase === "quoting" ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> {c.busy}</> : c.quoteButton}
          </Button>
        </form>

        {error !== null && (
          <p role="alert" className="flex items-start gap-2 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</p>
        )}

        {quote && (phase === "quoted" || phase === "paying") && (
          <section className="space-y-4 border-t border-white/10 pt-6" aria-live="polite">
            <p className="flex items-start gap-2 text-lg font-medium"><CheckCircle2 className="mt-1 size-5 shrink-0" aria-hidden="true" />{c.quoted(quote.repo, quote.regels, price)}</p>
            <div className="space-y-2 rounded-md border border-white/15 p-4">
              <h3 className="font-semibold">{c.linkTitle}</h3>
              <p className="text-sm">{c.linkText}</p>
              <p className="break-all font-mono text-xs">{link}</p>
              <Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); }}>
                {copied ? c.copied : c.copy}
              </Button>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-4" disabled={phase === "paying"} />
              <span>{c.consent}</span>
            </label>
            <ConsentLinks c={c} locale={locale} />
            <Button type="button" onClick={pay} disabled={!agreed || phase === "paying"}>
              {phase === "paying" ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> {c.paying}</> : c.pay(price)}
            </Button>
            <p className="text-sm opacity-80">{c.payNote}</p>
          </section>
        )}
      </div>
    </CinemaPage>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The page a customer returns to after paying, and opens again with the private link.

function Field({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      {label ? <dt className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</dt> : null}
      <dd className="whitespace-pre-line break-words">{text}</dd>
    </div>
  );
}

export function HypothesisCard({ h, c }: { h: Hypothesis; c: Copy }) {
  const where = [h.file, h.function].filter(Boolean).join(" · ");
  return (
    <li className="space-y-3 rounded-md border border-white/15 p-4">
      <h3 className="break-words text-lg font-semibold">{h.severity ? <span className="mr-2 rounded bg-white/10 px-2 py-0.5 text-xs uppercase">{h.severity}</span> : null}{h.title}</h3>
      <dl className="space-y-2 text-sm">
        <Field label={c.labels.where} text={where} />
        <Field label="" text={h.description} />
        <Field label={c.labels.abuse} text={h.attackPath} />
        <Field label={c.labels.impact} text={h.impact} />
        <Field label={c.labels.fix} text={h.recommendation} />
        {typeof h.confidence === "number" ? <Field label={c.labels.confidence} text={`${Math.round(h.confidence * 100)}%`} /> : null}
      </dl>
    </li>
  );
}

export function ReportView({ report, c }: { report: Report; c: Copy }) {
  const read = report.gelezen;
  return (
    <section className="space-y-4" aria-label={c.reportTitle}>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{c.reportTitle}: {report.repository}</h2>
      <p className="text-sm">{read ? c.reportMeta(report.inScope.regels, read.bestanden, read.vanTotaal) : null}</p>
      {!report.volledig ? <p className="text-sm">{c.partial}</p> : null}
      {read && read.nietGelezen.length > 0 ? <p className="break-words font-mono text-xs">{c.unread} {read.nietGelezen.join(", ")}</p> : null}
      {report.hypotheses.length === 0 ? <p>{c.nothingFound}</p> : (
        <>
          <p className="font-medium">{c.hypothesisCount(report.hypotheses.length)}</p>
          <ol className="space-y-4">{report.hypotheses.map((h, i) => <HypothesisCard key={i} h={h} c={c} />)}</ol>
        </>
      )}
      <p className="text-sm opacity-80">{c.reportNote}</p>
    </section>
  );
}

export function StatusView({ status, report, c, locale = "en", onWithdraw, withdrawing = false, withdrawError = false }: {
  status: OrderStatus | null; report: Report | null; c: Copy; locale?: Locale; onWithdraw?: () => void; withdrawing?: boolean; withdrawError?: boolean;
}) {
  if (!status) return <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{c.checking}</p>;
  return (
    <div className="space-y-4" aria-live="polite">
      <p className="text-lg font-medium">{c.states[status.toestand]}</p>
      {status.terugbetaling ? <p className="text-sm">{status.terugbetaald ? c.refundMade : c.refundBusy}</p> : null}
      {status.herroepingOp ? <p className="text-sm">{c.withdrawn(formatMoment(status.herroepingOp, locale))}</p> : null}
      {!status.herroepingOp && (status.toestand === "BETAALD" || status.toestand === "BEZIG") && onWithdraw ? (
        <div className="space-y-2 rounded-md border border-white/15 p-4">
          <p className="text-sm">{c.withdrawLead}</p>
          <Button type="button" variant="outline" onClick={onWithdraw} disabled={withdrawing}>{withdrawing ? c.withdrawBusy : c.withdrawButton}</Button>
          {withdrawError ? <p role="alert" className="text-sm">{c.withdrawError}</p> : null}
        </div>
      ) : null}
      {status.toestand === "KLAAR" ? <p className="text-sm opacity-80">{c.withdrawLate}</p> : null}
      {report ? <ReportView report={report} c={c} /> : null}
    </div>
  );
}

export function DeepScanStatusPage() {
  const locale = useLang();
  const c = COPY[locale];
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedOrder[]>([]);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawFailed, setWithdrawFailed] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    document.title = c.statusTitle + " | tokenizen";
    const robots = document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex";
    document.head.appendChild(robots);
    return () => { robots.remove(); };
  }, [c.statusTitle]);

  useEffect(() => {
    const lees = () => { setStatus(null); setReport(null); setFailed(null); setSaved(savedOrders(storage())); setToken(readToken(window.location.hash, storage())); };
    lees();
    window.addEventListener("hashchange", lees);
    return () => window.removeEventListener("hashchange", lees);
  }, []);

  useEffect(() => {
    if (!token) return;
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      if (stopped.current || !token) return;
      const s = await getStatus(token);
      if (stopped.current) return;
      if (!s.ok) {
        setFailed(s.status === 404 || s.status === 400 ? c.errors.unknownKey : failureText(s, c));
        if (s.status === 404 || s.status === 400) return; // a key that does not exist will not start to exist
      } else {
        setFailed(null);
        setStatus(s);
        if (s.toestand === "KLAAR" && s.rapportKlaar) {
          const r = await getReport(token);
          if (!stopped.current && r.ok) setReport(r.rapport);
        }
        if (!keepPolling(s.toestand, s.terugbetaling, s.terugbetaald) && (s.toestand !== "KLAAR" || s.rapportKlaar)) return;
      }
      timer = setTimeout(() => { void tick(); }, 5000);
    }
    void tick();
    return () => { stopped.current = true; if (timer) clearTimeout(timer); };
  }, [token, c]);

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `tokenizen-deep-scan-${report.repository.replace("/", "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadConfirmation() {
    if (!status) return;
    const text = confirmationFor(status, locale);
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `tokenizen-deep-scan-order-${status.repo.replace("/", "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function withdrawNow() {
    if (!token || withdrawing) return;
    setWithdrawing(true);
    setWithdrawFailed(false);
    const r = await withdraw(token);
    setWithdrawing(false);
    if (r.ok) setStatus(r);
    else setWithdrawFailed(true);
  }

  const others = saved.filter((o) => o.token !== token);

  return (
    <CinemaPage image="lens" chip={c.statusChip} title={c.statusTitle} lead={c.statusLead}>
      <div className="max-w-3xl space-y-6">
        {token === null ? <p>{c.noKey}</p> : token === undefined ? null : <StatusView status={status} report={report} c={c} locale={locale} onWithdraw={() => { void withdrawNow(); }} withdrawing={withdrawing} withdrawError={withdrawFailed} />}
        {failed !== null && token ? <p role="alert" className="flex items-start gap-2 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{failed}</p> : null}
        {report || (status?.betaald && status.akkoordOp) || saved.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {report ? <Button type="button" variant="outline" onClick={download}>{c.download}</Button> : null}
            {status?.betaald && status.akkoordOp ? <Button type="button" variant="outline" onClick={downloadConfirmation}>{c.confirmation}</Button> : null}
            {saved.length > 0 ? <Button type="button" variant="outline" onClick={() => { forgetToken(storage()); setSaved([]); }}>{c.forget}</Button> : null}
          </div>
        ) : null}
        {others.length > 0 ? (
          <div className="space-y-1 text-sm">
            <h3 className="font-semibold">{c.savedTitle}</h3>
            <ul className="list-disc pl-5">
              {others.map((o) => (
                <li key={o.token}><a className="underline underline-offset-2 hover:text-primary" href={privateLink(window.location.origin, locale, o.token)}>{o.at.slice(0, 16).replace("T", " ")}</a></li>
              ))}
            </ul>
          </div>
        ) : null}
        <ConsentLinks c={c} locale={locale} />
      </div>
    </CinemaPage>
  );
}
