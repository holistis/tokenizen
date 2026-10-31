// scoreboard.ts — the rows of tokenizen.nl/en/scoreboard.
//
// The page shows one thing: how many of the findings that human auditors already found in closed
// contests our scan finds. A row is added when a measurement exists, and a pending row stays empty on
// purpose until its result does. Nothing here is rounded up and nothing is removed when it is
// unflattering: a result that turns out wrong is corrected in the row, with the old text kept in the
// note.
//
// EVERY ROW LINKS TO A FILE IN THE OPEN REPOSITORY that holds the rule written before the run and the
// result written after it. A number without such a link does not belong on this page.
//
// WHAT STAYS PRIVATE AND WHAT DOES NOT. How the scan finds things (its prompts, settings and models) is
// ours and is not described here or anywhere on the site. How it is measured is open: the contests, the
// two judges, the rules written before the run, and every output. The two fit together because the files
// the scan uses are committed by hash before the sealed run, so they cannot change afterwards, and
// because anyone can re-score the published outputs with the open judges. A test fails if a row starts
// describing the recipe.
//
// "tunedOn" matters more than the number. A row on a set the system was tuned on is shown, because it is
// the honest record of how we got here, but it is labelled as not evidence: a student who has seen the
// exam questions scores well and proves nothing.

const REPO = "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main";

export type RunStatus = "measured" | "pending";
export type TunedOn = "no" | "yes" | "partly" | "not applicable";

export interface RunLink {
  label: string;
  href: string;
}

export interface ScoreRun {
  id: string;
  /** ISO date of the measurement, or null while pending. */
  date: string | null;
  title: string;
  /** What was run. */
  system: string;
  /** Which contests, and how many known findings they hold. */
  set: string;
  status: RunStatus;
  /** Known High and Medium findings in the set. */
  known: number | null;
  /** Known findings that both judges matched to a hypothesis (the strict count). */
  found: number | null;
  /** Hypotheses the system reported in total. */
  hypotheses: number | null;
  tunedOn: TunedOn;
  /** Which fixed set a row measured and which version of the scan, so that two rows can be compared (scripts/scoreboard-regel.mjs). Rows on the development set carry neither: the Publication Rule does not cover them. */
  setId?: string;
  version?: string;
  /** What to know before reading the number. */
  note: string;
  links: RunLink[];
}

export const SCORE_UPDATED = "2026-10-31";

// The rule for what goes on this page and how fast, with an OpenTimestamps stamp next to it in the open repository.
export const PUBLICATION_RULE_URL = `${REPO}/PUBLICATION-RULE-scan-results.md`;

export const SEALED_SET_HASH = "de1a23a4aabc17def5145229c8ee4b4b216e25e8a5ec990e0c5bb37620b61ca1";
export const SEED_BLOCK = { number: 53022890, hash: "0x91b7371d9902f60b3515633ffda7f89f7537bcce9a132a62fef21694f54ddd1d" };

export const SCORE_RUNS: ScoreRun[] = [
  {
    id: "contests-after-today",
    date: null,
    title: "Contests that appear after today",
    system: "Every system that takes part, ours included",
    set: "New contests as their final reports are published",
    status: "pending",
    known: null,
    found: null,
    hypotheses: null,
    tunedOn: "not applicable",
    note: "The cleanest test, because the answers do not exist yet when the report is committed. The hash of a system's report is committed before the contest results are published, and scored afterwards with the same two judges. Takes weeks, since results arrive per contest.",
    links: [{ label: "How the judges decide", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` }],
  },
  {
    id: "lab-sealed-2",
    version: "4.1",
    date: "2026-10-31",
    title: "A development version on the same eight contests, second run",
    system: "A development version of the scan, not in production. Run 2 of 2 on 31 October",
    set: "The 8 contests of the sealed run, 105 known findings. No longer secret: their results were published on 24 October",
    status: "measured",
    known: 105,
    found: 12,
    hypotheses: 324,
    tunedOn: "yes",
    note: "Strict, both judges name the same finding: 12 of 105 in the first 15 hypotheses per contest (120 of the 324 reported), 15 in the first 30, 16 in the whole list (15.2 percent). All easy: 16 of 59 easy, 0 of 14 middle, 0 of 32 hard. Every contest was read in full this time, for 0.12 dollars for the whole set. The prediction written before the run was 12 to 25 strict over the whole list, most likely 15 to 20; the rule written with it needed 17 or more over the whole list to count as clearly above the first run, and 16 does not meet it. Both runs together found 21 different findings. Two things changed between the runs, the version and a setting, so the rise cannot be credited to either one. The judges are a different pair than in the older rows, so the older rows are not strictly comparable. We built this version after the answers to these contests were public, and run 2 after seeing run 1 on them, so the set is tuned on. One run, and the better of two. The contests have been public since 24 October and may be in the training data.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-31-lab-sealed/README.md` }],
  },
  {
    id: "lab-sealed-1",
    version: "4.0",
    date: "2026-10-31",
    title: "A development version on the same eight contests, first run",
    system: "A development version of the scan, not in production. Run 1 of 2 on 31 October",
    set: "The 8 contests of the sealed run, 105 known findings. No longer secret: their results were published on 24 October",
    status: "measured",
    known: 105,
    found: 10,
    hypotheses: 282,
    tunedOn: "yes",
    note: "Strict, both judges name the same finding: 10 of 105 in the first 15 hypotheses per contest (120 of the 282 reported), 12 in the first 30 and 12 in the whole list (11.4 percent). All easy: 12 of 59 easy, 0 of 14 middle, 0 of 32 hard. This run was only partly read because of a setting of ours that we fixed for the second run, so it is likely lower than a full read would give. The second run above read everything. The judges are a different pair than in the older rows, so the older rows are not strictly comparable. We built this version after the answers to these contests were public, so the set is tuned on. One run. The contests have been public since 24 October and may be in the training data.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-31-lab-sealed/README.md` }],
  },
  {
    id: "evmbench-forty",
    setId: "evmbench-40",
    version: "3.1",
    date: "2026-10-26",
    title: "Version 3.1 on the 40 audits of EVMbench",
    system: "Version 3.1 of the scan, as in production, unchanged",
    set: "The 40 audits of the public EVMbench detect set, 117 high severity findings. 4 of the 40 overlap earlier tuning sets",
    status: "measured",
    known: 117,
    found: 23,
    hypotheses: 1537,
    tunedOn: "partly",
    note: "Counts the first 15 hypotheses per audit, 600 of the 1,537 the scan reported, like the rows below. The first 30 hold 29 of 117, and so does the whole list. Only High findings are counted here, so the number cannot be set next to the Code4rena and Sherlock rows, which count High and Medium. Over the whole list 2.9 percent of the hypotheses match a known finding, and in 18 of the 40 audits nothing passed both judges. Without the 4 audits that overlap our earlier tuning sets it is 21 of 110. On the 7 newest audits, none used before, it is 3 of 14. The 29 older audits are public and may be in the training data of the models behind the scan and the judges. One run, no audit run twice. The rules for reading the result were written in a working note before the run, but we anchored that note only after it, so the order is something you take on our word. Three people outside our team recomputed the totals from the verdict files and got the same numbers; that covers the arithmetic, not whether the judges' verdicts are right.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-26-evmbench/README.md` }],
  },
  {
    id: "slither-same-contests",
    date: "2026-10-25",
    title: "Slither 0.11.6 on the same contests",
    system: "Slither 0.11.6 with default settings, a free static analysis tool",
    set: "Code4rena contests where it ran in our setup: 4 of 9 newer and 4 of 6 older, 34 known findings",
    status: "measured",
    known: 34,
    found: 0,
    hypotheses: 167,
    tunedOn: "not applicable",
    note: "Strict hits: none. Two hypotheses on one contest matched a known finding for one judge only. Static tools are not built for the business-logic flaws that contests reward, they ran on only part of the contests in our setup, and the judges are language models. On the same contests our scan found 6 of 34 in its first 15 hypotheses; the older contests may be in the training data of the model behind our scan.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-25-free-tools/README.md` }],
  },
  {
    id: "aderyn-same-contests",
    date: "2026-10-25",
    title: "Aderyn 0.6.8 on the same contests",
    system: "Aderyn 0.6.8 with default settings, a free static analysis tool",
    set: "Code4rena contests where it ran in our setup: 4 of 9 newer and 6 of 6 older, 70 known findings",
    status: "measured",
    known: 70,
    found: 0,
    hypotheses: 202,
    tunedOn: "not applicable",
    note: "Strict hits: none. Static tools are not built for the business-logic flaws that contests reward, they ran on only part of the contests in our setup, and the judges are language models. On the same contests our scan found 10 of 70 in its first 15 hypotheses; the older contests may be in the training data of the model behind our scan.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-25-free-tools/README.md` }],
  },
  {
    id: "c4-fresh-nine",
    setId: "c4-nine",
    version: "3.1",
    date: "2026-10-25",
    title: "Version 3.1 on nine newer Code4rena contests",
    system: "Version 3.1 of the scan, as in production",
    set: "9 Code4rena contests from September 2025 to March 2026, 66 known findings. Not used to build the scan",
    status: "measured",
    known: 66,
    found: 5,
    hypotheses: 135,
    tunedOn: "no",
    note: "Counts the first 15 hypotheses per contest, which is what reports showed until 25 October; the first 30 held 8 of 66. The rule for reading the result was written before the run: 5 percent or more holds, and this is 7.6 percent. 3 of 35 easy findings, 0 of 8 middle and 2 of 23 hard were in the first 15; 61 of 66 known findings were not. Small numbers, one run per contest. The Code4rena known lists are shorter than Sherlock's, contests from early 2026 may be in the training data of a model, and the Olas contest was read for 38 percent of its code.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-25-c4-fresh/README.md` }],
  },
  {
    id: "v31-same-eight",
    setId: "sealed-8",
    version: "3.1",
    date: "2026-10-25",
    title: "Version 3.1 on the same eight contests",
    system: "Version 3.1 of the scan, live since the evening of 25 October",
    set: "The 8 contests of the sealed run, 105 known findings. No longer secret: their results were published on 24 October",
    status: "measured",
    known: 105,
    found: 8,
    hypotheses: 120,
    tunedOn: "partly",
    note: "6 of 59 easy findings, 1 of 14 middle, 1 of 32 hard. Precision 7.5 percent, about 20 to 45 seconds and 0.02 to 0.15 dollar per scan. Two things changed at once, a newer model and a fix of which files count, so we cannot say which one did the work. One run, so a repeat could land between about 6 and 10. The models may have seen these contests. 97 of 105 known findings were still not found. The rule for reading the result was written in our own notes before the run, which are not public, so this row is less verifiable than the sealed run. Correction on 31 October 2026: this row first said it was not tuned on this set. Version 3.1 was built after the results of these contests were public on 24 October, so the label is now partly. The time per scan was about 20 to 50 seconds, not 20 to 45 as written above.",
    links: [{ label: "The results, judgements and hashes", href: `${REPO}/results/2026-10-25-v31/README.md` }],
  },
  {
    id: "sealed-v3",
    setId: "sealed-8",
    version: "3",
    date: "2026-10-24",
    title: "The sealed run: the new version",
    system: "Version 3 of the scan, its files committed by hash before the run",
    set: "Sealed set: 8 contests, 105 known findings, committed by a hash before anyone looked at them",
    status: "measured",
    known: 105,
    found: 4,
    hypotheses: 120,
    tunedOn: "no",
    note: "2 of 59 easy findings, 0 of 14 middle, 2 of 32 hard. Precision 5.0 percent, 46 to 105 seconds and at most 0.064 dollar per scan. It found 3 known findings that the running scan did not. The rule written first needed 5, so it is not met and the running scan stayed in production. On the evening of 25 October version 3.1 replaced it, see the row above. Our own reading of two disagreements between the judges would have made it 5; the number we registered is the one both judges agree on.",
    links: [
      { label: "The results and our reading", href: `${REPO}/results/2026-10-24-sealed/README.md` },
      { label: "The pre-registration and its addendum", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` },
      { label: "The set, to recompute its hash", href: `${REPO}/bench/verzegelde-set.json` },
    ],
  },
  {
    id: "sealed-s0",
    setId: "sealed-8",
    version: "2.1",
    date: "2026-10-24",
    title: "The sealed run: the scan as it runs",
    system: "Version 2.1 of the scan, the one in production until the evening of 25 October, with the pattern block",
    set: "Sealed set: 8 contests, 105 known findings",
    status: "measured",
    known: 105,
    found: 1,
    hypotheses: 43,
    tunedOn: "no",
    note: "1 of 59 easy findings, 0 of 14 middle, 0 of 32 hard. Precision 4.7 percent, 2.7 to 8.6 minutes per scan. The one it found, the new version found as well.",
    links: [
      { label: "The results and our reading", href: `${REPO}/results/2026-10-24-sealed/README.md` },
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-v3-2026-10-24.md` },
    ],
  },
  {
    id: "exploration-a",
    date: "2026-10-24",
    title: "The next version, first trial",
    system: "In development. How it works stays private until after the sealed run; the hash of its files is published before that run",
    set: "Development set: 6 contests, 85 known findings",
    status: "measured",
    known: 85,
    found: 7,
    hypotheses: 88,
    tunedOn: "yes",
    note: "7 of 31 easy findings, 0 of 26 middle, 0 of 28 hard. We tune on this set, so this is a record of how we got here and not evidence.",
    links: [{ label: "Results and raw outputs", href: `${REPO}/results/2026-10-24-dev-set/README.md` }],
  },
  {
    id: "baseline-dev-set",
    date: "2026-10-24",
    title: "The scan as it runs, on the development set",
    system: "Version 2 of the scan with the pattern block of production",
    set: "Development set: 6 contests, 85 known findings",
    status: "measured",
    known: 85,
    found: 1,
    hypotheses: 39,
    tunedOn: "yes",
    note: "Without the pattern block it found 0 of 85 with 36 hypotheses. Two more known findings were matched by only one of the two judges, which we do not count. We tune on this set, so this is not evidence.",
    links: [{ label: "Results and raw outputs", href: `${REPO}/results/2026-10-24-dev-set/README.md` }],
  },
  {
    id: "v2",
    date: "2026-10-24",
    title: "Version 2 of the scan",
    system: "The scan after the first round of fixes",
    set: "7 contests: 4 it was tuned on (31 known findings) and 3 new ones (9 known)",
    status: "measured",
    known: 40,
    found: 0,
    hypotheses: 31,
    tunedOn: "partly",
    note: "0 of 31 on the four contests it was tuned on and 0 of 9 on the three new ones. It read 29 percent of the in-scope code. We found afterwards that the measured copy lacked a block of historical patterns that production carries, and the results page carries that correction above its tables.",
    links: [
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-v2-2026-10-24.md` },
      { label: "The results", href: `${REPO}/RESULTS-v2-2026-10-24.md` },
    ],
  },
  {
    id: "v1",
    date: "2026-10-24",
    title: "Version 1, as it ran",
    system: "The scan as it ran on the morning of 24 October 2026",
    set: "4 contests, 31 known findings",
    status: "measured",
    known: 31,
    found: 0,
    hypotheses: 2,
    tunedOn: "no",
    note: "Two hypotheses in total, neither matching a known finding. One job failed and two returned empty reports. The prediction we wrote before the run was at most 2 of 31.",
    links: [
      { label: "The pre-registration", href: `${REPO}/PREREGISTRATION-2026-10-24.md` },
      { label: "The results", href: `${REPO}/RESULTS-2026-10-24.md` },
    ],
  },
];

/** How the page tells a reader what a row is worth. */
export const TUNED_LABEL: Record<TunedOn, string> = {
  no: "not tuned on this set",
  yes: "tuned on this set, not evidence",
  partly: "partly tuned on this set",
  "not applicable": "decides the question",
};

// THE DUTCH VERSION OF THE ROWS. The numbers, dates, hashes and links of a row are the same in both languages and live in SCORE_RUNS
// above; only the words differ, so only the words are repeated here. A test checks that every row has its Dutch text, that the links
// line up, and that every number of the English note appears in the Dutch one (decimals written with a comma). Dutch must never say
// more than the English does and keeps every caveat.

export type RunLocale = "en" | "nl";

export interface RunTextNl {
  title: string;
  system: string;
  set: string;
  note: string;
  /** The labels of the links, in the order of the links of the English row. */
  links: string[];
}

export const SCORE_RUNS_NL: Record<string, RunTextNl> = {
  "contests-after-today": {
    title: "Wedstrijden die na vandaag verschijnen",
    system: "Elk systeem dat meedoet, het onze inbegrepen",
    set: "Nieuwe wedstrijden zodra hun eindrapporten verschijnen",
    note: "De zuiverste toets, want de antwoorden bestaan nog niet als het rapport wordt vastgelegd. De hash van het rapport van een systeem wordt vastgelegd voordat de uitslagen van de wedstrijd verschijnen, en wordt achteraf beoordeeld door dezelfde twee rechters. Dat duurt weken, want de uitslagen komen per wedstrijd binnen.",
    links: ["Hoe de rechters beslissen"],
  },
  "evmbench-forty": {
    title: "Versie 3.1 op de 40 audits van EVMbench",
    system: "Versie 3.1 van de scan, zoals in productie, ongewijzigd",
    set: "De 40 audits van de openbare detect-set van EVMbench, 117 bevindingen van hoge ernst. 4 van de 40 overlappen met eerdere afstelsets",
    note: "Telt de eerste 15 hypotheses per audit, 600 van de 1.537 die de scan meldde, zoals de rijen hieronder. De eerste 30 bevatten er 29 van de 117, en de hele lijst ook. Hier tellen alleen High-bevindingen mee, dus het getal is niet naast de rijen van Code4rena en Sherlock te leggen, die High en Medium tellen. Over de hele lijst komt 2,9 procent van de hypotheses overeen met een bekende bevinding, en in 18 van de 40 audits kwam er niets door beide rechters. Zonder de 4 audits die overlappen met onze eerdere afstelsets zijn het er 21 van de 110. Op de 7 nieuwste audits, nog niet eerder gebruikt, zijn het er 3 van de 14. De 29 oudere audits zijn openbaar en kunnen in de trainingsdata staan van de modellen achter de scan en de rechters. Eén run, geen audit twee keer gedraaid. De regels voor het lezen van de uitslag stonden vooraf in een werknotitie, maar we hebben die notitie pas na de run verankerd, dus de volgorde moet je op ons woord geloven. Drie mensen buiten ons team hebben de totalen opnieuw berekend uit de oordeelbestanden en kwamen op dezelfde getallen; dat dekt de rekensom, niet of de oordelen van de rechters kloppen.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "lab-sealed-2": {
    title: "Een ontwikkelversie op dezelfde acht wedstrijden, tweede run",
    system: "Een ontwikkelversie van de scan, niet in productie. Run 2 van 2 op 31 oktober",
    set: "De 8 wedstrijden van de verzegelde run, 105 bekende bevindingen. Niet meer geheim: de uitslagen zijn op 24 oktober gepubliceerd",
    note: "Strikt, beide rechters noemen dezelfde bevinding: 12 van 105 in de eerste 15 hypotheses per wedstrijd (120 van de 324 gemelde), 15 in de eerste 30, 16 in de hele lijst (15,2 procent). Allemaal makkelijk: 16 van de 59 makkelijke, 0 van de 14 gemiddelde, 0 van de 32 moeilijke. Dit keer is elke wedstrijd helemaal gelezen, voor 0,12 dollar voor de hele set. De voorspelling vooraf was 12 tot 25 strikt over de hele lijst, meest waarschijnlijk 15 tot 20; de regel die erbij hoorde vroeg 17 of meer over de hele lijst om duidelijk boven de eerste run te tellen, en 16 haalt dat niet. Beide runs samen vonden 21 verschillende bevindingen. Tussen de runs veranderden twee dingen, de versie en een instelling, dus de stijging is aan geen van beide toe te schrijven. De rechters zijn een ander paar dan in de oudere rijen, dus de oudere rijen zijn niet strikt vergelijkbaar. We hebben deze versie gebouwd nadat de antwoorden op deze wedstrijden openbaar waren, en run 2 nadat we run 1 erop zagen, dus de set is afgesteld. Eén run, en de betere van twee. De wedstrijden zijn sinds 24 oktober openbaar en kunnen in de trainingsdata zitten.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "lab-sealed-1": {
    title: "Een ontwikkelversie op dezelfde acht wedstrijden, eerste run",
    system: "Een ontwikkelversie van de scan, niet in productie. Run 1 van 2 op 31 oktober",
    set: "De 8 wedstrijden van de verzegelde run, 105 bekende bevindingen. Niet meer geheim: de uitslagen zijn op 24 oktober gepubliceerd",
    note: "Strikt, beide rechters noemen dezelfde bevinding: 10 van 105 in de eerste 15 hypotheses per wedstrijd (120 van de 282 gemelde), 12 in de eerste 30 en 12 in de hele lijst (11,4 procent). Allemaal makkelijk: 12 van de 59 makkelijke, 0 van de 14 gemiddelde, 0 van de 32 moeilijke. Deze run is maar deels gelezen door een instelling van ons die we voor de tweede run hebben gerepareerd, dus hij ligt waarschijnlijk lager dan een volledige lezing zou geven. De tweede run hierboven las alles. De rechters zijn een ander paar dan in de oudere rijen, dus de oudere rijen zijn niet strikt vergelijkbaar. We hebben deze versie gebouwd nadat de antwoorden op deze wedstrijden openbaar waren, dus de set is afgesteld. Eén run. De wedstrijden zijn sinds 24 oktober openbaar en kunnen in de trainingsdata zitten.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "slither-same-contests": {
    title: "Slither 0.11.6 op dezelfde wedstrijden",
    system: "Slither 0.11.6 met standaardinstellingen, een gratis hulpmiddel voor statische analyse",
    set: "Code4rena-wedstrijden waarop het in onze opzet draaide: 4 van de 9 nieuwere en 4 van de 6 oudere, 34 bekende bevindingen",
    note: "Strikte treffers: geen. Twee hypotheses bij één wedstrijd kwamen voor slechts één van de twee rechters overeen met een bekende bevinding. Statische analysetools zijn niet gemaakt voor de fouten in de bedrijfslogica die in wedstrijden worden beloond, ze draaiden in onze opzet maar op een deel van de wedstrijden, en de rechters zijn taalmodellen. Op dezelfde wedstrijden vond onze scan er 6 van de 34 in zijn eerste 15 hypotheses; de oudere wedstrijden kunnen in de trainingsdata staan van het model achter onze scan.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "aderyn-same-contests": {
    title: "Aderyn 0.6.8 op dezelfde wedstrijden",
    system: "Aderyn 0.6.8 met standaardinstellingen, een gratis hulpmiddel voor statische analyse",
    set: "Code4rena-wedstrijden waarop het in onze opzet draaide: 4 van de 9 nieuwere en 6 van de 6 oudere, 70 bekende bevindingen",
    note: "Strikte treffers: geen. Statische analysetools zijn niet gemaakt voor de fouten in de bedrijfslogica die in wedstrijden worden beloond, ze draaiden in onze opzet maar op een deel van de wedstrijden, en de rechters zijn taalmodellen. Op dezelfde wedstrijden vond onze scan er 10 van de 70 in zijn eerste 15 hypotheses; de oudere wedstrijden kunnen in de trainingsdata staan van het model achter onze scan.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "c4-fresh-nine": {
    title: "Versie 3.1 op negen nieuwere Code4rena-wedstrijden",
    system: "Versie 3.1 van de scan, zoals die in productie draait",
    set: "9 Code4rena-wedstrijden van september 2025 tot maart 2026, 66 bekende bevindingen. Niet gebruikt om de scan te bouwen",
    note: "Telt de eerste 15 hypotheses per wedstrijd, wat rapporten tot 25 oktober lieten zien; de eerste 30 bevatten er 8 van de 66. De regel voor het lezen van de uitslag is vooraf opgeschreven: 5 procent of meer houdt stand, en dit is 7,6 procent. 3 van de 35 makkelijke bevindingen, 0 van de 8 gemiddelde en 2 van de 23 moeilijke zaten in de eerste 15; 61 van de 66 bekende bevindingen niet. Kleine aantallen, één run per wedstrijd. De bekende lijsten van Code4rena zijn korter dan die van Sherlock, wedstrijden van begin 2026 kunnen in de trainingsdata van een model zitten, en de Olas-wedstrijd is voor 38 procent van de code gelezen.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "v31-same-eight": {
    title: "Versie 3.1 op dezelfde acht wedstrijden",
    system: "Versie 3.1 van de scan, live sinds de avond van 25 oktober",
    set: "De 8 wedstrijden van de verzegelde run, 105 bekende bevindingen. Niet meer geheim: de uitslagen zijn op 24 oktober gepubliceerd",
    note: "6 van de 59 makkelijke bevindingen, 1 van de 14 gemiddelde, 1 van de 32 moeilijke. Precisie 7,5 procent, ongeveer 20 tot 45 seconden en 0,02 tot 0,15 dollar per scan. Er veranderden twee dingen tegelijk, een nieuwer model en een aanpassing van welke bestanden meetellen, dus we kunnen niet zeggen welke van de twee het werk deed. Eén run, dus een herhaling kan uitkomen tussen ongeveer 6 en 10. De modellen kunnen deze wedstrijden hebben gezien. 97 van de 105 bekende bevindingen werden nog steeds niet gevonden. De regel voor het lezen van de uitslag stond vooraf in onze eigen notities, die niet openbaar zijn, dus deze rij is minder goed te controleren dan de verzegelde run. Correctie op 31 oktober 2026: deze rij zei eerst dat de versie niet op deze set was afgesteld. Versie 3.1 is gebouwd nadat de uitslagen van deze wedstrijden op 24 oktober openbaar waren, dus het label is nu deels. De tijd per scan was ongeveer 20 tot 50 seconden, niet 20 tot 45 zoals hierboven staat.",
    links: ["De resultaten, oordelen en hashes"],
  },
  "sealed-v3": {
    title: "De verzegelde run: de nieuwe versie",
    system: "Versie 3 van de scan, de bestanden vooraf vastgelegd met een hash",
    set: "Verzegelde set: 8 wedstrijden, 105 bekende bevindingen, met een hash vastgelegd voordat iemand ernaar keek",
    note: "2 van de 59 makkelijke bevindingen, 0 van de 14 gemiddelde, 2 van de 32 moeilijke. Precisie 5,0 procent, 46 tot 105 seconden en hooguit 0,064 dollar per scan. Hij vond 3 bekende bevindingen die de draaiende scan niet vond. De eerst opgeschreven regel vroeg er 5, dus die is niet gehaald en de draaiende scan bleef in productie. Op de avond van 25 oktober verving versie 3.1 hem, zie de rij hierboven. Onze eigen lezing van twee meningsverschillen tussen de rechters had er 5 van gemaakt; het getal dat we hebben vastgelegd is het getal waar beide rechters het over eens zijn.",
    links: ["De resultaten en onze lezing", "De preregistratie en de aanvulling", "De set, om zijn hash na te rekenen"],
  },
  "sealed-s0": {
    title: "De verzegelde run: de scan zoals hij draait",
    system: "Versie 2.1 van de scan, die tot de avond van 25 oktober in productie was, met het patroonblok",
    set: "Verzegelde set: 8 wedstrijden, 105 bekende bevindingen",
    note: "1 van de 59 makkelijke bevindingen, 0 van de 14 gemiddelde, 0 van de 32 moeilijke. Precisie 4,7 procent, 2,7 tot 8,6 minuten per scan. De ene bevinding die hij vond, vond de nieuwe versie ook.",
    links: ["De resultaten en onze lezing", "De preregistratie"],
  },
  "exploration-a": {
    title: "De volgende versie, eerste proef",
    system: "In ontwikkeling. Hoe het werkt blijft privé tot na de verzegelde run; de hash van de bestanden wordt vóór die run gepubliceerd",
    set: "Ontwikkelset: 6 wedstrijden, 85 bekende bevindingen",
    note: "7 van de 31 makkelijke bevindingen, 0 van de 26 gemiddelde, 0 van de 28 moeilijke. We stellen de scan op deze set af, dus dit is een verslag van hoe we hier gekomen zijn en geen bewijs.",
    links: ["Resultaten en ruwe uitvoer"],
  },
  "baseline-dev-set": {
    title: "De scan zoals hij draait, op de ontwikkelset",
    system: "Versie 2 van de scan met het patroonblok van productie",
    set: "Ontwikkelset: 6 wedstrijden, 85 bekende bevindingen",
    note: "Zonder het patroonblok vond hij 0 van de 85 met 36 hypotheses. Nog twee bekende bevindingen werden door slechts één van de twee rechters gekoppeld, en die tellen we niet mee. We stellen de scan op deze set af, dus dit is geen bewijs.",
    links: ["Resultaten en ruwe uitvoer"],
  },
  v2: {
    title: "Versie 2 van de scan",
    system: "De scan na de eerste ronde verbeteringen",
    set: "7 wedstrijden: 4 waarop hij was afgesteld (31 bekende bevindingen) en 3 nieuwe (9 bekende)",
    note: "0 van de 31 op de vier wedstrijden waarop hij was afgesteld en 0 van de 9 op de drie nieuwe. Hij las 29 procent van de code die binnen de scope viel. Achteraf bleek dat de gemeten kopie een blok historische patronen miste dat productie wel heeft, en de pagina met de resultaten zet die correctie boven de tabellen.",
    links: ["De preregistratie", "De resultaten"],
  },
  v1: {
    title: "Versie 1, zoals hij draaide",
    system: "De scan zoals hij draaide op de ochtend van 24 oktober 2026",
    set: "4 wedstrijden, 31 bekende bevindingen",
    note: "In totaal twee hypotheses, geen van beide kwam overeen met een bekende bevinding. Eén taak mislukte en twee leverden een leeg rapport op. De voorspelling die we vóór de run opschreven was hooguit 2 van de 31.",
    links: ["De preregistratie", "De resultaten"],
  },
};

/** The Dutch version of TUNED_LABEL. */
export const TUNED_LABEL_NL: Record<TunedOn, string> = {
  no: "niet op deze set afgesteld",
  yes: "op deze set afgesteld, geen bewijs",
  partly: "deels op deze set afgesteld",
  "not applicable": "beslist de vraag",
};

/** The words of a row in a language. Falls back to the English row when no Dutch text exists, so a new row never renders empty. */
export function runText(run: ScoreRun, locale: RunLocale): { title: string; system: string; set: string; note: string; links: RunLink[] } {
  const nl = locale === "nl" ? SCORE_RUNS_NL[run.id] : undefined;
  if (!nl || nl.links.length !== run.links.length) return { title: run.title, system: run.system, set: run.set, note: run.note, links: run.links };
  return {
    title: nl.title,
    system: nl.system,
    set: nl.set,
    note: nl.note,
    links: run.links.map((link, i) => ({ href: link.href, label: nl.links[i] })),
  };
}

export function tunedLabel(tunedOn: TunedOn, locale: RunLocale): string {
  return locale === "nl" ? TUNED_LABEL_NL[tunedOn] : TUNED_LABEL[tunedOn];
}
