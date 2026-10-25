// scoreboard.ts — the rows of tokenizen.nl/en/scoreboard.
//
// The page shows one thing: how many of the findings that human auditors already found in closed
// contests our scan finds. A row is added when a measurement exists, and a pending row stays empty on
// purpose until its result does. Nothing here is rounded up and nothing is removed when it is
// unflattering: a result that turns out wrong is corrected in the row, with the old text kept in the
// note.
//
// EVERY ROW LINKS TO A FILE IN THE OPEN REPOSITORY that holds the rule written before the run and the
// result written after it. A number without such a link does not belong on this page.
//
// WHAT STAYS PRIVATE AND WHAT DOES NOT. How the scan finds things (its prompts, settings and models) is
// ours and is not described here or anywhere on the site. How it is measured is open: the contests, the
// two judges, the rules written before the run, and every output. The two fit together because the files
// the scan uses are committed by hash before the sealed run, so they cannot change afterwards, and
// because anyone can re-score the published outputs with the open judges. A test fails if a row starts
// describing the recipe.
//
// "tunedOn" matters more than the number. A row on a set the system was tuned on is shown, because it is
// the honest record of how we got here, but it is labelled as not evidence: a student who has seen the
// exam questions scores well and proves nothing.

const REPO = "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main";

export type RunStatus = "measured" | "pending";
export type TunedOn = "no" | "yes" | "partly" | "not applicable";

export interface RunLink {
  label: string;
  href: string;
}

export interface ScoreRun {
  id: string;
  /** ISO date of the measurement, or null while pending. */
  date: string | null;
  title: string;
  /** What was run. */
  system: string;
  /** Which contests, and how many known findings they hold. */
  set: string;
  status: RunStatus;
  /** Known High and Medium findings in the set. */
  known: number | null;
  /** Known findings that both judges matched to a hypothesis (the strict count). */
  found: number | null;
  /** Hypotheses the system reported in total. */
  hypotheses: number | null;
  tunedOn: TunedOn;
  /** What to know before reading the number. */
  note: string;
  links: RunLink[];
}

export const SCORE_UPDATED = "2026-10-25";

export const SEALED_SET_HASH = "de1a23a4aabc17def5145229c8ee4b4b216e25e8a5ec990e0c5bb37620b61ca1";
export const SEED_BLOCK = { number: 53022890, hash: "0x91b7371d9902f60b3515633ffda7f89f7537bcce9a132a62fef21694f54ddd1d" };

export const SCORE_RUNS: ScoreRun[] = [
  {
    id: "contests-after-today",
    date: null,
    title: "Contests that appear after today",
    system: "Every system that takes part, ours included",
    set: "New contests as their final reports are published",
    status: "pending",
    known: null,
    found: null,
    hypotheses: null,
    tunedOn: "not applicable",
    note: "The cleanest test, because no model can have seen the answers. The hash of a system's report is committed before the contest results are published, and scored afterwards with the same two judges. Takes weeks, since results arrive per contest.",
    links: [{ label: "How the judges decide", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` }],
  },
  {
    id: "v31-same-eight",
    date: "2026-10-25",
    title: "Version 3.1 on the same eight contests",
    system: "Version 3.1 of the scan, live since the evening of 25 October",
    set: "The 8 contests of the sealed run, 105 known findings. No longer secret: their results were published on 24 October",
    status: "measured",
    known: 105,
    found: 8,
    hypotheses: 120,
    tunedOn: "no",
    note: "6 of 59 easy findings, 1 of 14 middle, 1 of 32 hard. Precision 7.5 percent, about 20 to 45 seconds and 0.02 to 0.15 dollar per scan. Two things changed at once, a newer model and a fix of which files count, so we cannot say which one did the work. One run, so a repeat could land between about 6 and 10. The models may have seen these contests. 97 of 105 known findings were still not found. The rule for reading the result was written in our own notes before the run, which are not public, so this row is less verifiable than the sealed run.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-25-v31/README.md` }],
  },
  {
    id: "sealed-v3",
    date: "2026-10-24",
    title: "The sealed run: the new version",
    system: "Version 3 of the scan, its files committed by hash before the run",
    set: "Sealed set: 8 contests, 105 known findings, committed by a hash before anyone looked at them",
    status: "measured",
    known: 105,
    found: 4,
    hypotheses: 120,
    tunedOn: "no",
    note: "2 of 59 easy findings, 0 of 14 middle, 2 of 32 hard. Precision 5.0 percent, 46 to 105 seconds and at most 0.064 dollar per scan. It found 3 known findings that the running scan did not. The rule written first needed 5, so it is not met and the running scan stays in production. Our own reading of two disagreements between the judges would have made it 5; the number we registered is the one both judges agree on.",
    links: [
      { label: "The results and our reading", href: `${REPO}/results/2026-10-24-sealed/README.md` },
      { label: "The pre-registration and its addendum", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` },
      { label: "The set, to recompute its hash", href: `${REPO}/bench/verzegelde-set.json` },
    ],
  },
  {
    id: "sealed-s0",
    date: "2026-10-24",
    title: "The sealed run: the scan as it runs",
    system: "Version 2.1 of the scan, the one in production until the evening of 25 October, with the pattern block",
    set: "Sealed set: 8 contests, 105 known findings",
    status: "measured",
    known: 105,
    found: 1,
    hypotheses: 43,
    tunedOn: "no",
    note: "1 of 59 easy findings, 0 of 14 middle, 0 of 32 hard. Precision 4.7 percent, 2.7 to 8.6 minutes per scan. The one it found, the new version found as well.",
    links: [
      { label: "The results and our reading", href: `${REPO}/results/2026-10-24-sealed/README.md` },
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` },
    ],
  },
  {
    id: "exploration-a",
    date: "2026-10-24",
    title: "The next version, first trial",
    system: "In development. How it works stays private until after the sealed run; the hash of its files is published before that run",
    set: "Development set: 6 contests, 85 known findings",
    status: "measured",
    known: 85,
    found: 7,
    hypotheses: 88,
    tunedOn: "yes",
    note: "7 of 31 easy findings, 0 of 26 middle, 0 of 28 hard. We tune on this set, so this is a record of how we got here and not evidence.",
    links: [{ label: "Results and raw outputs", href: `${REPO}/results/2026-10-24-dev-set/README.md` }],
  },
  {
    id: "baseline-dev-set",
    date: "2026-10-24",
    title: "The scan as it runs, on the development set",
    system: "Version 2 of the scan with the pattern block of production",
    set: "Development set: 6 contests, 85 known findings",
    status: "measured",
    known: 85,
    found: 1,
    hypotheses: 39,
    tunedOn: "yes",
    note: "Without the pattern block it found 0 of 85 with 36 hypotheses. Two more known findings were matched by only one of the two judges, which we do not count. We tune on this set, so this is not evidence.",
    links: [{ label: "Results and raw outputs", href: `${REPO}/results/2026-10-24-dev-set/README.md` }],
  },
  {
    id: "v2",
    date: "2026-10-24",
    title: "Version 2 of the scan",
    system: "The scan after the first round of fixes",
    set: "7 contests: 4 it was tuned on (31 known findings) and 3 new ones (9 known)",
    status: "measured",
    known: 40,
    found: 0,
    hypotheses: 31,
    tunedOn: "partly",
    note: "0 of 31 on the four contests it was tuned on and 0 of 9 on the three new ones. It read 29 percent of the in-scope code. We found afterwards that the measured copy lacked a block of historical patterns that production carries, and the results page carries that correction above its tables.",
    links: [
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-v2-2026-10-24.md` },
      { label: "The results", href: `${REPO}/RESULTS-v2-2026-10-24.md` },
    ],
  },
  {
    id: "v1",
    date: "2026-10-24",
    title: "Version 1, as it ran",
    system: "The scan as it ran on the morning of 24 October 2026",
    set: "4 contests, 31 known findings",
    status: "measured",
    known: 31,
    found: 0,
    hypotheses: 2,
    tunedOn: "no",
    note: "Two hypotheses in total, neither matching a known finding. One job failed and two returned empty reports. The prediction we wrote before the run was at most 2 of 31.",
    links: [
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-2026-10-24.md` },
      { label: "The results", href: `${REPO}/RESULTS-2026-10-24.md` },
    ],
  },
];

/** How the page tells a reader what a row is worth. */
export const TUNED_LABEL: Record<TunedOn, string> = {
  no: "not tuned on this set",
  yes: "tuned on this set, not evidence",
  partly: "partly tuned on this set",
  "not applicable": "decides the question",
};
