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
    verify: "Each result lists what was read. The code is open, and the grids above are made with the same code.",
    not: "Not a conformity assessment and not legal advice. The signals are a selection, not one per legal requirement.",
    price: "Free",
    cta: { label: "Check a repository", href: "/cra-check" },
  },
  {
    id: "signal-log",
    status: "early access",
    name: "Signal log",
    line: "Every week the same eight signals for your repositories, written down so nobody can change them afterwards.",
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
    gets: "A written report with proof for every finding and a severity, delivered to you privately.",
    verify: "Our published GitHub advisory, with our account credited as reporter, is an example you can open yourself.",
    not: "Not a penetration test of your production systems and not a certificate.",
    price: "After a conversation",
    cta: { label: "See our record", href: "/security" },
  },
  {
    id: "scan",
    status: "pay per scan",
    name: "Smart contract scan",
    line: "A scan that returns hypotheses for you to review. It finds some of what a human audit finds, and we publish how much.",
    gets: "A report of AI-generated hypotheses about your contract, to be reviewed by hand. You pay per scan over x402.",
    verify: "The public scoreboard: version 3.1 found 8 of 105 known findings on a sealed set, in one run. Every row links to the rule written before the run.",
    not: "Not an audit and no guarantee that a contract is safe. It missed 97 of 105 in that run.",
    price: "Price and payment address: see the official sources",
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
    price: "Ask",
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
    verify: "Elke uitslag noemt wat er gelezen is. De code is open en de rasters hierboven zijn met dezelfde code gemaakt.",
    not: "Geen conformiteitsbeoordeling en geen juridisch advies. De signalen zijn een selectie, niet een per wettelijke eis.",
    price: "Gratis",
    cta: { label: "Check een repository", href: "/cra-check" },
  },
  {
    id: "signal-log",
    status: "early access",
    name: "Signal log",
    line: "Elke week dezelfde acht signalen van jouw repositories, vastgelegd zodat niemand ze achteraf kan veranderen.",
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
    gets: "Een schriftelijk rapport met bewijs bij elke vondst en een ernst, privé aan jou geleverd.",
    verify: "Ons gepubliceerde GitHub-advisory, waarin ons account als melder staat, is een voorbeeld dat je zelf kunt openen.",
    not: "Geen penetratietest van je productiesystemen en geen certificaat.",
    price: "Na een gesprek",
    cta: { label: "Bekijk ons dossier", href: "/security" },
  },
  {
    id: "scan",
    status: "per scan betalen",
    name: "Smart-contractscan",
    line: "Een scan die hypotheses teruggeeft om na te lopen. Hij vindt een deel van wat een menselijke audit vindt, en we publiceren hoeveel.",
    gets: "Een rapport met door AI bedachte hypotheses over jouw contract, om met de hand na te lopen. Je betaalt per scan via x402.",
    verify: "Het openbare scorebord: versie 3.1 vond 8 van de 105 bekende bevindingen op een verzegelde set, in een run. Elke rij linkt naar de regel die voor de run is opgeschreven.",
    not: "Geen audit en geen garantie dat een contract veilig is. Hij miste 97 van de 105 in die run.",
    price: "Prijs en betaaladres: zie de officiële bronnen",
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
    price: "Vraag het",
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
      eyebrow: "tokenizen.nl · Eindhoven · two brothers",
      h1a: "We find the leaks.",
      h1b: "We publish the numbers.",
      body: "Security research, free checks and a log where any change to the past shows. Below you see 109 public repositories, measured on eight security signals. We publish our misses too.",
      ctaPrimary: "Check your repository",
      ctaSecondary: "See what we offer",
      chips: [
        { value: "109", label: "public repositories measured", href: "/notes/eight-security-signals-109-repositories" },
        { value: "8", label: "signals per repository", href: "/cra-check" },
        { value: "1", label: "published High advisory, our account credited", href: ADVISORY_URL },
      ],
    },
    offers: {
      heading: "Six things we do. What you get, how you check it, what it is not.",
      intro: "Each one comes with the way to check it and with its limit, on the same card.",
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
      fine: "We read public pages only and store no report. The dashed square in every grid above is the place for yours.",
      label: "Public GitHub repository",
    },
    proof: {
      heading: "Down to one line.",
      body: "This is how a log works that you can verify without trusting us. Every line holds the hash of the line before it, so changing, removing or reordering an old line shows. Our Signal log works this way, and the timestamp of its head comes from OpenTimestamps, which is outside our control.",
      sealed: "Our smart contract scan was tested on a sealed set of audit contests. The set was committed by its hash before the run, so anyone can recompute that hash.",
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
      heading: "Security research, with receipts.",
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
          text: "Reports confirmed or triaged at four well-known technology companies. The names stay private.",
        },
        {
          chip: "planned",
          text: "Sealed dossiers: every report we file gets a date and a fingerprint on a public list, without its content. When the fix is out we publish the dossier, and anyone can see that we had it on that date.",
        },
      ],
      more: "The whole record",
    },
    unknowns: {
      heading: "What we do not know, and where we missed.",
      intro: "The numbers that do not flatter us sit on the same page as the ones that do.",
      scan: "Our smart contract scan found 8 of 105 known findings on a sealed set, in one run. It missed 97.",
      pinned: "In 29 of the 109 repositories we could not tell whether dependencies are pinned, so they count neither way.",
      warnings: "The email warnings of the Signal log are not built yet.",
      scoreboard: "Scoreboard with every run",
    },
  },
  nl: {
    hero: {
      eyebrow: "tokenizen.nl · Eindhoven · twee broers",
      h1a: "Wij vinden de lekken.",
      h1b: "Wij publiceren de cijfers.",
      body: "Beveiligingsonderzoek, gratis checks en een logboek waarin elke verandering van het verleden opvalt. Hieronder zie je 109 openbare repositories, gemeten op acht beveiligingssignalen. Onze missers publiceren we ook.",
      ctaPrimary: "Check jouw repository",
      ctaSecondary: "Bekijk ons aanbod",
      chips: [
        { value: "109", label: "openbare repositories gemeten", href: "/notes/eight-security-signals-109-repositories" },
        { value: "8", label: "signalen per repository", href: "/cra-check" },
        { value: "1", label: "gepubliceerd advisory met ernst High, ons account als melder", href: ADVISORY_URL },
      ],
    },
    offers: {
      heading: "Zes dingen die wij doen. Wat je krijgt, hoe je het nagaat, wat het niet is.",
      intro: "Bij elk staat de manier om het na te gaan en de grens ervan, op dezelfde kaart.",
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
      fine: "We lezen alleen openbare pagina's en bewaren geen rapport. Het gestippelde vierkant in elk raster hierboven is de plek voor de jouwe.",
      label: "Openbare GitHub-repository",
    },
    proof: {
      heading: "Tot op één regel.",
      body: "Zo werkt een logboek dat je kunt controleren zonder ons te vertrouwen. Elke regel bevat de hash van de regel ervoor, dus een oude regel veranderen, weghalen of verplaatsen valt op. Ons Signal log werkt zo, en de tijdstempel van de kop komt van OpenTimestamps, dat buiten onze controle staat.",
      sealed: "Onze smart-contractscan is getest op een verzegelde set auditwedstrijden. De set is vooraf met zijn hash vastgelegd, dus iedereen kan die hash zelf narekenen.",
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
      heading: "Beveiligingsonderzoek, met bewijs.",
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
          text: "Meldingen die zijn bevestigd of beoordeeld bij vier bekende technologiebedrijven. De namen blijven privé.",
        },
        {
          chip: "gepland",
          text: "Verzegelde dossiers: elke melding die we doen krijgt een datum en een vingerafdruk op een openbare lijst, zonder de inhoud. Zodra de reparatie er is publiceren we het dossier, en iedereen kan zien dat we het op die datum al hadden.",
        },
      ],
      more: "Het hele dossier",
    },
    unknowns: {
      heading: "Wat we niet weten, en waar we misten.",
      intro: "De cijfers die ons niet flatteren staan op dezelfde pagina als de cijfers die dat wel doen.",
      scan: "Onze smart-contractscan vond 8 van de 105 bekende bevindingen op een verzegelde set, in een run. Hij miste er 97.",
      pinned: "Bij 29 van de 109 repositories konden we niet zien of onderdelen zijn vastgezet, dus die tellen naar geen van beide kanten mee.",
      warnings: "De waarschuwingsmails van het Signal log zijn nog niet gebouwd.",
      scoreboard: "Scorebord met elke run",
    },
  },
};
