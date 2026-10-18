// x402-bazaar.test.ts — is onze catalogus-verklaring waar, en keurt HUN eigen
// validator hem goed?
//
// WAAROM DIT BESTAAT, en het is niet om een regel code te bevestigen. Een
// verklaring in een 402-antwoord is een belofte aan een MACHINE: een agent leest
// hem, kopieert het voorbeeld, en roept ons aan. Een verklaring die niet
// overeenkomt met wat de route echt accepteert, is dus geen slordigheid maar een
// onwaarheid die automatisch wordt opgevolgd.
//
// WAT DEZE TEST AL HEEFT GEVANGEN, voor er iets live stond. De verklaring uit
// `declareDiscoveryExtension` draagt met opzet GEEN http-methode, terwijl het
// bijgeleverde schema die wel verplicht stelt. Hun validator keurde onze
// verklaring daarom af met "/input: must have required property 'method'". De
// ontbrekende helft is `bazaarResourceServerExtension`, die de methode uit het
// echte verzoek invult, en die moet apart geregistreerd worden. Zonder die
// registratie ziet het 402-antwoord er voor ons compleet uit en wordt het door
// elke index afgekeurd, zonder foutmelding ergens. Dat is precies de stille
// storing waar deze suite voor bestaat.
//
// DRIE SOORTEN CONTROLE.
// 1. HUN rechter, niet de onze: de validators komen uit @x402/extensions zelf, en
//    de spec zegt dat een facilitator `info` tegen `schema` MOET valideren voor
//    hij catalogiseert.
// 2. Waarheid tegenover de echte route: de verklaarde methodelijst moet exact de
//    lijst zijn die de code accepteert, zodat een derde methode morgen rood wordt
//    in plaats van stil verkeerd geadverteerd.
// 3. Standaard uit: zolang de vlag uit staat mogen de bytes van het live
//    402-antwoord niet veranderen. Dat maakt een deploy ongevaarlijk.

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import {
  bazaarResourceServerExtension,
  validateDiscoveryExtension,
  validateDiscoveryExtensionSpec,
} from "@x402/extensions/bazaar";
import { OWNERSHIP_METHODS } from "endpoint-attest";
import { declareBazaarDiscovery, buildPaidRoutes, readSellerConfig, FACILITATOR_URL } from "./x402-seller.js";

/** Een geldige, maar volstrekt wegwerpbare sleutel en een ander payTo-adres. */
const TEST_ENV = {
  X402_RECEIPT_SIGNING_KEY: "0x" + "11".repeat(32),
  X402_PAY_TO: "0x2888F36548a900B9b08d584524e1f73BC563eC26",
};

function configMet(extra: Record<string, string> = {}) {
  const config = readSellerConfig({ ...TEST_ENV, ...extra });
  if (!config) throw new Error("de testomgeving hoort een verkoper op te leveren");
  return config;
}

function ruweVerklaring(): any {
  return declareBazaarDiscovery().bazaar as any;
}

/**
 * Een minimale namaak-context die hun eigen `isHTTPRequestContext` accepteert:
 * die eist alleen dat `method` en `adapter` aanwezig zijn.
 */
function httpContext(method = "POST") {
  return {
    method,
    adapter: { getUrl: () => "https://api.tokenizen.nl/api/paid/verify-ownership" },
  };
}

function verrijkteVerklaring(method = "POST"): any {
  const enrich = (bazaarResourceServerExtension as any).enrichDeclaration;
  return enrich(ruweVerklaring(), httpContext(method));
}

describe("de catalogus-verklaring, getoetst door hun eigen validator", () => {
  it("levert precies een bazaar-sleutel op", () => {
    expect(Object.keys(declareBazaarDiscovery())).toEqual(["bazaar"]);
  });

  it("de ruwe verklaring is spec-geldig", () => {
    const uitslag = validateDiscoveryExtensionSpec(ruweVerklaring());
    expect(uitslag.errors ?? []).toEqual([]);
    expect(uitslag.valid).toBe(true);
  });

  it("de ruwe verklaring draagt met opzet nog geen http-methode", () => {
    // Dit is geen gebrek maar het contract: de methode hoort bij het verzoek, niet
    // bij de verklaring. Deze test legt dat vast, zodat niemand het later
    // "repareert" door er met de hand een methode in te zetten.
    expect(ruweVerklaring().info.input.method).toBeUndefined();
    expect(validateDiscoveryExtension(ruweVerklaring() as never).valid).toBe(false);
  });

  it("na verrijking door hun eigen resource-server-extensie is hij volledig geldig", () => {
    const verrijkt = verrijkteVerklaring("POST");
    const uitslag = validateDiscoveryExtension(verrijkt as never);
    // Foutenlijst mee in de melding, anders staat hier straks alleen
    // "expected true to be false" en moet iemand opnieuw gaan zoeken.
    expect(uitslag.errors ?? []).toEqual([]);
    expect(uitslag.valid).toBe(true);
    expect(verrijkt.info.input.method).toBe("POST");
  });

  it("verklaart een json-body, want de route leest json", () => {
    const info = ruweVerklaring().info;
    expect(info.input.type).toBe("http");
    expect(info.input.bodyType).toBe("json");
  });
});

describe("waarheid tegenover de echte route", () => {
  function bodySchema(): any {
    return ruweVerklaring().schema?.properties?.input?.properties?.body;
  }

  it("de verklaarde methodelijst is exact de lijst die de code accepteert", () => {
    const verklaard = bodySchema()?.properties?.method?.enum;
    expect(verklaard, "de bouwer heeft de body-velden ergens anders gezet").toBeDefined();
    // Dit wordt rood zodra iemand een derde methode aan OWNERSHIP_METHODS
    // toevoegt zonder de etalage bij te werken.
    expect([...verklaard].sort()).toEqual([...OWNERSHIP_METHODS].sort());
  });

  it("het meegegeven voorbeeld voldoet aan ons eigen verklaarde invoerschema", () => {
    const schema = bodySchema();
    const voorbeeld = ruweVerklaring().info?.input?.body;
    expect(schema, "geen body-schema gevonden").toBeDefined();
    expect(voorbeeld, "geen body-voorbeeld gevonden").toBeDefined();
    const ajv = new (Ajv as any)({ strict: false });
    const valideer = ajv.compile(schema);
    const goed = valideer(voorbeeld);
    expect(valideer.errors ?? [], JSON.stringify(valideer.errors)).toEqual([]);
    expect(goed).toBe(true);
  });

  it("een voorbeeld dat de route zou afwijzen, wordt ook door ons schema afgewezen", () => {
    // Een controle de andere kant op: als het schema alles doorlaat, bewijst de
    // test hierboven niets.
    const ajv = new (Ajv as any)({ strict: false });
    const valideer = ajv.compile(bodySchema());
    expect(valideer({ endpoint: "https://x.example", ownerAddress: "niet-een-adres", method: "dns-txt" })).toBe(false);
    expect(valideer({ endpoint: "https://x.example", ownerAddress: "0x2888F36548a900B9b08d584524e1f73BC563eC26", method: "duif" })).toBe(false);
    expect(valideer({ ownerAddress: "0x2888F36548a900B9b08d584524e1f73BC563eC26", method: "dns-txt" })).toBe(false);
  });

  it("de drie velden die de route echt vereist staan erin, en geen verzonnen vierde", () => {
    const platteTekst = JSON.stringify(declareBazaarDiscovery());
    for (const veld of ["endpoint", "ownerAddress", "method"]) {
      expect(platteTekst).toContain(veld);
    }
    expect(platteTekst).not.toContain("apiKey");
    expect(platteTekst).not.toContain("challenge");
  });
});

describe("standaard uit, want een deploy mag het live antwoord niet veranderen", () => {
  it("zonder de vlag staat er geen bazaar in de route-verklaring", () => {
    const routes = buildPaidRoutes(configMet()) as any;
    const extensies = routes["POST /api/paid/verify-ownership"].extensions;
    expect(Object.keys(extensies)).not.toContain("bazaar");
    expect(Object.keys(extensies)).toContain("offer-receipt");
  });

  it("met de vlag op 1 staat hij er wel, naast offer-receipt", () => {
    const routes = buildPaidRoutes(configMet({ X402_BAZAAR: "1" })) as any;
    const extensies = routes["POST /api/paid/verify-ownership"].extensions;
    expect(Object.keys(extensies)).toContain("bazaar");
    expect(Object.keys(extensies)).toContain("offer-receipt");
  });

  it("een andere waarde dan 1 zet hem niet aan", () => {
    for (const waarde of ["0", "true", "ja", " "]) {
      const routes = buildPaidRoutes(configMet({ X402_BAZAAR: waarde })) as any;
      expect(Object.keys(routes["POST /api/paid/verify-ownership"].extensions)).not.toContain("bazaar");
    }
  });
});

describe("de facilitator, want zonder catalogus aan de andere kant verklaren we in het niets", () => {
  it("blijft standaard op de huidige facilitator staan", () => {
    expect(configMet().facilitatorUrl).toBe(FACILITATOR_URL);
  });

  it("is te wisselen zonder de code aan te raken", () => {
    expect(configMet({ X402_FACILITATOR_URL: "https://facilitator.payai.network" }).facilitatorUrl)
      .toBe("https://facilitator.payai.network");
  });

  it("negeert een lege waarde in plaats van zonder facilitator te draaien", () => {
    expect(configMet({ X402_FACILITATOR_URL: "   " }).facilitatorUrl).toBe(FACILITATOR_URL);
  });
});
