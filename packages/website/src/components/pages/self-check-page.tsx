import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { CinemaPage } from "@/components/home/cinema";
import { localizeApiError } from "@/components/pages/x402-check-page";
import { useLocale, type Locale } from "@/i18n/context";
import {
  CheckApiError,
  getOwnershipChallenge,
  verifyOwnership,
  type ChallengeResult,
  type OwnershipMethod,
  type VerifyResult,
} from "@/lib/check-api";

interface Copy {
  title: string;
  description: string;
  chip: string;
  h1: string;
  lead: string;
  storageParagraph: string;
  step1Title: string;
  step1Description: string;
  endpointLabel: string;
  addressLabel: string;
  getToken: string;
  startOver: string;
  invalidEndpoint: string;
  invalidAddress: string;
  genericError: string;
  step2Title: string;
  step2Description: string;
  dnsButton: string;
  fileButton: string;
  dnsIntro: (record: ReactNode) => ReactNode;
  dnsNote: string;
  fileIntro: string;
  fileNote: string;
  verify: string;
  copyToken: string;
  copied: string;
  /** The language the time of a successful verification is written in; undefined is the reader's own setting, as it always was. */
  dateLocale: string | undefined;
  verified: (when: string) => string;
  notVerified: (reason: string) => string;
  nextTitle: string;
  nextDescription: (name: ReactNode) => ReactNode;
  comingSoon: string;
  nextNote: string;
}

// Every sentence of the page, in both languages. A key missing in one of them fails the type check. The English is the approved wording
// and stays as it is. What the check server wrote (its error sentences and the reason a verification failed) is not here: it is shown
// as the server sent it.
export const SELF_CHECK_COPY: Record<Locale, Copy> = {
  en: {
    title: "Free endpoint ownership check | tokenizen",
    description:
      "Prove you control an endpoint with a free, live DNS or well-known-file check, the same ownership proof endpoint-attest uses, run directly in your browser.",
    chip: "free",
    h1: "Prove you own an endpoint. Free, live, no account.",
    lead: "This runs the same ownership proof endpoint-attest uses: an ACME-style challenge (like every certificate authority already uses), checked live against your DNS or your own server the moment you click verify.",
    storageParagraph:
      "This does not store your endpoint, your address, or the result anywhere. Verification runs once, live, and nothing is written to a database. If verification unexpectedly fails right after you published the token correctly, this free service may simply have restarted. Request a fresh token and try again.",
    step1Title: "Step 1: get your verification token",
    step1Description: "Enter the endpoint you control and the address you want the (eventual) attestation issued to.",
    endpointLabel: "Endpoint URL",
    addressLabel: "Your address (0x…)",
    getToken: "Get verification token",
    startOver: "Start over with a different endpoint",
    invalidEndpoint: "Enter a full http(s) URL, e.g. https://api.example.com/mcp",
    invalidAddress: "Enter a 0x-prefixed, 40-hex-character address. This identifies you as the requester, it is not billed or charged.",
    genericError: "Something went wrong. Please try again.",
    step2Title: "Step 2: publish the token, then verify",
    step2Description: "Publish EXACTLY ONE of these two. Pick whichever is easier for your setup.",
    dnsButton: "DNS TXT record",
    fileButton: "Well-known file",
    dnsIntro: (record) => <>Create a {record} record at:</>,
    dnsNote: "With this exact value. DNS propagation can take a few minutes depending on your provider.",
    fileIntro: "Serve exactly these bytes (nothing else) at:",
    fileNote: "No surrounding HTML, no trailing content, just the token itself.",
    verify: "I've published it, verify now",
    copyToken: "Copy token",
    copied: "Copied",
    dateLocale: undefined,
    verified: (when) => `Ownership verified at ${when}.`,
    notVerified: (reason) => `Not verified yet: ${reason}`,
    nextTitle: "What's next: the full trust attestation",
    nextDescription: (name) => (
      <>
        Ownership proven. The next step is a signed, content-addressed, 30-day {name}: the checks run, the outcome is recorded, and the result is
        cryptographically signed.
      </>
    ),
    comingSoon: "Coming soon: paid step, price to be announced",
    nextNote:
      "This is not billed yet and there is no button for it here on purpose: we are not going to put a payment flow in front of you before it exists. When it launches, it will run over x402 the same way the rest of tokenizen.nl does.",
  },
  nl: {
    title: "Gratis check op eigenaarschap van een endpoint | tokenizen",
    description:
      "Bewijs dat je een endpoint beheert met een gratis, live check via DNS of een well-known-bestand: hetzelfde eigenaarschapsbewijs dat endpoint-attest gebruikt, direct vanuit je browser uitgevoerd.",
    chip: "gratis",
    h1: "Bewijs dat een endpoint van jou is. Gratis, live, zonder account.",
    lead: "Dit draait hetzelfde eigenaarschapsbewijs dat endpoint-attest gebruikt: een challenge in ACME-stijl, zoals elke certificate authority die al gebruikt, live gecontroleerd tegen je DNS of je eigen server op het moment dat je op verifiëren klikt.",
    storageParagraph:
      "Deze check slaat je endpoint, je adres en de uitkomst nergens op. De verificatie draait één keer, live, en er wordt niets in een database geschreven. Als de verificatie onverwacht mislukt terwijl je het token correct hebt gepubliceerd, is deze gratis dienst misschien gewoon opnieuw gestart. Vraag dan een nieuw token aan en probeer het opnieuw.",
    step1Title: "Stap 1: haal je verificatietoken op",
    step1Description: "Vul het endpoint in dat je beheert en het adres waarop de (uiteindelijke) attestation moet worden uitgegeven.",
    endpointLabel: "Endpoint-URL",
    addressLabel: "Jouw adres (0x…)",
    getToken: "Haal verificatietoken op",
    startOver: "Opnieuw beginnen met een ander endpoint",
    invalidEndpoint: "Vul een volledige http(s)-URL in, bijvoorbeeld https://api.example.com/mcp",
    invalidAddress:
      "Vul een adres in dat met 0x begint en uit 40 hexadecimale tekens bestaat. Hiermee laat je zien wie de aanvrager is, er wordt niets voor gefactureerd of afgeschreven.",
    genericError: "Er ging iets mis. Probeer het opnieuw.",
    step2Title: "Stap 2: publiceer het token en verifieer dan",
    step2Description: "Publiceer PRECIES ÉÉN van deze twee. Kies wat het makkelijkst is voor jouw setup.",
    dnsButton: "DNS TXT-record",
    fileButton: "Well-known-bestand",
    dnsIntro: (record) => <>Maak een {record}-record aan op:</>,
    dnsNote: "Met precies deze waarde. DNS-propagatie kan een paar minuten duren, afhankelijk van je provider.",
    fileIntro: "Serveer precies deze bytes (niets anders) op:",
    fileNote: "Geen omringende HTML, geen extra inhoud erachter, alleen het token zelf.",
    verify: "Ik heb het gepubliceerd, verifieer nu",
    copyToken: "Kopieer token",
    copied: "Gekopieerd",
    dateLocale: "nl-NL",
    verified: (when) => `Eigenaarschap geverifieerd op ${when}.`,
    notVerified: (reason) => `Nog niet geverifieerd: ${reason}`,
    nextTitle: "Hoe nu verder: de volledige trust attestation",
    nextDescription: (name) => (
      <>
        Eigenaarschap bewezen. De volgende stap is een ondertekende, content-addressed {name} van 30 dagen: de controles draaien, de uitkomst wordt
        vastgelegd en het resultaat wordt cryptografisch ondertekend.
      </>
    ),
    comingSoon: "Binnenkort: betaalde stap, prijs wordt nog bekendgemaakt",
    nextNote:
      "Hier wordt nog niets voor gefactureerd en er staat hier bewust geen knop voor: we zetten geen betaalflow voor je neus voordat die bestaat. Zodra het live gaat, loopt het via x402, op dezelfde manier als de rest van tokenizen.nl.",
  },
};

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

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type Step = "form" | "challenge" | "verified";

function isValidEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function SelfCheckPage() {
  const { locale } = useLocale();
  const c = SELF_CHECK_COPY[locale];
  usePageMeta(c.title, c.description);

  const [step, setStep] = useState<Step>("form");
  const [endpoint, setEndpoint] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeResult | null>(null);
  const [method, setMethod] = useState<OwnershipMethod>("dns-txt");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  async function handleGetChallenge(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!isValidEndpoint(endpoint)) {
      setFormError(c.invalidEndpoint);
      return;
    }
    if (!ETH_ADDRESS_RE.test(ownerAddress)) {
      setFormError(c.invalidAddress);
      return;
    }

    setChallengeLoading(true);
    try {
      const result = await getOwnershipChallenge(endpoint, ownerAddress);
      if (!result.ok) {
        // The server's own sentence, as it sent it.
        setFormError(result.error);
        return;
      }
      setChallenge(result);
      setStep("challenge");
      setVerifyResult(null);
    } catch (err) {
      setFormError(err instanceof CheckApiError ? localizeApiError(err.message, locale) : c.genericError);
    } finally {
      setChallengeLoading(false);
    }
  }

  async function handleVerify() {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await verifyOwnership(endpoint, ownerAddress, method);
      if (!result.ok && "error" in result) {
        setVerifyResult({ ok: false, method, location: "", reason: result.error });
      } else {
        setVerifyResult(result as VerifyResult);
        if ((result as VerifyResult).ok) setStep("verified");
      }
    } catch (err) {
      setVerifyResult({
        ok: false,
        method,
        location: "",
        reason: err instanceof CheckApiError ? localizeApiError(err.message, locale) : c.genericError,
      });
    } finally {
      setVerifyLoading(false);
    }
  }

  function startOver() {
    setStep("form");
    setChallenge(null);
    setVerifyResult(null);
    setFormError(null);
  }

  return (
    <CinemaPage image="kluis" chip={c.chip} title={c.h1} lead={c.lead}>
      <div className="max-w-2xl [color-scheme:dark]">
        <p className="text-sm leading-relaxed text-muted-foreground">{c.storageParagraph}</p>

        <Card className="mt-8">
          <CardTitle>{c.step1Title}</CardTitle>
          <CardDescription>{c.step1Description}</CardDescription>
          <CardContent>
            <form onSubmit={handleGetChallenge} className="space-y-4">
              <div>
                <label htmlFor="endpoint" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {c.endpointLabel}
                </label>
                <input
                  id="endpoint"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://api.example.com/mcp"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  disabled={step !== "form"}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ownerAddress" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {c.addressLabel}
                </label>
                <input
                  id="ownerAddress"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x..."
                  value={ownerAddress}
                  onChange={(e) => setOwnerAddress(e.target.value)}
                  disabled={step !== "form"}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                />
              </div>

              {formError ? (
                <p className="text-sm text-rule-red" role="alert">
                  {formError}
                </p>
              ) : null}

              {step === "form" ? (
                <Button type="submit" disabled={challengeLoading}>
                  {challengeLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {c.getToken}
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={startOver}>
                  {c.startOver}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {challenge ? (
          <ChallengeCard
            locale={locale}
            challenge={challenge}
            method={method}
            onMethodChange={setMethod}
            onVerify={handleVerify}
            verifyLoading={verifyLoading}
            verifyResult={verifyResult}
          />
        ) : null}

        {step === "verified" ? <VerifiedCard locale={locale} /> : null}
      </div>
    </CinemaPage>
  );
}

/** Step 2: the token to publish, in the way the reader picks, and the button that checks it. */
export function ChallengeCard({
  locale = "en",
  challenge,
  method,
  onMethodChange,
  onVerify,
  verifyLoading = false,
  verifyResult = null,
}: {
  locale?: Locale;
  challenge: ChallengeResult;
  method: OwnershipMethod;
  onMethodChange: (method: OwnershipMethod) => void;
  onVerify: () => void;
  verifyLoading?: boolean;
  verifyResult?: VerifyResult | null;
}) {
  const c = SELF_CHECK_COPY[locale];
  const choice = (value: OwnershipMethod, label: string) => (
    <button
      type="button"
      onClick={() => onMethodChange(value)}
      aria-pressed={method === value}
      className={`rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
        method === value
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card className="mt-6">
      <CardTitle>{c.step2Title}</CardTitle>
      <CardDescription>{c.step2Description}</CardDescription>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {choice("dns-txt", c.dnsButton)}
          {choice("well-known-file", c.fileButton)}
        </div>

        {method === "dns-txt" ? (
          <div className="space-y-2 text-sm">
            <p>{c.dnsIntro(<span className="font-mono">TXT</span>)}</p>
            <TokenRow locale={locale} label={challenge.dnsTxt.location} value={challenge.dnsTxt.token} />
            <p className="text-muted-foreground">{c.dnsNote}</p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p>{c.fileIntro}</p>
            <TokenRow locale={locale} label={challenge.wellKnownFile.location} value={challenge.wellKnownFile.token} />
            <p className="text-muted-foreground">{c.fileNote}</p>
          </div>
        )}

        <div>
          <Button type="button" onClick={onVerify} disabled={verifyLoading}>
            {verifyLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {c.verify}
          </Button>
        </div>

        {verifyResult ? <VerifyResultView locale={locale} result={verifyResult} /> : null}
      </CardContent>
    </Card>
  );
}

/** What comes after a successful verification. Not billed, and no payment button on purpose. */
export function VerifiedCard({ locale = "en" }: { locale?: Locale }) {
  const c = SELF_CHECK_COPY[locale];
  return (
    <Card className="mt-6 border-rule-green/40">
      <CardTitle className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-rule-green" aria-hidden="true" />
        {c.nextTitle}
      </CardTitle>
      <CardDescription>{c.nextDescription(<em>EndpointAttestation</em>)}</CardDescription>
      <CardContent>
        <Badge variant="yellow">{c.comingSoon}</Badge>
        <p className="mt-3 text-sm text-muted-foreground">{c.nextNote}</p>
      </CardContent>
    </Card>
  );
}

function TokenRow({ locale, label, value }: { locale: Locale; label: string; value: string }) {
  const c = SELF_CHECK_COPY[locale];
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <CopyButton value={value} copyLabel={c.copyToken} copiedLabel={c.copied} className="shrink-0" />
    </div>
  );
}

/** The outcome of one verification. The reason of a failure is the check server's own sentence, shown as it came. */
export function VerifyResultView({ result, locale = "en" }: { result: VerifyResult; locale?: Locale }) {
  const c = SELF_CHECK_COPY[locale];
  if (result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-rule-green/40 bg-rule-green-soft px-3 py-2.5 text-sm text-rule-green">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{c.verified(new Date(result.verifiedAt).toLocaleString(c.dateLocale))}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-rule-red/40 bg-rule-red-soft px-3 py-2.5 text-sm text-rule-red">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{c.notVerified(result.reason)}</span>
    </div>
  );
}
