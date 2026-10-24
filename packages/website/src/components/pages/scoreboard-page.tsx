import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { SCORE_RUNS, SCORE_UPDATED, SEALED_SET_HASH, SEED_BLOCK, TUNED_LABEL, type ScoreRun } from "@/data/scoreboard";

const TITLE = "Scoreboard | tokenizen";
const DESCRIPTION =
  "How many of the findings that human auditors already found in closed contests our smart contract scan finds. Every row links to the rule written before the run and the result after it.";
const CITE_AS = "tokenizen, scoreboard of the Bug Bounty Intelligence scan, https://tokenizen.nl/en/scoreboard";

function useMeta() {
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
}

/** "0 of 31", or a plain word while a row has no result. */
export function resultText(run: ScoreRun): string {
  if (run.status === "pending" || run.found === null || run.known === null) return "Not measured yet";
  return `${run.found} of ${run.known}`;
}

function RunCard({ run }: { run: ScoreRun }) {
  const pending = run.status === "pending";
  const evidence = run.tunedOn === "yes" || run.tunedOn === "partly" ? "yellow" : pending ? "neutral" : "green";
  return (
    <li className="rounded-lg border border-border bg-card p-5 md:p-6" data-testid="score-run">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={pending ? "neutral" : "primary"}>{pending ? "pending" : "measured"}</Badge>
        <Badge variant={evidence}>{TUNED_LABEL[run.tunedOn]}</Badge>
        {run.date ? (
          <time dateTime={run.date} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {run.date}
          </time>
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">{run.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{run.system}</p>
      <p className="mt-4 font-display text-3xl font-semibold tracking-tight">{resultText(run)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {run.set}
        {run.hypotheses !== null ? `. It reported ${run.hypotheses} hypotheses in total.` : ""}
      </p>
      <p className="mt-3 text-sm leading-relaxed">{run.note}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {run.links.map((link) => (
          <li key={link.href}>
            <a className="underline underline-offset-2" href={link.href} target="_blank" rel="noreferrer noopener">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function ScoreboardPage() {
  useMeta();

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href="/en"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          tokenizen.nl
        </a>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Bug Bounty Intelligence · open scoreboard</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">Scoreboard</h1>
        <p className="mt-5 text-base leading-relaxed">
          How many of the findings that human auditors already found in closed contests does our smart contract scan find? Each row
          links to the rule we wrote before the run and the result we wrote after it. A row without a result is empty on purpose.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {SCORE_UPDATED}. Newest and still open rows first.</p>

        <ul className="mt-8 space-y-5">
          {SCORE_RUNS.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </ul>

        <Card className="mt-10">
          <CardTitle>How to read a number</CardTitle>
          <CardDescription>What is counted, and by whom.</CardDescription>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                A known finding is a unique valid High or Medium finding in the final report of a Sherlock contest. The number of
                wardens who found it is its difficulty: easy is found by 5 or more, middle by 3 or 4, hard by 1 or 2.
              </li>
              <li>
                A hit counts only when two judges of different model families both name the same known finding for the same root
                cause. A person reads every disagreement.
              </li>
              <li>
                The contests were split into a development set and a sealed set by sorting them on a hash that includes the hash of
                Base block {SEED_BLOCK.number}, which nobody here could choose. The sealed set is committed with the hash{" "}
                <span className="break-all font-mono text-xs">{SEALED_SET_HASH}</span> and was run once, on 24 October 2026. The
                set is published now, so anyone can recompute that hash.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardTitle>What would count as proof</CardTitle>
          <CardDescription>Five steps, in the order we take them.</CardDescription>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>The sealed run: contests nobody here has seen, with the decision rule fixed in advance. Done on 24 October 2026; the bar was not met.</li>
              <li>Contests that appear after today, with the hash of our report committed before the results are published.</li>
              <li>A test that makes each reported flaw actually happen, so a finding does not rest on anyone's word.</li>
              <li>A flaw that a real owner confirms.</li>
              <li>Someone else re-scoring our published outputs with the open judges and getting our numbers.</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardTitle>What is open and what is private</CardTitle>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                Open: the contests, the two judges and their check, the rules we wrote before each run, every output and every
                judge statement. Anyone can re-score them.
              </li>
              <li>
                Private: how the scan finds things. Before the sealed run we published the SHA-256 of the files it uses, so they
                could not change afterwards.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardTitle>What this is not</CardTitle>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>It is not an audit, an approval or a certification. A scan that finds nothing does not make code safe.</li>
              <li>
                These contests may be in the training data of the models, so absolute numbers can be too high. Comparisons between
                systems on the same contests are paired and less affected.
              </li>
              <li>The judges are language models and we have a stake in the result. That is why every table and every judge statement is published.</li>
            </ul>
          </CardContent>
        </Card>

        <div className="mt-8 text-sm text-muted-foreground">
          <p className="font-mono text-xs uppercase tracking-wide">Cite this page</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-words rounded bg-muted px-2 py-1.5 font-mono text-xs">{CITE_AS}</code>
            <CopyButton value={CITE_AS} copyLabel="Copy citation" copiedLabel="Copied" />
          </div>
          <p className="mt-3">
            Found a mistake in how we count? Open an issue in the{" "}
            <a
              className="underline underline-offset-2"
              href="https://github.com/holistis/bug-bounty-intelligence-mcp"
              target="_blank"
              rel="noreferrer noopener"
            >
              repository
            </a>
            . We correct it in public.
          </p>
        </div>
      </div>
    </article>
  );
}
