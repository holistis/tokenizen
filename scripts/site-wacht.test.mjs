import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GROEN,
  ONBEKEND,
  ROOD,
  bundelAdres,
  draai,
  eenRonde,
  haal,
  npmAdres,
  openbaarOverzicht,
  oordeelApi,
  oordeelBetaallinks,
  oordeelBetaalroute,
  oordeelInhoud,
  oordeelKanarie,
  oordeelNpm,
  oordeelOmleiding,
  oordeelSitemap,
  oordeelStartpagina,
  oordeelTls,
} from "./site-wacht.mjs";

const config = JSON.parse(readFileSync(new URL("./diensten.json", import.meta.url), "utf8"));
const WORTEL = fileURLToPath(new URL("..", import.meta.url));

// A small world of answers. Every test starts from the good one and breaks one thing.
function wereld(wijziging = {}) {
  const bundel = [...config.inhoud.moetErInStaan, ...config.betaallinks].join(" ... ");
  const goed = {
    "https://tokenizen.nl/": { status: 200, location: "", paymentRequired: "", tekst: '<!doctype html><html lang="en"><head><title>tokenizen | We find the leaks. We publish the numbers.</title><script type="module" src="/assets/index-AbC123.js"></script></head></html>' },
    "https://tokenizen.nl/assets/index-AbC123.js": { status: 200, location: "", paymentRequired: "", tekst: bundel },
    "https://tokenizen.nl/en/checks": { status: 301, location: "https://tokenizen.nl/checks", paymentRequired: "", tekst: "" },
    "https://tokenizen.nl/sitemap.xml": { status: 200, location: "", paymentRequired: "", tekst: '<?xml version="1.0"?><urlset><url><loc>https://tokenizen.nl/checks</loc></url><url><loc>https://tokenizen.nl/nl/checks</loc></url></urlset>' },
    "https://tokenizen.nl/llms.txt": { status: 200, location: "", paymentRequired: "", tekst: "# tokenizen\n" },
    [config.api.gezondheid]: { status: 200, location: "", paymentRequired: "", tekst: '{"ok":true}' },
    [config.x402.url]: {
      status: 402,
      location: "",
      paymentRequired: "eyJ4NDAyVmVyc2lvbiI6Mn0=",
      tekst: JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", network: config.x402.netwerk, amount: config.x402.bedrag, payTo: config.x402.betaaladres }] }),
    },
  };
  for (const naam of config.npm) goed[npmAdres(naam)] = { status: 200, location: "", paymentRequired: "", tekst: '{"version":"1.2.3"}' };
  const wereldMap = { ...goed, ...wijziging };
  return {
    haal: async (url) => wereldMap[url] ?? { fout: "onbekend adres in de proefwereld" },
    tlsDagen: async () => wereldMap.tlsDagen ?? 60,
  };
}

const rood = (uitslagen) => uitslagen.filter((x) => x.stand === ROOD);

test("in the good world nothing is red and the canary is green", async () => {
  const r = await eenRonde(config, wereld());
  assert.deepEqual(rood(r), []);
  assert.equal(r.find((x) => x.id === "kanarie").stand, GROEN);
  assert.equal(r.find((x) => x.id === "kassa-link-actief").stand, ONBEKEND, "a payment link switched on cannot be seen from outside, so it is never green");
});

// Green, red, green: every check must turn red when its thing is broken, otherwise it measures nothing.
const DEFECTEN = [
  ["de startpagina mist zijn kop", { "https://tokenizen.nl/": { status: 200, location: "", paymentRequired: "", tekst: '<html lang="nl"><title>iets anders</title><script src="/assets/index-AbC123.js"></script>' } }, "website-start"],
  ["de startpagina geeft 500", { "https://tokenizen.nl/": { status: 500, location: "", paymentRequired: "", tekst: "kapot" } }, "website-start"],
  ["een vaste prijs staat niet meer op de site", { "https://tokenizen.nl/assets/index-AbC123.js": { status: 200, location: "", paymentRequired: "", tekst: "niets" } }, "inhoud-mist"],
  ["het adres dat we weghaalden staat er weer", { "https://tokenizen.nl/assets/index-AbC123.js": { status: 200, location: "", paymentRequired: "", tekst: [...config.inhoud.moetErInStaan, ...config.betaallinks, "Lochemstraat 49"].join(" ") } }, "inhoud-terug"],
  ["de site wijst niet meer naar de betaallinks", { "https://tokenizen.nl/assets/index-AbC123.js": { status: 200, location: "", paymentRequired: "", tekst: config.inhoud.moetErInStaan.join(" ") } }, "kassa-links-op-site"],
  ["het oude /en-adres stuurt niet meer door", { "https://tokenizen.nl/en/checks": { status: 200, location: "", paymentRequired: "", tekst: "<html>" } }, "omleiding-en"],
  ["de sitemap is een webpagina", { "https://tokenizen.nl/sitemap.xml": { status: 200, location: "", paymentRequired: "", tekst: "<html>geen xml" } }, "sitemap"],
  ["de sitemap mist de Nederlandse checks", { "https://tokenizen.nl/sitemap.xml": { status: 200, location: "", paymentRequired: "", tekst: '<?xml version="1.0"?><urlset><url><loc>https://tokenizen.nl/checks</loc></url></urlset>' } }, "sitemap"],
  ["llms.txt is een webpagina", { "https://tokenizen.nl/llms.txt": { status: 200, location: "", paymentRequired: "", tekst: "<!doctype html>" } }, "llms"],
  ["de gezondheidsroute zegt niet ok", { [config.api.gezondheid]: { status: 200, location: "", paymentRequired: "", tekst: '{"ok":false}' } }, "api-gezondheid"],
  ["de betaalde route geeft geen 402", { [config.x402.url]: { status: 200, location: "", paymentRequired: "", tekst: "{}" } }, "scan-betaalverzoek"],
  ["het betaaladres is veranderd", { [config.x402.url]: { status: 402, location: "", paymentRequired: "x", tekst: JSON.stringify({ accepts: [{ network: config.x402.netwerk, amount: config.x402.bedrag, payTo: "0x0000000000000000000000000000000000000001" }] }) } }, "scan-betaalverzoek"],
  ["de prijs is veranderd", { [config.x402.url]: { status: 402, location: "", paymentRequired: "x", tekst: JSON.stringify({ accepts: [{ network: config.x402.netwerk, amount: "1", payTo: config.x402.betaaladres }] }) } }, "scan-betaalverzoek"],
  ["het certificaat verloopt over 3 dagen", { tlsDagen: 3 }, "tls-tokenizen.nl"],
  ["een pakket staat niet meer op npm", { "https://registry.npmjs.org/capacity-attest/latest": { status: 404, location: "", paymentRequired: "", tekst: "not found" } }, "npm-capacity-attest"],
];

for (const [naam, wijziging, id] of DEFECTEN) {
  test(`groen, rood, groen: ${naam}`, async () => {
    const stuk = await eenRonde(config, wereld(wijziging));
    const gevonden = stuk.filter((x) => x.id === id || x.id.startsWith(id));
    assert.ok(gevonden.some((x) => x.stand === ROOD), `${id} werd niet rood: ${JSON.stringify(gevonden)}`);
    const heel = await eenRonde(config, wereld());
    assert.deepEqual(rood(heel), []);
  });
}

test("a failed read is onbekend, never green and never red", async () => {
  const r = await eenRonde(config, wereld({ [config.api.gezondheid]: { fout: "timeout" } }));
  assert.equal(r.find((x) => x.id === "api-gezondheid").stand, ONBEKEND);
});

test("the canary turns red when the checker cannot see (a marker that cannot exist comes out as present)", () => {
  assert.equal(oordeelKanarie("gewone tekst", config.kanarie).stand, GROEN);
  assert.equal(oordeelKanarie(`gewone tekst ${config.kanarie}`, config.kanarie).stand, ROOD);
});

test("a red counts only when it is red in all three rounds, a minute apart", async () => {
  let ronde = 0;
  const pauzes = [];
  const vast = { "https://tokenizen.nl/sitemap.xml": { status: 200, location: "", paymentRequired: "", tekst: "<html>" } };
  const alleDrie = await draai(config, { ...wereld(vast), pauzeMs: 1, wacht: async (ms) => pauzes.push(ms) });
  assert.equal(alleDrie.bevestigdRood.length, 1);
  assert.equal(pauzes.length, 2, "two waits: three rounds");

  const flappend = wereld();
  const goed = flappend.haal;
  const kapot = wereld(vast).haal;
  const wisselend = { ...flappend, haal: async (url) => (ronde === 0 ? kapot(url) : goed(url)) };
  const eenKeer = await draai(config, { ...wisselend, pauzeMs: 1, wacht: async () => { ronde++; } });
  assert.equal(eenKeer.bevestigdRood.length, 0, "red once is not enough");
  assert.ok(!rood(eenKeer.uitslagen).length, "an unconfirmed red is shown as onbekend, not as red");
});

test("the watcher reads only https and only the hosts it was given", async () => {
  assert.deepEqual(await haal("http://tokenizen.nl/"), { fout: "adres niet toegestaan" });
  assert.deepEqual(await haal("https://example.org/"), { fout: "adres niet toegestaan" });
  assert.deepEqual(await haal("https://169.254.169.254/latest/meta-data"), { fout: "adres niet toegestaan" });
  let aangeroepen = 0;
  await haal("https://tokenizen.nl/", { fetcher: async (url, opties) => { aangeroepen++; assert.equal(opties.method, "GET"); assert.equal(opties.redirect, "manual"); return { status: 200, headers: new Headers(), text: async () => "" }; } });
  assert.equal(aangeroepen, 1);
});

test("the public summary is one time, one word per group, and no address, name, reason or key", () => {
  const uitslagen = [
    { id: "a", groep: "website", stand: GROEN, reden: "" },
    { id: "b", groep: "scan", stand: ROOD, reden: "het betaaladres wijkt af van de officiële bron" },
    { id: "c", groep: "kassa", stand: ONBEKEND, reden: "niet te zien bij https://buy.stripe.com/abc" },
  ];
  const uit = openbaarOverzicht(uitslagen, new Date("2026-10-29T08:00:00Z"));
  assert.equal(uit.stand, ROOD);
  assert.deepEqual(uit.groepen, { website: GROEN, scan: ROOD, kassa: ONBEKEND });
  const tekst = JSON.stringify(uit);
  assert.doesNotMatch(tekst, /https?:|0x[0-9a-fA-F]|@|\d+\.\d+\.\d+\.\d+|stripe|betaaladres|wazir|elite|denktank|sandbox/i);
  assert.deepEqual(Object.keys(uit).sort(), ["gemeten_op", "groepen", "stand"]);
});

test("the list of services points only at our own hosts and the services we look at", () => {
  for (const url of [...config.sites, config.api.gezondheid, config.x402.url, ...config.betaallinks]) assert.equal(new URL(url).protocol, "https:");
  assert.equal(config.betaallinks.length, 4);
  assert.ok(config.betaallinks.every((l) => l.startsWith("https://buy.stripe.com/")));
});

// The list must not drift from the site it watches: the address and the price come from the official sources note, the four links from the
// source of the Signal log page, and every sentence it expects must exist in the source of the website.
function bronnen(map, uit = []) {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (naam === "node_modules" || naam === "dist") continue;
    if (statSync(pad).isDirectory()) bronnen(pad, uit);
    else if (/\.(ts|tsx|txt)$/.test(naam) && !/\.test\./.test(naam)) uit.push(pad);
  }
  return uit;
}

test("the list of services agrees with the sources of the website", () => {
  const bronTekst = bronnen(join(WORTEL, "packages/website/src")).map((p) => readFileSync(p, "utf8")).join("\n");
  const links = readFileSync(join(WORTEL, "packages/website/src/data/signal-log-links.ts"), "utf8");
  for (const link of config.betaallinks) assert.ok(links.includes(link), `betaallink niet in signal-log-links.ts: ${link}`);
  assert.ok(bronTekst.includes(config.x402.betaaladres), "het betaaladres staat niet in de officiële bronnen op de site");
  assert.ok(bronTekst.includes(new URL(config.x402.url).pathname) || bronTekst.includes(config.x402.url));
  for (const zin of config.inhoud.moetErInStaan) assert.ok(bronTekst.includes(zin), `verwachte zin staat niet in de bron van de site: ${zin}`);
  for (const zin of config.inhoud.magErNietInStaan) assert.ok(!bronTekst.includes(zin), `weggehaalde zin staat nog in de bron van de site: ${zin}`);
});

test("small helpers", () => {
  assert.equal(bundelAdres('<script src="/assets/index-AbC_12-x.js"></script>'), "https://tokenizen.nl/assets/index-AbC_12-x.js");
  assert.equal(bundelAdres("<html></html>"), null);
  assert.equal(oordeelTls("x", 14, 14).stand, GROEN);
  assert.equal(oordeelTls("x", 13, 14).stand, ROOD);
  assert.equal(oordeelTls("x", null, 14).stand, ONBEKEND);
  assert.equal(oordeelNpm("x", { status: 200, tekst: '{"version":"1.0.0"}' }).stand, GROEN);
  assert.equal(oordeelApi({ status: 200, tekst: "geen json" }).stand, ROOD);
  assert.equal(oordeelOmleiding({ status: 302, location: "https://tokenizen.nl/checks", tekst: "" }, "https://tokenizen.nl/checks").stand, ROOD);
  assert.equal(oordeelStartpagina({ fout: "x" }).stand, ONBEKEND);
  assert.equal(oordeelSitemap({ status: 404, tekst: "" }).stand, ROOD);
  assert.equal(oordeelInhoud("x", { moetErInStaan: [], magErNietInStaan: [] })[0].stand, GROEN);
  assert.equal(oordeelBetaalroute({ status: 402, tekst: "kapot json", paymentRequired: "x" }, config.x402).stand, ROOD);
  assert.equal(oordeelBetaallinks(config.betaallinks.join(" "), config.betaallinks)[0].stand, GROEN);
});
