import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScoreboardPage, resultText } from "@/components/pages/scoreboard-page";
import { SCORE_RUNS, SEALED_SET_HASH, TUNED_LABEL } from "@/data/scoreboard";

describe("ScoreboardPage", () => {
  const html = renderToStaticMarkup(<ScoreboardPage />);

  it("shows every row with its title and its result in words a reader can check", () => {
    for (const run of SCORE_RUNS) {
      expect(html).toContain(run.title.replace(/&/g, "&amp;"));
    }
    expect(html).toContain("0 of 31");
    expect(html).toContain("0 of 40");
    expect(html).toContain("7 of 85");
    expect(html).toContain("1 of 85");
    expect(html).toContain("4 of 105");
    expect(html).toContain("1 of 105");
  });

  it("says Not measured yet for the rows that have no result, and never invents one", () => {
    const pending = SCORE_RUNS.filter((r) => r.status === "pending");
    expect(pending.length).toBeGreaterThanOrEqual(1);
    for (const run of pending) expect(resultText(run)).toBe("Not measured yet");
    expect(html.split("Not measured yet").length - 1).toBe(pending.length);
  });

  it("labels the rows on a set we tuned on as not evidence", () => {
    expect(html).toContain(TUNED_LABEL.yes);
  });

  it("states what it is not, what would count as proof, and how to cite it", () => {
    expect(html).toContain("not an audit, an approval or a certification");
    expect(html).toContain("What would count as proof");
    expect(html).toContain("https://tokenizen.nl/en/scoreboard");
    expect(html).toContain(SEALED_SET_HASH);
  });

  it("opens every outside link in a new tab without leaking the referrer and uses only https", () => {
    expect(html).not.toMatch(/href="http:\/\//);
    const outside = html.match(/<a [^>]*href="https:\/\/github\.com[^>]*>/g) ?? [];
    expect(outside.length).toBeGreaterThan(3);
    for (const tag of outside) expect(tag).toContain('rel="noreferrer noopener"');
  });

  it("uses no long dashes", () => {
    expect(html).not.toMatch(/[–—]/);
  });
});
