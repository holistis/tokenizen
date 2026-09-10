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
    eyebrow: "Infrastructuur voor de AI-agent-economie · open source",
    h1Line1: "Iedereen bouwt de koperskant.",
    h1Line2: "Wij bouwen de verkoperskant.",
    body: "Agent-identiteit, spend-limits en betaalrails zijn onderweg (x402: betaling per API-call, Google AP2: autorisatie-protocol, ERC-8004: on-chain reputatie-registers). Wat nog ontbreekt: een ondertekend spoor van wat een verkoper claimt geleverd te hebben, en of dat overeenkwam met wat beloofd was. Tokenizen bouwt dat spoor, te beginnen met Capacity Attest: een ondertekende, feitelijke leveringsclaim voor x402-capaciteitshandel tussen agents.",
    clarifier: "De koper tekent de claim, want alleen hij weet wat er echt aankwam. Wat ontstaat is desondanks het trackrecord van de verkoper: het bewijs dat een goede verkoper aan de volgende koper kan tonen.",
    trustLine: "Geen token · geen lening · geen yield",
    ctaPrimary: "Bekijk de code op GitHub",
    ctaSecondary: "Hoe het werkt",
    installLabel: "of direct proberen:",
  },
  problem: {
    eyebrow: "Het probleem",
    h2: "Een agent betaalt, krijgt minder, en heeft er geen ondertekend spoor van.",
    body: "Een AI-agent betaalt via x402 voor capaciteit bij een andere agent of dienst: GPU-uren, opslag, API/inference-credits, bandbreedte. De levering valt tegen: minder uren dan toegezegd, lagere kwaliteit, minder opslag. Er is geen kwitantie die vastlegt wat beloofd en geclaimd werd. Dat is geen bewijs dat de levering zelf klopte, wel een ondertekend spoor dat een agent later kan raadplegen en tonen.",
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
    eyebrow: "Het product: Capacity Attest",
    h2: "Een ondertekende, feitelijke leveringsclaim. Geen oordeel, geen score.",
    body: "Na een x402-afwikkeling voor capaciteit (GPU-uren, opslag, API-credits, bandbreedte) laat de betalende agent een cryptografisch ondertekende claim achter: `delivered` (yes/no/partial) plus een hash van het bewijsmateriaal, content-addressed en op een append-only ledger. Andere agents kunnen die geschiedenis opvragen vóórdat ze zelf zaken doen met een verkoper.",
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
    h2: "Nieuw project. Geen klanten. Wel bewezen fundament.",
    body: "Tokenizen is net gelanceerd, open source, en in actieve ontwikkeling. Er zijn nog geen externe gebruikers, geen partnerships, geen klanten. Dat zeggen we gewoon zo. Wat er wél staat: dit is gebouwd bovenop bewezen eigen betaal- en MCP-infrastructuur (x402, meerdere eerder gepubliceerde npm/MCP-packages), en de eerste onafhankelijke verificatie van een live claim heeft al plaatsgevonden. De eerste externe integratie is het volgende dat telt.",
    checkpoints: [
      {
        title: "npm-publicatie",
        body: "capacity-attest 0.2.0 staat live op npm en in het MCP-register.",
        achieved: true,
      },
      {
        title: "Eerste externe clone/install",
        body: "Iemand buiten dit project die de repository kloont of npm install capacity-attest draait, zonder dat wij het voordoen.",
        achieved: false,
      },
      {
        title: "Eerste externe agent-integratie",
        body: "Een agent van een andere partij die record_delivery of get_delivery_history daadwerkelijk aanroept.",
        achieved: false,
      },
    ],
    proof: {
      title: "Onafhankelijk geverifieerd",
      body: "Een extern project (ASM-spec) verifieerde op 1 september 2026 zelfstandig een echte betaalclaim: zelfde claimId, zelfde handtekening terugberekend naar de koper, dezelfde on-chain betaling.",
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
  noscript: {
    h1: "Tokenizen: bewijs van levering voor de AI-agent-economie",
    body: "Tokenizen bouwt open-source infrastructuur voor de verkoperskant van de AI-agent-economie: een verifieerbaar bewijs dat een verkoper een recht echt heeft, en dat wat geleverd is overeenkomt met wat beloofd was.",
    h2: "Capacity Attest",
    productBody: "Wanneer een AI-agent via het x402-protocol betaalt voor capaciteit (GPU-uren, opslag, API-credits, bandbreedte) bij een andere agent, laat de betalende agent na afwikkeling een cryptografisch ondertekende claim achter of het geleverde overeenkwam met wat beloofd was. Andere agents kunnen die geschiedenis opvragen vóórdat ze zaken doen met een verkoper.",
    link: "Bekijk de code op GitHub",
  },
};
