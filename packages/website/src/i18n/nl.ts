import type { Dictionary } from "./types";

export const nl: Dictionary = {
  htmlLang: "nl",
  meta: {
    title: "Tokenizen | Bewijs van levering voor de AI-agent-economie",
    description:
      "Tokenizen bouwt open-source infrastructuur voor de verkoperskant van de AI-agent-economie. Capacity Attest laat na een x402-betaling een ondertekende, feitelijke leveringsclaim achter, zodat de volgende koper de geschiedenis van een verkoper kan checken vóór hij zelf betaalt. Geen token, geen rente, geen lening.",
    ogLocale: "nl_NL",
    ogTitle: "Tokenizen | Bewijs van levering voor de AI-agent-economie",
    ogDescription:
      "Iedereen bouwt de koperskant van de AI-agent-economie (identiteit, spend-limits, betaalrails). Tokenizen bouwt de verkoperskant: een ondertekend, feitelijk bewijs dat het geleverde overeenkomt met wat beloofd was.",
    twitterTitle: "Tokenizen | Bewijs van levering voor de AI-agent-economie",
    twitterDescription:
      "Open-source infrastructuur voor de verkoperskant van de AI-agent-economie: een ondertekende, feitelijke leveringsclaim na elke x402-betaling.",
  },
  header: {
    navLabel: "Hoofdnavigatie",
    mobileNavLabel: "Mobiele navigatie",
    links: [
      { href: "#probleem", label: "Probleem" },
      { href: "#waarom-nu", label: "Waarom nu" },
      { href: "#product", label: "Product" },
      { href: "#controle", label: "Controle" },
      { href: "#hoe-het-werkt", label: "Hoe het werkt" },
      { href: "#ontwerpgrenzen", label: "Grenzen" },
      { href: "#open-source", label: "Open source" },
      { href: "#status", label: "Status" },
    ],
    github: "GitHub",
    openMenu: "Open menu",
    closeMenu: "Sluit menu",
  },
  languageSwitch: {
    groupLabel: "Kies taal",
    nl: "NL",
    en: "EN",
  },
  themeToggle: {
    groupLabel: "Kies thema",
    light: "Licht",
    system: "Systeem",
    dark: "Donker",
  },
  hero: {
    eyebrow: "Open source infrastructuur voor de AI-agent-economie",
    h1Line1: "AI-agenten doen straks zaken met elkaar.",
    h1Line2: "Niemand kan nakijken wat er echt gebeurde.",
    body: "Een AI-agent koopt iets bij een andere agent en betaalt binnen een seconde. Of er ook echt geleverd is wat beloofd was, legt niemand vast. Wij maken daar ondertekende bonnetjes van. Twee soorten: een bonnetje van wat er geleverd werd, en een bonnetje van wat een controle van zo'n agent werkelijk aantrof. Allebei na te lezen door de volgende die zaken wil doen.",
    clarifier: "De koper tekent de claim, want alleen hij weet wat er echt aankwam. Wat ontstaat is desondanks het trackrecord van de verkoper: het bewijs dat een goede verkoper aan de volgende koper kan tonen.",
    trustLine: "Geen token · geen lening · geen yield",
    ctaPrimary: "Bekijk de code op GitHub",
    ctaSecondary: "Hoe het werkt",
    installLabel: "of direct proberen:",
  },
  problem: {
    eyebrow: "Het probleem",
    h2: "Betalen gaat al vanzelf. Nakijken wat je kreeg, niet.",
    body: "Een agent betaalt in een seconde voor rekenkracht, opslag of toegang tot een dienst. Kreeg hij minder dan beloofd, dan verdwijnt dat zodra de sessie stopt. Er blijft niets over dat iemand later kan bekijken. Geen klacht, geen bewijs, geen geheugen.",
    cards: [
      {
        title: "De koper weet het",
        body: "Hij zag de output, of zag hem niet. Maar die kennis gaat verloren zodra de sessie eindigt.",
      },
      {
        title: "De volgende koper niet",
        body: "Die begint blind bij dezelfde verkoper, zonder geschiedenis om op te checken vóór hij zelf betaalt.",
      },
      {
        title: "Niemand legt de claim vast",
        body: "Zonder ondertekend spoor is er niets dat een belofte aan een geclaimde levering koppelt, laat staan iets dat een volgende koper kan controleren.",
      },
    ],
  },
  whyNow: {
    eyebrow: "Waarom nu",
    h2: "Drie ontwikkelingen vallen dit jaar samen.",
    body: "Uit negen domeinscans (augustus 2026) volgt hetzelfde patroon: de koperskant van de agent-economie krijgt alle aandacht. De verkoperskant en het object zelf (het bewijs) blijft onderbelicht, precies op het moment dat regelgeving en betaalrails er wél om vragen.",
    reasons: [
      {
        date: "20 juli 2026",
        title: "EU Digital Product Passport-register live",
        body: "De Europese Commissie opende het DPP-register; verplichte paspoorten volgen gefaseerd per productcategorie (batterijen vanaf feb. 2027). Bewijst dat een machineleesbaar, financiën-vrij asset-paspoort een reële EU-norm wordt, niet dat het nu al overal verplicht is.",
      },
      {
        date: "2 augustus 2026",
        title: "EU AI Act, Artikel 14 in werking",
        body: "Hoog-risico AI-systemen moeten aantoonbaar door mensen te overzien zijn. Dat vraagt om een controleerbaar spoor van wat een autonome agent deed, precies het soort auditeerbaarheid waar Tokenizen op inspeelt, zonder dat wij zelf een Artikel 14-nalevingsclaim doen.",
      },
      {
        date: "doorlopend",
        title: "x402 en Google AP2 laten één vraag open",
        body: "Coinbase (nu Linux Foundation) en Google bouwden de betaal- en autorisatie-rails. “Wat koop ik precies, en mag de verkoper dit leveren?” blijft onbeantwoord.",
      },
    ],
  },
  product: {
    eyebrow: "Pijler 1: bewijs van levering",
    h2: "Een bonnetje van wat er geleverd is. Geen cijfer, geen oordeel.",
    body: "Zodra een agent betaald heeft, legt hij vast of hij kreeg wat beloofd was: ja, nee, of gedeeltelijk. Dat bonnetje wordt ondertekend en kan daarna niet meer worden veranderd. Wie later met diezelfde verkoper zaken wil doen, kan die geschiedenis opvragen voordat hij betaalt.",
    codeLabelRecordCall: "MCP tool-call → record_delivery",
    codeLabelHistoryCall: "MCP tool-call → get_delivery_history",
    codeLabelResult: "antwoord",
    note: "Dit is een fictief voorbeeld: de adressen, hashes en handtekening hierboven zijn verzonnen om het schema te tonen, niet afgeleid van een echte claim. Voor een echte, live claim zie het bewijs-blok in de Status-sectie hieronder. Het volledige schema staat in `packages/capacity-attest/src/schema.ts`.",
    cards: [
      {
        title: "record_delivery",
        body: "De betalende agent roept dit aan ná een x402-afwikkeling. De server valideert eerst het schema, dan of `claimId` echt de hash van de inhoud is, en dan of `signature` terugrekent naar `buyerAddress`. Pas dan komt de claim op de append-only ledger.",
      },
      {
        title: "get_delivery_history",
        body: "Gegeven een `sellerAddress`: alle bekende, handtekening-geverifieerde claims tegen die verkoper, chronologisch. Puur feitelijk: geen gemiddelde, geen percentage, geen trust score.",
      },
    ],
  },
  secondPillar: {
    eyebrow: "Pijler 2",
    h2: "Bewijs van controle, niet van veiligheid.",
    body: "Een bedrijf dat een vreemde AI-agent binnenlaat heeft alleen de folder van de maker. Pijler 2 maakt daar een bonnetje van dat iedereen kan nakijken: de eigenaar bewijst eerst dat de endpoint van hem is, geeft toestemming, en wij leggen vast wat wij werkelijk aantroffen. Ondertekend, met een datum, en door iedereen na te lezen.",
    cards: [
      {
        title: "De eigenaar bewijst dat het van hem is",
        body: "Hij zet een code in zijn DNS of als bestand op zijn eigen server. Daarmee toont hij aan dat hij de endpoint beheert, zoals een briefje in je brievenbus aantoont dat het jouw huis is.",
      },
      {
        title: "Hij geeft toestemming",
        body: "Zonder uitdrukkelijke toestemming raken wij een endpoint niet aan, en wij zetten nooit iemand op een lijst die er niet om gevraagd heeft.",
      },
      {
        title: "Wij schrijven op wat we zagen",
        body: "Geen cijfer en geen oordeel. Wat wij niet konden vaststellen heet onvaststelbaar, en dat staat er dan ook gewoon.",
      },
    ],
    honestNote: "Wij zetten nooit het stempel veilig. Een test kan laten zien dat er iets mis is, maar nooit bewijzen dat er niets mis is.",
    ctaLabel: "Probeer het gratis",
    ctaNote: "Gratis en zonder account. De betaalde stempel staat bewust nog uit.",
  },
  howItWorks: {
    eyebrow: "Hoe het werkt",
    h2: "Vier stappen, geen tussenpersoon.",
    body: "Tokenizen verifieert of settelt zelf geen betalingen, dat gebeurt al bij x402. De ledger registreert alleen de bon van een afwikkeling die al heeft plaatsgevonden.",
    steps: [
      {
        title: "Agent betaalt via x402",
        body: "Een AI-agent koopt capaciteit (GPU-uren, opslag, API-credits, bandbreedte) bij een andere agent of dienst.",
      },
      {
        title: "Koper tekent een claim",
        body: "Na afwikkeling legt de betalende agent vast of het beloofde is aangekomen: yes / no / partial, plus een hash van het bewijs.",
      },
      {
        title: "Claim naar de ledger",
        body: "record_delivery valideert schema, claimId en handtekening, en schrijft de claim append-only weg. Niet te wijzigen achteraf.",
      },
      {
        title: "Volgende koper checkt eerst",
        body: "Vóór hij zelf betaalt roept een agent get_delivery_history aan en ziet de ruwe leveringsgeschiedenis van die verkoper.",
      },
    ],
  },
  boundaries: {
    eyebrow: "Ontwerpgrenzen",
    h2: "Bewust géén token, géén rente, géén lening.",
    body: "Dit is geen marketing-truc. Het is een bewuste, harde ontwerpgrens, en een strategische: het houdt Tokenizen buiten de zwaarst gereguleerde en meest gehypte hoek van crypto. De grens is expliciet ingebakken in het schema en de documentatie, niet weggemoffeld.",
    columns: [
      {
        label: "Wel: bouwen we",
        items: [
          "Verificatie van levering (delivered: yes/no/partial + evidence hash)",
          "Append-only audit-trail, content-addressed, niet achteraf te wijzigen",
          "MCP-tools om vóór betaling de geschiedenis van een verkoper te checken",
          "Echte capaciteitshandel: GPU-uren, opslag, API-credits, bandbreedte",
        ],
      },
      {
        label: "Met guardrail",
        items: [
          "Settlement is spot-only (direct afgewikkeld, nooit op krediet of termijn)",
          "Credits zijn inwisselbare vouchers voor capaciteit, geen verhandelbaar instrument",
          "Bewijsmateriaal wordt als hash opgeslagen, niet als data zelf",
        ],
      },
      {
        label: "Nooit: hardcoded uitgesloten",
        items: [
          "Geen eigen token of munt",
          "Geen leningen",
          "Geen rente-op-betalingen",
          "Geen factoring / invoice-financing",
          "Geen yield-producten",
        ],
      },
    ],
  },
  openSource: {
    eyebrow: "Open source & voor developers",
    h2: "De code is er. En nu ook op npm.",
    body: "`capacity-attest` is een MCP-server, geschreven in TypeScript, met een dekkende testsuite. Het package staat live op npm (huidige versie 0.2.0) en is geregistreerd in het officiële MCP-register als `io.github.holistis/capacity-attest`. Een agent kan de server direct aanroepen zonder eerst de repository te klonen.",
    badges: {
      mit: "MIT-licentie",
      typescript: "TypeScript",
      mcp: "Model Context Protocol",
      status: "live op npm",
    },
    npmLabel: "npmjs.com/package/capacity-attest",
    installIntro: "Voor lokale ontwikkeling: clone de repository, installeer, bouw, en draai de meegeleverde end-to-end demo, die gebruikt een wegwerpbare test-wallet en raakt geen live infrastructuur aan.",
    localDevLabel: "lokale ontwikkeling",
    repoButton: "Repository op GitHub",
    terminalLabel: "installeren",
    localTerminalLabel: "terminal",
    commentBuild: "tsc -> dist/",
    commentTest: "vitest run",
    commentDemo: "end-to-end lokale demo, TEST-sleutels, geen live infra",
    copyLabel: "Kopieer",
    copiedLabel: "Gekopieerd",
  },
  status: {
    eyebrow: "Status, eerlijk",
    h2: "Geen betalende klanten. Wel drie externe partijen die op het formaat bouwen, en werk dat anderen zelf hebben nagerekend.",
    body: "Tokenizen is open source en in actieve ontwikkeling. Er zijn geen betalende klanten en geen partnerships, en dat zeggen we gewoon zo. Wat er wel is: drie partijen buiten dit project bouwen inmiddels op het claimformaat. Een van hen heeft onze verifier van de grond af opnieuw gebouwd in een andere taal en levert hem mee in zijn eigen pakket. Een ander noemt het measured-blok de bron van waarheid voor gemeten levering in zijn eigen conceptspecificatie, vastgepind op een commit van deze repo. Het volgende dat telt is de ondertekende testvectoren in een officiële conformance-set krijgen, zodat iedereen die later meedoet er langs moet.",
    checkpoints: [
      {
        title: "npm-publicatie",
        body: "capacity-attest staat live op npm en in het MCP-register, op dit moment als 0.7.0, met 0.8.0 wachtend op een blokkade bij de registry.",
        achieved: true,
      },
      {
        title: "Eerste extern gebruik",
        body: "Iemand buiten dit project die van capacity-attest afhangt zonder dat wij het voordoen. Drie partijen doen dat nu: een concept-ERC-8004-conventie die deze repo op commit-niveau vastpint, een onafhankelijk herbouwde verifier die meegeleverd wordt in andermans gepubliceerde pakket, en een BSV-rail-adapter op hetzelfde claimformaat van een losse auteur.",
        achieved: true,
      },
      {
        title: "Onafhankelijke verificatie door andermans code",
        body: "Een externe partij heeft de verifier van de grond af opnieuw gebouwd, alleen met de standaardbibliotheek, met een eigen implementatie van secp256k1, EIP-191 en canonieke JSON. Zeven van zeven vectoren komen overeen, inclusief beide negatieve controles, en het draait nu als permanente regressietest binnen zijn eigen gepubliceerde pakket.",
        achieved: true,
      },
      {
        title: "Een externe agent die zelf record_delivery aanroept",
        body: "Anderen verifiëren onze claims en hangen van het formaat af, maar we hebben nog geen bewijs van een agent van een andere partij die in productie een leveringsclaim via de MCP-tool wegschrijft. Tot we dat zien, blijft dit open.",
        achieved: false,
      },
      {
        title: "De ondertekende vectoren in een officiële conformance-set",
        body: "De vijf ondertekende gemeten vectoren opgenomen in de eigen verplichte testset van een standaardengroep, zodat eraan voldoen een voorwaarde voor meedoen wordt in plaats van een gunst aan ons. Aangevraagd, nog niet toegekend.",
        achieved: false,
      },
    ],
    proof: {
      title: "Onafhankelijk geverifieerd",
      body: "Onafhankelijke controles door andere mensen in plaats van door ons: een echte betaalclaim die een extern project op 1 september 2026 verifieerde, met hetzelfde claimId en dezelfde handtekening terugberekend naar de koper; een verifier die van de grond af in een andere taal is herbouwd; live leveringsclaims die iedereen kan uitlezen op drie losse chains; en een echte giveFeedback-aanroep op het ERC-8004 Reputation Registry op Base mainnet. Elke controle staat gelinkt vanuit de repository, zodat hij opnieuw na te rekenen is.",
      txLabel: "Bekijk de transactie",
      verificationLabel: "Bekijk de verificatie",
    },
    limitation: {
      title: "Bewuste grens: de ledger is nog lokaal",
      body: "`npm install capacity-attest` start standaard een lokale ledger per installatie (in te stellen via `CAPACITY_ATTEST_DATA_DIR`). Twee onafhankelijke installaties zien elkaars claims nog niet automatisch via die standaardinstelling; dat blijft de volgende bouwstap. Wat er intussen wél is, en live geverifieerd op Base mainnet: claims publiceren en terugvinden via de Ethereum Attestation Service, én een echte `giveFeedback()`-koppeling met de ERC-8004 Reputation Registry, zodat het leveringsfeit ook zichtbaar wordt op de plek waar honderdduizenden ERC-8004-agents al kijken. Beide zijn bewezen, opt-in bouwstenen: klaar om te gebruiken, nog niet automatisch actief tussen installaties.",
    },
  },
  footer: {
    tagline: "Open-source infrastructuur voor de verkoperskant van de AI-agent-economie. Nieuw, in actieve ontwikkeling, met vaste ontwerpgrenzen.",
    maintainedBy: "Onderhouden door",
    githubLabel: "github.com/holistis/tokenizen",
    copyright: "© 2026 tokenizen. Open source, MIT-licentie.",
    legend: [
      { dot: "bg-rule-green", label: "wel: bouwen we" },
      { dot: "bg-rule-yellow", label: "met guardrail" },
      { dot: "bg-rule-red", label: "nooit, hardcoded uitgesloten" },
    ],
  },
  trustRadar: {
    metaTitle: "Trust Radar | tokenizen",
    metaDescription: "Een gratis, openbare lijst van MCP-servers waarvan de eigenaar zelf om een controle vroeg en aantoonde dat hij de endpoint beheert. Geen beveiligingsaudit, en nooit een vermelding waar de eigenaar niet om gevraagd heeft.",
    eyebrow: "Gratis en openbaar",
    h1: "Trust Radar",
    intro: "Een openbare lijst van MCP-servers waarvan de eigenaar zelf om een controle vroeg, aantoonde dat hij de endpoint beheert, en toestemming gaf om het ondertekende resultaat hier te tonen.",
    disclaimer: "Dit is geen algemene beveiligingsaudit, en wij zetten hier nooit iemand neer die er niet om gevraagd heeft. Elke regel hieronder is een zelf aangevraagde controle met bewezen eigendom: de eigenaar toonde eerst aan dat hij het domein beheert, via een DNS TXT-record of een bestand op zijn eigen server, voordat het ondertekende resultaat werd gepubliceerd. “Controles doorstaan” betekent dat de ondertekende controles zijn uitgevoerd en dat er geen enkele faalde. Het is geen garantie dat de server veilig is.",
    checkedLabel: "Gecontroleerd",
    mailSubject: "Trust Radar: controle aanvragen",
    empty: {
      title: "Nog geen bevestigde endpoints.",
      body: "Hier staat niets totdat een eigenaar zelf om een controle vraagt, aantoont dat hij de endpoint beheert, en het ondertekende resultaat laat publiceren. Wij zetten nooit een endpoint op deze lijst zonder dat de eigenaar erom vroeg.",
      cta: "Wees de eerste, vraag een gratis stempel aan",
    },
    badges: {
      checksPassed: "Controles doorstaan",
      openUnclear: "Open, onduidelijk",
      selfDeclaredUnsafe: "Zelf onveilig genoemd",
    },
  },
  noscript: {
    h1: "Tokenizen: bewijs van levering voor de AI-agent-economie",
    body: "Tokenizen bouwt open-source infrastructuur voor de verkoperskant van de AI-agent-economie: een verifieerbaar bewijs dat een verkoper een recht echt heeft, en dat wat geleverd is overeenkomt met wat beloofd was.",
    h2: "Capacity Attest",
    productBody: "Wanneer een AI-agent via het x402-protocol betaalt voor capaciteit (GPU-uren, opslag, API-credits, bandbreedte) bij een andere agent, laat de betalende agent na afwikkeling een cryptografisch ondertekende claim achter of het geleverde overeenkwam met wat beloofd was. Andere agents kunnen die geschiedenis opvragen vóórdat ze zaken doen met een verkoper.",
    link: "Bekijk de code op GitHub",
  },
};
