// similarity.ts — the scoring core of mark-attest. Deliberately simple: a
// name-collision check only needs to be AS GOOD AS a human skimming two
// names side by side, not a trained trademark examiner. Two independent
// signals, combined by taking the higher one, because they catch two
// different failure modes and neither alone covers both:
//
//  1. editRatio — catches near-identical spelling (two parties who
//     independently landed on literally the same word: "Kepler" / "Kepler",
//     "Astra" / "Astra", "Comet" / "Comet" — all real 2026 disputes).
//  2. consonantContainment — catches a name that EVOKES another without
//     spelling it the same way (Anthropic's "Claude" vs the "Clawdbot"
//     project, which blends "Claude" + "claw"). Stripping vowels and
//     repeated letters down to a consonant skeleton and checking whether
//     one skeleton sits inside the other catches this; editRatio alone
//     misses it (the two words share almost no raw character positions).
//
// Neither signal is a legal verdict. This module answers "do these two
// names look alike to a simple algorithm", nothing about trademark
// classes, likelihood of confusion, or who filed first — see README.md's
// own boundary on that.

export interface SimilarityResult {
  /** 0 (nothing alike) to 1 (identical after normalization). The higher of the two signals below. */
  score: number;
  /** Which signal produced the reported score — lets a caller see WHY two names flagged, not just that they did. */
  matchedVia: "exact-ish-spelling" | "consonant-pattern";
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Bounds (0..n inclusive, filled before read in every iteration below)
  // guarantee every index here is in range — the `!` assertions reflect
  // that, not an unchecked assumption.
  const prevRow = new Array<number>(n + 1);
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;
  for (let i = 1; i <= m; i++) {
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        prevRow[j]! + 1, // deletion
        row[j - 1]! + 1, // insertion
        prevRow[j - 1]! + cost, // substitution
      );
    }
    for (let j = 0; j <= n; j++) prevRow[j] = row[j]!;
  }
  return prevRow[n]!;
}

function editRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1; // both empty strings: defined as identical, not a division by zero
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Strips a name down to its consonant "skeleton" — vowels removed, then
 * runs of the same letter collapsed to one. Deliberately crude: the goal is
 * catching a loose phonetic echo (CLWD both in "Claude" and "Clawdbot"), not
 * a real phonetic algorithm (soundex/metaphone), which would be its own,
 * separately-tested module if this crude version ever proves too blunt.
 */
function consonantSkeleton(name: string): string {
  return name
    .replace(/[^a-z]/g, "")
    .replace(/[aeiou]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function consonantContainment(a: string, b: string): number {
  const skelA = consonantSkeleton(a);
  const skelB = consonantSkeleton(b);
  if (skelA.length === 0 || skelB.length === 0) return 0; // an all-vowel name (e.g. "io") has no skeleton to compare — this signal abstains, editRatio still applies
  const [shorter, longer] = skelA.length <= skelB.length ? [skelA, skelB] : [skelB, skelA];
  if (longer.includes(shorter)) return 1;
  return editRatio(skelA, skelB);
}

/** Compares two candidate names and reports how alike they look, and via which signal. */
export function compareNames(nameA: string, nameB: string): SimilarityResult {
  const a = normalize(nameA);
  const b = normalize(nameB);
  const spelling = editRatio(a, b);
  const consonantPattern = consonantContainment(a, b);
  if (consonantPattern > spelling) {
    return { score: consonantPattern, matchedVia: "consonant-pattern" };
  }
  return { score: spelling, matchedVia: "exact-ish-spelling" };
}
