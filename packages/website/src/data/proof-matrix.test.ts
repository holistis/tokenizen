import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { entriesOfKind } from "@/components/pages/notes-index";
import {
  daysSince,
  formatMeasured,
  isIsoDate,
  MAX_AGE_FACTOR,
  PROOF_COPY,
  PROOF_ROWS,
  proofAge,
  proofProblems,
  typedAgain,
  type ProofRow,
} from "@/data/proof-matrix";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBSITE = resolve(HERE, "..", "..");
const REPO = resolve(WEBSITE, "..", "..");
const SOURCE_FILE = resolve(HERE, "proof-matrix.ts");
const SITEMAP = readFileSync(resolve(WEBSITE, "public", "sitemap.xml"), "utf8");

const TODAY = new Date();

/** A copy of the first real row with one thing changed, to plant a fault. */
const planted = (change: Partial<Record<keyof ProofRow, unknown>>): ProofRow[] => [{ ...PROOF_ROWS[0], ...change } as ProofRow];

describe("the proof matrix rows", () => {
  it("have a value, claim, checker, source, date and check address, and are not too old", () => {
    expect(proofProblems(PROOF_ROWS, TODAY)).toEqual([]);
  });

  // Typed by hand on purpose: these must not be read back from the data file.
  // What someone outside our team checked comes first, our own measurements next, the chain after that, and our own limit closes.
  it("are the seven rows the king approved, in this order", () => {
    expect(PROOF_ROWS.map((r) => r.id)).toEqual(["recount", "second-checker", "countersigned", "repositories", "x402-receipts", "payment", "scan-misses"]);
    expect(PROOF_ROWS.map((r) => r.value.en)).toEqual(["7 audits", "3 of 3", "2 signatures", "109", "0 of 600", "1 payment", "97 of 105"]);
    expect(PROOF_ROWS.map((r) => r.value.nl)).toEqual(["7 audits", "3 van 3", "2 handtekeningen", "109", "0 van 600", "1 betaling", "97 van 105"]);
    expect(PROOF_ROWS.map((r) => r.checkedBy)).toEqual(["outside", "outside", "outside", "own", "own", "chain", "limit"]);
    expect(PROOF_ROWS.map((r) => r.measuredAt)).toEqual(["2026-11-02", "2026-10-17", "2026-11-18", "2026-10-28", "2026-10-15", "2026-10-23", "2026-10-25"]);
  });

  it("name an existing file as their source, and a path of this site or an https address to check", () => {
    for (const row of PROOF_ROWS) {
      const file = row.source.split(",")[0];
      if (file.startsWith("packages/")) expect(existsSync(resolve(REPO, file)), `${row.id}: ${file}`).toBe(true);
      else expect(file, row.id).toMatch(/^https:\/\//);
      if (row.checkUrl.startsWith("/")) expect(SITEMAP, `${row.id}: ${row.checkUrl}`).toContain(`https://tokenizen.nl${row.checkUrl}</loc>`);
    }
  });

  it("carry the date of the note they come from", () => {
    const notes = [...entriesOfKind("note"), ...entriesOfKind("blog")];
    for (const row of PROOF_ROWS.filter((r) => r.checkUrl.startsWith("/notes/"))) {
      expect(notes.find((n) => n.slug === row.checkUrl)?.date, row.id).toBe(row.measuredAt);
    }
  });

  it("do not type a number again that already lives somewhere else", () => {
    // The scoreboard holds 97 and 105, the benchmark file 109, the notes 600.
    expect(typedAgain(readFileSync(SOURCE_FILE, "utf8"), [97, 105, 109, 600])).toEqual([]);
  });
});

describe("the checks on the rows catch a planted fault", () => {
  it("a date that is left out, changed to the future, too old, or not a date", () => {
    expect(proofProblems(planted({ measuredAt: "" }), TODAY).join("|")).toContain("measuredAt is missing");
    expect(proofProblems(planted({ measuredAt: undefined }), TODAY).join("|")).toContain("measuredAt is missing");
    expect(proofProblems(planted({ measuredAt: "15 Oct 2026" }), TODAY).join("|")).toContain("measuredAt is missing");
    expect(proofProblems(planted({ measuredAt: "2026-02-31" }), TODAY).join("|")).toContain("measuredAt is missing");
    const tomorrow = new Date(TODAY.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(proofProblems(planted({ measuredAt: tomorrow }), TODAY).join("|")).toContain("in the future");
    const old = new Date(TODAY.getTime() - (MAX_AGE_FACTOR * 60 + 3) * 86_400_000).toISOString().slice(0, 10);
    expect(proofProblems(planted({ measuredAt: old, staleAfterDays: 60 }), TODAY).join("|")).toContain("more than twice its limit");
  });

  it("a source or a check address that is left out or emptied", () => {
    expect(proofProblems(planted({ source: "" }), TODAY).join("|")).toContain("no source");
    expect(proofProblems(planted({ source: undefined }), TODAY).join("|")).toContain("no source");
    expect(proofProblems(planted({ checkUrl: "" }), TODAY).join("|")).toContain("no checkUrl");
    expect(proofProblems(planted({ checkUrl: undefined }), TODAY).join("|")).toContain("no checkUrl");
    expect(proofProblems(planted({ checkUrl: "http://example.com/x" }), TODAY).join("|")).toContain("neither a path");
  });

  it("a value or a claim that is emptied in one language, a wrong checker, a wrong limit, a repeated id", () => {
    expect(proofProblems(planted({ value: { en: "0 of 600", nl: "" } }), TODAY).join("|")).toContain("no nl value");
    expect(proofProblems(planted({ claim: { en: "", nl: "x" } }), TODAY).join("|")).toContain("no en claim");
    expect(proofProblems(planted({ checkedBy: "friend" }), TODAY).join("|")).toContain("checkedBy");
    expect(proofProblems(planted({ staleAfterDays: 0 }), TODAY).join("|")).toContain("staleAfterDays");
    expect(proofProblems([PROOF_ROWS[0], PROOF_ROWS[0]], TODAY).join("|")).toContain("id used twice");
    expect(proofProblems(planted({ id: "" }), TODAY).join("|")).toContain("no id");
  });

  it("a number that is typed again, and no false alarm on dates, other numbers or comments", () => {
    expect(typedAgain('value: "97 of 105",', [97, 105, 109, 600])).toEqual([97, 105]);
    expect(typedAgain("const total = 109;", [97, 105, 109, 600])).toEqual([109]);
    expect(typedAgain("measuredAt: \"2026-10-15\", staleAfterDays: 60, id: 1097", [97, 105, 109, 600])).toEqual([]);
    expect(typedAgain("// 97 and 105 come from the scoreboard\n/* 600 */ const a = 1;", [97, 105, 109, 600])).toEqual([]);
  });
});

describe("how old a row is", () => {
  it("counts whole calendar days in UTC, whatever the time of day", () => {
    expect(daysSince("2026-10-28", new Date("2026-11-18T00:00:00Z"))).toBe(21);
    expect(daysSince("2026-10-28", new Date("2026-11-18T23:59:59Z"))).toBe(21);
    expect(daysSince("2026-10-28", new Date("2026-11-19T00:00:00Z"))).toBe(22);
    expect(daysSince("2026-10-28", new Date("2026-10-28T12:00:00Z"))).toBe(0);
    expect(daysSince("2026-10-28", new Date("2026-10-27T12:00:00Z"))).toBe(-1);
  });

  it("calls a row stale only when it is older than its own limit", () => {
    const row = { measuredAt: "2026-10-28", staleAfterDays: 60 };
    expect(proofAge(row, new Date("2026-12-27T10:00:00Z"))).toEqual({ days: 60, stale: false });
    expect(proofAge(row, new Date("2026-12-28T10:00:00Z"))).toEqual({ days: 61, stale: true });
  });

  it("writes the date and the age in both languages", () => {
    expect(formatMeasured("2026-10-28", "en")).toBe("28 Oct 2026");
    expect(formatMeasured("2026-10-28", "nl")).toBe("28 okt 2026");
    expect(formatMeasured("2026-11-02", "en")).toBe("2 Nov 2026");
    expect(PROOF_COPY.en.ago(21)).toBe("21 days ago");
    expect(PROOF_COPY.en.ago(1)).toBe("1 day ago");
    expect(PROOF_COPY.nl.ago(21)).toBe("21 dagen geleden");
    expect(PROOF_COPY.nl.ago(1)).toBe("1 dag geleden");
    expect(PROOF_COPY.en.stale(60)).toBe("Older than 60 days: due for a new measurement");
    expect(PROOF_COPY.nl.stale(60)).toBe("Ouder dan 60 dagen: tijd voor een nieuwe meting");
  });

  it("only takes real dates", () => {
    expect(isIsoDate("2026-10-28")).toBe(true);
    for (const bad of ["", "2026-13-01", "2026-02-30", "28-10-2026", "2026-10-28T00:00:00Z"]) expect(isIsoDate(bad), bad).toBe(false);
  });
});

describe("the words of the matrix", () => {
  it("are the approved texts, typed by hand here", () => {
    expect(PROOF_COPY.en.heading).toBe("What we measured, and how you can check it");
    expect(PROOF_COPY.nl.heading).toBe("Wat we maten, en hoe je het zelf nagaat");
    expect(PROOF_COPY.en.subtitle).toBe("Every number has a source, a date and a way to run it again. When a number gets old, this page says so.");
    expect(PROOF_COPY.nl.subtitle).toBe("Bij elk getal staat een bron, een datum en een manier om het opnieuw te doen. Wordt een getal oud, dan zegt deze pagina dat.");
    expect(PROOF_COPY.en.chips).toEqual({
      own: "Our own measurement",
      outside: "Checked by someone outside our team",
      chain: "On-chain",
      limit: "A limit we publish",
      testnet: "Test network",
      "own-test": "Our own test",
    });
    expect(PROOF_COPY.nl.chips).toEqual({
      own: "Eigen meting",
      outside: "Nagekeken door iemand buiten ons team",
      chain: "Op de keten",
      limit: "Een grens die we zelf publiceren",
      testnet: "Testnetwerk",
      "own-test": "Eigen test",
    });
    expect([PROOF_COPY.en.measured, PROOF_COPY.en.check]).toEqual(["Measured", "Check it yourself"]);
    expect([PROOF_COPY.nl.measured, PROOF_COPY.nl.check]).toEqual(["Gemeten", "Ga het zelf na"]);
  });

  it("keep the wording of the homepage tiles they replace, with a capital at the start and without the two phrases the king took out", () => {
    // The six rows that replace the old tiles, in their order; the countersigned receipt has its own test below.
    const tiles = PROOF_ROWS.filter((r) => r.id !== "countersigned");
    const en = tiles.map((r) => r.claim.en);
    expect(en[0]).toBe(
      "Our research scan runs on 7 audits come with their verdict files and a script that recounts them, the leader's higher score included. Someone outside our team has already recounted them",
    );
    expect(en[1]).toBe("Test receipts on which a second checker, written separately by the author of an open x402 receipt proposal, reached the same result as ours");
    expect(en[2]).toBe("Public repositories in ten EU countries measured on eight security signals, our misses published");
    expect(en[3]).toBe("x402 catalogue records we sampled from one index declare the offer-receipt extension. Ours signs offers, and you can check one yourself");
    expect(en[4]).toBe("One real payment on Base mainnet from a test agent of ours to our own service, with the transactions open to check");
    expect(en[5]).toBe("Our scan missed 97 of 105 known findings in its run on eight audit contests.");
    const nl = tiles.map((r) => r.claim.nl);
    expect(nl[0]).toBe(
      "Onze onderzoeksscans op 7 audits komen met hun oordeelsbestanden en een script dat alles opnieuw telt, ook de hogere score van de koploper. Iemand buiten ons team heeft het al nagerekend",
    );
    expect(nl[1]).toBe("Testbonnetjes waarop een tweede controleprogramma, apart geschreven door de schrijver van een openstaand x402-bonnetjesvoorstel, tot hetzelfde resultaat kwam als het onze");
    expect(nl[2]).toBe("Openbare repositories in tien EU-landen gemeten op acht beveiligingssignalen, onze missers gepubliceerd");
    expect(nl[3]).toBe("x402-catalogusrecords uit een index die we als steekproef namen, vermelden de offer-receipt-extensie. Onze dienst ondertekent aanbiedingen, en je kunt er zelf een nalopen");
    expect(nl[4]).toBe("Een echte betaling op Base mainnet van een testagent van ons aan onze eigen dienst, met de transacties open om na te kijken");
    expect(nl[5]).toBe("Onze scan miste 97 van de 105 bekende bevindingen in de run op acht auditwedstrijden.");
    // Every sentence starts with a capital, except the two that start with the name x402.
    for (const claim of [...en, ...nl]) expect(claim.startsWith("x402") || /^[A-Z]/.test(claim), claim).toBe(true);
  });

  it("says what the countersigned receipt is, in the words approved, typed by hand here", () => {
    const row = PROOF_ROWS.find((r) => r.id === "countersigned");
    expect(row?.claim.en).toBe(
      "One receipt for a paid call to our service on a test network, signed by us and countersigned by the party that paid, with its id and both signatures recomputed by a second implementer. The check the call ran came back as not passed, and the receipt says so",
    );
    expect(row?.claim.nl).toBe(
      "Een bonnetje voor een betaalde aanroep van onze dienst op een testnetwerk, door ons ondertekend en door de betalende partij mee ondertekend, waarvan een tweede ontwikkelaar het id en beide handtekeningen opnieuw uitrekende. De controle die de aanroep deed kwam niet door, en dat staat zo in het bonnetje",
    );
    expect(row?.caveats).toEqual(["testnet"]);
    expect(row?.checkedBy).toBe("outside");
  });
});
