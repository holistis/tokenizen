import { describe, expect, it } from "vitest";

import { showsRuleLegend } from "@/components/footer";

describe("showsRuleLegend", () => {
  it("shows the rule legend on the homepage in both languages", () => {
    expect(showsRuleLegend("/")).toBe(true);
    expect(showsRuleLegend("/en")).toBe(true);
    expect(showsRuleLegend("/en/")).toBe(true);
  });

  // The dots explain the coloured rules of the homepage. On the blog they explain nothing.
  it("hides it on the blog and the other pages", () => {
    expect(showsRuleLegend("/notes")).toBe(false);
    expect(showsRuleLegend("/en/notes/check-pay-prove")).toBe(false);
    expect(showsRuleLegend("/check")).toBe(false);
  });
});
