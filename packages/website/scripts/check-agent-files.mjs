// check-agent-files.mjs — draait na elke build, faalt luid als een bestand
// dat AI-agents opvragen stilzwijgend uit de build is gevallen.
//
// Waarom dit bestaat: de site wordt geserveerd met
// not_found_handling: "single-page-application". Een pad dat niet bestaat
// geeft dus GEEN 404 maar HTTP 200 met index.html. Toen llms.txt nog
// ontbrak, kreeg elke AI-agent die het opvroeg een brok HTML terug met
// status 200, zonder enig signaal dat er iets mis was. Dat faalpad is stil,
// dus het moet hier hard afgevangen worden en niet pas in productie.
//
// Gevonden op 2026-09-01 door de robots.txt/llms.txt op het echte
// apex-domein te curlen in plaats van alleen lokaal te kijken.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** Elk bestand met de eis waaraan de inhoud moet voldoen. */
const REQUIRED = [
  { file: "llms.txt", mustStartWith: "# ", omschrijving: "llms.txt voor AI-agents" },
  { file: "robots.txt", mustStartWith: "User-agent:", omschrijving: "robots.txt" },
  { file: "sitemap.xml", mustStartWith: "<?xml", omschrijving: "sitemap" },
];

const fouten = [];

for (const { file, mustStartWith, omschrijving } of REQUIRED) {
  const pad = join(dist, file);
  if (!existsSync(pad)) {
    fouten.push(`${file} ontbreekt in dist/ (${omschrijving}). Zonder dit bestand geeft de SPA-fallback HTML met status 200 terug in plaats van een 404, en merkt niemand het.`);
    continue;
  }
  const inhoud = readFileSync(pad, "utf8");
  if (!inhoud.trim()) {
    fouten.push(`${file} is leeg (${omschrijving}).`);
    continue;
  }
  if (!inhoud.startsWith(mustStartWith)) {
    fouten.push(`${file} begint niet met ${JSON.stringify(mustStartWith)} maar met ${JSON.stringify(inhoud.slice(0, 30))}. Waarschijnlijk is het per ongeluk HTML geworden.`);
  }
  if (inhoud.trimStart().startsWith("<!doctype") || inhoud.trimStart().startsWith("<html")) {
    fouten.push(`${file} bevat HTML in plaats van de verwachte inhoud (${omschrijving}).`);
  }
}

if (fouten.length) {
  console.error("\nBuild afgekeurd, agent-bestanden kloppen niet:\n");
  for (const f of fouten) console.error("  - " + f);
  console.error("");
  process.exit(1);
}

console.log(`agent-bestanden ok (${REQUIRED.map((r) => r.file).join(", ")})`);
