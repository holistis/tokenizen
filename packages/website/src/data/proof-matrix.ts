// The proof matrix on the homepage: every number we show, who checked it, when it was measured and where to run it again.
//
// One row per number. A number that already lives somewhere else in this repository is read from there and never typed again here
// (the scoreboard for the misses, the benchmark file for the repositories, the notes for the sample and the payment). A test fails when
// one of those numbers shows up as a literal in this file. The wording of each sentence is the wording the homepage already carried.
// How old a number is is worked out by the page from measuredAt, never written down here. No long dashes, no markdown.

import { BLOG_POSTS } from "@/data/blog-posts";
import { BENCHMARK_DATE, BENCHMARK_NOTE_PATH, BENCHMARK_REPOSITORIES } from "@/data/cra-benchmark";
import { SCORE_RUNS } from "@/data/scoreboard";

export type ProofLocale = "en" | "nl";
export type Localised = Record<ProofLocale, string>;

/** Who looked at the number: our own measurement, someone outside our team, the chain itself, or a limit we publish against ourselves. */
export type CheckedBy = "own" | "outside" | "chain" | "limit";
/** Small flags that say what kind of test it was. */
export type Caveat = "testnet" | "own-test";

export interface ProofRow {
  id: string;
  value: Localised;
  claim: Localised;
  checkedBy: CheckedBy;
  caveats: Caveat[];
  /** ISO date (yyyy-mm-dd) of the measurement, taken from the place that holds the result. */
  measuredAt: string;
  /** After this many days the page says the number is due for a new measurement. */
  staleAfterDays: number;
  /** Where a reader runs it again: a path on this site or an https address. */
  checkUrl: string;
  /** Where the number comes from, as a file in this repository (then a comma and the place in it) or a public address. */
  source: string;
}

function scoreRun(id: string) {
  const run = SCORE_RUNS.find((r) => r.id === id);
  if (!run || run.known === null || run.found === null || run.date === null) throw new Error(`proof-matrix: scoreboard row ${id} is missing or has no result`);
  return { ...run, known: run.known, found: run.found, date: run.date };
}

function postDate(slug: string): string {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`proof-matrix: no note ${slug}`);
  return post.date;
}

function factValue(href: string): string {
  for (const post of BLOG_POSTS) {
    for (const block of post.blocks) {
      const fact = block.type === "facts" ? block.items.find((i) => i.href === href) : undefined;
      if (fact) return fact.value;
    }
  }
  throw new Error(`proof-matrix: no fact card links to ${href}`);
}

const SAMPLE_NOTE = "/notes/zero-of-600-x402-services-sign-a-receipt";
const PAYMENT_NOTE = "check-pay-prove";
const RESULTS_FOLDER = "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-11-02-our-scan-under-the-benchmark-judge";
const SECOND_CHECKER = "https://github.com/x402-foundation/x402/pull/3827#issuecomment-6230063003";
const COUNTERSIGNED = "https://github.com/x402-foundation/x402/issues/2887#issuecomment-6987288414";

const recount = scoreRun("benchmark-judge-seven");
const sealed = scoreRun("v31-same-eight");
/** The number of audits is the first number of the scoreboard row's own description ("7 audits of the public EVMbench detect set"). */
const auditCount = /^(\d+) audits/.exec(recount.set)?.[1];
if (!auditCount) throw new Error("proof-matrix: the scoreboard row benchmark-judge-seven no longer starts with its audit count");
const missed = sealed.known - sealed.found;

export const PROOF_ROWS: ProofRow[] = [
  {
    id: "recount",
    value: { en: `${auditCount} audits`, nl: `${auditCount} audits` },
    claim: {
      en: `Our research scan runs on ${auditCount} audits come with their verdict files and a script that recounts them, the leader's higher score included. Someone outside our team has already recounted them`,
      nl: `Onze onderzoeksscans op ${auditCount} audits komen met hun oordeelsbestanden en een script dat alles opnieuw telt, ook de hogere score van de koploper. Iemand buiten ons team heeft het al nagerekend`,
    },
    checkedBy: "outside",
    caveats: [],
    measuredAt: recount.date,
    staleAfterDays: 60,
    checkUrl: RESULTS_FOLDER,
    source: "packages/website/src/data/scoreboard.ts, row benchmark-judge-seven",
  },
  {
    id: "second-checker",
    value: { en: "3 of 3", nl: "3 van 3" },
    claim: {
      en: "Test receipts on which a second checker, written separately by the author of an open x402 receipt proposal, reached the same result as ours",
      nl: "Testbonnetjes waarop een tweede controleprogramma, apart geschreven door de schrijver van een openstaand x402-bonnetjesvoorstel, tot hetzelfde resultaat kwam als het onze",
    },
    checkedBy: "outside",
    caveats: ["testnet", "own-test"],
    measuredAt: "2026-10-17",
    staleAfterDays: 60,
    checkUrl: SECOND_CHECKER,
    source: SECOND_CHECKER,
  },
  {
    id: "countersigned",
    value: { en: "2 of 2", nl: "2 van 2" },
    claim: {
      en: "One receipt for a paid call to our service on a test network, signed by us and countersigned by the party that paid, with its id and both signatures recomputed by a second implementer. The check the call ran came back as not passed, and the receipt says so",
      nl: "Een bonnetje voor een betaalde aanroep van onze dienst op een testnetwerk, door ons ondertekend en door de betalende partij mee ondertekend, waarvan een tweede ontwikkelaar het id en beide handtekeningen opnieuw uitrekende. De controle die de aanroep deed kwam niet door, en dat staat zo in het bonnetje",
    },
    checkedBy: "outside",
    caveats: ["testnet"],
    measuredAt: "2026-11-18",
    staleAfterDays: 60,
    checkUrl: COUNTERSIGNED,
    source: COUNTERSIGNED,
  },
  {
    id: "repositories",
    value: { en: String(BENCHMARK_REPOSITORIES), nl: String(BENCHMARK_REPOSITORIES) },
    claim: {
      en: "Public repositories in ten EU countries measured on eight security signals, our misses published",
      nl: "Openbare repositories in tien EU-landen gemeten op acht beveiligingssignalen, onze missers gepubliceerd",
    },
    checkedBy: "own",
    caveats: [],
    measuredAt: BENCHMARK_DATE,
    staleAfterDays: 60,
    checkUrl: BENCHMARK_NOTE_PATH,
    source: "packages/website/src/data/cra-benchmark.ts, BENCHMARK_REPOSITORIES",
  },
  {
    id: "x402-receipts",
    value: { en: factValue(SAMPLE_NOTE), nl: factValue(SAMPLE_NOTE).replace(" of ", " van ") },
    claim: {
      en: "x402 catalogue records we sampled from one index declare the offer-receipt extension. Ours signs offers, and you can check one yourself",
      nl: "x402-catalogusrecords uit een index die we als steekproef namen, vermelden de offer-receipt-extensie. Onze dienst ondertekent aanbiedingen, en je kunt er zelf een nalopen",
    },
    checkedBy: "own",
    caveats: [],
    measuredAt: "2026-10-15",
    staleAfterDays: 60,
    checkUrl: SAMPLE_NOTE,
    source: "packages/website/src/data/blog-posts.ts, the fact card that links the note; the date is the date of the note",
  },
  {
    id: "payment",
    value: { en: "1 payment", nl: "1 betaling" },
    claim: {
      en: "One real payment on Base mainnet from a test agent of ours to our own service, with the transactions open to check",
      nl: "Een echte betaling op Base mainnet van een testagent van ons aan onze eigen dienst, met de transacties open om na te kijken",
    },
    checkedBy: "chain",
    caveats: ["own-test"],
    measuredAt: postDate(PAYMENT_NOTE),
    staleAfterDays: 60,
    checkUrl: "/notes/check-pay-prove",
    source: "packages/website/src/data/blog-posts.ts, the note check-pay-prove",
  },
  {
    id: "scan-misses",
    value: { en: `${missed} of ${sealed.known}`, nl: `${missed} van ${sealed.known}` },
    claim: {
      en: `Our scan missed ${missed} of ${sealed.known} known findings in its run on eight audit contests.`,
      nl: `Onze scan miste ${missed} van de ${sealed.known} bekende bevindingen in de run op acht auditwedstrijden.`,
    },
    checkedBy: "limit",
    caveats: [],
    measuredAt: sealed.date,
    staleAfterDays: 60,
    checkUrl: "/scoreboard",
    source: "packages/website/src/data/scoreboard.ts, row v31-same-eight",
  },
];

export const PROOF_COPY: Record<
  ProofLocale,
  {
    heading: string;
    subtitle: string;
    chips: Record<CheckedBy | Caveat, string>;
    measured: string;
    check: string;
    columns: { number: string; says: string; checkedBy: string; measured: string; check: string };
    ago: (days: number) => string;
    stale: (days: number) => string;
  }
> = {
  en: {
    heading: "What we measured, and how you can check it",
    subtitle: "Every number has a source, a date and a way to run it again. When a number gets old, this page says so.",
    chips: {
      own: "Our own measurement",
      outside: "Checked by someone outside our team",
      chain: "On-chain",
      limit: "A limit we publish",
      testnet: "Test network",
      "own-test": "Our own test",
    },
    measured: "Measured",
    check: "Check it yourself",
    columns: { number: "Number", says: "What it says", checkedBy: "Checked by", measured: "Measured", check: "Check" },
    ago: (days) => `${days} ${days === 1 ? "day" : "days"} ago`,
    stale: (days) => `Older than ${days} days: due for a new measurement`,
  },
  nl: {
    heading: "Wat we maten, en hoe je het zelf nagaat",
    subtitle: "Bij elk getal staat een bron, een datum en een manier om het opnieuw te doen. Wordt een getal oud, dan zegt deze pagina dat.",
    chips: {
      own: "Eigen meting",
      outside: "Nagekeken door iemand buiten ons team",
      chain: "Op de keten",
      limit: "Een grens die we zelf publiceren",
      testnet: "Testnetwerk",
      "own-test": "Eigen test",
    },
    measured: "Gemeten",
    check: "Ga het zelf na",
    columns: { number: "Getal", says: "Wat het zegt", checkedBy: "Nagekeken door", measured: "Gemeten", check: "Check" },
    ago: (days) => `${days} ${days === 1 ? "dag" : "dagen"} geleden`,
    stale: (days) => `Ouder dan ${days} dagen: tijd voor een nieuwe meting`,
  },
};

const MONTHS: Record<ProofLocale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  nl: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
};

export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** "28 Oct 2026" or "28 okt 2026". */
export function formatMeasured(iso: string, locale: ProofLocale): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[locale][month - 1]} ${year}`;
}

/** Whole days between the measurement and today, both counted as calendar days in UTC, so a page built in one time zone and read in another agrees. */
export function daysSince(iso: string, now: Date): number {
  const measured = Date.parse(`${iso}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - measured) / 86_400_000);
}

export function proofAge(row: Pick<ProofRow, "measuredAt" | "staleAfterDays">, now: Date): { days: number; stale: boolean } {
  const days = daysSince(row.measuredAt, now);
  return { days, stale: days > row.staleAfterDays };
}

/** A row older than this many times its own limit is a failing test: the page has been telling readers it is due for a long time. */
export const MAX_AGE_FACTOR = 2;

/** What is wrong with the rows, as readable lines; an empty list means they are fine. Used by the test, which also plants faults to prove it. */
export function proofProblems(rows: ProofRow[], now: Date): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const at = `row ${row.id || "(no id)"}`;
    if (!row.id) problems.push(`${at}: no id`);
    if (seen.has(row.id)) problems.push(`${at}: id used twice`);
    seen.add(row.id);
    for (const locale of ["en", "nl"] as const) {
      if (!row.value?.[locale]?.trim()) problems.push(`${at}: no ${locale} value`);
      if (!row.claim?.[locale]?.trim()) problems.push(`${at}: no ${locale} claim`);
    }
    if (!["own", "outside", "chain", "limit"].includes(row.checkedBy)) problems.push(`${at}: checkedBy is not one of own, outside, chain, limit`);
    if (!row.source?.trim()) problems.push(`${at}: no source`);
    if (!row.checkUrl?.trim()) problems.push(`${at}: no checkUrl`);
    else if (!/^(\/|https:\/\/)/.test(row.checkUrl)) problems.push(`${at}: checkUrl is neither a path on this site nor an https address`);
    if (!Number.isInteger(row.staleAfterDays) || row.staleAfterDays <= 0) problems.push(`${at}: staleAfterDays is not a positive whole number`);
    if (!row.measuredAt || !isIsoDate(row.measuredAt)) {
      problems.push(`${at}: measuredAt is missing or not a yyyy-mm-dd date`);
      continue;
    }
    const days = daysSince(row.measuredAt, now);
    if (days < 0) problems.push(`${at}: measuredAt is in the future`);
    else if (Number.isInteger(row.staleAfterDays) && row.staleAfterDays > 0 && days > MAX_AGE_FACTOR * row.staleAfterDays) {
      problems.push(`${at}: measured ${days} days ago, more than twice its limit of ${row.staleAfterDays} days`);
    }
  }
  return problems;
}

/** Numbers that this file must read from elsewhere and never type: any of them found as a number in the code (comments and strings that hold no digits aside). */
export function typedAgain(source: string, numbers: number[]): number[] {
  const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return numbers.filter((n) => new RegExp(`(?<![\\d.-])${n}(?![\\d-])`).test(code));
}
