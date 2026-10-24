import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { CheckApiError, checkX402Endpoint, type X402CheckResult, type X402Level, type X402Status } from "@/lib/check-api";

const TITLE = "Free x402 endpoint check | tokenizen";
const DESCRIPTION =
  "Paste the URL of an x402 route you run and see what a buyer's client would see: whether the payment request passes the official schema, and how far up the receipt ladder it gets. Free, never pays, nothing to install.";

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

type Shown = X402Status | "not_evaluated";

const WORDS: Record<Shown, string> = {
  pass: "pass",
  fail: "fail",
  not_measured: "not measured",
  not_evaluated: "not reached",
};

function StatusIcon({ status }: { status: Shown }) {
  if (status === "pass") return <CheckCircle2 className="size-5 shrink-0 text-rule-green" aria-hidden="true" />;
  if (status === "fail") return <XCircle className="size-5 shrink-0 text-rule-red" aria-hidden="true" />;
  if (status === "not_measured") return <AlertCircle className="size-5 shrink-0 text-rule-yellow" aria-hidden="true" />;
  return <MinusCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function StatusBadge({ status }: { status: Shown }) {
  const variant = status === "pass" ? "green" : status === "fail" ? "red" : status === "not_measured" ? "yellow" : "neutral";
  return <Badge variant={variant}>{WORDS[status]}</Badge>;
}

/** Single quotes inside a URL would end the quoting of the command we hand out, so they are percent-encoded. */
export function reproduceCommand(url: string): string {
  return `npx -y agent-receipt-verify '${url.replace(/'/g, "%27")}'`;
}

function LevelRow({ level }: { level: X402Level }) {
  return (
    <li className="flex gap-3 border-t border-border py-3 first:border-t-0">
      <StatusIcon status={level.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Level {level.level}</span>
          <StatusBadge status={level.status} />
        </div>
        <p className="mt-1 text-sm font-medium">{level.name}</p>
        {level.evidence ? <p className="mt-1 break-words text-sm text-muted-foreground">{level.evidence}</p> : null}
      </div>
    </li>
  );
}

/** Everything text that came from the endpoint is rendered as a text node, never as markup. */
export function X402CheckResultView({ result }: { result: X402CheckResult }) {
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
        <CardTitle>Would a buyer client accept your payment request?</CardTitle>
        <CardDescription>
          The answer is checked with the official x402 schema (the one real buyer clients validate with), on the very response the
          ladder below judged.
        </CardDescription>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={buyerCheck.status} />
            {buyerCheck.httpStatus !== null ? <Badge>HTTP {buyerCheck.httpStatus}</Badge> : null}
            {buyerCheck.x402Version !== null ? <Badge>x402 version {buyerCheck.x402Version}</Badge> : null}
            {buyerCheck.source ? <Badge>read from the {buyerCheck.source}</Badge> : null}
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
              <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Worth a look, not a failure</p>
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
        <CardTitle>The receipt ladder</CardTitle>
        <CardDescription>
          Levels 0 to 2 can be measured without paying. Levels 3 to 5 need a real settlement, so they come back as not measured,
          which is not the same as failed.{" "}
          <a className="underline underline-offset-2" href={ladder.definition} target="_blank" rel="noreferrer noopener">
            What each level means
          </a>
          .
        </CardDescription>
        <CardContent>
          <ul>
            {ladder.levels.map((level) => (
              <LevelRow key={level.level} level={level} />
            ))}
          </ul>
          {ladder.methodRetried ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Your route answered {ladder.methodRetried.firstStatus} to {ladder.methodRetried.from}, so we asked once more with{" "}
              {ladder.methodRetried.to}. The verdicts above are about that second answer.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Measured {when}. {result.requestsMade} {result.requestsMade === 1 ? "request" : "requests"} from our server.
          {result.cached ? " This answer comes from a two minute cache, so a double click does not hit your server twice." : ""}
        </p>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">What this does not tell you</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide">Run the ladder yourself</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{reproduceCommand(result.url)}</code>
            <CopyButton value={reproduceCommand(result.url)} copyLabel="Copy command" copiedLabel="Copied" />
          </div>
          <p className="mt-1">The open source tool gives the ladder part. The schema part is the official parser run on the same response.</p>
        </div>
      </div>
    </div>
  );
}

export function X402CheckPage() {
  useArticleMeta();

  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"POST" | "GET">("POST");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<X402CheckResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (url.trim().length === 0) {
      setError("Paste the URL of your x402 route first, for example https://api.example.com/v1/route");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const answer = await checkX402Endpoint(url.trim(), method);
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

        <p className="mt-8 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">agent-receipt-verify · free check</p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Check your x402 endpoint. Free, live, nothing to install.
        </h1>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-foreground/90">
          <p>
            Paste the URL of an x402 route you run. Our server sends it one anonymous request, never pays, and tells you what a buyer
            client would see.
          </p>
          <p>
            Two answers come from that one response. First: does the payment request pass the official x402 schema, the check a real
            buyer client runs before it pays. A request that fails it is usually not recognised as a payment request at all, and the seller sees no error. Second: how far up the
            receipt ladder you get, for the levels that need no payment.
          </p>
          <p className="text-sm text-muted-foreground">
            We store nothing. The answer is kept in memory for two minutes so that a double click does not hit your server twice. A
            route can be checked a limited number of times per hour, and you may check only routes you run or have permission to test.
          </p>
        </div>

        <Card className="mt-8">
          <CardTitle>Your route</CardTitle>
          <CardDescription>A public https URL on the standard port. IP addresses and internal names are refused.</CardDescription>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="x402-url" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  Endpoint URL
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
                <legend className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">Method the route answers</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="x402-method" checked={method === "POST"} onChange={() => setMethod("POST")} />
                    POST (the usual case)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="x402-method" checked={method === "GET"} onChange={() => setMethod("GET")} />
                    GET
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
                Check this route
              </Button>
            </form>
          </CardContent>
        </Card>

        {result ? <X402CheckResultView result={result} /> : null}

        <div className="mt-10 space-y-3 text-sm text-muted-foreground">
          <p>
            Why this exists: a payment request can look fine to the person who wrote it and still fail every real buyer, silently. We
            shipped exactly that ourselves on 2026-10-22: a field 53 characters long where the buyer schema allows 32, with no error
            anywhere on our side. This page runs the check we wished we had had.
          </p>
          <p>
            The ladder and its definition are open source in{" "}
            <a
              className="underline underline-offset-2"
              href="https://github.com/holistis/agent-receipt-verify"
              target="_blank"
              rel="noreferrer noopener"
            >
              agent-receipt-verify
            </a>
            . Found a wrong verdict? Open an issue there with the URL and we will look at the response together.
          </p>
        </div>
      </div>
    </article>
  );
}
