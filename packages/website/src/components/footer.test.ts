import { describe, expect, it } from "vitest";

import { showsRuleLegend } from "@/components/footer";

describe("showsRuleLegend", () => {
  it("shows the rule legend on the tools page in both languages", () => {
    expect(showsRuleLegend("/tools")).toBe(true);
    expect(showsRuleLegend("/en/tools")).toBe(true);
    expect(showsRuleLegend("/tools")).toBe(true);
    expect(showsRuleLegend("/nl/tools")).toBe(true);
    expect(showsRuleLegend("/en/tools/")).toBe(true);
  });

  // The dots explain the coloured rules of the homepage. On the blog they explain nothing.
  it("hides it on the homepage, the blog and the other pages", () => {
    expect(showsRuleLegend("/")).toBe(false);
    expect(showsRuleLegend("/en")).toBe(false);
    expect(showsRuleLegend("/notes")).toBe(false);
    expect(showsRuleLegend("/en/notes/check-pay-prove")).toBe(false);
    expect(showsRuleLegend("/check")).toBe(false);
  });
});
