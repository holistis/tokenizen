import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatCount,
  formatKb,
  formatUsd,
  runRepoCheck,
  type RepoCheckErrorCode,
  type RepoCheckLocale,
  type RepoCheckOutcome,
  type RepoQuote,
} from "@/lib/repo-price-check";

// The "Check your repository" block on /scan and /nl/scan: one field, one button, and the answer of the free precheck as plain text.
// Every value from the server goes through repo-price-check.ts and is rendered as a React text node. No server sentence is shown.

interface Copy {
  label: string;
  intro: string;
  fieldLabel: string;
  placeholder: string;
  button: string;
  checking: string;
  empty: string;
  repo: string;
  size: string;
  lines: string;
  linesMissing: string;
  noSolidity: string;
  price: string;
  basis: (q: RepoQuote, sizeKb: number) => string;
  noQuote: string;
  errors: Record<RepoCheckErrorCode, string>;
}

const COPY: Record<RepoCheckLocale, Copy> = {
  en: {
    label: "Check your repository",
    intro: "Type a public GitHub repository as owner/name. The free check measures the Solidity the scan would count. Only the name is sent.",
    fieldLabel: "Repository",
    placeholder: "owner/name",
    button: "Check",
    checking: "Checking",
    empty: "Type a repository first, as owner/name.",
    repo: "Repository",
    size: "Size the scan counts",
    lines: "Estimated lines",
    linesMissing: "not in this answer",
    noSolidity: "No Solidity of the project's own was found. Tests, mocks, scripts, interfaces and vendored code are left out.",
    price: "Price of a deep scan",
    basis: (q, sizeKb) => {
      const parts = [`Basis: ${formatKb(q.basisKb ?? sizeKb, "en")}`];
      if (q.perMbCents !== null) parts.push(` at ${formatUsd(q.perMbCents, "en")} per MB`);
      if (q.minimumCents !== null) parts.push(`, with a minimum of ${formatUsd(q.minimumCents, "en")}`);
      parts.push(".");
      if (q.minimumApplied === true) parts.push(" The minimum applies here.");
      return parts.join("");
    },
    noQuote: "The free check shows the measured size of the code. The price for a deep scan by size will appear here once the deep scan is live.",
    errors: {
      invalid: "That is not a public GitHub repository name. Use owner/name, for example holistis/tokenizen.",
      not_found: "This repository was not found, or it is not public.",
      rate_limited: "Too many checks, try again in a minute.",
      busy: "The check is busy. Try again in a minute.",
      unavailable: "The check is not available right now. Try again later.",
      network: "Could not reach the check. Your connection may have dropped, or the service is offline.",
      bad_response: "The check gave an answer we could not read. Try again later.",
    },
  },
  nl: {
    label: "Check je repository",
    intro: "Typ een openbare GitHub-repository als eigenaar/naam. De gratis check meet de Solidity die de scan zou tellen. Alleen de naam wordt verstuurd.",
    fieldLabel: "Repository",
    placeholder: "eigenaar/naam",
    button: "Check",
    checking: "Bezig",
    empty: "Typ eerst een repository, als eigenaar/naam.",
    repo: "Repository",
    size: "Grootte die de scan telt",
    lines: "Geschatte regels",
    linesMissing: "niet in dit antwoord",
    noSolidity: "Er is geen eigen Solidity van het project gevonden. Tests, mocks, scripts, interfaces en meegeleverde code tellen niet mee.",
    price: "Prijs van een diepe scan",
    basis: (q, sizeKb) => {
      const parts = [`Basis: ${formatKb(q.basisKb ?? sizeKb, "nl")}`];
      if (q.perMbCents !== null) parts.push(` tegen ${formatUsd(q.perMbCents, "nl")} per MB`);
      if (q.minimumCents !== null) parts.push(`, met een minimum van ${formatUsd(q.minimumCents, "nl")}`);
      parts.push(".");
      if (q.minimumApplied === true) parts.push(" Hier geldt het minimum.");
      return parts.join("");
    },
    noQuote: "De gratis check toont de gemeten grootte van de code. De prijs voor een diepe scan op grootte verschijnt hier zodra de diepe scan live is.",
    errors: {
      invalid: "Dat is geen naam van een openbare GitHub-repository. Gebruik eigenaar/naam, bijvoorbeeld holistis/tokenizen.",
      not_found: "Deze repository is niet gevonden, of hij is niet openbaar.",
      rate_limited: "Te veel checks, probeer het over een minuut opnieuw.",
      busy: "De check is bezig. Probeer het over een minuut opnieuw.",
      unavailable: "De check is nu niet beschikbaar. Probeer het later opnieuw.",
      network: "De check is niet bereikbaar. Misschien is je verbinding weggevallen, of is de dienst offline.",
      bad_response: "De check gaf een antwoord dat we niet konden lezen. Probeer het later opnieuw.",
    },
  },
};

export const REPO_CHECK_COPY = COPY;

/** The answer of one check, as text only. */
export function RepoCheckResultView({ outcome, locale }: { outcome: RepoCheckOutcome; locale: RepoCheckLocale }) {
  const c = COPY[locale];
  if (outcome.kind === "error") {
    return (
      <p className="text-sm text-rule-red" role="alert">
        {c.errors[outcome.code]}
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm" data-testid="repo-check-result">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{c.repo}</dt>
        <dd className="font-mono break-all">{outcome.repo}</dd>
        <dt className="text-muted-foreground">{c.size}</dt>
        <dd>{formatKb(outcome.sizeKb, locale)}</dd>
        <dt className="text-muted-foreground">{c.lines}</dt>
        <dd>{outcome.estimatedLines === null ? c.linesMissing : formatCount(outcome.estimatedLines, locale)}</dd>
        {outcome.quote ? (
          <>
            <dt className="text-muted-foreground">{c.price}</dt>
            <dd>{formatUsd(outcome.quote.cents, locale)}</dd>
          </>
        ) : null}
      </dl>
      {outcome.noSolidity ? <p>{c.noSolidity}</p> : null}
      {outcome.quote ? <p className="text-muted-foreground">{c.basis(outcome.quote, outcome.sizeKb)}</p> : <p className="text-muted-foreground">{c.noQuote}</p>}
    </div>
  );
}

/** The form. The submit path itself lives in runRepoCheck, which is tested with a mocked fetch. */
export function RepoPriceCheck({ locale }: { locale: RepoCheckLocale }) {
  const c = COPY[locale];
  const [repo, setRepo] = useState("");
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<RepoCheckOutcome | null>(null);
  const [empty, setEmpty] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setEmpty(false);
    if (repo.trim().length === 0) {
      setOutcome(null);
      setEmpty(true);
      return;
    }
    setLoading(true);
    setOutcome(null);
    try {
      setOutcome(await runRepoCheck(repo));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p>{c.intro}</p>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <label htmlFor="repo-price-check" className="block font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {c.fieldLabel}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="repo-price-check"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={300}
            placeholder={c.placeholder}
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {loading ? c.checking : c.button}
          </Button>
        </div>
      </form>
      <div aria-live="polite">
        {empty ? (
          <p className="text-sm text-rule-red" role="alert">
            {c.empty}
          </p>
        ) : null}
        {outcome ? <RepoCheckResultView outcome={outcome} locale={locale} /> : null}
      </div>
    </div>
  );
}
