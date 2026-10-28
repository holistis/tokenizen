import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, MinusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckApiError, checkCraRepo, type CraCheckResult, type CraControl, type CraStatus } from "@/lib/check-api";

const TITLE = "Free CRA readiness check for a GitHub repository | tokenizen";
const DESCRIPTION =
  "Name a public GitHub repository and see which of eight points the EU Cyber Resilience Act asks around vulnerability handling are visible in it, and what would make the rest visible. Free, read only, nothing stored.";

function useArticleMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const descriptionTag = document.head.querySelector('meta[name="description"]');
    const prevDescription = descriptionTag?.getAttribute("content") ?? null;
    descriptionTag?.setAttribute("content", DESCRIPTION);
    return () => {
      document.title = prevTitle;
      if (prevDescription !== null) descriptionTag?.setAttribute("content", prevDescription);
    };
  }, []);
}

const WORDS: Record<CraStatus, string> = {
  visible: "visible",
  not_visible: "not visible",
  not_measured: "not measured",
};

function StatusIcon({ status }: { status: CraStatus }) {
  if (status === "visible") return <CheckCircle2 className="size-5 shrink-0 text-rule-green" aria-hidden="true" />;
  if (status === "not_visible") return <AlertCircle className="size-5 shrink-0 text-rule-yellow" aria-hidden="true" />;
  return <MinusCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function StatusBadge({ status }: { status: CraStatus }) {
  const variant = status === "visible" ? "green" : status === "not_visible" ? "yellow" : "neutral";
  return <Badge variant={variant}>{WORDS[status]}</Badge>;
}

/** The addresses we list are ones our server built from a strictly validated owner/repo, but a link is only made for the two hosts it can ever be. */
const GITHUB_URL = /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\/[A-Za-z0-9._~%/?=&:-]+$/;

function ControlRow({ control }: { control: CraControl }) {
  return (
    <li className="flex gap-3 border-t border-border py-3 first:border-t-0">
      <StatusIcon status={control.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{control.topic}</p>
          <StatusBadge status={control.status} />
        </div>
        {control.evidence ? <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{control.evidence}</p> : null}
        <p className="mt-1 break-words text-sm text-muted-foreground">{control.explanation}</p>
        {control.fix ? (
          <p className="mt-1 break-words text-sm">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">To make it visible </span>
            {control.fix}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Everything that came from the repository is rendered as a text node, never as markup. */
export function CraCheckResultView({ result }: { result: CraCheckResult }) {
  const { summary } = result;
  const measured = new Date(result.measuredAt);
  const when = Number.isNaN(measured.getTime()) ? result.measuredAt : measured.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <div className="mt-8 space-y-6" data-testid="cra-check-result">
      <div className="flex gap-3 rounded-md border border-border bg-muted/40 p-4">
        <StatusIcon status={summary.notVisible === 0 ? "visible" : "not_visible"} />
        <p className="text-base leading-relaxed">
          For {result.repo}, {summary.visible} of the {summary.measured} points we could measure are visible in the public repository
          {summary.notVisible > 0 ? `, and ${summary.notVisible} ${summary.notVisible === 1 ? "is" : "are"} not` : ""}.
          {summary.notMeasured > 0 ? ` ${summary.notMeasured} could not be measured.` : ""}
        </p>
      </div>

      <Card>
        <CardTitle>The eight points</CardTitle>
        <CardDescription>
          Each point is something the Regulation asks around vulnerability handling and distribution of updates. "Not visible" means we did
          not see it in the public repository, not that you do not do it.
        </CardDescription>
        <CardContent>
          <ul>
            {result.controls.map((control) => (
              <ControlRow key={control.id} control={control} />
            ))}
          </ul>
          <p className="mt-3 break-words text-sm text-muted-foreground">{result.advisories}</p>
        </CardContent>
      </Card>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Measured {when}. Rule set {result.rules.version}, reviewed on {result.rules.reviewedOn}.
          {result.cached ? " This answer comes from a one hour cache, because a repository does not change by the minute." : ""}
        </p>
        <p>
          {result.rules.basis} The Regulation itself is{" "}
          <a className="underline underline-offset-2" href={result.rules.regulation} target="_blank" rel="noreferrer noopener">
            on EUR-Lex
          </a>
          .
        </p>
        <p>{result.notice}</p>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">What this does not tell you</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.whatThisDoesNotMeasure.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">Check our facts yourself</p>
          <p className="mt-1">These are the public pages our server read. Open them and compare.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.sourcesRead.map((u) => (
              <li key={u} className="break-all font-mono text-xs">
                {GITHUB_URL.test(u) ? (
                  <a className="underline underline-offset-2" href={u} target="_blank" rel="noreferrer noopener">
                    {u}
                  </a>
                ) : (
                  u
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function CraCheckPage() {
  useArticleMeta();

  const [repo, setRepo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CraCheckResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (repo.trim().length === 0) {
      setError("Type a public repository first, for example owner/name or https://github.com/owner/name");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const answer = await checkCraRepo(repo.trim());
      if (answer.ok) setResult(answer);
      else setError(answer.error);
    } catch (err) {
      setError(err instanceof CheckApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-2xl">
        <a
          href="/en"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          tokenizen.nl
        </a>

        <p className="mt-8 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">cyber resilience act · free check</p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          What can be seen of your CRA vulnerability handling? Free, live, a repository name is enough.
        </h1>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-foreground/90">
          <p>
            Name a public GitHub repository. Our server reads a handful of its public pages, about seven requests, and tells you which of
            eight points are visible: a security policy with a reporting address, a software bill of materials, signed releases, pinned
            dependencies, automatic updates, security scans, maintenance and a licence. For each point that is not visible you get what
            would make it visible.
          </p>
          <p>
            The EU Cyber Resilience Act (Regulation 2024/2847) puts duties on makers of software that is sold in the EU. The reporting
            duties apply from 11 September 2026 and most other duties from 11 December 2027. Many teams do not know where they stand, and
            most of what the Regulation asks is not visible from outside, so this check is small on purpose and says what it cannot see.
          </p>
          <p className="text-sm text-muted-foreground">
            We store nothing. The answer is kept in memory for one hour so that the same repository is not read twice. Only public
            repositories can be checked, and a private repository looks the same as one that does not exist.
          </p>
        </div>

        <Card className="mt-8">
          <CardTitle>Your repository</CardTitle>
          <CardDescription>A public repository on github.com, as owner/name or its address.</CardDescription>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="cra-repo" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  Repository
                </label>
                <input
                  id="cra-repo"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="owner/name"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </div>

              {error ? (
                <p className="text-sm text-rule-red" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Check this repository
              </Button>
            </form>
          </CardContent>
        </Card>

        {result ? <CraCheckResultView result={result} /> : null}

        <div className="mt-10 space-y-3 text-sm text-muted-foreground">
          <p>
            Why this exists: we ran the same check on our own repositories first. One of them showed four points that were not visible
            (no security policy, no automatic updates, no security scan, no software bill of materials), we added them, and the check now
            shows all eight.
          </p>
          <p>
            An indication from public data is all this is. It is not a conformity assessment, not legal advice, and not a certificate.
          </p>
        </div>
      </div>
    </article>
  );
}
