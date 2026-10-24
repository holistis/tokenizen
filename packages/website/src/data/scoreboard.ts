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

export const SCORE_UPDATED = "2026-10-24";

export const SEALED_SET_HASH = "de1a23a4aabc17def5145229c8ee4b4b216e25e8a5ec990e0c5bb37620b61ca1";
export const SEED_BLOCK = { number: 53022890, hash: "0x91b7371d9902f60b3515633ffda7f89f7537bcce9a132a62fef21694f54ddd1d" };

export const SCORE_RUNS: ScoreRun[] = [
  {
    id: "sealed-run",
    date: null,
    title: "The sealed run",
    system: "The scan as it runs today (S0) against the new version (v3)",
    set: "8 contests with 105 known findings, committed by a hash before anyone looked at them",
    status: "pending",
    known: 105,
    found: null,
    hypotheses: null,
    tunedOn: "not applicable",
    note: "Not run yet. The rule was written first: version 3 replaces the running one only if it finds at least 5 known findings that S0 does not, at least twice as many as it loses, with precision not more than 2 points lower, at most 1 dollar and 20 minutes per scan. If it finds nothing that S0 does not, we say so and stop selling the scan as a way to find vulnerabilities.",
    links: [
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` },
      { label: "The check of the judges", href: `${REPO}/bench/kalibratie.json` },
    ],
  },
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
