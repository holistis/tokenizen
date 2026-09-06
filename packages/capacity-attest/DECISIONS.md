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
