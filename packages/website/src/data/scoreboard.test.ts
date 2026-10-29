import { describe, expect, it } from "vitest";

import llms from "../../public/llms.txt?raw";
import sitemap from "../../public/sitemap.xml?raw";
import { SCORE_RUNS, SEALED_SET_HASH, TUNED_LABEL } from "./scoreboard";

const LONG_DASHES = /[–—]/;

describe("SCORE_RUNS", () => {
  it("has unique ids and real dates where there is a result", () => {
    const ids = SCORE_RUNS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const run of SCORE_RUNS) {
      if (run.status === "measured") expect(run.date, run.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("never claims more found than known, and measured rows carry all their numbers", () => {
    for (const run of SCORE_RUNS) {
      if (run.status === "measured") {
        expect(run.known, run.id).not.toBeNull();
        expect(run.found, run.id).not.toBeNull();
        expect(run.hypotheses, run.id).not.toBeNull();
        expect(run.found!, run.id).toBeLessThanOrEqual(run.known!);
      }
    }
  });

  it("leaves a pending row empty instead of filling it with a guess", () => {
    for (const run of SCORE_RUNS.filter((r) => r.status === "pending")) {
      expect(run.found, run.id).toBeNull();
      expect(run.hypotheses, run.id).toBeNull();
      expect(run.date, run.id).toBeNull();
    }
  });

  it("gives every row a link to the open repository, and only over https", () => {
    for (const run of SCORE_RUNS) {
      expect(run.links.length, run.id).toBeGreaterThan(0);
      for (const link of run.links) expect(link.href, run.id).toMatch(/^https:\/\//);
    }
    const repoLinks = SCORE_RUNS.flatMap((r) => r.links).filter((l) => l.href.includes("github.com/holistis/bug-bounty-intelligence-mcp"));
    expect(repoLinks.length).toBeGreaterThanOrEqual(SCORE_RUNS.length);
  });

  it("marks a row on a set we tuned on as not evidence", () => {
    for (const run of SCORE_RUNS) {
      if (run.tunedOn === "yes") expect(TUNED_LABEL.yes).toContain("not evidence");
    }
    expect(SCORE_RUNS.find((r) => r.id === "exploration-a")?.tunedOn).toBe("yes");
    expect(SCORE_RUNS.find((r) => r.id === "baseline-dev-set")?.tunedOn).toBe("yes");
  });

  it("records the sealed run for both systems, on a set nobody tuned on, and keeps the registered numbers", () => {
    const v3 = SCORE_RUNS.find((r) => r.id === "sealed-v3")!;
    const s0 = SCORE_RUNS.find((r) => r.id === "sealed-s0")!;
    for (const run of [v3, s0]) {
      expect(run.status, run.id).toBe("measured");
      expect(run.known, run.id).toBe(105);
      expect(run.tunedOn, run.id).toBe("no");
    }
    expect(v3.found).toBe(4);
    expect(s0.found).toBe(1);
    expect(v3.note).toContain("not met");
    expect(SEALED_SET_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses no long dashes and no markdown stars in any text", () => {
    for (const run of SCORE_RUNS) {
      for (const text of [run.title, run.system, run.set, run.note, ...run.links.map((l) => l.label)]) {
        expect(text, run.id).not.toMatch(LONG_DASHES);
        expect(text, run.id).not.toContain("**");
      }
    }
  });

  it("never describes how the scan finds things, only how it is measured", () => {
    const forbidden = /\b(lens|lenses|long-context|long context|deepseek|prompt|prompts|one pass|cheap model|temperature|few-shot)\b/i;
    for (const run of SCORE_RUNS) {
      for (const text of [run.title, run.system, run.set, run.note]) expect(text, run.id).not.toMatch(forbidden);
    }
  });

  it("is listed in the sitemap and in llms.txt", () => {
    expect(sitemap).toContain("https://tokenizen.nl/scoreboard");
    expect(llms).toContain("https://tokenizen.nl/scoreboard");
  });
});
