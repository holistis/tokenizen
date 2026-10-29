#!/usr/bin/env node
// site-wacht: the watcher of tokenizen.nl from the outside. It only reads: GET requests to a fixed list of our own addresses (scripts/diensten.json),
// never a payment, never an order, never a key. It runs in GitHub Actions, so not on the machines it watches, and it fails (exit 1) when something is
// really wrong, which makes GitHub email the owner. No dependencies, so it cannot be broken by a package.
//
// Three outcomes per check: groen (measured and right), rood (measured and wrong) and onbekend (could not be measured). Onbekend is never green.
// A red is confirmed: it is measured again after a minute and again after another minute, and only a check that is red in all three rounds counts.
// A canary proves the checker can see: it looks for a marker that cannot exist, and the checker must report that as red, or the watcher itself is blind.
//
//   node scripts/site-wacht.mjs                 one run (three rounds when something is red)
//   node scripts/site-wacht.mjs --json uit.json also write the public-safe summary (four words, no addresses)
//
// Exit: 0 nothing is red, 1 something is red in all three rounds or the watcher is blind, 2 the list of services could not be read.

import { readFileSync, writeFileSync } from "node:fs";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

export const GROEN = "groen";
export const ROOD = "rood";
export const ONBEKEND = "onbekend";

const uitslag = (id, groep, stand, reden = "") => ({ id, groep, stand, reden });

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading: one GET at a time, only https, only our own hosts and the two services we look at (Stripe pages, the npm registry).

const TOEGESTAAN = new Set(["tokenizen.nl", "api.tokenizen.nl", "x402.tokenizen.nl", "buy.stripe.com", "registry.npmjs.org", "api.github.com"]);

export async function haal(url, { fetcher = fetch, ms = 20000, token = "" } = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !TOEGESTAAN.has(u.hostname)) return { fout: "adres niet toegestaan" };
  try {
    const res = await fetcher(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(ms), headers: { "user-agent": "tokenizen-site-wacht (read only)", ...(token && u.hostname === "api.github.com" ? { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } : {}) } });
    const tekst = await res.text();
    return { status: res.status, location: res.headers.get("location") ?? "", paymentRequired: res.headers.get("payment-required") ?? "", tekst };
  } catch (e) {
    return { fout: e instanceof Error ? e.message : String(e) };
  }
}

export function tlsDagen(host, nu = Date.now()) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - nu) / 86400000) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Judging: plain functions of an answer, so a test can feed them a good answer and a broken one.

export function oordeelStartpagina(ant) {
  if (ant.fout) return uitslag("website-start", "website", ONBEKEND, "niet bereikbaar om te meten");
  if (ant.status !== 200) return uitslag("website-start", "website", ROOD, `status ${ant.status}`);
  if (!ant.tekst.includes('<html lang="en"') || !ant.tekst.includes("<title>tokenizen | We find the leaks.")) return uitslag("website-start", "website", ROOD, "de startpagina mist zijn vaste kop");
  return uitslag("website-start", "website", GROEN);
}

export function bundelAdres(html, wortel = "https://tokenizen.nl") {
  const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? wortel + m[0] : null;
}

/** The pages of this site live in one script. If it holds the words we expect and none of the words we removed, the right version is live. */
export function oordeelInhoud(bundel, inhoud, extraMoet = []) {
  const resultaten = [];
  for (const woord of [...inhoud.moetErInStaan, ...extraMoet]) {
    if (!bundel.includes(woord)) resultaten.push(uitslag("inhoud-mist", "website", ROOD, `een vaste zin of prijs staat niet meer op de site: ${woord.slice(0, 40)}`));
  }
  for (const woord of inhoud.magErNietInStaan) {
    if (bundel.includes(woord)) resultaten.push(uitslag("inhoud-terug", "website", ROOD, `iets wat we weghaalden staat weer op de site: ${woord.slice(0, 40)}`));
  }
  return resultaten.length ? resultaten : [uitslag("inhoud", "website", GROEN)];
}

/** The canary: asked for a marker that cannot exist, the checker has to say red. If it says green, it is blind. */
export function oordeelKanarie(bundel, kanarie) {
  const proef = oordeelInhoud(bundel, { moetErInStaan: [kanarie], magErNietInStaan: [] });
  return proef.some((r) => r.stand === ROOD)
    ? uitslag("kanarie", "bewaker", GROEN)
    : uitslag("kanarie", "bewaker", ROOD, "de bewaker is blind: een onmogelijke zin kwam als aanwezig uit de meting");
}

export function oordeelOmleiding(ant, naar) {
  if (ant.fout) return uitslag("omleiding-en", "website", ONBEKEND, "niet bereikbaar om te meten");
  const goed = ant.status === 301 && (ant.location === naar || ant.location.endsWith(new URL(naar).pathname));
  return goed ? uitslag("omleiding-en", "website", GROEN) : uitslag("omleiding-en", "website", ROOD, `het oude /en-adres stuurt niet meer door (status ${ant.status})`);
}

export function oordeelSitemap(ant) {
  if (ant.fout) return uitslag("sitemap", "website", ONBEKEND, "niet bereikbaar om te meten");
  if (ant.status !== 200 || !ant.tekst.startsWith("<?xml")) return uitslag("sitemap", "website", ROOD, "de sitemap is weg of is geen xml");
  for (const loc of ["https://tokenizen.nl/checks", "https://tokenizen.nl/nl/checks"]) {
    if (!ant.tekst.includes(`<loc>${loc}</loc>`)) return uitslag("sitemap", "website", ROOD, "de sitemap mist een pagina");
  }
  return uitslag("sitemap", "website", GROEN);
}

export function oordeelLlms(ant) {
  if (ant.fout) return uitslag("llms", "website", ONBEKEND, "niet bereikbaar om te meten");
  if (ant.status !== 200 || ant.tekst.trimStart().startsWith("<") || !ant.tekst.includes("tokenizen")) return uitslag("llms", "website", ROOD, "llms.txt is weg of is een webpagina");
  return uitslag("llms", "website", GROEN);
}

export function oordeelApi(ant) {
  if (ant.fout) return uitslag("api-gezondheid", "checks", ONBEKEND, "niet bereikbaar om te meten");
  let ok = false;
  try {
    ok = JSON.parse(ant.tekst).ok === true;
  } catch {
    ok = false;
  }
  return ant.status === 200 && ok ? uitslag("api-gezondheid", "checks", GROEN) : uitslag("api-gezondheid", "checks", ROOD, `de gezondheidsroute antwoordt niet goed (status ${ant.status})`);
}

/** The paid route has to ask exactly what the official sources say: the price, the network and the address the money goes to. A different address is a red at once. */
export function oordeelBetaalroute(ant, x402) {
  if (ant.fout) return uitslag("scan-betaalverzoek", "scan", ONBEKEND, "niet bereikbaar om te meten");
  if (ant.status !== 402) return uitslag("scan-betaalverzoek", "scan", ROOD, `de betaalde route vraagt niet om betaling (status ${ant.status})`);
  let eerste;
  try {
    eerste = JSON.parse(ant.tekst).accepts?.[0];
  } catch {
    eerste = undefined;
  }
  if (!eerste) return uitslag("scan-betaalverzoek", "scan", ROOD, "het betaalverzoek is niet te lezen");
  if (String(eerste.payTo ?? "").toLowerCase() !== x402.betaaladres.toLowerCase()) return uitslag("scan-betaalverzoek", "scan", ROOD, "het betaaladres wijkt af van de officiële bron");
  if (eerste.network !== x402.netwerk) return uitslag("scan-betaalverzoek", "scan", ROOD, "het netwerk wijkt af van de officiële bron");
  if (String(eerste.amount) !== x402.bedrag) return uitslag("scan-betaalverzoek", "scan", ROOD, "de prijs wijkt af van de officiële bron");
  if (!ant.paymentRequired) return uitslag("scan-betaalverzoek", "scan", ROOD, "de betaalkop ontbreekt");
  return uitslag("scan-betaalverzoek", "scan", GROEN);
}

/** Did the last deploy of the website work? Cloudflare reports it as a check on the newest commit of main. A failed deploy leaves the old site up, so
 *  the site itself looks fine while nothing new can go live: only this check sees it. A deploy that is still running is onbekend, never red. */
export function oordeelUitrol(ant, naam) {
  if (ant.fout) return uitslag("website-uitrol", "website", ONBEKEND, "de uitrol van de site was niet na te kijken");
  let runs = [];
  try {
    runs = JSON.parse(ant.tekst).check_runs ?? [];
  } catch {
    runs = [];
  }
  const nieuwste = runs
    .filter((r) => r && r.name === naam)
    .sort((a, b) => Date.parse(b.started_at ?? "") - Date.parse(a.started_at ?? ""))[0];
  if (ant.status !== 200 || !nieuwste) return uitslag("website-uitrol", "website", ONBEKEND, "geen uitslag van de uitrol te vinden");
  if (nieuwste.status !== "completed") return uitslag("website-uitrol", "website", ONBEKEND, "de uitrol loopt nog");
  if (nieuwste.conclusion === "success") return uitslag("website-uitrol", "website", GROEN);
  if (nieuwste.conclusion === "cancelled" || nieuwste.conclusion === "skipped" || nieuwste.conclusion === "neutral") return uitslag("website-uitrol", "website", ONBEKEND, `de uitrol is ${nieuwste.conclusion}`);
  return uitslag("website-uitrol", "website", ROOD, "de laatste uitrol van de website is mislukt: wat nieuw is staat niet online");
}

export function oordeelTls(host, dagen, minimaal) {
  if (dagen === null) return uitslag(`tls-${host}`, "website", ONBEKEND, "certificaat niet te lezen");
  return dagen >= minimaal ? uitslag(`tls-${host}`, "website", GROEN) : uitslag(`tls-${host}`, "website", ROOD, `het certificaat verloopt over ${dagen} dagen`);
}

export function oordeelNpm(naam, ant) {
  if (ant.fout) return uitslag(`npm-${naam}`, "gereedschap", ONBEKEND, "niet bereikbaar om te meten");
  let versie = "";
  try {
    versie = String(JSON.parse(ant.tekst).version ?? "");
  } catch {
    versie = "";
  }
  return ant.status === 200 && versie ? uitslag(`npm-${naam}`, "gereedschap", GROEN) : uitslag(`npm-${naam}`, "gereedschap", ROOD, `het pakket staat niet meer op npm (status ${ant.status})`);
}

/** From outside, a payment page of Stripe cannot show whether the link is switched on: it answers 200 for any address and fills in the rest with script.
 *  So that part stays onbekend on purpose. What can be measured is that our site still points at the four links. */
export function oordeelBetaallinks(bundel, links) {
  const weg = links.filter((l) => !bundel.includes(l));
  const op = weg.length ? uitslag("kassa-links-op-site", "kassa", ROOD, "de site wijst niet meer naar alle vier de betaallinks") : uitslag("kassa-links-op-site", "kassa", GROEN);
  return [op, uitslag("kassa-link-actief", "kassa", ONBEKEND, "van buitenaf niet te zien of een betaallink aanstaat; het alarm is de betaalmelding van Stripe")];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// One round and the whole run.

export async function eenRonde(config, { haal: lees = (u) => haal(u, { token: process.env.GITHUB_TOKEN ?? "" }), tlsDagen: tlsLees = tlsDagen, oefenalarm = false } = {}) {
  const r = [];
  // A drill: a red that is put there on purpose, to see that a failed run really reaches the owner. Only a person starts it, by hand.
  if (oefenalarm) r.push(uitslag("oefenalarm", "bewaker", ROOD, "dit is een proef: een bewust rood alarm om te zien dat de mail de eigenaar bereikt"));
  const start = await lees("https://tokenizen.nl/");
  r.push(oordeelStartpagina(start));

  let bundel = null;
  const adres = start.tekst ? bundelAdres(start.tekst) : null;
  if (adres) {
    const b = await lees(adres);
    if (b.status === 200) bundel = b.tekst;
  }
  if (bundel === null) {
    r.push(uitslag("inhoud", "website", ONBEKEND, "de pagina's van de site waren niet te lezen"));
    r.push(uitslag("kanarie", "bewaker", ONBEKEND, "geen bundel om de kanarie op te proberen"));
  } else {
    r.push(...oordeelInhoud(bundel, config.inhoud));
    r.push(oordeelKanarie(bundel, config.kanarie));
    r.push(...oordeelBetaallinks(bundel, config.betaallinks));
  }

  r.push(oordeelOmleiding(await lees("https://tokenizen.nl/en/checks"), "https://tokenizen.nl/checks"));
  r.push(oordeelSitemap(await lees("https://tokenizen.nl/sitemap.xml")));
  r.push(oordeelLlms(await lees("https://tokenizen.nl/llms.txt")));
  r.push(oordeelApi(await lees(config.api.gezondheid)));
  r.push(oordeelBetaalroute(await lees(config.x402.url), config.x402));
  if (config.uitrol) r.push(oordeelUitrol(await lees(config.uitrol.adres), config.uitrol.controle));
  for (const host of config.sites.map((s) => new URL(s).hostname)) r.push(oordeelTls(host, await tlsLees(host), config.tlsMinimaleDagen));
  for (const naam of config.npm) r.push(oordeelNpm(naam, await lees(npmAdres(naam))));
  return r;
}

/** The registry address of a package. A scoped name keeps its @ and writes the slash as %2F; the names come from our own list. */
export const npmAdres = (naam) => `https://registry.npmjs.org/${naam.replace(/\//g, "%2F")}/latest`;

const wachtMs = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

/** A red only counts when it is red in all three rounds, a minute apart. Everything else is shown as it was in the last round. */
export async function draai(config, deps = {}) {
  const pauze = deps.pauzeMs ?? 60000;
  const wacht = deps.wacht ?? wachtMs;
  let ronde = await eenRonde(config, deps);
  let rood = new Set(ronde.filter((x) => x.stand === ROOD).map((x) => `${x.id}|${x.reden}`));
  for (let i = 0; i < 2 && rood.size > 0; i++) {
    await wacht(pauze);
    ronde = await eenRonde(config, deps);
    const nu = new Set(ronde.filter((x) => x.stand === ROOD).map((x) => `${x.id}|${x.reden}`));
    rood = new Set([...rood].filter((sleutel) => nu.has(sleutel)));
  }
  const bevestigd = ronde.filter((x) => x.stand === ROOD && rood.has(`${x.id}|${x.reden}`));
  const rest = ronde.filter((x) => x.stand !== ROOD || !rood.has(`${x.id}|${x.reden}`)).map((x) => (x.stand === ROOD ? { ...x, stand: ONBEKEND, reden: `één keer rood, niet bevestigd: ${x.reden}` } : x));
  return { uitslagen: [...bevestigd, ...rest], bevestigdRood: bevestigd };
}

/** The only thing that may leave this script for a public page: a time and one word per group. No address, no name, no reason. */
export function openbaarOverzicht(uitslagen, tijd = new Date()) {
  const volgorde = [GROEN, ONBEKEND, ROOD];
  const groepen = {};
  for (const x of uitslagen) {
    const nu = groepen[x.groep];
    if (!nu || volgorde.indexOf(x.stand) > volgorde.indexOf(nu)) groepen[x.groep] = x.stand;
  }
  const alles = Object.values(groepen);
  const stand = alles.includes(ROOD) ? ROOD : alles.includes(ONBEKEND) ? ONBEKEND : GROEN;
  return { gemeten_op: tijd.toISOString(), stand, groepen };
}

// ---------------------------------------------------------------------------------------------------------------------------------

async function main() {
  const pad = fileURLToPath(new URL("./diensten.json", import.meta.url));
  let config;
  try {
    config = JSON.parse(readFileSync(pad, "utf8"));
  } catch {
    console.error("STOP: scripts/diensten.json is niet te lezen, dus de bewaker kan niets bekijken.");
    process.exit(2);
  }
  const { uitslagen, bevestigdRood } = await draai(config, { oefenalarm: process.env.SITE_WACHT_OEFENALARM === "1" });
  for (const x of uitslagen) console.log(`${x.stand.toUpperCase().padEnd(9)} ${x.id}${x.reden ? `: ${x.reden}` : ""}`);
  const uit = process.argv.indexOf("--json");
  if (uit > -1 && process.argv[uit + 1]) writeFileSync(process.argv[uit + 1], JSON.stringify(openbaarOverzicht(uitslagen), null, 2) + "\n");
  if (bevestigdRood.length) {
    console.error(`\n${bevestigdRood.length} controle(s) rood in drie rondes achter elkaar.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
