// scoreboard-regel.ts: the checks behind the Publication Rule (PUBLICATION-RULE-scan-results.md in the open repository bug-bounty-intelligence-mcp).
//
// The rule promises two things that a machine can look at:
//   1. A run that scores lower than the run just before it on the same fixed set says so in its row, with both numbers side by side.
//   2. Every run is on the scoreboard within 7 days.
// This file holds the logic for both. scripts/scoreboard-regel.mjs runs it against the real scoreboard and the real results folder, and the
// weekly workflow of the same name turns red when something is off. It has no runtime imports, so Node can run it without a build.
//
// Rows on the development set carry no setId and are left out on purpose: the rule does not cover them.

import type { RunTextNl, ScoreRun } from "@/data/scoreboard";

export const WINDOW_DAYS = 7;

/** The words a row must contain when it scored lower than the run before it. Check on these, so the text block below cannot drift from the check. */
export const LOWER_PHRASE: Record<"en" | "nl", string> = {
  en: "Lower than the run before",
  nl: "Lager dan de run ervoor",
};

/**
 * Folders in the results folder of the open repository that are not linked from a row, and why that is fine. Anything else that is not linked
 * and is older than the window turns the check red. Adding a line here is a public decision: it is in the open repository of this site.
 */
export const RESULT_DIR_EXCEPTIONS: Record<string, string> = {
  "2026-10-24-baseline": "Raw outputs of version 1, which its row reaches through RESULTS-2026-10-24.md.",
  "2026-10-24-v2": "Raw outputs of version 2, which its row reaches through RESULTS-v2-2026-10-24.md.",
  "2026-10-24-dev-set-2": "Part 2 of the development set, which the rule does not cover (we tune on it, it is not evidence).",
  "2026-11-01-same-reports-different-judges": "A re-judging of the published reports of a third party with two free judges. It is not a run of our scan, so no scoreboard row can link to it; the note same-reports-different-judges does.",
};

export interface Regression {
  setId: string;
  prev: ScoreRun;
  next: ScoreRun;
}

/** 2.1 < 3 < 3.1: numbers per segment, so that 3.10 comes after 3.9. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The measured rows of the fixed sets, per set, oldest first. Two runs on the same day are ordered by version. */
export function runsPerSet(runs: ScoreRun[]): Map<string, ScoreRun[]> {
  const sets = new Map<string, ScoreRun[]>();
  for (const run of runs) {
    if (run.status !== "measured" || !run.setId || !run.version || run.found === null || run.known === null || !run.date) continue;
    const list = sets.get(run.setId) ?? [];
    list.push(run);
    sets.set(run.setId, list);
  }
  for (const list of sets.values()) {
    list.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || compareVersions(a.version ?? "", b.version ?? ""));
  }
  return sets;
}

/** Every run that scored lower than the run just before it on the same set. A repeat of the same version counts too: the rule says "the run just before it". */
export function findRegressions(runs: ScoreRun[]): Regression[] {
  const out: Regression[] = [];
  for (const [setId, list] of runsPerSet(runs)) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const next = list[i]!;
      if ((next.found ?? 0) < (prev.found ?? 0)) out.push({ setId, prev, next });
    }
  }
  return out;
}

/** The sentence for the note of a row that scored lower, ready to paste. Both numbers, both versions, both dates, and the single-run caveat. */
export function regressionBlock(r: Regression, locale: "en" | "nl"): string {
  const { prev, next } = r;
  if (locale === "nl") {
    return `${LOWER_PHRASE.nl}: ${next.found} van de ${next.known} voor versie ${next.version} (${next.date}), tegen ${prev.found} van de ${prev.known} voor versie ${prev.version} (${prev.date}). Telkens één run; een herhaling kan anders uitkomen.`;
  }
  return `${LOWER_PHRASE.en}: ${next.found} of ${next.known} for version ${next.version} (${next.date}), against ${prev.found} of ${prev.known} for version ${prev.version} (${prev.date}). One run each; a repeat can land elsewhere.`;
}

/** The regressions whose row does not say so yet, in either language. These are what turns the check red. */
export function regressionsWithoutNote(runs: ScoreRun[], nl: Record<string, RunTextNl>): Regression[] {
  return findRegressions(runs).filter((r) => {
    const enOk = r.next.note.includes(LOWER_PHRASE.en);
    const nlOk = (nl[r.next.id]?.note ?? "").includes(LOWER_PHRASE.nl);
    return !(enOk && nlOk);
  });
}

export interface PendingDir {
  name: string;
  ageDays: number;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/**
 * The folders of the results folder that no row links to. `overdue` are older than the window and not an exception: the rule was broken, or an
 * exception is missing. `due` are still inside the window. A folder name starts with the date of the run (YYYY-MM-DD-...); anything else is ignored.
 */
export function unlinkedResultDirs(runs: ScoreRun[], dirNames: string[], today: string): { overdue: PendingDir[]; due: PendingDir[] } {
  const hrefs = runs.flatMap((r) => r.links.map((l) => l.href));
  const overdue: PendingDir[] = [];
  const due: PendingDir[] = [];
  for (const name of dirNames) {
    const m = /^(\d{4}-\d{2}-\d{2})-/.exec(name);
    if (!m) continue;
    if (name in RESULT_DIR_EXCEPTIONS) continue;
    if (hrefs.some((h) => h.includes(`/results/${name}/`))) continue;
    const ageDays = dayNumber(today) - dayNumber(m[1]!);
    (ageDays > WINDOW_DAYS ? overdue : due).push({ name, ageDays });
  }
  return { overdue, due };
}
