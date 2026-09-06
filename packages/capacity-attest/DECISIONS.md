# Decision register: bewust uitgestelde features

Elke regel hier is een feature die overwogen is, met een reden om NIET te
bouwen op dit moment, en een precieze, vooraf vastgelegde voorwaarde waaronder
dat oordeel zou omslaan. Doel: nooit een feature bouwen op onderbuikgevoel of
op "dit leek me nuttig", en nooit een afgewezen idee stilzwijgend opnieuw
overwegen zonder te checken of de oorspronkelijke reden nog steldt.

Format per item: Hypothese · Waarom nu niet · Trigger-criterium (het exacte,
vooraf afgesproken bewijs dat nodig is) · Wat NIET als trigger telt · Status.

Bijgewerkt: 2026-09-06, na een adversariële tegentoets op de eerste versie van
deze analyse (zie knowledge/al-mizaan/lessen-log.md, 2026-09-06 vervolg 3, in
wazir-al-ghanima) die twee inconsistenties in de eerste versie blootlegde.

---

## D-001: Bestaans-verankering (OpenTimestamps of vergelijkbaar)

**Hypothese:** een claim die alleen in ons eigen GitHub-bestand staat, is niet
onafhankelijk aantoonbaar op een bepaald moment te hebben bestaan. Als wij het
bestand zouden aanpassen of laten verdwijnen, is er niets dat een buitenstaander
kan controleren zonder ons te vertrouwen.

**Waarom nu niet:** geen enkele echte partij heeft dit ooit als blokkade tegen
capacity-attest genoemd. ASM-spec (YE-YI7) accepteerde de claim als authentiek
puur op inhoud-hash + handtekening + on-chain betaal-match, zonder ooit te
vragen om een externe verankering. De eis komt uit een bredere x402-foundation-
discussie (x402-foundation/x402#2887) als iets dat een toekomstige
werkgroep-standaard zou kunnen eisen, niet als een concrete vraag aan ons.

**Trigger-criterium (elk van de twee volstaat):**

- (a) Een echte, geïdentificeerde partij noemt het ontbreken van een
  bestaans-verankering expliciet als reden om een claim niet te vertrouwen of
  niet te integreren met capacity-attest.
- (b) De x402-foundation-werkgroep (x402-foundation/tsc#4, indien gecharterd)
  publiceert een formele referentiesysteem-eis die verankering verplicht
  stelt voor deelname.

**Wat NIET telt als trigger:** een algemene discussie in een ander project
over het nut van verankering, zonder dat het tegen capacity-attest specifiek
is ingebracht. Zie D-002 voor de reden waarom "iemand ergens anders vroeg
erom" niet volstaat: die meetlat geldt voor elk item hier, consistent.

**Belangrijk technisch onderscheid, vastgelegd zodat het niet later verward
wordt:** verankering bewijst dat data op tijdstip X ongewijzigd bestond. Het
bewijst NIET dat een claim eerlijk is (geen oplossing voor een leugen over
`delivered` of een leeg beloofde geldbuffer, dat is een ander soort probleem).

**Status:** niet bouwen. Wachten op trigger (a) of (b).

---

## D-002: Formele conformance-vectoren-suite publiceren

**Hypothese:** een derde partij die onze claim-encodering wil natrekken, moet
nu zelf schema.ts lezen en de logica reconstrueren. Een gepubliceerde set
vaste testgevallen (zoals AXES's `portable/jcs-properties`) zou dat werk voor
ze doen.

**Waarom nu niet, en wat de eerste versie van deze analyse fout had:** de
eerste versie noemde dit een "echte need" op basis van één contact (YE-YI7).
Dat is precies het "één datapunt bewijst niets"-probleem dat elders in dit
document terecht wordt afgewezen (zie D-001, D-003). Bovendien: wat YE-YI7
concreet miste (claimId, package-versie, exact commando) is nu al opgelost
via de nieuwe "Een claim onafhankelijk verifiëren"-sectie in README.md, en
dat is een ander, goedkoper soort oplossing dan een formele, te onderhouden
vectoren-suite.

**Trigger-criterium:** een TWEEDE, onafhankelijke partij (dus niet YE-YI7,
niet dezelfde persoon in een ander project) loopt aantoonbaar tegen dezelfde
soort wrijving aan ná het lezen van de bijgewerkte README, ondanks de
quickstart-sectie. Dat isoleert of het probleem echt "ontbrekende
test-vectoren" is, of iets anders (documentatie, communicatie).

**Wat NIET telt als trigger:** de EmbryoSpace BSV-fixture die er sowieso aan
komt telt NIET automatisch als bevestiging als hij zonder wrijving lukt, want
een andere chain en een andere contactpersoon is een te vervuild experiment
om iets te bewijzen. Het telt WEL als signaal als hij, ondanks de nieuwe
README-sectie, alsnog dezelfde vragen moet stellen die YE-YI7 stelde.

**Status:** niet bouwen. README-quickstart (goedkoop, al gedaan) blijft staan
als eerste, kleinere oplossing. Vectoren-suite wacht op een tweede, schoon
datapunt.

---

## D-003: "Onderweg"-status voor lange leveringen (meerdaagse/meerwekelijkse capaciteit)

**Hypothese:** bij een claim over een hele maand opslag of bandbreedte weet
een koper pas ná die hele maand of het goed ging. Een tussentijdse
"in-behandeling"-status zou eerder inzicht geven.

**Waarom nu niet:** het idee komt van een ander domein (Facet, fysieke
pakketbezorging: "is mijn pakket zoek"), een ander faalpatroon dan "loopt
mijn GPU-meter correct door". Geen van de ~46 vandaag bekeken GitHub-plekken
en geen van de twee echte externe contacten heeft dit voor gemeten capaciteit
specifiek gevraagd. Reële branchevergelijking: cloud-facturering (AWS,
Vast.ai, RunPod) wordt vrijwel overal achteraf per periode afgerekend.

**Eerlijke correctie na tegentoets:** de eerste versie verwierp dit te snel
als "verkeerd domein". Het onderliggende structurele patroon (belofte bij
t=0, geen tussentijds signaal, pas controleerbaar bij t=einde) is wel degelijk
hetzelfde voor metered capacity als voor pakketbezorging. Het punt is niet dat
de analogie fout is, het punt is dat NIEMAND in ons eigen domein dit patroon
ooit een probleem heeft genoemd. Dat is dezelfde meetlat als D-001, nu correct
consistent toegepast.

**Trigger-criterium:** een echte gebruiker van capacity-attest (niet een
theoretisch geval) heeft een claim die een periode van meerdere dagen of
langer beslaat, EN geeft aan dat het ontbreken van een tussentijds signaal een
concreet probleem was (bijvoorbeeld: een geschil ontstond omdat er geen manier
was om halverwege de periode te signaleren dat iets misging).

**Wat NIET telt als trigger:** een algemene observatie dat "dit ooit nuttig
zou kunnen zijn" voor een hypothetisch meerdaags scenario. Er moet een
concrete claim met een concreet probleem tegenaan zijn gelopen.

**Status:** niet bouwen. Schema-uitbreiding zou een backwards-compatible
toevoeging zijn (net als `measured` in 0.2.0), dus geen architecturale
blokkade om dit later alsnog toe te voegen als de trigger afgaat.

---

## D-004: Geen reputatiescore of ranking (bevestigde bestaande keuze, geen open punt)

**Hypothese die getoetst werd:** ontbreekt er iets aan adoptie doordat
`get_delivery_history` geen samengevat oordeel geeft?

**Bewijs, letterlijk nagekeken in de woorden van beide echte contacten
(2026-09-06):** geen van beide heeft ooit, expliciet of impliciet, gevraagd
om een score. Sterker, YE-YI7 schreef in zijn eigen ASM-spec-werk expliciet:
"raw post-call payer attestation rather than turn it into a trust score",
een directe bevestiging van onze eigen ontwerpkeuze, van de persoon die er het
dichtst bovenop zit. Los daarvan bevestigde dezelfde dag een ander incident
(een publiekelijk betrapte lege economische bond bij een ander project in
dezelfde discussie) waarom een score/geldbuffer extra aanvalsoppervlak
toevoegt.

**Status:** bevestigd, geen open punt. Blijft een bewaakpunt: als ooit een
echte partij een score als concrete adoptie-blokkade noemt, is dát het moment
om dit dossier te heropenen, niet eerder.

---

## D-005: claim-vindbaarheid tussen onafhankelijke installaties

**Hypothese:** `get_delivery_history` belooft dat een koper de geschiedenis
van een verkoper kan checken vóór hij zelf betaalt. Maar de ledger is
standaard lokaal per installatie (`CAPACITY_ATTEST_DATA_DIR`). Als koper A en
koper B allebei hun eigen installatie draaien, ziet B de claim die A over
dezelfde verkoper vastlegde niet automatisch. Dat is geen slordigheid, dat
staat al expliciet in de Status-sectie van de site sinds vandaag.

**Hoe dit punt ontstond, en waarom het zwaarder weegt dan D-001 t/m D-003:**
twee onafhankelijke bronnen kwamen op dezelfde dag, via twee heel verschillende
wegen, op precies hetzelfde gat uit. Wijzelf, door eerlijk te zijn over de
architectuur op de site. En ChatGPT, aan de koning voorgelegd na het lezen van
de repository, dat het "centrale database versus portable evidence"-vraagstuk
noemde. Dat zijn niet twee meningen, dat is hetzelfde reële gat, twee keer
onafhankelijk gevonden. Dat maakt dit zwaarder dan een los verbetervoorstel.

**Meteen gedaan, vandaag (geen wacht-op-trigger-item, dit was een reeds
aanwezige onduidelijkheid in geleverde code, geen nieuwe feature):** het
antwoord van `get_delivery_history` bevat nu twee extra velden, `scope`
(altijd `"local-ledger"`) en `note` (een vaste, feitelijke tekst die uitlegt
dat een lege of korte geschiedenis niet betekent dat de verkoper schoon is,
het kan ook betekenen dat hier simpelweg nog niets is vastgelegd). Dit stond
al zo in de README voor mensen die het lazen, maar de MCP-tool-beschrijving
en de daadwerkelijke JSON-uitkomst zeiden het niet, en een AI-agent die de
tool aanroept leest typisch geen README. Getest: 439 tests slagen, inclusief
twee nieuwe die specifiek controleren dat `scope`/`note` aanwezig zijn en dat
er nooit een score/rating-veld naast sluipt (zie tools.test.ts).

**Wat NOG NIET gedaan is, en dat is wel een wacht-op-bewijs-vraagstuk:** of
en hoe claims tussen onafhankelijke installaties vindbaar worden gemaakt.
ChatGPT's suggestie ("word niet de centrale database, maak het protocol-
neutraal en portable") is een architectuurvoorkeur, geen bewezen oplossing.
De keuze staat open tussen minstens drie routes, geen ervan is nu al
beargumenteerd de juiste:

- (a) niets doen: een marktplaats of integrator draait zelf één gedeelde
  installatie voor al zijn verkopers, en het probleem lost zich vanzelf op
  zonder dat wij iets hoeven te bouwen;
- (b) een gedeelde, door ons gehoste index bouwen (het scenario dat we zelf
  al hebben afgewezen: dat zou "vertrouw Tokenizen" impliceren in plaats van
  "verifieer de claim zelf", precies tegen onze eigen filosofie in);
- (c) een gedecentraliseerde vindbaarheids-afspraak (bijvoorbeeld: claims
  publiceren op een voorspelbare, per-verkoper-adres plek), zonder dat
  Tokenizen zelf een centrale autoriteit wordt.

**Trigger-criterium:** dit wordt pas een bouwbeslissing zodra er een ECHTE
situatie is met minstens twee onafhankelijke installaties die daadwerkelijk
over dezelfde verkoper zouden moeten kunnen praten. De EmbryoSpace-bijdrage
(Base-installaties naast een BSV-installatie) is de eerst mogelijke, al
geplande gelegenheid om dit in het echt te zien gebeuren of net niet. Zodra
die PR er is: expliciet checken of dit voor hem al een probleem is, en zo ja,
pas dan de drie routes hierboven met echt bewijs tegen elkaar afwegen.

**Wat NIET telt als trigger:** een strategische suggestie, hoe goed
beargumenteerd ook, zonder een concrete partij die er daadwerkelijk tegenaan
loopt. Zelfde meetlat als elk ander item hier.

**Status:** de disclosure-fix is vandaag gedaan en live. De onderliggende
architectuurkeuze (a/b/c) staat open, wachtend op de eerste echte
gelegenheid om 'm te toetsen.

**Update dezelfde dag, avond:** goun7 (auteur van het "proof-of-done"-
voorstel, x402-foundation/x402#3379, bouwer van Tamga Protocol) stelde
letterlijk deze vraag in een openbare reactie: "for 'a future buyer pulls
that seller's history', what is the intended hosting model: every buyer runs
their own, or federation?" Zie D-006 voor het antwoord en de bijbehorende,
scherpere vervolgvraag die hij tegelijk stelde.

**Correctie, nog dezelfde avond:** de zin hierboven noemde dit eerder "precies
het trigger-criterium hierboven". Dat was te snel. Het trigger-criterium eist
letterlijk "een ECHTE situatie... met minstens twee onafhankelijke
installaties die daadwerkelijk over dezelfde verkoper zouden moeten kunnen
praten". Een scherpe, goed onderbouwde vraag van een geloofwaardige externe
partij is een signaal dat de prioriteit verhoogt, maar is niet hetzelfde als
die concrete situatie zelf: goun7 vraagt naar het beoogde model, hij zit zelf
niet vast als tweede installatie die met een eerste over dezelfde verkoper
moet praten. D-012 hieronder (dezelfde dag, los onderzoek) trekt dezelfde
conclusie zonder dit expliciet te herzien: "D-005's eigen trigger-criterium
... blijft ongewijzigd van kracht." De EmbryoSpace-PR blijft dus de concrete,
nog openstaande gelegenheid om de trigger echt te laten afgaan. Wat vandaag
wél verandert: D-012 identificeert de concrete mechaniek voor route (c) zodra
die trigger afgaat (EAS/ERC-8004, zie hieronder). De keuze zelf blijft open,
maar is niet langer ongericht.

**Vervolg 0.4.0, expliciete koning-opdracht: het detecteerbare/bouwbare deel
van vindbaarheid nu gebouwd, op dezelfde manier als D-006.** Na D-006 gaf de
koning opdracht ook vraag 2 (deze) op te pakken, "in loops en checks", met de
eerder door hemzelf voorgestelde aanpak: een echt geval NABOOTSEN en er een
benchmark op maken, in plaats van te wachten op een externe partij. Dat kan,
want een simulatie bewijst dat het mechanisme WERKT (technische validiteit),
ook al bewijst het geen marktvraag. Precies wat goun7 zelf publiek doet met
zijn Tamga-fixture (settlement "simulated", Tamga-kant echt).

**Het inzicht dat vindbaarheid bouwbaar maakt zonder centrale index:** onze
claims zijn al zelf-verifieerbaar (`claimId` = inhoud-hash, handtekening →
`buyerAddress`). Vindbaarheid heeft dus geen vertrouwde index nodig. Claims
mogen overal gepubliceerd worden; de vinder verifieert elke gevonden claim
zelf. Nep wordt geweigerd door `verifyClaim`; weglating blijft het
D-006-probleem, ongewijzigd en meegenomen. Vindbaarheid en verificatie passen
dus schoon op elkaar: verzamel uit willekeurige, onvertrouwde bronnen,
verifieer alles lokaal.

**Wat gebouwd is (0.4.0, branch `feat/cross-installation-discovery`):** een
substraat-agnostische aggregatie-naad, `discoverDeliveryHistory(seller,
sources)` (discovery.ts). Leest een verkopers claims uit meerdere
onafhankelijke `ClaimSource`s (de lokale ledger, plus elk host-onafhankelijk
substraat dat de koper wil lezen), ontdubbelt op `claimId`, HERVERIFIEERT elke
claim ongeacht de bron, filtert claims over andere verkopers eruit, en draait
`analyzeCompleteness` over het resultaat. Per-bron-boekhouding (fetched,
accepted, rejected, duplicates) laat zien wat elke bron bijdroeg. Geen bron
wordt vertrouwd. Openbare, draaibare fixture (`npm run discovery-fixture`,
`docs/DISCOVERY-FIXTURE.md`): twee nagebootste installaties, 8 controles (6
GREEN, 2 RED), waaronder het bewijs dat B zonder discovery A's claim mist, met
discovery wel ziet, dat nep/verkeerde-verkoper wordt geweigerd, en dat een
verborgen middelste claim óók over installaties heen wordt betrapt (compositie
met D-006). 502 tests groen.

**Wat NIET gebouwd is, expres:** de echte publieke onderlaag (EAS op Base,
ERC-8004) is NIET live gekoppeld. Dat kost gas, een echte chain, en verdient
een echte integrator; de naad is er klaar voor, de live-koppeling wacht op de
D-005-trigger (twee echte installaties die moeten interopereren). En, hardcoded
eerlijk: dit lost VINDBAARHEID op, niet VOLLEDIGHEID. Een bron kan nog steeds
weglaten; meer onafhankelijke bronnen verhogen de kosten van een
gecoördineerde weglating maar bereiken nooit een bewijs. Zelfde grens als
D-006, nu over installaties heen.

**Wat verificatie hier WEL en NIET bewijst (toegevoegd na adversariële review,
zodat het niet wordt oververkocht):** `verifyClaim` bewijst AUTEURSCHAP van de
inhoud, meer niet. Het bewijst niet dat er echt betaald of geleverd is
(`settlementRef` wordt hier niet on-chain gecontroleerd) en niet dat kopers
verschillende personen zijn. Eén sleutelpaar kan dus geldige positieve claims
spammen om een verkoper op te blazen, of geldige negatieve om er een te
beschadigen. Volume en Sybil worden door aggregatie NIET opgelost; de
per-bron-cap begrenst alleen het werk (DoS-bescherming), het is geen
Sybil-verdediging. Dit staat expliciet in DISCOVERY_NOTE, het `note`-veld en
docs/DISCOVERY-FIXTURE.md, zodat een lezer die alleen "geverifieerd" ziet niet
meer zekerheid afleidt dan er is. De blocker uit die review (een bron die geen
array teruggaf liet de hele aggregatie crashen en censureerde zo alle andere
bronnen) is gerepareerd met een non-array-guard plus tests; ook de
boekhoudkundige verwarring tussen "geweigerd (crypto)" en "andere verkoper" is
opgesplitst in aparte tellers.

**Status:** vindbaarheids-naad + fixture gebouwd en getest (0.4.0, branch
`feat/cross-installation-discovery`, nog niet naar main, nog niet gepubliceerd,
wacht op review door de koning).

**LIVE BEWEZEN op Base mainnet (2026-09-06), op koning-opdracht:** de EAS-route
is niet langer alleen gedocumenteerd, hij is echt uitgevoerd op chainId 8453.
Een schema (`bytes32 claimId,string claim`, UID
`0x1dd19408345dee43b432b89ccb68760265ecff506098b6efe8ba82ad0d52b195`) is
geregistreerd, en twee claims zijn als EAS-attestaties gepubliceerd, publiek
te bekijken:
- c1 (delivered yes): `0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc`
- c2 (delivered NO): `0xe736b005cbcb54f8f196ac64ef09d75d939c8a18c0d5d9670b5c5025c07398c4`
  (https://base.easscan.org/attestation/view/<uid>)

Daarna vond een apart, read-only script (een "verse installatie") beide
attestaties terug van de keten via `eth_getLogs` op recipient=seller, decodeerde
ze en verifieerde elke claim LOKAAL (inclusief de negatieve), zonder iets te
vertrouwen behalve Base zelf. Totale kosten: ~0.0000096 ETH (ongeveer 2,5
dollarcent) voor alle drie de transacties. Uitgevoerd vanaf de VPS
(euler-liquidator-wallet als gas-betaler; de claim zelf is door een aparte,
wegwerp-koperssleutel ondertekend, dus attester != koper). Dit bewijst het
mechanisme end-to-end op een echte publieke keten. Het bewijst nog steeds geen
VOLLEDIGHEID (een indexer/host kan nog steeds weglaten; de koper kan zelf de
keten bevragen om dat te omzeilen) en geen marktvraag; wat het wel bewijst is
dat cross-installatie-vindbaarheid echt werkt en publiek natrekbaar is.

Live koppeling als herbruikbare functie in het pakket (`src/eas.ts`,
offline-getest) staat klaar; het bundelen van een RPC/gas blijft aan de
aanroeper, en een echte productie-integrator blijft de trigger voor verdere
uitbouw.

---

## D-006: kan een oneerlijke host claims selectief verbergen?

**De vraag, letterlijk van goun7:** "The claim ledger is append-only JSONL —
is it hash-chained, or does integrity rest on the host? (Our F25 lesson:
append-only without cross-verification is one hostile writer away from a
consistent fake history.)" Zijn eigen team vond exact dit lek in hun eigen
systeem via een adversariële audit (finding F25: een seed-houder kan een
consistente nepgeschiedenis naar een vers node fabriceren).

**Nagekeken in de eigen code, niet aangenomen (`grep` op ledger.ts):** er zit
GEEN hash-koppeling tussen opeenvolgende claims. Elke claim is op zichzelf
inhoud-geadresseerd en ondertekend (`claimId` + `signature`), dat blijft
altijd controleerbaar. Maar het ledger-BESTAND als geheel heeft geen
mechanisme dat bewijst dat er niets is weggelaten. Wie `get_delivery_history`
bedient (zie D-005: dat is vandaag niet gedefinieerd wie dat is) kan simpelweg
een deelverzameling van de echte claims teruggeven, bijvoorbeeld alle
positieve en geen enkele negatieve, en de vragende koper heeft geen manier om
dat te ontdekken. Elke getoonde claim is dan nog steeds 100% authentiek,
`verifyClaim()` zegt overal `{ok: true}`, maar het geheel is misleidend door
weglating, niet door vervalsing.

**Waarom dit anders is dan D-001:** D-001 (bestaans-verankering) bewijst dat
ÉÉN claim op tijdstip X bestond. Dat lost dit probleem niet op: een host kan
prima een echte, verankerde claim tonen en gewoon een ANDERE, ook echte,
verankerde claim niet tonen. Volledigheid (niets is weggelaten) en
bestaan (dit ene ding is echt en van toen) zijn twee aparte eigenschappen.

**Eerlijk antwoord aan goun7:** nee, niet hash-chained vandaag, en ja, het
weglating-scenario is op dit moment mogelijk. Dat is een reëel, vandaag nog
onopgelost gat, niet iets om te verbloemen.

**Mogelijke routes, geen van alle nu al gekozen:**
- (a) een periodiek gepubliceerde, verankerde merkle-root over alle bekende
  claimId's per verkoper, zodat een koper kan controleren of de getoonde set
  overeenkomt met de laatst gepubliceerde volledige set;
- (b) claims laten publiceren op een plek die de host niet zelf beheert
  (raakt direct aan D-005's route c, gedecentraliseerde vindbaarheid);
- (c) meerdere, onafhankelijke hosts laten aanroepen en de resultaten
  vergelijken (verschuift het vertrouwen naar "genoeg onafhankelijke bronnen
  zijn het eens", in plaats van één host).

**Trigger-criterium:** dit is al getriggerd, niet hypothetisch: een
geïdentificeerde, technisch onderlegde externe partij heeft de vraag al
gesteld, in het openbaar, met een eigen vergelijkbare bevinding in eigen werk
als onderbouwing. Dat is zwaarder bewijs dan wat D-001 tot D-005 nodig hadden.
Dit betekent NIET meteen bouwen: welke van de drie routes (of een combinatie)
de juiste is, is nog niet uitgezocht, en dat uitzoeken is de volgende stap,
geen aanname.

**Vervolg, later dezelfde dag: een echte adversariële toets voordat er iets
naar buiten ging.** Op uitdrukkelijk verzoek van de koning ("wij gaan eerst
ervoor zorgen dat we het probleem echt hebben opgelost... bereid scherpe
vragen van professors voor") is er NIET gereageerd op goun7's vraag voordat
vier onafhankelijke reviews hun werk hadden gedaan: één brede misbruik-scan
over het hele pakket (de 4 verplichte checks: auth/data/exposure/rate, plus
race conditions en "wat kan een oneerlijke host nog meer doen") en drie
onafhankelijke ontwerp-pogingen voor D-005+D-006 samen (transparency-log-lens,
on-chain-anchoring-lens met een echte kostenanalyse tegen de werkelijke
settlement-code, en een "bouw zo min mogelijk"-tegengeluid).

**Wat die misbruik-scan echt vond, en wat dat betekent voor de eigen
aanname hierboven:** het klopt NIET dat "elke getoonde claim nog steeds 100%
authentiek is". De leesroute (`resyncFromDisk` in ledger.ts, de basis van
`get_delivery_history`) controleerde tot vandaag alleen de VORM van `claimId`
en `signature` (twee regexes), nooit of ze ook echt bij de inhoud horen.
Een tweede proces met schrijftoegang tot dezelfde `CAPACITY_ATTEST_DATA_DIR`
(een gedeelde ledger is een expliciet ondersteunde inzet, zie ledger.ts's
eigen headercommentaar) kon dus een compleet verzonnen, verkeerd-toegeschreven
of getamperde regel rechtstreeks in `claims.jsonl` plaatsen en die kwam er
zonder enige controle weer uit. Dat is een reëler probleem dan D-006 hierboven
veronderstelde: niet alleen weglating, ook fabricage. Gerepareerd (SEVENTH FIX
in ledger.ts, 2026-09-06): de leesroute rekent `verifyClaim()` nu ook zelf na
per regel, met vier nieuwe tests die precies dit scenario natrekken
(verkeerde claimId, ongeldige handtekening, en de reattributie-variant met
een handtekening van een ander wallet dan de opgegeven buyer). Drie kleinere,
losstaande bevindingen uit dezelfde scan zijn tegelijk gerepareerd omdat ze
mechanisch en ondiscutabel waren: een absoluut bestandspad dat via een
lock-timeout-foutmelding naar de MCP-caller lekte (EIGHTH FIX), een
ontbrekende try/catch rond de `get_delivery_history`-handler zelf (NINTH
FIX, inconsistent met de rest van het codebase-patroon), en een
cyclus-bewaking die wel op de ingest-route stond maar niet op haar eigen
tweelingfunctie op de schema-route (TENTH FIX, niet bereikbaar via MCP, wel
inconsistent). Twee grotere bevindingen zijn NIET vandaag gerepareerd, expres:
zie D-014 en D-015 hieronder.

**Wat vandaag wél is uitgebreid, als directe, eerlijke reactie op de vraag
zelf:** de `note` in `get_delivery_history`'s antwoord (en de MCP
tool-beschrijving) noemden tot vandaag alleen D-005 (cross-installatie).
Vanaf vandaag noemen ze ook expliciet dat volledigheid op de eerlijkheid van
de host rust, niet op cryptografie: precies het onderscheid dat dit
document zelf al maakte, nu ook zichtbaar voor een AI-agent die de tool
aanroept zonder deze file te lezen. Daarnaast staat er nu een README-sectie
("Je eigen ingediende claims delen, los van een host") met een kant-en-klaar
voorbeeld: een koper kan zijn eigen, al ondertekende claims filteren en
rechtstreeks aan een wantrouwende tegenpartij laten zien, buiten elke host
om. Geen nieuw schema, geen nieuwe tool, hergebruikt alleen wat al
geëxporteerd werd (`claimsForSeller`), exact het soort goedkope, reële
mitigatie die de "bouw zo min mogelijk"-review aanraadde.

**Waarom er vandaag GEEN on-chain/blockchain-mechanisme is gebouwd, ook al
leverden twee van de drie ontwerp-reviews onafhankelijk een variant daarvan
op:** de derde review las de daadwerkelijke settlement-code
(`mcp-paywall/src/x402.mjs`) in plaats van aan te nemen, en vond dat
meeliften op dezelfde x402-transactie niet kan (de koper ondertekent alleen
een off-chain EIP-3009-autorisatie; een facilitator van een derde partij
zendt de echte transactie uit, dit project bouwt of beheert die transactie
nooit). Een apart, nieuw on-chain-bericht zou dus de EERSTE keer zijn dat een
koper Base-ETH moet aanhouden, een transactie moet uitzenden en op bevestiging
moet wachten, iets wat vandaag nergens in dit pakket nodig is (ondertekenen
is overal puur offline). Het verschuift het weglatingsprobleem ook niet weg,
het verplaatst het: van "één host kan iets verzwijgen" naar "elke individuele
koper moet zelf de moeite en kosten nemen om iets te publiceren, anders is
het net zo onzichtbaar als vandaag". Geen overduidelijke verbetering dus. Los
daarvan bevestigde D-012 (hieronder, dezelfde dag, apart onderzoek) dat de
markt dit al heeft gevuld: EAS (Ethereum Attestation Service, live op Base
sinds meerdere jaren, bevraagbaar via een gratis GraphQL-API, onafhankelijk
geverifieerd vandaag) en ERC-8004 zijn precies de publieke,
niet-Tokenizen-gehoste opslag die D-005's route (c) zocht. Zelf een nieuw
contract bouwen zou exact de fout herhalen die D-007 t/m D-013 net vermeden
voor de zes andere lagen: een slechter alternatief bouwen voor iets dat elders
al beter en groter bestaat. Als D-005's trigger ooit afgaat, is het antwoord
dus waarschijnlijk "publiceer een verwijzing naar EAS/ERC-8004", niet "bouw
een eigen ledger-contract", maar dat blijft, net als de rest van route (c),
wachten op die trigger.

**Trigger-criterium voor het on-chain/anchoring-stuk specifiek:** een
concrete, betalende partij (een integrator, geen losse commentator) heeft
een reëel, operationeel probleem met de huidige aanpak (README-uitleg +
zelf-export) EN is bereid de bijkomende complexiteit (gas, wallet-beheer,
transactiebevestiging) zelf te dragen of te financieren. **Wat NIET telt als
trigger:** een tweede goede vraag zonder een tweede echte partij die er
concreet tegenaan loopt, zie D-002's eigen redenering, dezelfde meetlat.

**Status:** vandaag NIET publiekelijk beantwoord: de koning gaf expliciet
opdracht eerst de twee onderliggende problemen aan te pakken voordat er
gereageerd wordt. Concreet gerepareerd: de fabricage-fout hierboven (SEVENTH
FIX) plus drie kleinere, mechanische bevindingen (EIGHTH/NINTH/TENTH FIX).
Concreet uitgebreid: de disclosure (`note`/tool-beschrijving) en een
zelf-export-recept in README. Bewust NIET gebouwd: een on-chain/anchoring-
mechanisme, zie redenering hierboven; blijft open onderzoek met een eigen
trigger-criterium, geen bouwbeslissing vandaag. (Deze tussenstand is later
diezelfde dag ingehaald: zie het 0.4.0-vervolg en de bijgewerkte eindstatus
onderaan D-006. De detectie-keten is toen alsnog gebouwd op expliciete
koning-opdracht, en de publieke reactie is daarna geplaatst.)

**Vervolg 0.4.0, expliciete koning-beslissing: van "alleen documenteren" naar
"het detecteerbare deel bouwen".** De status hierboven zei "geen bouwbeslissing
vandaag". Dat is herzien, en de herziening staat hier zichtbaar in plaats van
dat de oude regel stilletjes wordt weggepoetst: de koning gaf daarna de
expliciete opdracht het probleem alsnog op te lossen, direct of indirect, na
een tweede, diepere onderzoeksronde (Certificate Transparency in de praktijk,
EAS/ERC-8004, cryptografische accumulators, transparency-log-werk 2024-2026,
inclusief een parallel voorstel van een externe AI). Die opdracht van de koning
is zelf een geldige trigger, en het onderzoek gaf een scherp, eerlijk resultaat
dat het bouwen stuurde in plaats van tegenhield.

**Wat het onderzoek vaststelde (met bronnen, samengevat):** volledigheid
VOORAF afdwingen of bewijzen uit één antwoord kan niemand, ook Google's
Certificate Transparency niet (het gossip-mechanisme dat split-view zou
vangen is in 2018 formeel doodverklaard en nooit uitgerold; CT leunt in de
praktijk op een handvol zwaar gefinancierde monitors plus browser-dreigementen,
niet op een bewijs binnen het log). EAS/ERC-8004 lossen vindbaarheid op maar
niet volledigheid tegen een oneerlijke indexer, en ERC-8004's reputatiedata is
empirisch 73-91% sybil-vervuild. Accumulators/sparse-Merkle geven wel een
afwezigheids-bewijs, maar alleen binnen een reeds gecommitteerde toestand, niet
dat de werkelijkheid volledig in die toestand zat. De enige realistische zet
voor een klein pakket is dus de herformulering die zowel de externe AI als het
2024-werk (Consistency-or-Die) delen: maak weglating EXTERN WAARNEEMBAAR in
plaats van onmogelijk, met getuigen die de host niet in handen heeft.

**Wat vandaag gebouwd is (0.4.0):** de goedkoopste getuige die geen coördinator
en geen netwerk nodig heeft is de koper zelf. Nieuw, additief veld
`priorClaimId` (schema.ts, exact dezelfde optioneel/nooit-gedefaulte discipline
als `measured` en `externalRefs`, dus geen enkele bestaande claim verandert,
bewezen door een frozen-preimage-test): elke koper rijgt zijn eigen
opeenvolgende claims over dezelfde verkoper aan elkaar. Omdat de schakel in de
ondertekende inhoud zit, kan een host hem niet weghalen. Nieuwe functie
`analyzeCompleteness` (completeness.ts) draait automatisch in
`get_delivery_history`'s antwoord (`completeness`-veld) en meldt in
`possibleOmissions` elke getoonde claim die terugverwijst naar een claim die
NIET in de uitkomst zit. Dat is het concrete "hier verbergt de host mogelijk
iets"-signaal.

**Het kernpunt dat een adversariële review terecht als blocker markeerde,
zodat we het niet oversellen:** dat `completeness`-veld wordt berekend door
dezelfde (mogelijk oneerlijke) host en zit in het antwoord dat die host
volledig beheert. Een kwaadwillende host kan er dus simpelweg
`chainConsistent: true, possibleOmissions: []` in zetten en toch claims
weglaten. De waarde zit NIET in het veld, maar in de ondertekende
`priorClaimId` in de claims zelf, die de host niet kan vervalsen of weghalen
(bevestigd: `priorClaimId` gaat door `computeClaimId()` en wordt dus door de
handtekening gedekt; strippen breekt de handtekening en de leesroute weigert
de claim). De detectie heeft dus alleen tanden als de LEZER de controle zelf
opnieuw uitrekent (`analyzeCompleteness()` over de teruggekregen, zelf
geverifieerde claims). Het veld in het antwoord is puur een gemak voor de
eerlijke of zelf-gehoste situatie. Dit staat nu expliciet in
completeness.ts, de tool-beschrijving, README (met een recept) en het
`note`-veld zelf, zodat een agent die alleen `chainConsistent` afleest niet
in slaap wordt gesust door een liegende host.

**Wat het NIET oplost, in code en docs eerlijk benoemd:** het betrapt een
verborgen MIDDELSTE claim, niet een verborgen laatste claim (een afgekapte
staart laat geen losse terugverwijzing achter) en niet een verborgen HELE
koper (je kunt geen schakel missen van een keten waarvan je nul schakels zag).
Daarvoor blijven de twee externe getuigen nodig die geen schema-veld kan
vervangen: de eigen bewaarde kopie van de koper (README-recept, D-006 hierboven)
en de publieke betaling op de keten (`settlementRef`). Dit is dus DETECTIE, geen
preventie, en het wordt nergens als preventie gepresenteerd.

**Trigger voor de volgende, zwaardere stap (transparency-log met witness-
cosigning, of on-chain anchoring):** een echte, betalende integrator die het
huidige detectie-niveau aantoonbaar te zwak vindt voor zijn geval en de
bijbehorende complexiteit/kosten wil dragen. Zie de aparte trigger hierboven
voor het on-chain-stuk. Tot dan is de per-koper-keten het eerlijke,
proportionele antwoord.

**Status (bijgewerkt 2026-09-06, avond):** per-koper-keten gebouwd, getest
(494 tests, plus een openbare fixture met 9 controles, `npm run fixture`),
gemerged naar main en gepubliceerd als `capacity-attest@0.4.0` op npm, met een
GitHub-release (v0.4.0). Daarna, en pas daarna, publiekelijk beantwoord op
x402-foundation/x402#3379 (comment 5560977571): het antwoord verwijst naar de
draaibare fixture en deze D-006-sectie, zodat de lezer alles zelf kan
natrekken in plaats van ons op ons woord te geloven. Zwaardere
transparency-infrastructuur: nog steeds open, met de scherpere trigger
hierboven.

---

## D-007 t/m D-013: de zes lagen naast Evidence (2026-09-06 workflow)

Achtergrond die voor alle zeven items hieronder geldt: een workflow van 14
agents (2026-09-06) onderzocht met echte webresearch of dit project ook de
zes lagen naast zijn eigen Evidence-laag moet bouwen: Identity, Authority,
Intent, Execution, Settlement, Discovery, Liability. Elk van de zeven kreeg
een eigen research-agent (met WebSearch/WebFetch) en daarna een aparte,
onafhankelijke kill-test-agent met opdracht de conclusie te ontkrachten.
Volledige bronnen, redenering en scores per laag: het artifact
`tokenizen-lagenkaart` (gepubliceerd 2026-09-06, gelinkt vanuit de sessie in
wazir-al-ghanima) en de ruwe agent-journal van die workflow-run.

De meta-uitkomst gold voor alle zeven: de markt heeft elke laag sneller
gevuld dan een los onderzoek naar "wat ontbreekt er in de agent-economie"
had aangenomen. ERC-8004, Google AP2, Microsoft Entra Agent ID, Okta/Auth0,
de x402 Foundation en het Legal Context Protocol bezetten elke laag al met
echte productie-infrastructuur, gebouwd door partijen met een schaal die een
team van 1-3 engineers niet kan evenaren. Zelf zo'n laag bouwen zou dus geen
gat vullen, het zou een slechter alternatief bouwen voor iets dat elders al
beter en groter bestaat.

Belangrijk onderscheid met D-001 t/m D-006: die items zijn allemaal "niet
bouwen, wacht op een trigger". D-007, D-008, D-009 en D-013 hieronder zijn
dat OOK voor de laag als geheel (bouw geen eigen Identity/Authority/Intent/
Liability-protocol), maar bevatten daarnaast een klein, apart besluit: een
puur citerend, nooit-geverifieerd verwijs-veld toevoegen aan het bestaande
`DeliveryClaim`-schema kost niets (geen nieuwe autoriteit, geen nieuwe
trust-registry, backward-compatible zoals `measured` in 0.2.0), dus dat IS
vandaag al gebouwd, zonder op een trigger te wachten. Voor Execution en
Settlement geldt die uitzondering niet: daar zou zelfs het kleine veld een
halfafgemaakte functie zijn zonder de bijbehorende actieve verificatielogica,
dus die blijven volledig wachten op een trigger, net als D-001 t/m D-004.

---

### D-007: Identity, wie is deze agent?

**Hypothese:** capacity-attest kent een agent alleen als een 0x-adres plus
een sluitende handtekening. Zou een rijkere, eigen identiteitslaag (een
naam, een profiel, een eigen registry) iets toevoegen?

**Waarom nu niet als eigen laag:** ERC-8004 (Identity/Reputation/Validation-
registries) draait sinds 29-01-2026 op Ethereum-mainnet, precies in
capacity-attest's eigen niche van wallet-adres-gebaseerde agents, met ENS/
EigenLayer/The Graph/Ethereum Foundation-adjacente steun. Daarnaast is elke
aangrenzende sub-laag al bezet: Microsoft Entra Agent ID (verplicht in
Copilot Studio sinds juli 2026), Okta Agent SSO (GA aug 2026), en
commerciële Know-Your-Agent-diensten (Sumsub, Vouched). Evidence-niveau 7:
infrastructuur wordt hier al verplicht gesteld, niet alleen aangeboden.

**Wat vandaag wel gebouwd is (geen trigger nodig, kost niets):**
`externalRefs.sellerAgentRef` / `externalRefs.buyerAgentRef`: optionele,
ongeverifieerde verwijs-strings naar een externe identiteitsbron (bv. een
ERC-8004-agent-id of DID). capacity-attest resolvet of beoordeelt dit veld
zelf niet, exact dezelfde postuur als `evidenceHash`.

**Update dezelfde dag, later:** de koning gaf expliciet opdracht om verder
te gaan dan het citaat-veld, zodat "de grote jongens" (ERC-8004 als eerste,
gegeven evidence-niveau 7 hierboven) daadwerkelijk met dit systeem kunnen
praten, niet alleen ernaar verwezen worden. Dat is zelf een geldig
trigger-criterium: een expliciete, bewuste product-beslissing van de
projecteigenaar is geen "onderbuikgevoel" of "dit leek me nuttig" (de
dingen die D-001 t/m D-006 willen voorkomen), het is een bewuste afweging
door de partij die uiteindelijk verantwoordelijk is voor de scope.

**Wat daardoor ook gebouwd is:** `resolve_agent_identity`, een read-only
MCP-tool (`src/erc8004.ts`) die `ownerOf(agentId)` en `tokenURI(agentId)`
aanroept op een door de aanroeper zelf opgegeven ERC-8004 Identity Registry
(`eip155:<chainId>:<registryAddress>` + `rpcUrl`, beide verplicht, geen
hardcoded adres of RPC, want ERC-8004 heeft onafhankelijke deployments per
chain en de EIP-tekst zelf noemt geen canoniek adres). Alleen de standaard
ERC-721-interface wordt gebruikt, niets ERC-8004-specifieks. Haalt bewust
NOOIT op wat `tokenURI` aanwijst (dat zou een SSRF-vormig risico zijn op
aanroeper-gecontroleerde on-chain data); geeft de rauwe pointer terug.

**Echt getest, niet alleen gemockt:** 14 tests in `erc8004.test.ts` tegen
een injecteerbare `ContractFactory` (geen netwerkafhankelijkheid in CI).
Daarbovenop een ECHTE, live controle (`examples/verify-erc8004-live.mjs`):
het adres `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` is op 2026-09-06
geverifieerd via een losse `eth_getCode`-aanroep op Base mainnet (echte
bytecode, geen leeg adres), en `ownerOf(2290)`/`tokenURI(2290)` zijn zowel
via rauwe `eth_call`-calldata als via de daadwerkelijke package-code
opgevraagd, met identiek resultaat: eigenaar `0x715Dc035fFb97dD7bB4095C6670138BA05BB4E6d`,
`tokenUri` `ipfs://bafkreifa2kvzjrtozvznce2bc3rwc7uzronxkm3w5fe2v6bjyfp52tci6e`.
Dit is dus aantoonbaar werkende interoperabiliteit met een echt, live,
extern systeem, niet alleen een schema-veld dat niemand ooit aanroept.

**Status:** veld gebouwd (0.3.0, ongepubliceerd, dev-branch).
`resolve_agent_identity`-tool gebouwd en live geverifieerd tegen Base
mainnet (0.3.0, ongepubliceerd, dev-branch), op expliciete opdracht van de
koning, niet op een externe trigger.

---

### D-008: Authority, wat mag deze agent doen?

**Hypothese:** de README noemt "policy- en scope-controle tussen agents"
als groen-gewenst, maar niets in het schema controleert budget, scope of
mandaat. Moet capacity-attest dat zelf bouwen?

**Waarom nu niet als eigen laag:** de vraag valt in drie stukken en elk stuk
is al bezet. Enterprise/single-org-autoriteit: Microsoft Entra Agent ID en
Okta/Auth0 Fine-Grained Authorization, GA en betaald sinds april 2026.
Cross-org kaartrail-autoriteit: Google AP2's Mandates, gedoneerd aan de FIDO
Alliance, gekoppeld aan Mastercard. De crypto-native/x402-niche die het best
bij capacity-attest zou passen: op 14-07-2026 formeel eerstvolgend werkitem
van de operationeel geworden x402 Foundation (Linux Foundation, Visa/
Mastercard/Google/Coinbase/Stripe als leden); de kill-test vond
daarbovenop al 9+ concurrerende individuele IETF-drafts (AIP, AAE, x402-
delegation-binding, draft-singla-agent-identity-protocol,
draft-mcgraw-httpapi-agent-budget e.a.) plus een al-productie a2a-x402-
extensie van Google/Coinbase/Ethereum Foundation/MetaMask. Een team van 1-3
zou hier geen vierde maar een tiende toetreder zijn.

**Wat vandaag wel gebouwd is (geen trigger nodig, kost niets):**
`externalRefs.mandateRef` + `externalRefs.mandateIssuerDid`: optionele
verwijzing naar een extern uitgegeven autoriteits-/mandaat-object en de DID
van de uitgever. Puur citaat, geen eigen autoriteit, geen eigen sleutel-
beheer.

**Trigger-criterium voor méér dan het citaat-veld** (de voorgestelde
`verify_mandate_scope`-tool, die actief zou controleren of een extern
mandaat de claim dekt): een externe partij vraagt concreet om budget/scope-
controle bovenop een claim. **Wat NIET telt als trigger:** het feit dat de
README dit ooit als wenselijk noemde, dat is de oorspronkelijke hypothese,
geen bevestiging uit de praktijk.

**Status:** velden gebouwd (0.3.0, ongepubliceerd, dev-branch). Tool: niet
bouwen, wacht op trigger.

---

### D-009: Intent, wat wilde de opdrachtgever oorspronkelijk?

**Hypothese:** `promisedSpec` is de koper's eigen invulling van wat beloofd
was. Ontbreekt er een apart, vooraf ondertekend mandaat van de échte
opdrachtgever?

**Waarom nu niet als eigen laag:** Google AP2's IntentMandate (W3C
Verifiable Credential, productie sinds sep 2025, v0.2 apr 2026) plus
Mastercard/Google's "Verifiable Intent" (mrt 2026) en Visa's Trusted Agent
Protocol dekken dit al. AP2 zit bovendien expliciet als autorisatielaag
BOVEN x402, de rail die capacity-attest zelf gebruikt, en waar dit project
al twee bijdragen aan leverde. De kill-test vond een feitelijke fout in het
eerste onderzoek (een verzonnen "budget"-veld op IntentMandate, dat in
werkelijkheid op een apart object zit), de correctie maakt de conclusie
steviger: de echte IntentMandate is nog smaller retail/SKU-vormig dan
gedacht, dus zelfs de "dunne niche" (compute-vormig intent) is te mager
voor een 12-maanden-project.

**Wat vandaag wel gebouwd is (geen trigger nodig, kost niets):**
`externalRefs.intentRef`: optionele verwijzing naar een extern, vooraf
ondertekend intent-object (bv. een AP2 IntentMandate).

**Trigger-criterium voor meer** (een eigen schema-mapping tussen assetType
en AP2's retail-vormige IntentContents): een echte externe gebruiker
probeert via een AP2-achtig mandaat compute/GPU-uren/API-credits/bandbreedte
te verhandelen en loopt vast omdat AP2's velden niet passen.

**Status:** veld gebouwd (0.3.0, ongepubliceerd, dev-branch). Schema-mapping:
niet bouwen, wacht op trigger.

---

### D-010: Execution, wat heeft de verkoper werkelijk gedaan?

**Hypothese:** `evidenceHash` is een hash die niemand verifieert en
`delivered` is de koper's eigen oordeel. Zou een tweede, onafhankelijke
handtekening (verkoper of derde partij) hier waarde toevoegen?

**Waarom nu niet, en waarom dit WAIT is, geen DO_NOT_BUILD:** het zware,
technisch interessante deel (cryptografisch/hardware-bewijs dat een
berekening echt plaatsvond) wordt al gebouwd door gespecialiseerde,
gefinancierde teams: Phala Network (productie, TEE-GPU's), Attestable ($20M
seed, aug 2026), Intel Trust Authority. Gensyn's Judge/Verde lost het ook op,
maar met een eigen token, precies de rode lijn van dit project. Zelfs
Google's AP2/Universal Commerce Protocol laat fulfillment bewust aan de
verkoper. De kill-test vond bovendien dat ERC-8004's Validation Registry al
generiek precies het voorgestelde `counterSignature`-idee aanbiedt (een
derde partij tekent een attestatie terug, zonder verplichte TEE/zkML). Bij
een echte trigger is de eerste stap dus ERC-8004-interoperabiliteit
onderzoeken, geen eigen veld verzinnen.

**Waarom hier, anders dan D-007/D-008/D-009, GEEN veld vandaag is gebouwd:**
geen van de twee echte externe contacten van dit project heeft ooit gevraagd
om onafhankelijke verificatie van een `delivered`-claim. Vooruitbouwen zou
de eigen discipline van D-001/D-002/D-003 doorbreken: wacht op een echt
gemeld geval, niet op een hypothese, ook al is het veld zelf goedkoop.

**Trigger-criterium:** een tweede partij (verkoper of een door beide
partijen aangewezen onafhankelijke verifier) vraagt concreet om een claim te
kunnen tegenspreken of bevestigen. **Wat NIET telt als trigger:** een
theoretisch "dit zou nuttig kunnen zijn".

**Status:** niet bouwen. Geen code vandaag. Wacht op trigger.

---

### D-011: Settlement, hoe wordt er afgerekend?

**Hypothese:** `settlementRef` is vrije tekst, nooit geverifieerd tegen een
echte facilitator of chain. Zou een `settlementVerified`-veld dat gat
dichten?

**Waarom nu niet:** de rail zelf (geld echt verplaatsen, on-chain
bevestigen) is volledig gedomineerd door de x402 Foundation (Linux
Foundation, ~40 leden, honderden miljoenen euro's jaarvolume), Google AP2 en
Base's Commerce Payments Protocol (5x extern geaudit, live op mainnet). De
ene subniche die nog open ligt (leverings-conditionele escrow-release)
vereist per definitie uitgestelde afwikkeling, en dat is precies wat dit
project's eigen gele regel ("settlement is spot-only") uitsluit. Dit project
kan die subniche dus niet eens betreden zonder de eigen ontwerpgrens te
breken.

**Waarom hier GEEN veld is gebouwd, in tegenstelling tot D-007/D-008/D-009:**
de enige waarde van `settlementVerified` zou zitten in de ACTIEVE controle
(automatisch de settlementRef bevragen bij een publieke facilitator/RPC en
vergelijken met de claim). Een kaal veld zonder die logica is een
halfafgemaakte functie die meer suggereert dan hij waarmaakt, precies het
soort ding dat dit project's eigen discipline (geen schijnzekerheid)
verbiedt. De actieve verificatielogica zelf is een apart, groter stuk werk
(netwerkaanroepen, meerdere chains/facilitators) dat een eigen ontwerp- en
trigger-beslissing verdient, geen bijvangst van deze workflow.

**Trigger-criterium:** een externe partij noemt een niet-geverifieerde
`settlementRef` concreet als probleem, of als reden om een claim te
wantrouwen. **Wat NIET telt als trigger:** de algemene observatie dat
verificatie "vast wel eens nuttig is".

**Status:** niet bouwen. Geen code vandaag. Wacht op trigger.

---

### D-012: Discovery, hoe vindt agent B een claim over agent A op een andere installatie?

**Hypothese:** is dit een nieuwe, aparte vraag naast D-005?

**Antwoord: nee, dit IS D-005, opnieuw getoetst met verse webresearch.** De
uitkomst bevestigt D-005's eigen analyse en maakt hem sterker: ERC-8004
(Identity/Reputation/Validation-registries, mainnet, ~500k geregistreerde
agents) en de Ethereum Attestation Service (9,5M+ attestaties sinds 2021)
geven al precies het publieke, niet-Tokenizen-gehoste opslag- en lookup-
mechanisme dat D-005's optie (c) zocht. De kill-test vond zelfs nog directere
concurrenten specifiek binnen de x402-ecosystem zelf (AgentZone, Onyx
Bazaar, gold-402, x402Scan) die precies "vind signalen over een verkoper
over installaties heen" al oplossen, gebouwd door kleine teams bovenop
bestaande infra.

**Wat dit betekent:** geen nieuw veld, geen nieuwe tool. D-005's eigen
trigger-criterium en de drie routes (a/b/c) blijven ongewijzigd van kracht.
`claimId`/`signature` zijn al direct publiceerbaar als EAS-schema of
ERC-8004-feedback zodra D-005's trigger (de EmbryoSpace cross-chain
bijdrage) zich voordoet.

**Status:** geen actie. Zie D-005 voor het trigger-criterium.

---

### D-013: Liability, wie draagt de gevolgen bij een geschil?

**Hypothese:** een `delivered: no`-claim is bewijs, maar wijst niemand aan
wie verantwoordelijk is of wat er daarna gebeurt. Moet capacity-attest een
eigen geschillen-/aansprakelijkheidsmechanisme krijgen?

**Waarom nu niet als eigen laag:** het Legal Context Protocol (American
Arbitration Association + Integra Ledger, Apache-2.0, live sinds 24-06-2026)
is functioneel al de Liability-laag: een open, ondertekenbaar record van
geldend recht en geschilverwijzing per transactie, met expliciete
koppelvlakken naar x402, AP2 en MCP, gesteund door Google, IBM, Circle,
Wayfair en meer. Wat het niet dekt, dekken Mastercard/Visa (kaartrail-
fraude), Justt/Chargeflow ($100M opgehaald, 250+ enterprise klanten) en
Armilla+Chaucer bij Lloyd's (AI-aansprakelijkheidsverzekering, feb 2026). De
kill-test vond bovendien x402Refunds.com, een live, solo-founder-gebouwde
dienst voor exact deze niche op dezelfde rail, bewijst dat een klein team
dit technisch kan bouwen, maar ook dat de niche al bezet is.

**Wat vandaag wel gebouwd is (geen trigger nodig, kost niets):**
`externalRefs.disputeContext` (`protocol` + `termsHash` + optioneel
`resolutionRef`): alleen te vullen als koper en verkoper al externe
geschil-voorwaarden accepteerden bij settlement. Geen eigen arbitrage, geen
eigen oordeel: een `delivered: no`-claim met dit veld wordt bruikbaar bewijs
in een bestaand extern geschil, in plaats van dat dit project zelf beslist
wie gelijk heeft.

**Trigger-criterium voor méér** (eigen geschillenlogica, wat het rode-lijn-
risico "eigen arbitrage/eigen waarheid" zou oproepen): een echt gemeld
geschil tussen een koper en verkoper op dit project. **Wat NIET telt als
trigger:** een hypothetisch "er zou ooit een geschil kunnen zijn".

**Status:** veld gebouwd (0.3.0, ongepubliceerd, dev-branch). Eigen
geschillenlogica: niet bouwen, wacht op trigger.

---

## D-014 t/m D-015: twee overgebleven bevindingen uit de misbruik-scan van 2026-09-06, bewust niet vandaag gerepareerd

Achtergrond: dezelfde brede misbruik-scan die de SEVENTH/EIGHTH/NINTH/TENTH
fix in D-006 hierboven opleverde, vond ook deze twee. Beide zijn ECHT, geen
van beide is vandaag gerepareerd, en dat is een bewuste keuze, geen
oversight: beide vereisen een eigen ontwerpbeslissing (welke limiet, welk
gedrag bij overschrijding) in plaats van een ondiscutabele mechanische fix.
Ze hier apart loggen in plaats van stilzwijgend te laten liggen is precies
het verschil tussen "eerlijk een open poort melden" en "een lek stilletjes
doorlaten" (koning-profiel 5.2).

### D-014: niets kost een koper iets om onbeperkt claims te fabriceren

**Hypothese:** `settlementRef` en `evidenceHash` zijn vrije, zelf-opgegeven
velden (bewust, zie README "Relatie tot x402"), niets controleert dat er
echt een x402-betaling achter zit. Een aanvaller met één (ongefinancierd)
testwallet kan dus, zonder ooit echt te betalen, in een lus geldige,
correct-ondertekende claims blijven produceren (elke keer een andere
`settlementRef` of timestamp geeft een andere, geldige `claimId`). Dat opent
twee concrete misbruiken: een verkoper die zichzelf honderden `delivered:
"yes"`-claims geeft (zelf-inflatie), of een aanvaller die een concurrent
`delivered: "no"`-claims geeft met een waardeloze `settlementRef`
(reputatieschade). Beide zien er in `get_delivery_history`'s antwoord
identiek uit aan een echte claim. Een aanverwant effect: `appendClaim()`
gebruikt precies één, bestandsbrede lock (niet per verkoper), dus een vloed
van claims voor willekeurig welke verkoper vertraagt tijdelijk ALLE andere
`record_delivery`-aanroepen op dezelfde gedeelde ledger.

**Waarom nu niet:** dit is een reeds bekend, bewust aanvaard MVP-grens, geen
nieuwe ontdekking: README's eigen "Relatie tot x402"-sectie noemt
`settlementRef`-verificatie tegen een echte facilitator al expliciet als TODO
buiten deze MVP. De misbruik-scan maakt het concreter (een exacte
aanvalslus, een naam voor het lock-effect) maar verandert de onderliggende
afweging niet: een echte oplossing (settlementRef actief bevragen bij een
facilitator/chain, of een soort bonding/rate-limit per sleutel) is precies
het soort "actieve verificatielogica" dat D-011 hierboven om dezelfde reden
NIET vandaag bouwt: een half werkend veld zonder de bijbehorende actieve
controle is schijnzekerheid, erger dan de huidige eerlijke "vrije tekst,
koper vult eerlijk in"-aanname.

**Trigger-criterium:** een echte partij ondervindt hier concrete schade van
(een verkoper wijst op zelf-inflatie door een concurrent, of een koper meldt
een vloed van valse claims tegen zijn adres), OF de D-011-trigger afgaat
(iemand noemt een ongeverifieerde `settlementRef` concreet als reden om een
claim te wantrouwen); in dat laatste geval lost de D-011-oplossing dit
grotendeels vanzelf mee op. **Wat NIET telt als trigger:** de theoretische
constatering dat dit "zou kunnen" zonder een echte partij die het doet of
erdoor geraakt wordt.

**Status:** niet bouwen. Bekende, bewuste MVP-grens, nu explicieter
gedocumenteerd. Wacht op trigger.

### D-015: `get_delivery_history`'s antwoord is onbegrensd en synchroon

**Hypothese:** elke andere O(n)-route over de ledger in dit bestand
(`resyncFromDisk`'s parse/sort/bySeller-opbouw) is vandaag al eerder
gehard met batches en een echte yield, na gemeten blokkades van
tientallen tot honderden milliseconden bij realistische schaal (zie
ledger.ts's eigen FIRST/THIRD/SIXTH FIX-commentaar). `get_delivery_history`'s
eigen antwoordpad (`textResult()` in index.ts, één ongebatchte
`JSON.stringify(value, null, 2)` over de volledige, ongelimiteerde
`claims`-array) kreeg diezelfde behandeling nooit. Bij een verkoper met een
organisch lange geschiedenis, of bij het D-014-scenario hierboven
(duizenden gefabriceerde claims tegen één verkoper), blokkeert dit exact
dezelfde klasse probleem die elders in dit bestand al meermaals is gefixt.

**Waarom nu niet:** de juiste oplossing (limiet op aantal geretourneerde
claims? paginering? alleen de meest recente N met het echte totaal erbij?)
is een productbeslissing die het antwoord-contract wijzigt, niet een
mechanische toevoeging zoals de SEVENTH t/m TENTH fix. Zonder een reëel
geval van een lange geschiedenis is elke keuze hier een gok naar de
verkeerde kant: te laag afkappen verbergt net de late, mogelijk negatieve
claims die het belangrijkst zijn om te zien.

**Trigger-criterium:** een reële verkoper-geschiedenis (organisch, of via
D-014) wordt daadwerkelijk lang genoeg om dit merkbaar te maken (trage
respons, of een gemeten event-loop-blokkade zoals de bestaande bench/-
scripts dat voor de andere routes al meten). **Wat NIET telt als trigger:**
de theoretische constatering dat een array "in principe" onbegrensd kan
groeien.

**Status:** niet bouwen. Bekend, gedocumenteerd, wacht op een gemeten geval
voordat er een keuze wordt gemaakt over HOE te begrenzen.
