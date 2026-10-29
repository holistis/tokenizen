// cra-nl.ts: Dutch for the fixed sentences that packages/self-check-server/src/cra-repo-check.ts sends with a CRA check result.
//
// The server writes English only. This file is a client-side phrasebook so that a Dutch reader does not get English sentences in the
// part of the page that is read most. The rules, all enforced by cra-nl.test.ts:
//   - A phrase is keyed by the EXACT English sentence the server sends. Every key must occur verbatim in cra-repo-check.ts, so a server
//     change that makes a Dutch sentence stale fails a test instead of showing an old translation of a new sentence.
//   - Sentences with a part that varies (a path, a number of days) are patterns: the English skeleton with "${}" for any text and
//     "${n}" for a number. The skeleton must equal a template literal in cra-repo-check.ts.
//   - Anything that is not in the table or matched by a pattern is returned unchanged. Nothing is guessed, and the varying parts
//     (file names, release names, scanner names, licence ids) are shown exactly as the server sent them.
//   - A new fixed sentence in the server that has no entry here fails the coverage test.
// The server's own error sentences (cra-check.ts) are not part of this file.

/** The two tails the server appends to some explanations (cra-repo-check.ts: ELSEWHERE and SETTINGS). */
const ELSEWHERE_EN = " This only looks at the public repository and its GitHub releases; if you do this somewhere else, it is not visible here.";
const SETTINGS_EN = " A scan switched on in the repository settings (for example CodeQL default setup) leaves no file and is not visible from outside.";

/** The note the server puts behind the path of a policy file that belongs to the owner and not to this repository. */
const WHERE_EN = " (the policy GitHub shows for every repository of this owner)";
const WHERE_NL = " (het beleid dat GitHub toont voor alle repositories van deze eigenaar)";

/** The fixed sentences, English (exact) to Dutch. */
export const PHRASES: Readonly<Record<string, string>> = {
  // The topic of each signal.
  "Reporting channel and policy for vulnerabilities": "Meldkanaal en beleid voor kwetsbaarheden",
  "Software bill of materials (SBOM)": "Onderdelenlijst (SBOM)",
  "Provenance of releases": "Herkomst van releases",
  "Pinned dependencies": "Vastgezette afhankelijkheden",
  "Automatic updates of components": "Automatische updates van componenten",
  "Automated security tests": "Geautomatiseerde beveiligingstests",
  "Maintenance and updates": "Onderhoud en updates",
  Licence: "Licentie",

  // 1. Reporting channel and policy for vulnerabilities.
  "A security policy file is there and names a contact address or a reporting link.":
    "Er staat een bestand met beveiligingsbeleid en dat noemt een contactadres of een meldlink.",
  "The file tree of the repository, or the owner's .github repository where a policy for all repositories can live, could not be read completely, so we cannot say whether a policy is there.":
    "De lijst met bestanden van de repository, of de .github-repository van de eigenaar waar een beleid voor alle repositories kan staan, kon niet helemaal worden gelezen, dus we kunnen niet zeggen of er een beleid is.",
  "No SECURITY.md was found in the root, .github/ or docs/ of the repository (the places GitHub looks), nor in the owner's .github repository. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports. Private vulnerability reporting switched on in the settings is not visible from outside.":
    "Er is geen SECURITY.md gevonden in de hoofdmap, in .github/ of in docs/ van de repository (de plekken waar GitHub kijkt), en ook niet in de .github-repository van de eigenaar. De CRA vraagt om een beleid voor gecoördineerde bekendmaking van kwetsbaarheden en een contactadres voor meldingen. Privé melden van kwetsbaarheden dat in de instellingen is aangezet, is van buitenaf niet te zien.",
  "Name an email address in the file, or switch on private vulnerability reporting and link to how to use it.":
    "Noem een e-mailadres in het bestand, of zet het privé melden van kwetsbaarheden aan en verwijs naar hoe je dat gebruikt.",
  "Add a SECURITY.md with a contact address, what you answer and within what time, and which versions are supported.":
    "Voeg een SECURITY.md toe met een contactadres, wat je antwoordt en binnen welke tijd, en welke versies worden ondersteund.",

  // 2. Software bill of materials.
  "a workflow step generates an SBOM": "een workflowstap maakt een SBOM",
  "A machine-readable component list, or a step that makes one, is visible.":
    "Een machineleesbare lijst met componenten, of een stap die er een maakt, is zichtbaar.",
  "The file tree, the releases or the workflow files could not be read completely, so we cannot say whether an SBOM is there.":
    "De lijst met bestanden, de releases of de workflowbestanden konden niet helemaal worden gelezen, dus we kunnen niet zeggen of er een SBOM is.",
  "No SBOM file anywhere in the repository (every file was listed), none attached to the latest releases and no workflow step that produces one. The CRA asks for a machine-readable list of components, at least the top-level dependencies.":
    "Nergens in de repository staat een SBOM-bestand (elk bestand stond in de lijst), er hangt er geen aan de laatste releases en er is geen workflowstap die er een maakt. De CRA vraagt om een machineleesbare lijst met componenten, minstens de afhankelijkheden op het hoogste niveau.",
  "Let the build produce a CycloneDX or SPDX file and attach it to each release.":
    "Laat de build een CycloneDX- of SPDX-bestand maken en hang dat aan elke release.",

  // 3. Provenance of releases.
  "a workflow signs releases or attests their provenance": "een workflow ondertekent releases of legt hun herkomst vast met een attestation",
  "Releases carry a signature or a provenance proof.": "Releases hebben een handtekening of een bewijs van herkomst.",
  "The releases could not be read.": "De releases konden niet worden gelezen.",
  "Not all workflow files could be read, so we cannot say whether a step signs the releases.":
    "Niet alle workflowbestanden konden worden gelezen, dus we kunnen niet zeggen of een stap de releases ondertekent.",
  "No signatures or provenance attestations are visible next to the latest releases or in the workflows. The CRA asks for secure distribution of updates; users should be able to check that an update comes from you.":
    "Bij de laatste releases en in de workflows zijn geen handtekeningen of attestations van herkomst zichtbaar. De CRA vraagt om veilige verspreiding van updates; gebruikers moeten kunnen nagaan dat een update van jou komt.",
  "Sign releases (for example with sigstore/cosign or GitHub attestations) and publish the signature with the release.":
    "Onderteken releases (bijvoorbeeld met sigstore/cosign of GitHub attestations) en publiceer de handtekening bij de release.",

  // 4. Pinned dependencies.
  "A lockfile fixes which versions of the components are used.": "Een lockfile legt vast welke versies van de componenten worden gebruikt.",
  "The file tree of the repository could not be read completely.": "De lijst met bestanden van de repository kon niet helemaal worden gelezen.",
  "The repository has package files but no lockfile anywhere in it (every file was listed). Without one you cannot later tell exactly which component versions are in a release.":
    "De repository heeft pakketbestanden maar nergens een lockfile (elk bestand stond in de lijst). Zonder lockfile kun je later niet precies zien welke versies van componenten in een release zitten.",
  "Commit your package manager's lockfile.": "Commit de lockfile van je pakketbeheerder.",
  "This kind of project normally pins its versions in the build file itself, so a missing lockfile says little. Not assessed.":
    "Dit soort project legt zijn versies normaal vast in het buildbestand zelf, dus een ontbrekende lockfile zegt weinig. Niet beoordeeld.",
  "No known package file in the repository, so this was not assessed.": "Er is geen bekend pakketbestand in de repository, dus dit is niet beoordeeld.",

  // 5. Automatic updates of components.
  "A tool proposes new versions and flags vulnerable components.": "Een tool stelt nieuwe versies voor en signaleert kwetsbare componenten.",
  "package.json (renovate settings)": "package.json (renovate-instellingen)",
  "Renovate is configured inside the root package.json.": "Renovate is ingesteld in de package.json in de hoofdmap.",
  "The root package.json could not be read completely, and Renovate can be configured inside it.":
    "De package.json in de hoofdmap kon niet helemaal worden gelezen, en Renovate kan daarin worden ingesteld.",
  "No Dependabot or Renovate configuration file was found, and the root package.json holds no Renovate settings (Renovate settings in a package.json deeper in the repository are not read). The CRA asks that vulnerabilities are addressed and fixed without delay, including by providing security updates. Dependabot security alerts switched on in the settings leave no file and are not visible from outside.":
    "Er is geen configuratiebestand van Dependabot of Renovate gevonden, en de package.json in de hoofdmap bevat geen Renovate-instellingen (Renovate-instellingen in een package.json dieper in de repository worden niet gelezen). De CRA vraagt dat kwetsbaarheden zonder vertraging worden aangepakt en verholpen, ook door beveiligingsupdates te leveren. Dependabot-beveiligingsmeldingen die in de instellingen zijn aangezet, laten geen bestand achter en zijn van buitenaf niet te zien.",
  "Turn on Dependabot or Renovate with a small configuration file.": "Zet Dependabot of Renovate aan met een klein configuratiebestand.",

  // 6. Automated security tests.
  "a security scan": "een beveiligingsscan",
  "A security scan runs in CI.": "Er draait een beveiligingsscan in CI.",
  "The workflow files could not all be read, so we cannot say whether a security scan runs.":
    "Niet alle workflowbestanden konden worden gelezen, dus we kunnen niet zeggen of er een beveiligingsscan draait.",
  "No CI workflows or pipeline files were found. The CRA asks for effective and regular tests and reviews of the security of the product.":
    "Er zijn geen CI-workflows of pipelinebestanden gevonden. De CRA vraagt om doeltreffende en regelmatige tests en beoordelingen van de beveiliging van het product.",
  "Add a workflow with a scanner (for example CodeQL, or a vulnerability scan of the dependencies).":
    "Voeg een workflow met een scanner toe (bijvoorbeeld CodeQL, of een kwetsbaarheidsscan van de afhankelijkheden).",
  "There are CI workflows or pipeline files and all of them were read, but none shows a security scan (CodeQL, Semgrep, Trivy, OSV, audit).":
    "Er zijn CI-workflows of pipelinebestanden en ze zijn allemaal gelezen, maar geen ervan toont een beveiligingsscan (CodeQL, Semgrep, Trivy, OSV, audit).",
  "Add a scan step that runs on each change or weekly.": "Voeg een scanstap toe die bij elke wijziging of wekelijks draait.",

  // 7. Maintenance and updates.
  "last commit on the default branch": "laatste commit op de standaardbranch",
  "last push to any branch": "laatste push naar een willekeurige branch",
  ", no release seen": ", geen release gezien",
  "The repository is archived: no security updates will come from it.": "De repository is gearchiveerd: er komen geen beveiligingsupdates meer uit.",
  "Say publicly who takes over maintenance, or that the product is no longer supported.":
    "Zeg openbaar wie het onderhoud overneemt, of dat het product niet meer wordt ondersteund.",
  "No date of the last change was available.": "Er was geen datum van de laatste wijziging beschikbaar.",
  "There is recent activity. That is a weak sign: recent commits do not show that vulnerabilities are handled, and a quiet repository does not show that they are not.":
    "Er is recente activiteit. Dat is een zwak teken: recente commits laten niet zien dat kwetsbaarheden worden afgehandeld, en een rustige repository laat niet zien dat ze niet worden afgehandeld.",
  "State the support period and make sure updates come within it.": "Geef de ondersteuningsperiode aan en zorg dat updates daarbinnen komen.",

  // 8. Licence.
  "A licence is declared.": "Er is een licentie opgegeven.",
  "A licence file is there (GitHub does not recognise its text, so it shows no licence name).":
    "Er is een licentiebestand (GitHub herkent de tekst niet, dus toont geen licentienaam).",
  "GitHub shows no licence and the file tree could not be read completely to look for a licence file.":
    "GitHub toont geen licentie en de lijst met bestanden kon niet helemaal worden gelezen om naar een licentiebestand te zoeken.",
  "No licence name from GitHub and no LICENSE, COPYING or UNLICENSE file in the root. For users, and for the CRA's split between open source and not, commercial and not, that is a first question.":
    "Geen licentienaam van GitHub en geen LICENSE-, COPYING- of UNLICENSE-bestand in de hoofdmap. Voor gebruikers, en voor het onderscheid dat de CRA maakt tussen open source en niet, commercieel en niet, is dat een eerste vraag.",
  "Add a LICENSE file.": "Voeg een LICENSE-bestand toe.",

  // The tail of some explanations (the server appends it to the sentence before it).
  [ELSEWHERE_EN]: " Dit kijkt alleen naar de openbare repository en de GitHub-releases; als je dit ergens anders doet, is het hier niet zichtbaar.",
  [SETTINGS_EN]: " Een scan die in de repositoryinstellingen is aangezet (bijvoorbeeld de standaardinstelling van CodeQL) laat geen bestand achter en is van buitenaf niet te zien.",

  // Below the signals.
  "not measured": "niet gemeten",
  "product design and default settings (Annex I, part I of the Regulation)": "productontwerp en standaardinstellingen (bijlage I, deel I van de verordening)",
  "whether fixed vulnerabilities are made public, and whether vulnerabilities are really handled without delay during the support period (Annex I, part II)":
    "of opgeloste kwetsbaarheden openbaar worden gemaakt, en of kwetsbaarheden tijdens de ondersteuningsperiode echt zonder vertraging worden afgehandeld (bijlage I, deel II)",
  "your internal process for notifying actively exploited vulnerabilities and severe incidents through the EU single reporting platform within 24 hours and 72 hours, and the final report (Article 14)":
    "je interne proces om actief misbruikte kwetsbaarheden en ernstige incidenten binnen 24 uur en 72 uur te melden via het gemeenschappelijke meldplatform van de EU, en het eindverslag (artikel 14)",
  "technical documentation, the risk assessment and the EU declaration of conformity": "de technische documentatie, de risicobeoordeling en de EU-conformiteitsverklaring",
  "builds, scans and signing that run in a CI system whose pipeline file is not at the root of the repository: a Jenkinsfile, .gitlab-ci.yml, azure-pipelines.yml, bitbucket-pipelines.yml, .travis.yml, .drone.yml and .circleci/config.yml are read, files they include and shared pipeline libraries are not":
    "builds, scans en ondertekening die draaien in een CI-systeem waarvan het pipelinebestand niet in de hoofdmap van de repository staat: een Jenkinsfile, .gitlab-ci.yml, azure-pipelines.yml, bitbucket-pipelines.yml, .travis.yml, .drone.yml en .circleci/config.yml worden gelezen, bestanden die ze opnemen en gedeelde pipelinebibliotheken niet",
  "private repositories, hosting other than GitHub, and anything that is not public": "privérepositories, hosting anders dan GitHub, en alles wat niet openbaar is",
  "This is an indication from public data about eight selected signals. It is not a check against the legal requirements, not a conformity assessment and not legal advice.":
    "Dit is een indicatie op basis van openbare gegevens over acht gekozen signalen. Het is geen toets aan de wettelijke eisen, geen conformiteitsbeoordeling en geen juridisch advies.",
  "These are eight selected signals visible in a public repository, not one signal for each of the eight legal requirements in Annex I part II of the Regulation. Some relate to those requirements (a bill of materials, updates, security tests, a disclosure policy with a contact, secure distribution of updates); others are general good practice the Regulation does not list as such (pinned dependencies, recent maintenance, a licence). On 2026-10-28 the topics were compared with the official text of the Regulation. The choice and the reading are our own and have not been reviewed by a lawyer.":
    "Dit zijn acht gekozen signalen die zichtbaar zijn in een openbare repository, niet één signaal per wettelijke eis van de acht in bijlage I deel II van de verordening. Sommige hangen samen met die eisen (een bill of materials, updates, beveiligingstests, een beleid voor het bekendmaken van kwetsbaarheden met een contact, veilige verspreiding van updates); andere zijn algemene goede praktijk die de verordening als zodanig niet noemt (vastgezette afhankelijkheden, recent onderhoud, een licentie). Op 2026-10-28 zijn de onderwerpen vergeleken met de officiële tekst van de verordening. De keuze en de lezing zijn van onszelf en zijn niet door een jurist beoordeeld.",
};

const TAILS = [ELSEWHERE_EN, SETTINGS_EN] as const;

const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

/** The path of a policy file as the server writes it: the path alone, or the path with a note that the policy belongs to the owner. */
function whereNl(where: string): string {
  return where.endsWith(WHERE_EN) ? where.slice(0, -WHERE_EN.length) + WHERE_NL : where;
}

const days = (n: string) => (n === "1" ? "1 dag" : `${n} dagen`);

/** What the age of the last change is measured from: the two fixed phrases the server uses, in Dutch, or null for anything else. */
function whatNl(what: string): string | null {
  return what === "last commit on the default branch" || what === "last push to any branch" ? PHRASES[what] : null;
}

export interface Pattern {
  /** The English skeleton: "${}" stands for any text, "${n}" for a number. It must equal a template literal in cra-repo-check.ts. */
  en: string;
  /** The Dutch sentence from what the holes matched, or null when a hole holds something that is not one of the known phrases. */
  nl: (holes: string[]) => string | null;
}

export const PATTERNS: readonly Pattern[] = [
  {
    en: "${}" + WHERE_EN,
    nl: ([path]) => `${path}${WHERE_NL}`,
  },
  {
    en: "A security policy file is there (${}), but it could not be examined completely, so we cannot say whether it names a contact address or a way to report.",
    nl: ([where]) =>
      `Er staat een bestand met beveiligingsbeleid (${whereNl(where)}), maar dat kon niet helemaal worden onderzocht, dus we kunnen niet zeggen of het een contactadres noemt of een manier om te melden.`,
  },
  {
    en: "A security policy file exists (${}) and all of it was read, but it names no contact address or reporting link. A link to a general homepage does not count. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports.",
    nl: ([where]) =>
      `Er bestaat een bestand met beveiligingsbeleid (${whereNl(where)}) en het is helemaal gelezen, maar het noemt geen contactadres of meldlink. Een link naar een algemene homepage telt niet mee. De CRA vraagt om een beleid voor gecoördineerde bekendmaking van kwetsbaarheden en een contactadres voor meldingen.`,
  },
  {
    en: "${} ${n} days ago${}",
    nl: ([what, n, rest]) => {
      const phrase = whatNl(what);
      const tail = phrase === null ? null : translate(rest);
      return phrase === null || tail === null ? null : `${phrase} ${days(n)} geleden${tail}`;
    },
  },
  {
    en: ", last release ${n} days ago",
    nl: ([n]) => `, laatste release ${days(n)} geleden`,
  },
  {
    en: "The ${} was ${n} days ago. The CRA expects vulnerabilities to be fixed quickly during the support period. Recent activity is only a weak sign of that, and a stable product can be quiet for good reasons.",
    nl: ([what, n]) => {
      const phrase = whatNl(what);
      return phrase === null
        ? null
        : `De ${phrase} was ${days(n)} geleden. De CRA verwacht dat kwetsbaarheden tijdens de ondersteuningsperiode snel worden verholpen. Recente activiteit is daar maar een zwak teken van, en een stabiel product kan om goede redenen rustig zijn.`;
    },
  },
  {
    en: "${n} published security advisories in this repository (a number says nothing about quality: zero does not mean safe)",
    nl: ([n]) =>
      `${n === "1" ? "1 gepubliceerd beveiligingsadvies" : `${n} gepubliceerde beveiligingsadviezen`} in deze repository (een getal zegt niets over kwaliteit: nul betekent niet veilig)`,
  },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The anchored expression for a skeleton. Text holes are lazy so that the first fitting split wins; the sentence must match from start to end. */
function compile(skeleton: string): RegExp {
  const body = skeleton
    .split(/(\$\{n?\})/)
    .map((piece) => (piece === "${}" ? "(.+?)" : piece === "${n}" ? "(\\d{1,9})" : escapeRegExp(piece)))
    .join("");
  return new RegExp(`^${body}$`);
}

const COMPILED = PATTERNS.map((pattern) => ({ pattern, re: compile(pattern.en) }));

/** The Dutch for a sentence the server sent, or null when it is not in the phrasebook (exact, by pattern, or a known sentence plus a known tail). */
function translate(text: string): string | null {
  if (has(PHRASES, text)) return PHRASES[text];
  for (const { pattern, re } of COMPILED) {
    const match = re.exec(text);
    if (!match) continue;
    const dutch = pattern.nl(match.slice(1));
    if (dutch !== null) return dutch;
  }
  for (const tail of TAILS) {
    if (text.length > tail.length && text.endsWith(tail)) {
      const base = translate(text.slice(0, -tail.length));
      if (base !== null) return base + PHRASES[tail];
    }
  }
  return null;
}

/** Dutch for a sentence of the server's CRA report; the sentence itself, untouched, when the phrasebook does not know it. */
export function craToDutch(text: string): string {
  return translate(text) ?? text;
}
