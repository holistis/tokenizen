import type { ReactNode } from "react";
import { ArrowUpRight, Mail } from "lucide-react";

import { CinemaPage } from "@/components/home/cinema";
import { Brothers } from "@/components/home/lower-sections";
import { ChainDemo } from "@/components/matrix/chain-demo";
import { MeasureGrids } from "@/components/matrix/measure-grid";
import { MissStrip } from "@/components/matrix/miss-strip";
import { useMeta } from "@/components/pages/legal-page";
import { ADVISORY_URL, CONTACT_EMAIL, GITHUB_URL, HOME, type Locale } from "@/data/home-copy";
import { Problem } from "@/components/sections/problem";
import { WhyNow } from "@/components/sections/why-now";
import { Product } from "@/components/sections/product";
import { SecondPillar } from "@/components/sections/second-pillar";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Boundaries } from "@/components/sections/boundaries";
import { OpenSource } from "@/components/sections/open-source";
import { Status } from "@/components/sections/status";
import { useLocale } from "@/i18n/context";
import { localePath } from "@/lib/locale-paths";

// The offer pages share one frame: a photograph with the promise on a pane of glass, then the same blocks as the cards on the homepage
// (what you get, how you check it, what it is not), then the way to start. Every page exists in English and in Dutch.

function useLang(): Locale {
  return useLocale().locale === "nl" ? "nl" : "en";
}

export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-white/10 pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[14rem_1fr] lg:gap-8">
      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.15em] text-[color:var(--glow)]">{label}</h2>
      <div className="max-w-3xl space-y-4 text-base leading-relaxed text-[color:var(--soft)]">{children}</div>
    </section>
  );
}

function LinkOut({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-[color:var(--glow)] underline-offset-2 hover:underline">
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function Contact({ subject, label }: { subject: string; label: string }) {
  return (
    <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`} className="btn-glow">
      <Mail className="size-4" aria-hidden="true" />
      {label}
    </a>
  );
}

/** The page frame of an offer: the meta tags, the photograph and glass, and the blocks below. */
function OfferFrame({
  image,
  chip,
  title,
  lead,
  metaTitle,
  metaDescription,
  children,
}: {
  image: string;
  chip: string;
  title: string;
  lead: string;
  metaTitle: string;
  metaDescription: string;
  children: ReactNode;
}) {
  useMeta(metaTitle, metaDescription);
  return (
    <CinemaPage image={image} chip={chip} title={title} lead={lead}>
      <div className="space-y-10">{children}</div>
    </CinemaPage>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Free checks

const CHECKS = {
  en: {
    chip: "free",
    title: "Free checks",
    lead: "Three checks you can run in a minute. Each one says what it looked at, and each one says what it cannot tell you.",
    metaTitle: "Free checks | tokenizen",
    metaDescription: "Free checks of a public GitHub repository, an x402 payment endpoint and the ownership of an endpoint.",
    three: "The three checks",
    open: "Open the check",
    tools: [
      {
        href: "/cra-check",
        name: "Eight security signals in a GitHub repository",
        text: "Name a public repository and see which of eight selected signals, related to topics in the EU Cyber Resilience Act, are visible in it: a security policy that names a contact, an SBOM, proof of where releases come from, a lockfile, automatic updates, a security scan, recent maintenance and a licence. It reads public pages only and stores no report.",
      },
      {
        href: "/x402-check",
        name: "Free x402 endpoint check",
        text: "Paste the URL of an x402 route you run and see, from one anonymous request that never pays, whether the payment request passes the official buyer schema and how far up the receipt ladder it gets. Nothing is stored.",
      },
      {
        href: "/check",
        name: "Prove you own an endpoint",
        text: "A free, live check that an endpoint is yours, without an account.",
      },
    ],
    measured: "What we measured",
    measuredText:
      "109 public repositories, eight signals each, measured on 28 October 2026. The grids come from rule set 2026-10-28.6; the check now runs a newer one that also reads other CI systems, so a new run can give other numbers.",
    log: "How a log you can verify works",
    not: "What they are not",
    notText:
      "The repository check is not a conformity assessment and not legal advice: eight signals are a selection and not one per legal requirement. A signal that is not visible may exist elsewhere.",
    weekly: "Want it every week",
    weeklyText: "The Signal log runs the repository check weekly and writes each result into a log with a timestamp you can check without us.",
    weeklyLink: "See the Signal log",
  },
  nl: {
    chip: "gratis",
    title: "Gratis checks",
    lead: "Drie checks die je in een minuut draait. Elke check zegt waar hij naar keek, en wat hij je niet kan vertellen.",
    metaTitle: "Gratis checks | tokenizen",
    metaDescription: "Gratis checks van een openbare GitHub-repository, een x402-betaalpunt en het eigenaarschap van een endpoint.",
    three: "De drie checks",
    open: "Open de check",
    tools: [
      {
        href: "/cra-check",
        name: "Acht beveiligingssignalen in een GitHub-repository",
        text: "Noem een openbare repository en zie welke van acht gekozen signalen, gerelateerd aan onderwerpen uit de Europese Cyber Resilience Act, erin zichtbaar zijn: een beveiligingsbeleid dat een contact noemt, een SBOM, bewijs waar releases vandaan komen, een lockfile, automatische updates, een beveiligingsscan, recent onderhoud en een licentie. De check leest alleen openbare pagina's en bewaart geen rapport.",
      },
      {
        href: "/x402-check",
        name: "Gratis x402-endpointcheck",
        text: "Plak de URL van een x402-route die je zelf draait en zie, na één anoniem verzoek dat nooit betaalt, of het betaalverzoek door het officiële koperschema komt en hoe hoog het op de receipt-ladder komt. Er wordt niets bewaard.",
      },
      {
        href: "/check",
        name: "Bewijs dat een endpoint van jou is",
        text: "Een gratis, live check dat een endpoint van jou is, zonder account.",
      },
    ],
    measured: "Wat we maten",
    measuredText:
      "109 openbare repositories, acht signalen per repository, gemeten op 28 oktober 2026. De rasters komen uit regelversie 2026-10-28.6; de check draait nu op een nieuwere die ook andere CI-systemen leest, dus een nieuwe run kan andere getallen geven.",
    log: "Zo werkt een logboek dat je kunt controleren",
    not: "Wat ze niet zijn",
    notText:
      "De repositorycheck is geen conformiteitsbeoordeling en geen juridisch advies: acht signalen zijn een selectie en niet een per wettelijke eis. Een signaal dat niet zichtbaar is, kan elders wel bestaan.",
    weekly: "Elke week",
    weeklyText: "Het Signal log draait de repositorycheck elke week en schrijft elke uitslag in een logboek met een tijdstempel die je zonder ons kunt controleren.",
    weeklyLink: "Bekijk het Signal log",
  },
};

export function ChecksPage() {
  const loc = useLang();
  const c = CHECKS[loc];
  const to = (rest: string) => localePath(loc, rest);
  return (
    <OfferFrame image="lens" chip={c.chip} title={c.title} lead={c.lead} metaTitle={c.metaTitle} metaDescription={c.metaDescription}>
      <Block label={c.three}>
        <ul className="space-y-6">
          {c.tools.map((t) => (
            <li key={t.href}>
              <h3 className="font-display text-2xl text-white">{t.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--soft)]">{t.text}</p>
              <p className="mt-3">
                <LinkOut href={to(t.href)}>{c.open}</LinkOut>
              </p>
            </li>
          ))}
        </ul>
      </Block>
      <Block label={c.measured}>
        <p>{c.measuredText}</p>
        <div className="panel rounded-xl p-4 md:p-6">
          <MeasureGrids locale={loc} />
        </div>
      </Block>
      <Block label={c.log}>
        <p>{HOME[loc].proof.body}</p>
        <ChainDemo locale={loc} />
        <p>
          {HOME[loc].proof.sealed} <LinkOut href={to("/scoreboard")}>{HOME[loc].proof.scoreboard}</LinkOut>
        </p>
      </Block>
      <Block label={c.not}>
        <p>{c.notText}</p>
      </Block>
      <Block label={c.weekly}>
        <p>{c.weeklyText}</p>
        <p>
          <LinkOut href={to("/signal-log")}>{c.weeklyLink}</LinkOut>
        </p>
      </Block>
    </OfferFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Security research

const SECURITY = {
  en: {
    chip: "on request",
    title: "Security research. What we can show, and what we cannot yet.",
    lead: "We find the leaks. Some of what we found we may show, some we may not, and some will follow when the fix is out.",
    metaTitle: "Security research | tokenizen",
    metaDescription: "Security research by two brothers in Eindhoven: a published High advisory, our own record including what was rejected, and how we will show the rest.",
    doLabel: "What we do",
    doText:
      "We read the pipelines and automation of software projects the way an attacker does: the files that run when someone opens an issue or a pull request, and the credentials those runs can reach. When we find a hole we report it privately to the maintainers, and we tell you what we found if you ask us to look at yours.",
    publicLabel: "The public example",
    publicText:
      "A published GitHub security advisory with severity High: prompt injection in an issue automation workflow could expose workflow credentials. Our account is credited as the reporter. The severity is the one in the published advisory, set by the project, and it has no CVE. It opens without a login.",
    advisory: "Open the advisory",
    recordLabel: "The whole record",
    recordText:
      "From our own records: we filed 81 reports so far. The receiver confirmed 5, from two known technology companies and three open-source projects, one of them the advisory above. For 2 more the receiver acknowledged the report or fixed it without answering us. The rest were rejected, were duplicates of earlier reports, were withdrawn by us because our analysis was wrong, have had no answer, or are still waiting. The names stay private.",
    recordNote: "These are our own records. They are not an outside audit of us.",
    sealedLabel: "Sealed dossiers (planned)",
    sealedText:
      "Reports under embargo cannot be shown. We plan to put each one on a public list with its date and a fingerprint, without its content. When the fix is out we publish the dossier, and anyone can recompute the fingerprint and see that we had it on that date. It is the same idea as our Signal log. It is not live yet.",
    notLabel: "What it is not",
    notText: "Not a penetration test of your production systems and not a certificate. You get a written report, privately, with the evidence we have for each finding and what is still open.",
    startLabel: "Start",
    subject: "Security research",
    write: "Write to us",
  },
  nl: {
    chip: "op aanvraag",
    title: "Beveiligingsonderzoek. Wat we kunnen laten zien, en wat nog niet.",
    lead: "Wij vinden de lekken. Een deel van wat we vonden mogen we laten zien, een deel niet, en een deel volgt zodra de reparatie er is.",
    metaTitle: "Beveiligingsonderzoek | tokenizen",
    metaDescription: "Beveiligingsonderzoek door twee broers in Eindhoven: een gepubliceerd advisory met ernst High, ons eigen dossier inclusief wat is afgewezen, en hoe we de rest gaan laten zien.",
    doLabel: "Wat we doen",
    doText:
      "Wij lezen de pijplijnen en automatisering van softwareprojecten zoals een aanvaller dat doet: de bestanden die draaien als iemand een issue of pull request opent, en de inloggegevens die die runs kunnen bereiken. Vinden we een gat, dan melden we dat privé aan de beheerders, en als je ons vraagt naar het jouwe te kijken, vertellen we je wat we vinden.",
    publicLabel: "Het openbare voorbeeld",
    publicText:
      "Een gepubliceerd GitHub-beveiligingsadvisory met ernst High: promptinjectie in een workflow die issues afhandelt kon inloggegevens van de workflow blootleggen. Ons account staat als melder vermeld. De ernst is die uit het gepubliceerde advisory, bepaald door het project, en er is geen CVE. Het opent zonder login.",
    advisory: "Open het advisory",
    recordLabel: "Het hele dossier",
    recordText:
      "Uit onze eigen administratie: we deden tot nu toe 81 meldingen. De ontvanger bevestigde er 5, van twee bekende technologiebedrijven en drie open-sourceprojecten, waaronder het advisory hierboven. Bij 2 andere erkende de ontvanger de melding of repareerde hij het zonder ons te antwoorden. De rest werd afgewezen, bleek een duplicaat van eerdere meldingen, is door ons ingetrokken omdat onze analyse niet klopte, kreeg geen antwoord of wacht nog. De namen blijven privé.",
    recordNote: "Dit is onze eigen administratie. Het is geen audit van ons door een buitenstaander.",
    sealedLabel: "Verzegelde dossiers (gepland)",
    sealedText:
      "Meldingen onder embargo kunnen we niet tonen. We willen elk ervan op een openbare lijst zetten met zijn datum en een vingerafdruk, zonder de inhoud. Zodra de reparatie er is publiceren we het dossier, en iedereen kan de vingerafdruk narekenen en zien dat we het op die datum al hadden. Het is hetzelfde idee als ons Signal log. Het is nog niet live.",
    notLabel: "Wat het niet is",
    notText: "Geen penetratietest van je productiesystemen en geen certificaat. Je krijgt privé een schriftelijk rapport, met het bewijs dat we per vondst hebben en wat nog open staat.",
    startLabel: "Start",
    subject: "Beveiligingsonderzoek",
    write: "Schrijf ons",
  },
};

export function SecurityPage() {
  const loc = useLang();
  const c = SECURITY[loc];
  return (
    <OfferFrame image="kluisdeur" chip={c.chip} title={c.title} lead={c.lead} metaTitle={c.metaTitle} metaDescription={c.metaDescription}>
      <Block label={c.doLabel}>
        <p>{c.doText}</p>
      </Block>
      <Block label={c.publicLabel}>
        <p>{c.publicText}</p>
        <p>
          <LinkOut href={ADVISORY_URL}>{c.advisory}</LinkOut>
        </p>
      </Block>
      <Block label={c.recordLabel}>
        <p>{c.recordText}</p>
        <p className="text-sm text-white/70">{c.recordNote}</p>
      </Block>
      <Block label={c.sealedLabel}>
        <p>{c.sealedText}</p>
      </Block>
      <Block label={c.notLabel}>
        <p>{c.notText}</p>
      </Block>
      <Block label={c.startLabel}>
        <Contact subject={c.subject} label={c.write} />
      </Block>
    </OfferFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Smart contract scan

const SCAN = {
  en: {
    chip: "pay per scan",
    title: "Smart contract scan",
    lead: "A scan that returns hypotheses for you to review. It finds some of what a human audit finds, and we publish how much.",
    metaTitle: "Smart contract scan | tokenizen",
    metaDescription: "A smart contract scan with a public scoreboard that includes what it missed. Pay per scan over x402.",
    getLabel: "What you get",
    getText:
      "A report of AI-generated hypotheses about your contract, to be reviewed by hand. The quick scan costs 1 dollar and returns the first 15 hypotheses; the full scan costs 5 dollars. You pay in USDC on Base over x402. A scan takes about 20 to 45 seconds.",
    sources: "Price and payment address: the official sources",
    checkLabel: "How you check it",
    checkText:
      "The public scoreboard lists every run. Where a row links to a pre-registration, the rule was written down in public before the run; for version 3.1 the rule is only in our own notes, so that row is less verifiable. Version 3.1 found 8 of 105 known findings in its first 15 hypotheses, on the same eight contests as our sealed run, which were no longer secret by then, after two changes at once. In the sealed run the earlier versions found 1 and 4. Each square below is one known finding.",
    strip: "8 of 105 known findings found, 97 missed",
    board: "Open the scoreboard",
    notLabel: "What it is not",
    notText: "It is not an audit and gives no guarantee that a contract is safe. It missed 97 of 105 known findings in that run.",
  },
  nl: {
    chip: "per scan betalen",
    title: "Smart-contractscan",
    lead: "Een scan die hypotheses teruggeeft om na te lopen. Hij vindt een deel van wat een menselijke audit vindt, en we publiceren hoeveel.",
    metaTitle: "Smart-contractscan | tokenizen",
    metaDescription: "Een smart-contractscan met een openbaar scorebord dat ook laat zien wat hij miste. Betaal per scan via x402.",
    getLabel: "Wat je krijgt",
    getText:
      "Een rapport met door AI bedachte hypotheses over jouw contract, om met de hand na te lopen. De snelle scan kost 1 dollar en geeft de eerste 15 hypotheses; de volledige scan kost 5 dollar. Je betaalt in USDC op Base via x402. Een scan duurt ongeveer 20 tot 45 seconden.",
    sources: "Prijs en betaaladres: de officiële bronnen",
    checkLabel: "Zo ga je het na",
    checkText:
      "Het openbare scorebord noemt elke run. Waar een rij naar een preregistratie verwijst, stond de regel vooraf openbaar opgeschreven; voor versie 3.1 staat de regel alleen in onze eigen notities, dus die rij is minder goed na te gaan. Versie 3.1 vond 8 van de 105 bekende bevindingen in zijn eerste 15 hypotheses, op dezelfde acht wedstrijden als onze verzegelde run, die toen niet meer geheim waren, na twee wijzigingen tegelijk. In de verzegelde run vonden de eerdere versies er 1 en 4. Elk vierkantje hieronder is één bekende bevinding.",
    strip: "8 van de 105 bekende bevindingen gevonden, 97 gemist",
    board: "Open het scorebord",
    notLabel: "Wat het niet is",
    notText: "Geen audit en geen garantie dat een contract veilig is. Hij miste 97 van de 105 bekende bevindingen in die run.",
  },
};

export function ScanPage() {
  const loc = useLang();
  const c = SCAN[loc];
  const to = (rest: string) => localePath(loc, rest);
  return (
    <OfferFrame image="prisma" chip={c.chip} title={c.title} lead={c.lead} metaTitle={c.metaTitle} metaDescription={c.metaDescription}>
      <Block label={c.getLabel}>
        <p>{c.getText}</p>
        <p>
          <LinkOut href={to("/notes/official-sources")}>{c.sources}</LinkOut>
        </p>
      </Block>
      <Block label={c.checkLabel}>
        <p>{c.checkText}</p>
        <MissStrip label={c.strip} />
        <p>
          <LinkOut href={to("/scoreboard")}>{c.board}</LinkOut>
        </p>
      </Block>
      <Block label={c.notLabel}>
        <p>{c.notText}</p>
      </Block>
    </OfferFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Open-source tools

const TOOLS = {
  en: {
    chip: "open source",
    title: "Open-source tools",
    lead: "Run them yourself, so you do not have to believe us.",
    metaTitle: "Open-source tools | tokenizen",
    metaDescription: "Open-source tools for payments between agents: capacity-attest, agent-receipt-verify, x402-lint and muraqib-agent-watch.",
    label: "The tools",
    npm: "On npm",
    code: "The code on GitHub",
    notLabel: "What they are not",
    notText: "No score, no verdict and no token of our own.",
    // The descriptions follow the package descriptions on npm (read 28 October 2026). The licences differ per tool, so none is promised here.
    tools: [
      {
        name: "capacity-attest",
        text: "After an x402 payment for capacity, the paying agent leaves a signed claim of what it says was delivered. A record, not a score and not a verdict.",
        href: "https://www.npmjs.com/package/capacity-attest",
      },
      {
        name: "agent-receipt-verify",
        text: "Checks x402 endpoint conformance before an agent pays, and links the receipt to its settlement.",
        href: "https://www.npmjs.com/package/agent-receipt-verify",
      },
      {
        name: "x402-lint",
        text: "Checks an x402 seller's own payment-required (402) response against the real client-side schema.",
        href: "https://www.npmjs.com/package/@alghanima/x402-lint",
      },
      {
        name: "muraqib-agent-watch",
        text: "A free, instant capability check for an MCP server: it lists what its tools say they can do (money, files, outbound messages, destructive actions, credentials) and flags tools that do not state their own safeguard.",
        href: "https://www.npmjs.com/package/muraqib-agent-watch",
      },
    ],
  },
  nl: {
    chip: "open source",
    title: "Open-sourcegereedschap",
    lead: "Draai het zelf, dan hoef je ons niet te geloven.",
    metaTitle: "Open-sourcegereedschap | tokenizen",
    metaDescription: "Open-sourcegereedschap voor betalingen tussen agenten: capacity-attest, agent-receipt-verify, x402-lint en muraqib-agent-watch.",
    label: "Het gereedschap",
    npm: "Op npm",
    code: "De code op GitHub",
    notLabel: "Wat het niet is",
    notText: "Geen score, geen oordeel en geen eigen token.",
    tools: [
      {
        name: "capacity-attest",
        text: "Na een x402-betaling voor capaciteit laat de betalende agent een ondertekende claim achter van wat volgens hem is geleverd. Een vastlegging, geen score en geen oordeel.",
        href: "https://www.npmjs.com/package/capacity-attest",
      },
      {
        name: "agent-receipt-verify",
        text: "Controleert of een x402-endpoint zich aan de regels houdt voordat een agent betaalt, en koppelt het bonnetje aan zijn afwikkeling.",
        href: "https://www.npmjs.com/package/agent-receipt-verify",
      },
      {
        name: "x402-lint",
        text: "Controleert het eigen payment-required-antwoord (402) van een x402-verkoper tegen het echte schema aan de koperskant.",
        href: "https://www.npmjs.com/package/@alghanima/x402-lint",
      },
      {
        name: "muraqib-agent-watch",
        text: "Een gratis, directe capaciteitscheck voor een MCP-server: hij laat zien wat de tools zeggen te kunnen (geld, bestanden, uitgaande berichten, destructieve acties, inloggegevens) en markeert tools die hun eigen beveiliging niet noemen.",
        href: "https://www.npmjs.com/package/muraqib-agent-watch",
      },
    ],
  },
};

export function ToolsPage() {
  const loc = useLang();
  const c = TOOLS[loc];
  return (
    <>
      <OfferFrame image="gereedschap" chip={c.chip} title={c.title} lead={c.lead} metaTitle={c.metaTitle} metaDescription={c.metaDescription}>
        <Block label={c.label}>
          <ul className="space-y-4">
            {c.tools.map((tool) => (
              <li key={tool.name}>
                <h3 className="font-mono text-sm text-white">{tool.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--soft)]">{tool.text}</p>
                <p className="mt-2">
                  <LinkOut href={tool.href}>{c.npm}</LinkOut>
                </p>
              </li>
            ))}
          </ul>
          <p>
            <LinkOut href={GITHUB_URL}>{c.code}</LinkOut>
          </p>
        </Block>
        <Block label={c.notLabel}>
          <p>{c.notText}</p>
        </Block>
      </OfferFrame>
      <div className="cinema">
        <Problem />
        <WhyNow />
        <Product />
        <SecondPillar />
        <HowItWorks />
        <Boundaries />
        <OpenSource />
        <Status />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A conversation

const TALK = {
  en: {
    chip: "a conversation",
    title: "Talk to Ahmed",
    lead: "Start with a conversation about where you stand.",
    metaTitle: "Talk to Ahmed | tokenizen",
    metaDescription: "A conversation about security, the EU Cyber Resilience Act or payments between agents, with Ahmed Ouadoudi of AO Services in Eindhoven.",
    getLabel: "What you get",
    getText: "A conversation about security, the EU Cyber Resilience Act or payments between agents, with the brother who does our consultancy and communication.",
    checkLabel: "How you check it",
    checkText: "Ask for our measurements. We show how each one was made and what it leaves out.",
    notLabel: "What it is not",
    notText: "No legal advice, no certificate and no promise of a result.",
    startLabel: "Start",
    subject: "A conversation with Ahmed",
    write: "Write to Ahmed",
  },
  nl: {
    chip: "een gesprek",
    title: "Praat met Ahmed",
    lead: "Begin met een gesprek over waar jij staat.",
    metaTitle: "Praat met Ahmed | tokenizen",
    metaDescription: "Een gesprek over beveiliging, de Europese Cyber Resilience Act of betalingen tussen agenten, met Ahmed Ouadoudi van AO Services in Eindhoven.",
    getLabel: "Wat je krijgt",
    getText: "Een gesprek over beveiliging, de Europese Cyber Resilience Act of betalingen tussen agenten, met de broer die onze consultancy en communicatie doet.",
    checkLabel: "Zo ga je het na",
    checkText: "Vraag naar onze metingen. We laten zien hoe elke meting is gemaakt en wat ze buiten beschouwing laat.",
    notLabel: "Wat het niet is",
    notText: "Geen juridisch advies, geen certificaat en geen belofte van een uitkomst.",
    startLabel: "Start",
    subject: "Een gesprek met Ahmed",
    write: "Schrijf Ahmed",
  },
};

export function ConsultancyPage() {
  const loc = useLang();
  const c = TALK[loc];
  return (
    <OfferFrame image="overleg" chip={c.chip} title={c.title} lead={c.lead} metaTitle={c.metaTitle} metaDescription={c.metaDescription}>
      <Block label={c.getLabel}>
        <p>{c.getText}</p>
      </Block>
      <Block label={c.checkLabel}>
        <p>{c.checkText}</p>
      </Block>
      <Block label={c.notLabel}>
        <p>{c.notText}</p>
      </Block>
      <Block label={c.startLabel}>
        <Contact subject={c.subject} label={c.write} />
      </Block>
    </OfferFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Who we are

const ABOUT = {
  en: {
    chip: "about us",
    metaTitle: "Two brothers, one company | tokenizen",
    metaDescription: "Abdellah and Ahmed Ouadoudi run AO Services in Eindhoven: security research, free checks, a log with a timestamp outside our control.",
    terms: "Terms",
    privacy: "Privacy",
  },
  nl: {
    chip: "over ons",
    metaTitle: "Twee broers, één bedrijf | tokenizen",
    metaDescription: "Abdellah en Ahmed Ouadoudi runnen AO Services in Eindhoven: beveiligingsonderzoek, gratis checks, een logboek met een tijdstempel buiten onze controle.",
    terms: "Voorwaarden",
    privacy: "Privacy",
  },
};

export function AboutPage() {
  const loc = useLang();
  const c = ABOUT[loc];
  const b = HOME[loc].brothers;
  useMeta(c.metaTitle, c.metaDescription);
  return (
    <CinemaPage image="werkbank" chip={c.chip} title={b.heading} lead={b.body}>
      <Brothers locale={loc} intro={false} />
      <section className="mt-12 border-t border-white/10 pt-8">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-[color:var(--soft)]">
          <p>
            AO Services, Lochemstraat 49, 5651 EL Eindhoven. KvK 86816632. {loc === "nl" ? "BTW" : "VAT"} NL004319767B61.{" "}
            <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            {c.terms}:{" "}
            <a className="underline underline-offset-2" href={localePath(loc, "/terms")}>
              tokenizen.nl/terms
            </a>
            . {c.privacy}:{" "}
            <a className="underline underline-offset-2" href={localePath(loc, "/privacy")}>
              tokenizen.nl/privacy
            </a>
            .
          </p>
        </div>
      </section>
    </CinemaPage>
  );
}
