// The numbers behind the measurement grids. Copied by script from the final totals of run 7 (knowledge file
// benchmark-2026-10-28-totalen-definitief.json in our private repository): 109 public repositories with a release,
// measured on 2026-10-28 with rule set 2026-10-28.6. These are the numbers of the published note
// "Eight security signals in 109 public repositories". A later run (rule set 2026-10-28.7) gave other numbers and is not mixed in here.
// Not one number on this page of the site is made up for the picture: every cell of a grid is one count from this table.

export const BENCHMARK_REPOSITORIES = 109;
export const BENCHMARK_RULES = "2026-10-28.6";
export const BENCHMARK_DATE = "2026-10-28";
export const BENCHMARK_NOTE_PATH = "/notes/eight-security-signals-109-repositories";
export const BENCHMARK_COUNTRIES = { Netherlands: 17, Germany: 12, France: 7, Belgium: 11, Sweden: 7, Finland: 12, Ireland: 11, Spain: 11, Italy: 11, Denmark: 10 } as const;

export interface BenchmarkSignal {
  key: string;
  en: string;
  nl: string;
  visible: number;
  notVisible: number;
  notMeasured: number;
}

export const BENCHMARK_SIGNALS: BenchmarkSignal[] = [
  { key: "vulnerability-policy", en: "Security policy with a contact", nl: "Beveiligingsbeleid met contact", visible: 17, notVisible: 89, notMeasured: 3 },
  { key: "sbom", en: "Software bill of materials (SBOM)", nl: "Onderdelenlijst (SBOM)", visible: 4, notVisible: 97, notMeasured: 8 },
  { key: "release-provenance", en: "Proof of where a release comes from", nl: "Bewijs waar een release vandaan komt", visible: 5, notVisible: 96, notMeasured: 8 },
  { key: "pinned-dependencies", en: "Pinned dependencies", nl: "Vastgezette onderdelen", visible: 56, notVisible: 24, notMeasured: 29 },
  { key: "dependency-updates", en: "Automatic dependency updates", nl: "Automatische updates", visible: 36, notVisible: 70, notMeasured: 3 },
  { key: "security-scanning", en: "Security scan in the pipeline", nl: "Beveiligingsscan in de pijplijn", visible: 15, notVisible: 89, notMeasured: 5 },
  { key: "maintenance", en: "Maintained in the last 90 days", nl: "Onderhouden in de laatste 90 dagen", visible: 88, notVisible: 21, notMeasured: 0 },
  { key: "license", en: "A licence", nl: "Een licentie", visible: 85, notVisible: 24, notMeasured: 0 },
];
