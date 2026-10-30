// scoreboard-regel.test.ts: the Publication Rule can be checked by a machine, and the real scoreboard passes the check today.

import { describe, expect, it } from "vitest";

import { SCORE_RUNS, SCORE_RUNS_NL, type ScoreRun } from "@/data/scoreboard";
import {
  LOWER_PHRASE,
  RESULT_DIR_EXCEPTIONS,
  findRegressions,
  regressionBlock,
  regressionsWithoutNote,
  runsPerSet,
  unlinkedResultDirs,
} from "./scoreboard-regel";

function run(over: Partial<ScoreRun> & { id: string }): ScoreRun {
  return {
    date: "2026-10-25",
    title: over.id,
    system: "test",
    set: "test",
    status: "measured",
    known: 100,
    found: 5,
    hypotheses: 120,
    tunedOn: "no",
    note: "A note.",
    links: [{ label: "x", href: `https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/${over.id}/README.md` }],
    setId: "set-a",
    version: "1",
    ...over,
  };
}

describe("runsPerSet", () => {
  it("leaves out rows without a set (the development set), pending rows and rows without numbers", () => {
    const rows = [
      run({ id: "a" }),
      run({ id: "dev", setId: undefined, version: undefined }),
      run({ id: "pending", status: "pending", found: null, date: null }),
    ];
    const sets = runsPerSet(rows);
    expect([...sets.keys()]).toEqual(["set-a"]);
    expect(sets.get("set-a")!.map((r) => r.id)).toEqual(["a"]);
  });

  it("orders by date, and by version on the same day, with 3.10 after 3.9", () => {
    const rows = [
      run({ id: "c", version: "3.10", date: "2026-10-25" }),
      run({ id: "b", version: "3.9", date: "2026-10-25" }),
      run({ id: "a", version: "10", date: "2026-10-24" }),
    ];
    expect(runsPerSet(rows).get("set-a")!.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("findRegressions", () => {
  it("finds a run that scored lower than the run just before it on the same set, and only that", () => {
    const rows = [
      run({ id: "v1", version: "1", date: "2026-10-24", found: 1 }),
      run({ id: "v2", version: "2", date: "2026-10-25", found: 6 }),
      run({ id: "v3", version: "3", date: "2026-10-26", found: 4 }),
      run({ id: "v4", version: "4", date: "2026-10-27", found: 4 }),
    ];
    const found = findRegressions(rows);
    expect(found).toHaveLength(1);
    expect(found[0]!.prev.id).toBe("v2");
    expect(found[0]!.next.id).toBe("v3");
  });

  it("does not compare runs across different sets", () => {
    const rows = [
      run({ id: "a", setId: "set-a", found: 9, date: "2026-10-24" }),
      run({ id: "b", setId: "set-b", found: 2, date: "2026-10-25" }),
    ];
    expect(findRegressions(rows)).toEqual([]);
  });

  it("counts a repeat of the same version that scored lower", () => {
    const rows = [run({ id: "a", version: "3.1", found: 8, date: "2026-10-25" }), run({ id: "b", version: "3.1", found: 6, date: "2026-10-26" })];
    expect(findRegressions(rows)).toHaveLength(1);
  });
});

describe("regressionBlock and regressionsWithoutNote", () => {
  const rows = [run({ id: "old", version: "3.1", found: 8, known: 105, date: "2026-10-25" }), run({ id: "new", version: "3.2", found: 5, known: 105, date: "2026-10-28" })];

  it("puts both numbers, both versions and both dates side by side, in both languages", () => {
    const [r] = findRegressions(rows);
    const en = regressionBlock(r!, "en");
    expect(en).toContain(LOWER_PHRASE.en);
    for (const piece of ["5 of 105", "version 3.2", "2026-10-28", "8 of 105", "version 3.1", "2026-10-25", "One run each"]) expect(en).toContain(piece);
    const nl = regressionBlock(r!, "nl");
    expect(nl).toContain(LOWER_PHRASE.nl);
    for (const piece of ["5 van de 105", "versie 3.2", "8 van de 105", "versie 3.1"]) expect(nl).toContain(piece);
  });

  it("flags a lower run whose note does not say so, and accepts it once both languages do", () => {
    expect(regressionsWithoutNote(rows, {})).toHaveLength(1);
    const [r] = findRegressions(rows);
    const fixedRows = rows.map((x) => (x.id === "new" ? { ...x, note: regressionBlock(r!, "en") } : x));
    expect(regressionsWithoutNote(fixedRows, {})).toHaveLength(1); // the Dutch note is still missing
    const nl = { new: { title: "", system: "", set: "", links: [], note: regressionBlock(r!, "nl") } };
    expect(regressionsWithoutNote(fixedRows, nl)).toEqual([]);
  });

  it("flags nothing when no run scored lower", () => {
    expect(regressionsWithoutNote([run({ id: "a", found: 1 }), run({ id: "b", found: 2, date: "2026-10-26" })], {})).toEqual([]);
  });
});

describe("unlinkedResultDirs", () => {
  const rows = [run({ id: "2026-10-25-v31" })];

  it("reports a folder no row links to once it is older than 7 days, and not before", () => {
    const names = ["2026-10-25-v31", "2026-10-20-missing", "2026-10-24-recent"];
    const { overdue, due } = unlinkedResultDirs(rows, names, "2026-10-31");
    expect(overdue.map((d) => d.name)).toEqual(["2026-10-20-missing"]);
    expect(due.map((d) => d.name)).toEqual(["2026-10-24-recent"]);
    expect(overdue[0]!.ageDays).toBe(11);
    // exactly 7 days old is still inside the window
    expect(unlinkedResultDirs(rows, ["2026-10-24-edge"], "2026-10-31").overdue).toEqual([]);
    expect(unlinkedResultDirs(rows, ["2026-10-23-edge"], "2026-10-31").overdue).toHaveLength(1);
  });

  it("skips named exceptions and names that do not start with a date", () => {
    const { overdue, due } = unlinkedResultDirs(rows, [...Object.keys(RESULT_DIR_EXCEPTIONS), "README", "notes"], "2027-01-01");
    expect(overdue).toEqual([]);
    expect(due).toEqual([]);
  });
});

describe("the real scoreboard", () => {
  it("has no run that scored lower than the one before it without saying so", () => {
    expect(regressionsWithoutNote(SCORE_RUNS, SCORE_RUNS_NL)).toEqual([]);
  });

  it("compares the three versions of the sealed set in order, 1 then 4 then 8", () => {
    const sealed = runsPerSet(SCORE_RUNS).get("sealed-8")!;
    expect(sealed.map((r) => [r.version, r.found])).toEqual([["2.1", 1], ["3", 4], ["3.1", 8]]);
  });

  it("covers the three fixed sets of the rule and leaves out the development set", () => {
    const sets = runsPerSet(SCORE_RUNS);
    expect([...sets.keys()].sort()).toEqual(["c4-nine", "evmbench-40", "sealed-8"]);
    for (const run of SCORE_RUNS.filter((r) => r.tunedOn === "yes")) expect(run.setId, run.id).toBeUndefined();
  });

  it("links every folder of the results folder of 30 October 2026, apart from the named exceptions", () => {
    const onDisk = [
      "2026-10-24-baseline",
      "2026-10-24-dev-set",
      "2026-10-24-dev-set-2",
      "2026-10-24-sealed",
      "2026-10-24-v2",
      "2026-10-25-c4-fresh",
      "2026-10-25-free-tools",
      "2026-10-25-v31",
      "2026-10-26-evmbench",
    ];
    const { overdue, due } = unlinkedResultDirs(SCORE_RUNS, onDisk, "2026-10-30");
    expect(overdue).toEqual([]);
    expect(due).toEqual([]);
  });
});
