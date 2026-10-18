// x402-keuring-18-okt.test.ts — de gaten die onze eigen keuring op 18 oktober vond,
// elk met een test die rood zou zijn geweest.
//
// WAAROM DIT EEN APART BESTAAND IS EN NIET VERSPREID OVER DE BESTAANDE SUITES. Deze
// gevallen horen bij elkaar omdat ze allemaal dezelfde vorm hebben: iets buiten ons
// (een facilitator, een verkoper, een vreemde) bepaalde iets waar wij met onze eigen
// naam of onze eigen sleutel voor instonden. Bij elkaar gezet is dat een leesbaar
// verhaal; verspreid over vijf bestanden is het vijf losse rariteiten.
//
// ALLE VIJF ZATEN IN LIVE CODE. Geen van hen is theoretisch, en bij elk staat
// hieronder wat er gemeten is in plaats van wat er bedacht is.

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { DNS_LABEL, WELL_KNOWN_PATH, challengeToken, verifyOwnership } from "endpoint-attest";
import {
  declareBazaarDiscovery,
  readSellerConfig,
  buildPaidRoutes,
  FACILITATOR_URL,
  SELLER_NETWORK,
  MAINNET_NETWORK,
} from "./x402-seller.js";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createApp, betaalstoringNaar503, herstelAntwoord } from "./app.js";

/** Lang genoeg voor hun eigen poort: een kort geheim maakt elk token te raden. */
const GEHEIM = "een-wegwerp-attestergeheim-van-ruim-genoeg-tekens";

const TEST_ENV = {
  X402_RECEIPT_SIGNING_KEY: "0x" + "11".repeat(32),
  X402_PAY_TO: "0x2888F36548a900B9b08d584524e1f73BC563eC26",
};

describe("de facilitator-url krijgt dezelfde strengheid als de resource-base", () => {
  // GEMETEN: X402_RESOURCE_BASE werd in drie regels streng gecontroleerd, en
  // X402_FACILITATOR_URL ging er in dezelfde functie volstrekt ongecontroleerd in.
  // Dat is de gevaarlijkste van de twee: elke betaling die deze server verifieert en
  // afrekent gaat naar wat daarin staat, en het antwoord dat terugkomt is waar onze
  // sleutel een bonnetje over ondertekent.

  it("weigert http, want hier reist een betaalpayload over", () => {
    expect(() => readSellerConfig({ ...TEST_ENV, X402_FACILITATOR_URL: "http://facilitator.example" })).toThrow(
      /must be https/,
    );
  });

  it("weigert inloggegevens in de url", () => {
    expect(() =>
      readSellerConfig({ ...TEST_ENV, X402_FACILITATOR_URL: "https://naam:geheim@facilitator.example" }),
    ).toThrow(/credentials/);
  });

  it("weigert een query of fragment, want dat is geen facilitator-adres", () => {
    expect(() =>
      readSellerConfig({ ...TEST_ENV, X402_FACILITATOR_URL: "https://facilitator.example?doorsturen=elders" }),
    ).toThrow(/query or fragment/);
    expect(() =>
      readSellerConfig({ ...TEST_ENV, X402_FACILITATOR_URL: "https://facilitator.example#elders" }),
    ).toThrow(/query or fragment/);
  });

  it("weigert iets wat geen url is", () => {
    expect(() => readSellerConfig({ ...TEST_ENV, X402_FACILITATOR_URL: "dit is geen url" })).toThrow(
      /not a usable url/,
    );
  });

  it("accepteert de twee die wij echt gebruiken, en knipt een naslepende schuine streep", () => {
    expect(readSellerConfig(TEST_ENV)?.facilitatorUrl).toBe(FACILITATOR_URL);
    expect(
      readSellerConfig({ ...TEST_ENV, X402_FACILITATOR_URL: "https://facilitator.payai.network/" })?.facilitatorUrl,
    ).toBe("https://facilitator.payai.network");
  });
});

describe("het gepubliceerde uitvoercontract beschrijft wat de route echt teruggeeft", () => {
  // GEMETEN OP 18 OKTOBER, en dit is het ergste van de vijf omdat het al in een
  // publieke catalogus staat: de verklaring eiste `token` als verplicht uitvoerveld
  // en de route gaf dat veld nooit terug. Onze eigen leveringscontroleur leest
  // precies dat veld, dus hij kon geen enkel echt antwoord van zijn eigen doeldienst
  // verwerken. De verklaring noemde ook een locatievorm die de code niet gebruikt.

  // GEMETEN, NIET AANGENOMEN, en mijn eerste poging had dit mis. Hun bouwer legt het
  // uitvoerVOORBEELD onder `info.output.example` en het uitvoerSCHEMA onder
  // `schema.properties.output.properties.example`. Een facilitator valideert die twee
  // tegen elkaar, dus dat is het paar dat moet kloppen.
  const voorbeeld = () => (declareBazaarDiscovery().bazaar as any).info.output.example;
  const uitvoerSchema = () =>
    (declareBazaarDiscovery().bazaar as any).schema.properties.output.properties.example;
  const invoerVoorbeeld = () => (declareBazaarDiscovery().bazaar as any).info.input.body;

  it("het voorbeeld voldoet aan het schema dat ernaast staat", () => {
    const ajv = new Ajv({ strict: false });
    const valideer = ajv.compile(uitvoerSchema());
    expect(valideer(voorbeeld())).toBe(true);
  });

  it("een ECHT antwoord van de route voldoet aan het verklaarde schema", async () => {
    // Dit is de controle die de vorige editie niet had: niet of het voorbeeld bij het
    // schema past, maar of de WERKELIJKE uitvoer van de dienst erbij past.
    const ajv = new Ajv({ strict: false });
    const valideer = ajv.compile(uitvoerSchema());

    const token = "endpoint-attest-" + "a".repeat(20);
    const geslaagd = await verifyOwnership("dns-txt", "https://klant.example/pad", TEST_ENV.X402_PAY_TO, GEHEIM, {
      resolveTxtRecords: async () => [[token]],
      fetchImpl: async () => {
        throw new Error("niet gebruikt in deze tak");
      },
    } as never);
    // De token die de dienst teruggeeft is de token die hij verwachtte, niet de onze,
    // dus het geslaagde geval wordt hier met de echte verwachte waarde nagespeeld.
    const echteToken = (geslaagd as any).token;
    expect(typeof echteToken).toBe("string");

    const opnieuw = await verifyOwnership("dns-txt", "https://klant.example/pad", TEST_ENV.X402_PAY_TO, GEHEIM, {
      resolveTxtRecords: async () => [[echteToken]],
      fetchImpl: async () => {
        throw new Error("niet gebruikt in deze tak");
      },
    } as never);
    expect(opnieuw.ok).toBe(true);
    expect(valideer(opnieuw)).toBe(true);
  });

  it("en een MISLUKT antwoord voldoet er ook aan, want dat is een antwoord en geen storing", async () => {
    const ajv = new Ajv({ strict: false });
    const valideer = ajv.compile(uitvoerSchema());
    const mislukt = await verifyOwnership("dns-txt", "https://klant.example/pad", TEST_ENV.X402_PAY_TO, GEHEIM, {
      resolveTxtRecords: async () => [["iets volstrekt anders"]],
      fetchImpl: async () => {
        throw new Error("niet gebruikt in deze tak");
      },
    } as never);
    expect(mislukt.ok).toBe(false);
    expect(valideer(mislukt)).toBe(true);
  });

  it("het token zit in de uitvoer, want zonder dat kan een derde het antwoord niet nalezen", () => {
    expect(Object.keys(uitvoerSchema().properties)).toContain("token");
    expect(uitvoerSchema().required).toContain("token");
    expect(voorbeeld().token).toBeTypeOf("string");
  });

  it("de voorbeeldlocatie gebruikt het label dat de code echt opvraagt", () => {
    // De oude verklaring zei `_tokenizen.example.com`, en het echte label is
    // `_endpoint-attest`. Een agent die het voorbeeld kopieert publiceerde dus op de
    // verkeerde plek en kwam er nooit door.
    expect(voorbeeld().location).toContain(DNS_LABEL);
    expect(voorbeeld().location).not.toContain("_tokenizen");
    expect(WELL_KNOWN_PATH).toContain("endpoint-attest");
  });

  it("het voorbeeld-ownerAddress is niet ons eigen ontvangstadres", () => {
    // Ons payTo stond hier als voorbeeld van "de partij die beweert dit eindpunt te
    // beheren". Dat is onze operator-identiteit in een veld waar hij niet hoort, in
    // een catalogus die iedereen leest.
    const invoer = invoerVoorbeeld();
    expect(String(invoer.ownerAddress).toLowerCase()).not.toBe(TEST_ENV.X402_PAY_TO.toLowerCase());
  });
});

/** Een verkoper die wel te bouwen is, met een facilitator die nergens naartoe gaat. */
const VERKOPER_MET_DODE_FACILITATOR = {
  kid: "did:pkh:eip155:1:0x0000000000000000000000000000000000000002",
  signerAddress: "0x0000000000000000000000000000000000000002",
  payTo: TEST_ENV.X402_PAY_TO,
  price: "$0.001",
  resourceBase: "https://api.tokenizen.nl",
  privateKey: "0x" + "11".repeat(32),
  receiptV2: false,
  bazaar: false,
  facilitatorUrl: "https://nergens.invalid",
};

const LOOKUP_PUBLIEK = { lookup: async () => [{ address: "93.184.216.34", family: 4 }] };

async function metServer(opties: Record<string, unknown>, werk: (basis: string) => Promise<void>) {
  const app = createApp({ routableHostDeps: LOOKUP_PUBLIEK, ...opties } as never);
  const server = app.listen(0);
  try {
    await werk(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    server.close();
  }
}

const LICHAAM = {
  endpoint: "https://voorbeeld.example/pad",
  ownerAddress: TEST_ENV.X402_PAY_TO,
  method: "dns-txt",
};

const post = (basis: string, pad: string) =>
  fetch(basis + pad, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(LICHAAM),
  });

describe("de betaalde route heeft zijn eigen emmer", () => {
  // GEMETEN: de betaalde en de gratis route deelden een limiter-instantie, dus een
  // vreemde kon met gratis verzoeken het budget van een betalende klant opmaken. Dat
  // is geen bescherming maar een dicht te drukken verdienroute. De regel staat in
  // rate-limit.ts zelf: een limiet PER AANROEPER op alles wat echt werk doet.
  //
  // WAAROM DEZE TEST ER ZO UITZIET, en dat is een eigen correctie. Mijn eerste versie
  // draaide zonder verkoper, dus zonder betaalde route, en keek of die geen 429 gaf.
  // Dat was VALS GROEN: zonder route loopt er geen limiter, dus hij gaf ook voor de
  // reparatie geen 429. Nu staat er een echte verkoper, en het verschil is beslissend:
  // met een gedeelde emmer is de derde regel 429, met een eigen emmer niet.

  it("een lege gratis emmer laat de betaalde route gewoon door", async () => {
    await metServer(
      {
        seller: VERKOPER_MET_DODE_FACILITATOR,
        verifyRateLimit: { windowMs: 60_000, max: 1 },
        paidRateLimit: { windowMs: 60_000, max: 3 },
      },
      async (basis) => {
        await post(basis, "/api/verify-ownership");
        const tweede = await post(basis, "/api/verify-ownership");
        expect(tweede.status).toBe(429);

        const betaald = await post(basis, "/api/paid/verify-ownership");
        expect(betaald.status).not.toBe(429);
      },
    );
  });

  it("en de betaalde emmer loopt zelf ook echt leeg", async () => {
    await metServer(
      {
        seller: VERKOPER_MET_DODE_FACILITATOR,
        verifyRateLimit: { windowMs: 60_000, max: 9 },
        paidRateLimit: { windowMs: 60_000, max: 1 },
      },
      async (basis) => {
        await post(basis, "/api/paid/verify-ownership");
        const tweede = await post(basis, "/api/paid/verify-ownership");
        expect(tweede.status).toBe(429);
        // En de gratis route is daardoor NIET dichtgegaan, de andere richting.
        const gratis = await post(basis, "/api/verify-ownership");
        expect(gratis.status).not.toBe(429);
      },
    );
  });
});

describe("een facilitator die niet antwoordt is onze storing, niet die van de koper", () => {
  // GEMETEN, EN ANDERS DAN DE KEURING VERMOEDDE. Die dacht dat een kapotte facilitator
  // het hele proces kon afsluiten. Dat reproduceert niet: de betaalmiddleware wordt lui
  // opgebouwd en reikt pas bij het eerste verzoek naar buiten, dus de app komt gewoon
  // overeind. Wat er wel gebeurde met een adres dat niet oplost: de betaalde route gaf
  // een kale `500 Internal Server Error`. Voor een koper is dat niet te onderscheiden
  // van "dit product is stuk". Dat is het gat dat hier dicht gaat.

  it("de gratis routes blijven antwoorden", async () => {
    await metServer({ seller: VERKOPER_MET_DODE_FACILITATOR }, async (basis) => {
      const gezond = await fetch(`${basis}/api/health`);
      expect(gezond.status).toBe(200);
      expect(await gezond.json()).toEqual({ ok: true });
    });
  });

  it("de betaalde route zegt 503 met een ware regel, geen kale 500", async () => {
    await metServer({ seller: VERKOPER_MET_DODE_FACILITATOR }, async (basis) => {
      const r = await post(basis, "/api/paid/verify-ownership");
      expect(r.status).toBe(503);
      const body = (await r.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      // De koper hoort te weten dat er NIETS is afgeschreven. Dat is het enige wat
      // hij op dit moment echt moet weten.
      expect(body.error).toMatch(/no payment was taken/);
      // En onze eigen facilitator-naam hoort NIET in het antwoord te staan.
      expect(JSON.stringify(body)).not.toContain("nergens.invalid");
    });
  });
});

describe("de 503-omzetting dekt alle uitgangen en niets meer dan dat", () => {
  // GEMETEN DOOR ONZE TWEEDE KEURING, met echte express. De eerste versie van deze
  // wrapper verving alleen res.json, en liet twee dingen mis gaan tegelijk:
  //
  //   facilitator stuk via res.json        -> 503  (de bedoeling)
  //   facilitator stuk via res.send        -> 500  (gemist, en @x402/express GEBRUIKT res.send)
  //   facilitator stuk via res.sendStatus  -> 500  (gemist)
  //   ONZE EIGEN 500, niets met afrekenen  -> 503  (een vals excuus voor een echte fout)
  //
  // Dat laatste is het ergste van de vier: een koper krijgt te horen dat er niets is
  // afgeschreven, terwijl de storing ergens anders zat. De grens die nu getrokken wordt
  // is niet "welke code gaf deze 500" (van buitenaf onzichtbaar) maar "wie had het
  // antwoord op dat moment in handen", en dat is wel te zien.
  //
  // Deze tests draaien tegen de ECHTE, geexporteerde middlewares. De keuring moest de
  // wrapper letterlijk kopieren om hem te kunnen meten, en een test op een kopie meet de
  // kopie.

  const metKeten = async (
    nepMiddleware: (req: Request, res: Response, next: NextFunction) => void,
    onzeHandler: (req: Request, res: Response) => void,
    werk: (basis: string) => Promise<void>,
  ) => {
    const app = express();
    app.post("/betaald", betaalstoringNaar503, nepMiddleware, herstelAntwoord, onzeHandler);
    const server = app.listen(0);
    try {
      await werk(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    } finally {
      server.close();
    }
  };

  const post = (basis: string) => fetch(basis + "/betaald", { method: "POST" });
  const nooitBereikt = (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, let: "de middleware hoorde dit niet te bereiken" });
  };

  it("res.json met 500 wordt 503 met de ware regel", async () => {
    await metKeten(
      (_req, res) => {
        res.status(500).json({ error: "Internal Server Error" });
      },
      nooitBereikt,
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(503);
        const body = (await r.json()) as { ok: boolean; error: string };
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/no payment was taken/);
      },
    );
  });

  it("res.send met 500 wordt OOK 503, en dat is de weg die @x402/express neemt", async () => {
    await metKeten(
      (_req, res) => {
        res.status(500).send("<html><body>Internal Server Error</body></html>");
      },
      nooitBereikt,
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(503);
        const body = (await r.json()) as { ok: boolean; error: string };
        expect(body.error).toMatch(/no payment was taken/);
        // En de html van de ander komt niet mee naar de koper.
        expect(JSON.stringify(body)).not.toContain("<html>");
      },
    );
  });

  it("res.sendStatus(500) wordt ook 503", async () => {
    await metKeten(
      (_req, res) => {
        res.sendStatus(500);
      },
      nooitBereikt,
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(503);
        expect(((await r.json()) as { error: string }).error).toMatch(/no payment was taken/);
      },
    );
  });

  it("maar een 402 of 200 van de middleware gaat ONGEMOEID door", async () => {
    await metKeten(
      (_req, res) => {
        res.status(402).json({ x402Version: 2, accepts: [] });
      },
      nooitBereikt,
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(402);
        expect((await r.json()) as Record<string, unknown>).toHaveProperty("x402Version", 2);
      },
    );
  });

  it("en ONZE EIGEN 500, na de middleware, blijft 500 in plaats van een vals excuus", async () => {
    // Dit is de reparatie. De betaling is hier GELUKT (de middleware geeft door), en pas
    // daarna loopt onze eigen handler stuk. "er is niets afgeschreven" zou dan een
    // onwaarheid zijn, en een echte fout zou erachter verdwijnen.
    await metKeten(
      (_req, _res, next) => {
        next();
      },
      (_req, res) => {
        res.status(500).json({ error: "onze eigen fout, niets met afrekenen te maken" });
      },
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(500);
        const body = (await r.json()) as { error: string };
        expect(body.error).toMatch(/onze eigen fout/);
        expect(JSON.stringify(body)).not.toContain("no payment was taken");
      },
    );
  });

  it("en dat geldt ook voor res.send en res.sendStatus na de middleware", async () => {
    await metKeten(
      (_req, _res, next) => {
        next();
      },
      (_req, res) => {
        res.status(500).send("onze eigen kale fout");
      },
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(500);
        expect(await r.text()).toContain("onze eigen kale fout");
      },
    );
    await metKeten(
      (_req, _res, next) => {
        next();
      },
      (_req, res) => {
        res.sendStatus(500);
      },
      async (basis) => {
        const r = await post(basis);
        expect(r.status).toBe(500);
      },
    );
  });

  it("en als de kop al verstuurd is wordt er niets meer herschreven", async () => {
    await metKeten(
      (_req, res) => {
        res.status(500);
        res.write("eerste stuk");
        res.json({ error: "te laat" });
      },
      nooitBereikt,
      async (basis) => {
        const r = await post(basis);
        // De kop stond al vast op 500, dus die blijft. Het punt is dat er geen tweede
        // antwoord bovenop wordt geschreven, want dat gooit in express.
        expect(r.status).toBe(500);
      },
    );
  });
});

describe("de terugzetter is dragend, niet decoratief", () => {
  // Een test die bewijst DAT de reparatie het verschil maakt. Zonder deze toets zou
  // iemand herstelAntwoord later kunnen weghalen omdat hij er overbodig uitziet, en dan
  // is het gat stil terug: een eigen 500 die aan de koper gemeld wordt als
  // afrekeningsstoring. Dezelfde keten, EEN middleware minder.
  it("laat je de terugzetter weg, dan krijgt een eigen 500 een vals excuus", async () => {
    const app = express();
    app.post(
      "/betaald",
      betaalstoringNaar503,
      (_req: Request, _res: Response, next: NextFunction) => next(),
      // GEEN herstelAntwoord hier, met opzet.
      (_req: Request, res: Response) => {
        res.status(500).json({ error: "onze eigen fout, niets met afrekenen te maken" });
      },
    );
    const server = app.listen(0);
    try {
      const poort = (server.address() as { port: number }).port;
      const r = await fetch(`http://127.0.0.1:${poort}/betaald`, { method: "POST" });
      expect(r.status).toBe(503);
      expect(JSON.stringify(await r.json())).toContain("no payment was taken");
    } finally {
      server.close();
    }
  });
});

describe("waarom het token teruggeven niets weggeeft, en waar die reden aan hangt", () => {
  // GEMETEN DOOR ONZE TWEEDE KEURING. De eerste onderbouwing zei dat het token "per
  // constructie publiek" is omdat de eigenaar hem moet publiceren. Dat klopt bij een
  // GESLAAGDE controle en is bij een MISLUKTE per definitie onwaar, want mislukt betekent
  // juist dat hij hem niet gepubliceerd heeft. De echte reden is anders en meetbaar:
  // /api/challenge geeft precies hetzelfde token al gratis voor een willekeurig paar.
  //
  // DEZE TEST IS DE PLEK WAAR DIE KOPPELING VASTLIGT. Zet iemand /api/challenge later
  // achter een inlog, dan valt deze test en wordt de afweging opnieuw gemaakt in plaats
  // van stilzwijgend overgenomen.

  const challengeTokenVan = (endpoint: string) => challengeToken(endpoint, TEST_ENV.X402_PAY_TO, GEHEIM);

  it("de gratis challenge-route geeft hetzelfde token als een mislukte verificatie", async () => {
    const endpoint = "https://klant.example/mcp";
    const eigenaar = TEST_ENV.X402_PAY_TO;

    const viaChallenge = challengeToken(endpoint, eigenaar, GEHEIM);
    const mislukt = await verifyOwnership("dns-txt", endpoint, eigenaar, GEHEIM, {
      resolveTxtRecords: async () => [["iets volstrekt anders"]],
      fetchImpl: async () => {
        throw new Error("niet gebruikt in deze tak");
      },
    } as never);

    expect(mislukt.ok).toBe(false);
    expect((mislukt as { token: string }).token).toBe(viaChallenge);
  });

  it("en die route zit niet achter een inlog, wat de hele reden is dat dit mag", async () => {
    // Faalt deze, dan is /api/challenge dichtgezet en is verifyOwnership het goedkoopste
    // orakel geworden. Dan hoort de onderbouwing in ownership.ts opnieuw bekeken te
    // worden, en daarom staat die verwijzing hier letterlijk in de test.
    const app = createApp({
      seller: null,
      routableHostDeps: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] } as never,
    } as never);
    const server = app.listen(0);
    try {
      const poort = (server.address() as { port: number }).port;
      const r = await fetch(`http://127.0.0.1:${poort}/api/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: "https://klant.example/mcp", ownerAddress: TEST_ENV.X402_PAY_TO }),
      });
      expect(r.status).toBe(200);
      // GEMETEN, niet aangenomen: de route geeft een blok per methode terug, met per
      // blok de plek EN het token. Hij geeft bovendien ook het consent-token weg, dus de
      // route is nog ruimer dan de onderbouwing nodig heeft.
      const body = (await r.json()) as {
        ok: boolean;
        dnsTxt: { location: string; token: string };
        wellKnownFile: { location: string; token: string };
      };
      expect(body.ok).toBe(true);
      expect(typeof body.dnsTxt.token).toBe("string");
      expect(body.dnsTxt.token).toBe(body.wellKnownFile.token);
      // NIET vergelijken met een token uit ons eigen geheim: deze server maakt in een
      // test zijn eigen willekeurige geheim, dus dat kan per definitie niet kloppen. Wat
      // hier telt is dat de route OPEN staat en een token teruggeeft zonder enig bewijs,
      // en dat beide methoden hetzelfde token dragen, wat laat zien dat het aan het PAAR
      // hangt en niet aan de methode.
      expect(body.dnsTxt.token.startsWith("tok_")).toBe(true);
    } finally {
      server.close();
    }
  });
});

describe("de mainnet-route, standaard uit", () => {
  // GEMETEN op 2026-10-18: facilitator.payai.network noemt eip155:8453 met scheme exact
  // op versie 2, en x402.org/facilitator noemt mainnet NIET. Een mainnet-prijs adverteren
  // met een facilitator die niet mainnet kan, is dus een prijs die niemand kan afrekenen.
  const mainnetEnv = {
    ...TEST_ENV,
    X402_MAINNET: "1",
    X402_FACILITATOR_URL: "https://facilitator.payai.network",
  };

  it("staat standaard uit, dus een deploy verandert het live antwoord niet", () => {
    expect(readSellerConfig(TEST_ENV)?.mainnet).toBe(false);
    const routes = buildPaidRoutes(readSellerConfig(TEST_ENV)!) as any;
    const accepts = routes["POST /api/paid/verify-ownership"].accepts;
    expect(accepts).toHaveLength(1);
    expect(accepts[0].network).toBe(SELLER_NETWORK);
  });

  it("aan gezet biedt hij TWEE netwerken aan, geen omschakeling", () => {
    const config = readSellerConfig(mainnetEnv)!;
    expect(config.mainnet).toBe(true);
    const routes = buildPaidRoutes(config) as any;
    const accepts = routes["POST /api/paid/verify-ownership"].accepts;
    expect(accepts).toHaveLength(2);
    expect(accepts.map((a: { network: string }) => a.network)).toEqual([SELLER_NETWORK, MAINNET_NETWORK]);
    // Dezelfde prijs en hetzelfde ontvangstadres op beide, anders adverteren we twee
    // verschillende aanbiedingen zonder dat iemand dat besloot.
    expect(new Set(accepts.map((a: { price: string }) => a.price)).size).toBe(1);
    expect(new Set(accepts.map((a: { payTo: string }) => a.payTo)).size).toBe(1);
  });

  it("weigert mainnet met een facilitator die mainnet niet kan", () => {
    expect(() => readSellerConfig({ ...TEST_ENV, X402_MAINNET: "1" })).toThrow(/does not list eip155:8453/);
  });
});
