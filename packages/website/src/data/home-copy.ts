// The words of the homepage and of the offer overview, in English and Dutch. Every claim here comes from something that is public or that
// the king approved: the published notes, the offer page, the scoreboard, the public GitHub advisory, and our own records (labelled as such).
// Anything that has no source yet is left out instead of being rounded up. No long dashes, no markdown.

export type Locale = "en" | "nl";

export const ADVISORY_URL = "https://github.com/pymc-labs/pymc-marketing/security/advisories/GHSA-72xh-gfpr-v9hx";
export const GITHUB_URL = "https://github.com/holistis/tokenizen";
export const CONTACT_EMAIL = "info@tokenizen.nl";

export interface Offer {
  id: "checks" | "signal-log" | "security" | "scan" | "tools" | "talk";
  status: string;
  name: string;
  line: string;
  gets: string;
  verify: string;
  not: string;
  price: string;
  cta: { label: string; href: string };
}

const OFFERS_EN: Offer[] = [
  {
    id: "checks",
    status: "free",
    name: "Free checks",
    line: "See in a minute what your public repository or payment endpoint shows.",
    gets: "A check of eight security signals in a public GitHub repository, a check of an x402 payment endpoint, and a proof that you own an endpoint.",
    verify: "Each result says which public pages were asked for and whether that worked. The grids above come from rule set 2026-10-28.6; the check now runs a newer one that also reads other CI systems, so a new run can give other numbers.",
    not: "Not a conformity assessment and not legal advice. The signals are a selection, not one per legal requirement.",
    price: "Free",
    cta: { label: "Check a repository", href: "/cra-check" },
  },
  {
    id: "signal-log",
    status: "early access",
    name: "Signal log",
    line: "Every week the same eight signals for your repositories, written into a log with a timestamp outside our control.",
    gets: "A weekly run for 3 (Solo) or 25 (Team) public repositories. You get the log by email, a timestamp from OpenTimestamps and the command to check it.",
    verify: "The timestamp can be checked without us. It counts as confirmed once Bitcoin has included it, usually some hours later.",
    not: "Run by hand for now. Email warnings are not built yet and there is no public place for logs. Not a compliance check.",
    price: "9.95 or 29.95 euro per month, VAT included",
    cta: { label: "See the offer", href: "/signal-log" },
  },
  {
    id: "security",
    status: "on request",
    name: "Security research",
    line: "We read your pipelines and automation the way an attacker does, and tell you what we find.",
    gets: "A written report, delivered to you privately, with the evidence we have for each finding, a severity and what is still open.",
    verify: "Our published GitHub advisory, with our account credited as reporter, is an example you can open yourself.",
    not: "Not a penetration test of your production systems and not a certificate.",
    price: "After a conversation. No fixed offer yet.",
    cta: { label: "See our record", href: "/security" },
  },
  {
    id: "scan",
    status: "pay per scan",
    name: "Smart contract scan",
    line: "A security scan of smart contract code: it returns possible weak spots for you to check. It finds some of what a human audit finds, and we publish how much.",
    gets: "A report of AI-generated hypotheses about the Solidity code in a public GitHub repository, to be reviewed by hand. You pay per scan in USDC over x402.",
    verify: "The public scoreboard lists every run. Version 3.1 found 8 of 105 known findings in its first 15 hypotheses, on contests that were no longer secret, after two changes at once. In the sealed run the earlier versions found 1 and 4. The rule of the sealed run was written down in public before it; for 3.1 it is only in our own notes.",
    not: "Not an audit and no guarantee that a contract is safe. What it finds and misses is on the public scoreboard.",
    price: "Quick scan 1 dollar (the first 15 hypotheses), full scan 5 dollars, paid in USDC on Base over x402. Payment address: the official sources.",
    cta: { label: "Open the scoreboard", href: "/scoreboard" },
  },
  {
    id: "tools",
    status: "open source",
    name: "Open-source tools",
    line: "Run them yourself, so you do not have to believe us.",
    gets: "capacity-attest, agent-receipt-verify, x402-lint and muraqib-agent-watch, plus MCP servers.",
    verify: "The code is on GitHub and the packages are on npm.",
    not: "No score, no verdict, no token of our own.",
    price: "Free",
    cta: { label: "See the tools", href: "/tools" },
  },
  {
    id: "talk",
    status: "a conversation",
    name: "Talk to Ahmed",
    line: "Start with a conversation about where you stand.",
    gets: "A conversation about security, the EU Cyber Resilience Act or payments between agents.",
    verify: "Ask for our measurements. We show how each one was made.",
    not: "No legal advice, no certificate and no promise of a result.",
    price: "Ask. No fixed offer yet.",
    cta: { label: "Write to Ahmed", href: `mailto:${CONTACT_EMAIL}?subject=A%20conversation%20with%20Ahmed` },
  },
];

const OFFERS_NL: Offer[] = [
  {
    id: "checks",
    status: "gratis",
    name: "Gratis checks",
    line: "Zie in een minuut wat jouw openbare repository of betaalpunt laat zien.",
    gets: "Een check van acht beveiligingssignalen in een openbare GitHub-repository, een check van een x402-betaalpunt en een bewijs dat het punt van jou is.",
    verify: "Elke uitslag noemt welke openbare pagina's zijn opgevraagd en of dat lukte. De rasters hierboven komen uit regelversie 2026-10-28.6; de check draait nu op een nieuwere die ook andere CI-systemen leest, dus een nieuwe run kan andere getallen geven.",
    not: "Geen conformiteitsbeoordeling en geen juridisch advies. De signalen zijn een selectie, niet een per wettelijke eis.",
    price: "Gratis",
    cta: { label: "Check een repository", href: "/cra-check" },
  },
  {
    id: "signal-log",
    status: "vroege toegang",
    name: "Signal log",
    line: "Elke week dezelfde acht signalen van jouw repositories, vastgelegd in een logboek met een tijdstempel buiten onze controle.",
    gets: "Een wekelijkse run voor 3 (Solo) of 25 (Team) openbare repositories. Je krijgt het logboek per mail, een tijdstempel van OpenTimestamps en het commando om die te controleren.",
    verify: "De tijdstempel is te controleren zonder ons. Hij telt als bevestigd zodra Bitcoin hem heeft opgenomen, meestal enkele uren later.",
    not: "Voorlopig met de hand gedraaid. Waarschuwingsmails zijn nog niet gebouwd en er is geen openbare plek voor logboeken. Geen compliancecheck.",
    price: "9,95 of 29,95 euro per maand, inclusief btw",
    cta: { label: "Bekijk het aanbod", href: "/signal-log" },
  },
  {
    id: "security",
    status: "op aanvraag",
    name: "Beveiligingsonderzoek",
    line: "Wij lezen jouw pijplijnen en automatisering zoals een aanvaller dat doet, en vertellen wat we vinden.",
    gets: "Een schriftelijk rapport, privé aan jou geleverd, met het bewijs dat we per vondst hebben, een ernst en wat nog open staat.",
    verify: "Ons gepubliceerde GitHub-advisory, waarin ons account als melder staat, is een voorbeeld dat je zelf kunt openen.",
    not: "Geen penetratietest van je productiesystemen en geen certificaat.",
    price: "Na een gesprek. Nog geen vast aanbod.",
    cta: { label: "Bekijk ons dossier", href: "/security" },
  },
  {
    id: "scan",
    status: "per scan betalen",
    name: "Smart-contractscan",
    line: "Een beveiligingsscan van smart-contractcode: hij geeft mogelijke zwakke plekken terug om na te lopen. Hij vindt een deel van wat een menselijke audit vindt, en we publiceren hoeveel.",
    gets: "Een rapport met door AI bedachte hypotheses over de Solidity-code in een openbare GitHub-repository, om met de hand na te lopen. Je betaalt per scan in USDC via x402.",
    verify: "Het openbare scorebord noemt elke run. Versie 3.1 vond 8 van de 105 bekende bevindingen in zijn eerste 15 hypotheses, op wedstrijden die niet meer geheim waren, na twee wijzigingen tegelijk. In de verzegelde run vonden de eerdere versies er 1 en 4. De regel van de verzegelde run stond vooraf openbaar; voor 3.1 staat hij alleen in onze eigen notities.",
    not: "Geen audit en geen garantie dat een contract veilig is. Wat hij vindt en mist staat op het openbare scorebord.",
    price: "Snelle scan 1 dollar (de eerste 15 hypotheses), volledige scan 5 dollar, betaald in USDC op Base via x402. Betaaladres: de officiële bronnen.",
    cta: { label: "Open het scorebord", href: "/scoreboard" },
  },
  {
    id: "tools",
    status: "open source",
    name: "Open-sourcegereedschap",
    line: "Draai het zelf, dan hoef je ons niet te geloven.",
    gets: "capacity-attest, agent-receipt-verify, x402-lint en muraqib-agent-watch, plus MCP-servers.",
    verify: "De code staat op GitHub en de pakketten staan op npm.",
    not: "Geen score, geen oordeel, geen eigen token.",
    price: "Gratis",
    cta: { label: "Bekijk het gereedschap", href: "/tools" },
  },
  {
    id: "talk",
    status: "een gesprek",
    name: "Praat met Ahmed",
    line: "Begin met een gesprek over waar jij staat.",
    gets: "Een gesprek over beveiliging, de Europese Cyber Resilience Act of betalingen tussen agenten.",
    verify: "Vraag naar onze metingen. We laten zien hoe elke meting is gemaakt.",
    not: "Geen juridisch advies, geen certificaat en geen belofte van een uitkomst.",
    price: "Vraag het. Nog geen vast aanbod.",
    cta: { label: "Schrijf Ahmed", href: `mailto:${CONTACT_EMAIL}?subject=Een%20gesprek%20met%20Ahmed` },
  },
];

export const OFFERS: Record<Locale, Offer[]> = { en: OFFERS_EN, nl: OFFERS_NL };

export interface HomeCopy {
  hero: {
    eyebrow: string;
    h1a: string;
    h1b: string;
    body: string;
    ctaPrimary: string;
    ctaSecondary: string;
    chips: Array<{ value: string; label: string; href: string }>;
  };
  offers: { heading: string; intro: string; get: string; verify: string; not: string; price: string };
  check: { heading: string; body: string; placeholder: string; button: string; fine: string; label: string };
  proof: { heading: string; body: string; sealed: string; scoreboard: string };
  brothers: {
    heading: string;
    body: string;
    abdellah: { name: string; role: string; line: string };
    ahmed: { name: string; role: string; line: string };
    contact: string;
  };
  security: {
    heading: string;
    intro: string;
    items: Array<{ chip: string; text: string; href?: string; linkLabel?: string }>;
    more: string;
  };
  unknowns: { heading: string; intro: string; scan: string; pinned: string; warnings: string; scoreboard: string };
}

export const HOME: Record<Locale, HomeCopy> = {
  en: {
    hero: {
      eyebrow: "tokenizen.nl · Eindhoven",
      h1a: "Everyone makes claims.",
      h1b: "We make ours checkable.",
      body: "Security research, free checks and a log with a timestamp outside our control. We do not promise that your contract is safe. We show what we checked, with our misses next to it and numbers you can recompute yourself. Each number below links to how we got it, with the commands and the limits.",
      ctaPrimary: "Check your repository",
      ctaSecondary: "See what we offer",
      chips: [
        { value: "0 of 600", label: "live x402 resources in our October sample sign a receipt. Ours does, and you can verify it", href: "/notes/zero-of-600-x402-services-sign-a-receipt" },
        { value: "On-chain", label: "one real AI-agent payment on Base mainnet, with the commands to check it yourself", href: "/notes/check-pay-prove" },
        { value: "109", label: "public repositories in ten EU countries measured on eight security signals, our misses published", href: "/notes/eight-security-signals-109-repositories" },
      ],
    },
    offers: {
      heading: "Six things we do. What you get, how you check it, what it is not.",
      intro: "Each one comes with the way to check it and with its limit, on the same card. Security research and talking to Ahmed have no fixed offer yet.",
      get: "What you get",
      verify: "How you check it",
      not: "What it is not",
      price: "Price",
    },
    check: {
      heading: "Now check yours.",
      body: "Type owner/name of a public GitHub repository and see which of the eight signals are visible in it.",
      placeholder: "owner/name",
      button: "Check it",
      fine: "We read public pages only and store no report.",
      label: "Public GitHub repository",
    },
    proof: {
      heading: "Down to one line.",
      body: "This is how a log works that you can verify without trusting us. Every line holds the hash of the line before it, so changing, removing or reordering an old line shows to anyone who kept an earlier head of the log. Our Signal log works this way, and the timestamp of its head comes from OpenTimestamps, which is outside our control.",
      sealed: "Our smart contract scan was tested on a sealed set of audit contests. The set was committed by its hash before the run, so anyone can recompute that hash. The new version did not meet the bar we set beforehand.",
      scoreboard: "See the scoreboard",
    },
    brothers: {
      heading: "Two brothers, one company.",
      body: "We are AO Services in Eindhoven. Abdellah does everything technical: the building and the measuring. Ahmed does the consultancy, the communication and the conversations with people.",
      abdellah: { name: "Abdellah Ouadoudi", role: "Technology and measurements", line: "Builds the tools, runs the measurements, finds the leaks." },
      ahmed: { name: "Ahmed Ouadoudi", role: "Consultancy and communication", line: "Talks with people, explains our work and listens to what you need." },
      contact: "Write to us",
    },
    security: {
      heading: "Security research. What we can show, and what we cannot yet.",
      intro: "Some of what we found we may show, some we may not, and some will follow when the fix is out.",
      items: [
        {
          chip: "public",
          text: "A published GitHub security advisory, severity High, with our account credited as reporter.",
          href: ADVISORY_URL,
          linkLabel: "Open the advisory",
        },
        {
          chip: "our own records",
          text: "Reports confirmed or assessed by two known technology companies. At two more, the report was received or fixed without an answer to us. The names stay private.",
        },
        {
          chip: "planned",
          text: "Planned, not live yet: each report we file would get a date and a fingerprint on a public list, without its content. When the fix is out we would publish the dossier, and anyone could see that we had it on that date.",
        },
      ],
      more: "The whole record",
    },
    unknowns: {
      heading: "What we do not know, and where we missed.",
      intro: "The numbers that do not flatter us sit on the same page as the ones that do.",
      scan: "Our smart contract scan found 8 of 105 known findings in its first 15 hypotheses, on contests that were no longer secret, after two changes at once. It missed 97. In the sealed run the earlier versions found 1 and 4.",
      pinned: "In 29 of the 109 repositories we could not tell whether a lockfile is present, so they count neither way.",
      warnings: "The email warnings of the Signal log are not built yet.",
      scoreboard: "Scoreboard with every run",
    },
  },
  nl: {
    hero: {
      eyebrow: "tokenizen.nl · Eindhoven",
      h1a: "Iedereen beweert wat.",
      h1b: "Bij ons kun je het nameten.",
      body: "Beveiligingsonderzoek, gratis checks en een logboek met een tijdstempel buiten onze controle. Wij beloven niet dat je contract veilig is. Wij laten zien wat we gecontroleerd hebben, met onze missers erbij en cijfers die je zelf kunt nareken. Elk getal hieronder linkt naar hoe we eraan kwamen, met de commando's en de grenzen.",
      ctaPrimary: "Check jouw repository",
      ctaSecondary: "Bekijk ons aanbod",
      chips: [
        { value: "0 van 600", label: "live x402-resources in onze steekproef van oktober ondertekenen een bonnetje. De onze wel, en je kunt het zelf nagaan", href: "/notes/zero-of-600-x402-services-sign-a-receipt" },
        { value: "Op de keten", label: "één echte betaling van een AI-agent op Base mainnet, met de commando's om het zelf na te gaan", href: "/notes/check-pay-prove" },
        { value: "109", label: "openbare repositories in tien EU-landen gemeten op acht beveiligingssignalen, onze missers gepubliceerd", href: "/notes/eight-security-signals-109-repositories" },
      ],
    },
    offers: {
      heading: "Zes dingen die wij doen. Wat je krijgt, hoe je het nagaat, wat het niet is.",
      intro: "Bij elk staat de manier om het na te gaan en de grens ervan, op dezelfde kaart. Beveiligingsonderzoek en praten met Ahmed hebben nog geen vast aanbod.",
      get: "Wat je krijgt",
      verify: "Zo ga je het na",
      not: "Wat het niet is",
      price: "Prijs",
    },
    check: {
      heading: "Check nu de jouwe.",
      body: "Typ owner/name van een openbare GitHub-repository en zie welke van de acht signalen erin zichtbaar zijn.",
      placeholder: "owner/name",
      button: "Check",
      fine: "We lezen alleen openbare pagina's en bewaren geen rapport.",
      label: "Openbare GitHub-repository",
    },
    proof: {
      heading: "Tot op één regel.",
      body: "Zo werkt een logboek dat je kunt controleren zonder ons te vertrouwen. Elke regel bevat de hash van de regel ervoor, dus een oude regel veranderen, weghalen of verplaatsen valt op voor wie een eerdere kop van het logboek heeft bewaard. Ons Signal log werkt zo, en de tijdstempel van de kop komt van OpenTimestamps, dat buiten onze controle staat.",
      sealed: "Onze smart-contractscan is getest op een verzegelde set auditwedstrijden. De set is vooraf met zijn hash vastgelegd, dus iedereen kan die hash zelf narekenen. De nieuwe versie haalde de lat niet die we vooraf zetten.",
      scoreboard: "Bekijk het scorebord",
    },
    brothers: {
      heading: "Twee broers, één bedrijf.",
      body: "Wij zijn AO Services in Eindhoven. Abdellah doet alles wat technisch is: het bouwen en het meten. Ahmed doet de consultancy, de communicatie en de gesprekken met mensen.",
      abdellah: { name: "Abdellah Ouadoudi", role: "Techniek en metingen", line: "Bouwt het gereedschap, draait de metingen, vindt de lekken." },
      ahmed: { name: "Ahmed Ouadoudi", role: "Consultancy en communicatie", line: "Praat met mensen, legt ons werk uit en luistert naar wat jij nodig hebt." },
      contact: "Schrijf ons",
    },
    security: {
      heading: "Beveiligingsonderzoek. Wat we kunnen laten zien, en wat nog niet.",
      intro: "Een deel van wat we vonden mogen we laten zien, een deel niet, en een deel volgt zodra de reparatie er is.",
      items: [
        {
          chip: "openbaar",
          text: "Een gepubliceerd GitHub-beveiligingsadvisory, ernst High, waarin ons account als melder staat.",
          href: ADVISORY_URL,
          linkLabel: "Open het advisory",
        },
        {
          chip: "eigen administratie",
          text: "Meldingen die zijn bevestigd of beoordeeld door twee bekende technologiebedrijven. Bij twee andere is de melding ontvangen of zonder antwoord aan ons gerepareerd. De namen blijven privé.",
        },
        {
          chip: "gepland",
          text: "Gepland, nog niet live: elke melding die we doen krijgt dan een datum en een vingerafdruk op een openbare lijst, zonder de inhoud. Zodra de reparatie er is publiceren we het dossier, en iedereen kan dan zien dat we het op die datum al hadden.",
        },
      ],
      more: "Het hele dossier",
    },
    unknowns: {
      heading: "Wat we niet weten, en waar we misten.",
      intro: "De cijfers die ons niet flatteren staan op dezelfde pagina als de cijfers die dat wel doen.",
      scan: "Onze smart-contractscan vond 8 van de 105 bekende bevindingen in zijn eerste 15 hypotheses, op wedstrijden die niet meer geheim waren, na twee wijzigingen tegelijk. Hij miste er 97. In de verzegelde run vonden de eerdere versies er 1 en 4.",
      pinned: "Bij 29 van de 109 repositories konden we niet zien of er een lockfile is, dus die tellen naar geen van beide kanten mee.",
      warnings: "De waarschuwingsmails van het Signal log zijn nog niet gebouwd.",
      scoreboard: "Scorebord met elke run",
    },
  },
};

export interface Pillar {
  id: "betrouwbaarheid" | "techniek" | "uniek";
  label: string;
  title: string;
  points: string[];
}

export interface CinemaCopy {
  offers: { heading: string; intro: string; open: string };
  tilePrice: Record<Offer["id"], string>;
  /** The homepage names no person; the conversation card is called by what it is. The offer page keeps its own name. */
  tileName: Partial<Record<Offer["id"], string>>;
  pillars: Pillar[];
  mission: { label: string; mission: { label: string; title: string; text: string }; vision: { label: string; title: string; text: string } };
  talk: { heading: string; body: string; button: string; secondary: string; subject: string };
  note: string;
}

// The pillars say what the visitor can check. Every point repeats something that is on a page of ours with its source; nothing new is claimed here.
export const CINEMA: Record<Locale, CinemaCopy> = {
  en: {
    offers: {
      heading: "What we do.",
      intro: "Six things. Each has its own page with what you get, how you check it and what it is not.",
      open: "Open",
    },
    tilePrice: {
      checks: "Free",
      "signal-log": "9.95 or 29.95 euro per month, VAT included",
      security: "No fixed offer yet",
      scan: "From 1 dollar per scan",
      tools: "Free",
      talk: "No fixed offer yet",
    },
    tileName: { scan: "Security scan for smart contracts", talk: "Talk to us" },
    pillars: [
      {
        id: "betrouwbaarheid",
        label: "Reliability",
        title: "Our numbers say where to check them.",
        points: [
          "Each result lists the public pages that were asked for, and whether that worked.",
          "The timestamp on a Signal log can be checked without us.",
          "Our misses sit on the same page as our hits.",
        ],
      },
      {
        id: "techniek",
        label: "Technique",
        title: "We measure first and claim after.",
        points: [
          "Eight security signals, measured over 109 public repositories on 28 October 2026. The method is in a published note.",
          "A log in which every line holds the hash of the line before it, with a timestamp from OpenTimestamps.",
          "Open-source tools on GitHub and npm: capacity-attest, agent-receipt-verify, x402-lint and muraqib-agent-watch.",
        ],
      },
      {
        id: "uniek",
        label: "What sets us apart",
        title: "Dates you can check without us.",
        points: [
          "The timestamp of a Signal log comes from OpenTimestamps, which is outside our control, and shows that the log existed by that date.",
          "We publish what our scan missed: 97 of 105 known findings in its run on eight audit contests.",
        ],
      },
    ],
    mission: {
      label: "Mission and vision",
      mission: {
        label: "Mission",
        title: "Make security claims that anyone can check.",
        text: "We build checks, publish how they were made and publish where they fail.",
      },
      vision: {
        label: "Vision",
        title: "A web where every claim arrives with the way to check it.",
        text: "Software, agents and payments that prove what they say, so that trust is something you measure.",
      },
    },
    talk: {
      heading: "Talk to us.",
      body: "Start with a conversation about where you stand. Ask for our measurements and we show how each one was made.",
      button: "Write to us",
      secondary: "Who we are",
      subject: "A conversation",
    },
    note: "The photographs on this page are illustrations made with AI.",
  },
  nl: {
    offers: {
      heading: "Wat wij doen.",
      intro: "Zes dingen. Elk heeft een eigen pagina met wat je krijgt, hoe je het nagaat en wat het niet is.",
      open: "Open",
    },
    tilePrice: {
      checks: "Gratis",
      "signal-log": "9,95 of 29,95 euro per maand, inclusief btw",
      security: "Nog geen vast aanbod",
      scan: "Vanaf 1 dollar per scan",
      tools: "Gratis",
      talk: "Nog geen vast aanbod",
    },
    tileName: { scan: "Beveiligingsscan voor smart contracts", talk: "Praat met ons" },
    pillars: [
      {
        id: "betrouwbaarheid",
        label: "Betrouwbaarheid",
        title: "Bij onze getallen staat waar je ze nagaat.",
        points: [
          "Elke uitslag noemt de openbare pagina's die zijn opgevraagd, en of dat lukte.",
          "De tijdstempel op een Signal log is zonder ons te controleren.",
          "Onze missers staan op dezelfde pagina als onze successen.",
        ],
      },
      {
        id: "techniek",
        label: "Techniek",
        title: "Eerst meten, dan pas iets beweren.",
        points: [
          "Acht beveiligingssignalen, gemeten bij 109 openbare repositories op 28 oktober 2026. De methode staat in een gepubliceerde notitie.",
          "Een logboek waarin elke regel de hash van de regel ervoor bevat, met een tijdstempel van OpenTimestamps.",
          "Open-sourcegereedschap op GitHub en npm: capacity-attest, agent-receipt-verify, x402-lint en muraqib-agent-watch.",
        ],
      },
      {
        id: "uniek",
        label: "Wat ons onderscheidt",
        title: "Datums die je zonder ons kunt nagaan.",
        points: [
          "De tijdstempel van een Signal log komt van OpenTimestamps, dat buiten onze controle staat, en laat zien dat het logboek op die datum al bestond.",
          "Wij publiceren wat onze scan miste: 97 van de 105 bekende bevindingen in de run op acht auditwedstrijden.",
        ],
      },
    ],
    mission: {
      label: "Missie en visie",
      mission: {
        label: "Missie",
        title: "Beveiligingsclaims zo maken dat iedereen ze kan nagaan.",
        text: "Wij bouwen checks, publiceren hoe ze zijn gemaakt en publiceren waar ze falen.",
      },
      vision: {
        label: "Visie",
        title: "Een web waarin elke bewering komt met de manier om haar na te gaan.",
        text: "Software, agenten en betalingen die bewijzen wat ze zeggen, zodat vertrouwen iets is wat je meet.",
      },
    },
    talk: {
      heading: "Praat met ons.",
      body: "Begin met een gesprek over waar jij staat. Vraag naar onze metingen en we laten zien hoe elke meting is gemaakt.",
      button: "Schrijf ons",
      secondary: "Wie wij zijn",
      subject: "Een gesprek",
    },
    note: "De foto's op deze pagina zijn illustraties, met AI gemaakt.",
  },
};
