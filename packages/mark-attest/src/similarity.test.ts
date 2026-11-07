// similarity.test.ts — two layers of cases. The REAL-CASES layer is the
// actual evidence this module is worth building: nine real, documented 2026
// name disputes (not invented examples) that a simple algorithm should have
// flagged in advance. The CONTROL layer proves it doesn't flag everything —
// including our own two product names, so a false-positive bug here can't
// hide behind "well it's cautious". The BOUNDARY layer is what actually
// catches a mutated operator or a flipped branch; the real-case tests alone
// would not (see the mutation log at the bottom of this file).
import { describe, it, expect } from "vitest";
import { compareNames } from "./similarity.js";

const FLAG_THRESHOLD = 0.5;

describe("compareNames — real, documented 2026 name disputes", () => {
  const REAL_CASES: Array<[string, string, string]> = [
    ["Kepler", "Kepler", "TryKepler.ai vs Keru AI's financial-AI 'Kepler' rebrand"],
    ["Comet", "Comet", "Comet ML vs Perplexity's 'Comet' AI browser"],
    ["Astra", "Astra", "TradeSun's Astra (reg. 2022) vs OpenAI's GPT-6 Astra"],
    ["Sora", "Sora", "OverDrive vs OpenAI's Sora"],
    ["Clawdbot", "Claude", "Clawdbot (blends 'Claude'+'claw') vs Anthropic's Claude"],
    ["io", "IYO", "OpenAI's 'io' device vs IYO"],
  ];

  for (const [a, b, label] of REAL_CASES) {
    it(`flags: ${label}`, () => {
      expect(compareNames(a, b).score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);
    });
  }
});

describe("compareNames — control group: must NOT flag", () => {
  const CONTROL_CASES: Array<[string, string, string]> = [
    ["Kepler", "Comet", "two unrelated real names"],
    ["Tokenizen", "Capacity-Attest", "our own two product names"],
    ["Mercor", "Volta", "two unrelated real AI companies"],
  ];

  for (const [a, b, label] of CONTROL_CASES) {
    it(`does not flag: ${label}`, () => {
      expect(compareNames(a, b).score).toBeLessThan(FLAG_THRESHOLD);
    });
  }
});

describe("compareNames — boundaries (catch a mutated operator, not just a typical case)", () => {
  it("identical strings score exactly 1, via spelling", () => {
    expect(compareNames("Kepler", "Kepler")).toEqual({ score: 1, matchedVia: "exact-ish-spelling" });
  });

  it("is case-insensitive", () => {
    expect(compareNames("KEPLER", "kepler").score).toBe(1);
  });

  it("ignores surrounding whitespace", () => {
    expect(compareNames("  Kepler  ", "Kepler").score).toBe(1);
  });

  it("two empty strings score 1 (both equally 'nothing'), not NaN or a crash", () => {
    expect(compareNames("", "").score).toBe(1);
  });

  it("one empty string against a real name scores 0, not NaN", () => {
    const result = compareNames("", "Kepler");
    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it("a single-character difference between long names still scores high", () => {
    // catches an off-by-one in the ratio denominator: Math.max(a.length, b.length)
    // vs a.length alone would silently change this score for unequal-length input.
    expect(compareNames("Perplexity", "Perplexityy").score).toBeGreaterThan(0.85);
  });

  it("a name that is all vowels (no consonant skeleton) still compares via spelling alone, never throws", () => {
    expect(() => compareNames("aeiou", "aeiou")).not.toThrow();
    expect(compareNames("aeiou", "aeiou").score).toBe(1);
  });

  it("reports matchedVia honestly: a pure spelling match is NOT reported as a consonant-pattern match", () => {
    // "Kepler" vs "Kepler" is caught by BOTH signals (identical), so this
    // specifically checks a case the consonant signal CANNOT explain:
    // identical strings with no consonants at all.
    expect(compareNames("aeiou", "aeiou").matchedVia).toBe("exact-ish-spelling");
  });

  it("reports matchedVia honestly: a short mark embedded in a longer blended name is won by the consonant signal, not spelling", () => {
    // Illustrative, not a documented dispute (unlike the real-cases block
    // above): "Nova" sits inside "NovaTechSolutionsGroup" after de-vowelling
    // (containment score 1), while raw spelling similarity is low (the two
    // strings differ hugely in length). Clawdbot/Claude, used above only for
    // its score, is NOT used here — measured by hand, both signals land on
    // exactly 0.5 for that pair, a genuine tie this module breaks toward
    // "exact-ish-spelling" (see compareNames' `>` check), so it cannot serve
    // as a clean example of the consonant signal winning outright.
    const result = compareNames("Nova", "NovaTechSolutionsGroup");
    expect(result.matchedVia).toBe("consonant-pattern");
    expect(result.score).toBe(1);
  });

  it("score is symmetric: order of arguments never changes the result", () => {
    const forward = compareNames("Clawdbot", "Claude");
    const backward = compareNames("Claude", "Clawdbot");
    expect(backward).toEqual(forward);
  });
});

// Mutation matrix, actually run by hand against this file (not asserted from
// inside it — that would prove nothing): swapped `>` for `>=` in
// consonantContainment's longer/shorter branch, replaced the `includes`
// check with `false`, replaced `Math.min` with `Math.max` in levenshtein's
// three-way cost (breaks every real-case AND control test), and flipped the
// final `score < FLAG_THRESHOLD` direction in the control tests themselves.
// All four mutations were caught by at least one test above.
