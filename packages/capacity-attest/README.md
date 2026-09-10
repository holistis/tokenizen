# capacity-attest

MCP-server voor leverings-attestaties bij x402-capaciteitshandel tussen AI-agents.

> Status: MVP, gepubliceerd op npm (`npm install capacity-attest`) en in het officiële MCP-register (`io.github.holistis/capacity-attest`).

## Onafhankelijk gecontroleerd, niet alleen beweerd

Beweringen over dit project zijn hieronder allemaal aanklikbaar en zelf na te trekken, niet op ons woord te geloven.

| Wat | Door wie | Status |
|---|---|---|
| Gebruikt `capacity-attest@0.2.0` als echte dependency, verifieert claim-digest/claimId/handtekening via onze eigen code | [YE-YI7/asm-spec#18](https://github.com/YE-YI7/asm-spec/pull/18) | Gemerged |
| BSV-rail-adapter op hetzelfde content-geadresseerde claim-formaat | [YE-YI7/asm-spec#19](https://github.com/YE-YI7/asm-spec/pull/19) (auteur EmbryoSpace) | Gemerged |
| Onze grensuitspraken ("vindbaarheid ≠ volledigheid") zelf op de keten geverifieerd door een derde, geen woord aangenomen | [x402-foundation/x402#3379](https://github.com/x402-foundation/x402/issues/3379) | Publiek, doorlopend |
| Live delivery-claims als on-chain attestaties op Base mainnet, door iedereen te decoderen | [delivered=yes](https://base.easscan.org/attestation/view/0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc) · [delivered=no](https://base.easscan.org/attestation/view/0xe736b005cbcb54f8f196ac64ef09d75d939c8a18c0d5d9670b5c5025c07398c4) | Live |
| Voorgesteld als koperszijde-aanvulling op een andermans agent-spec | [omworldprotocol/om-world#18](https://github.com/omworldprotocol/om-world/pull/18) | In review, nog niet gemerged |

## Waarom dit bestaat

Wanneer een AI-agent via het [x402-protocol](https://www.x402.org/) betaalt voor capaciteit (GPU-uren, opslag, API/inference-credits, bandbreedte) bij een andere agent of dienst, is er na de betaling geen bewijs dat het beloofde ook echt geleverd is. De kopende agent weet het zelf (hij zag de output, of zag hem niet), maar die kennis gaat verloren zodra de sessie eindigt. De volgende agent die met dezelfde verkoper zaken wil doen, begint weer blind.

`capacity-attest` lost dat specifieke gat op: na afwikkeling laat de **betalende** agent een cryptografisch ondertekende, feitelijke claim achter (`delivered: yes/no/partial` + een hash van het bewijsmateriaal). Andere agents kunnen die geschiedenis opvragen **voordat** ze zelf met die verkoper in zee gaan.

Geen oordeel. Geen reputatiescore. Geen "vonnis", puur een ondertekende bon-plus-claim, net zoals een afleverbon bij een fysieke levering.

## Wat dit NIET is

Dit is bewust en hardcoded **niet**:

- **Geen reputatiescore of rating.** `get_delivery_history` retourneert de ruwe, chronologische lijst van claims, geen gemiddelde, geen percentage, geen "trust score". Het samenvatten tot één getal is impliciet een oordeel, en dat is expliciet afgewezen tijdens de besluitvorming voor dit project.
- **Geen financieel product.** Geen rente, geen tijd-disconto op betalingen, geen yield op het ledger-saldo (er ís geen saldo, dit is geen escrow), geen lening, geen onderpand, geen invoice-financing/factoring. `assetType` is een gesloten enum van capaciteitssoorten (`gpu-hours`, `storage`, `api-credits`, `bandwidth`) en bevat bewust niets dat op een financieel instrument lijkt.
- **Geen eigen token of munt.** Betalingen lopen via x402/USDC zoals gebruikelijk; dit project registreert alleen de *bon* van een afwikkeling die al ergens anders heeft plaatsgevonden.
- **Geen krediet-verlening.** Een claim wordt pas gemaakt **na** een voltooide betaling. Dit project financiert niets, het documenteert een reeds afgeronde ijara (verhuur/dienst)-transactie.
- **Geen eigen identity-, autoriteits- of geschillenlaag.** `externalRefs` (zie hieronder) is puur een citaat naar een systeem van een ander (ERC-8004, AP2, Legal Context Protocol, ...). Dit project resolvet, verifieert of beoordeelt die verwijzing zelf nooit. Zie [DECISIONS.md](./DECISIONS.md) D-007 t/m D-013 voor waarom dit bewust geen eigen protocol is geworden.

Dit is een bewuste, formeel getoetste ontwerpkeuze, niet een toevallige scope-beperking. Zie de guardrails-sectie in het project-brief als je overweegt hier iets aan toe te voegen: bij twijfel of een veld/functie hiertegenaan schuurt, laat het weg.

Bewust uitgestelde features (verankering, tussentijdse status, formele conformance-vectoren), inclusief de precieze voorwaarde waaronder we ze alsnog zouden bouwen: zie [DECISIONS.md](./DECISIONS.md).

## Hoe het werkt

### 1. `record_delivery`

De betalende agent (de koper) roept dit aan **na** een x402-afwikkeling, zodra bekend is of het beloofde is aangekomen. De claim bevat:

| Veld | Betekenis |
| --- | --- |
| `sellerAddress` | 0x-adres van de partij die betaald werd |
| `buyerAddress` | 0x-adres van de betalende agent, moet overeenkomen met het adres dat uit `signature` wordt teruggerekend |
| `assetType` | `gpu-hours` \| `storage` \| `api-credits` \| `bandwidth` |
| `promisedSpec` | Wat er beloofd was: vrije tekst of een gestructureerd object |
| `delivered` | `yes` \| `no` \| `partial` |
| `evidenceHash` | sha256-hex van bewijsmateriaal (logs, response-payload, ...), het bewijs zelf wordt niet opgeslagen |
| `settlementRef` | x402-payment-ref of on-chain tx-hash van de onderliggende betaling |
| `timestamp` | ISO-8601 tijdstip |
| `claimId` | content-addressed sha256-hash van alle velden hierboven, zie `computeClaimId()` in `src/schema.ts` |
| `signature` | EIP-191 personal-sign handtekening van de koper over `claimId` |
| `externalRefs` | *(optioneel, sinds 0.3.0)* ongeverifieerde verwijzingen naar andere agent-economie-infrastructuur: `sellerAgentRef`/`buyerAgentRef` (bv. een ERC-8004-agent-id of DID), `mandateRef`+`mandateIssuerDid` (een extern uitgegeven AP2/AAE-mandaat), `intentRef` (een extern AP2 IntentMandate), `disputeContext` (`protocol`+`termsHash`+optioneel `resolutionRef`, bv. een Legal Context Protocol-verwijzing). Zie [DECISIONS.md](./DECISIONS.md) D-007 t/m D-013 |
| `priorClaimId` | *(optioneel, sinds 0.4.0)* de `claimId` van jouw vorige claim over dezelfde `sellerAddress`, zodat jouw claims over die verkoper een ketting vormen. Weggelaten bij je eerste claim over een verkoper. Zit in de ondertekende inhoud, dus een host kan het niet weghalen. Laat een lezer een host betrappen die een middelste claim verbergt. Zie [DECISIONS.md](./DECISIONS.md) D-006 |

De server valideert eerst het schema, dan of `claimId` echt de hash van de inhoud is, en dan of `signature` echt terugrekent naar `buyerAddress`. Alleen dan wordt de claim toegevoegd aan de append-only ledger (`data/claims.jsonl`). Een ongeldige handtekening of een claim die al eerder is opgeslagen (zelfde `claimId`) wordt geweigerd.

### 2. `get_delivery_history`

Gegeven een `sellerAddress`, retourneert dit alle bekende claims tegen die verkoper op déze installatie, chronologisch (oudst eerst). Puur feitelijk, geen samengevat getal. Een kopende agent roept dit aan **vóórdat** hij betaalt, om de ruwe leveringsgeschiedenis van een potentiële verkoper te zien en zelf te beoordelen.

Het antwoord bevat naast `sellerAddress`, `count` en `claims` ook `scope` (altijd `"local-ledger"`) en `note`: een vaste, feitelijke tekst die uitlegt dat dit resultaat alleen de lokale ledger van déze installatie weerspiegelt. Een lege of korte geschiedenis betekent niet dat de verkoper een schone staat van dienst heeft, het kan ook betekenen dat er hier simpelweg nog geen claims zijn vastgelegd. Zie [DECISIONS.md](./DECISIONS.md) (D-005) voor de bredere architectuurvraag hierachter: hoe vindt een koper claims die op een ándere installatie zijn vastgelegd.

Sinds 0.4.0 bevat het antwoord ook `completeness`: een analyse van de per-koper ketens (`priorClaimId`) in precies deze uitkomst. Als een getoonde claim terugverwijst naar een claim die NIET in de uitkomst zit, komt die in `possibleOmissions` te staan. Dat is een concreet, controleerbaar signaal dat de host mogelijk een middelste claim verbergt, in plaats van een vaag vermoeden.

Let op, dit is het belangrijkste punt: dat `completeness`-veld wordt berekend door dezelfde server die de claims teruggeeft. Vertrouw je die server niet, vertrouw dan ook het veld niet, want een oneerlijke host kan er gewoon "alles compleet" in zetten. De echte zekerheid zit in de ondertekende `priorClaimId` in de claims zelf, die een host niet kan vervalsen of weghalen. Reken de controle dus zelf opnieuw uit over de teruggekregen claims:

```js
// recompute-completeness.mjs
import { verifyClaim } from "capacity-attest/dist/signing.js";
import { analyzeCompleteness } from "capacity-attest/dist/completeness.js";

// `claims` = de array uit het get_delivery_history-antwoord.
const allSigned = claims.every((c) => verifyClaim(c).ok);   // elke claim echt?
const report = analyzeCompleteness(claims);                  // zelf herrekenen, niet het host-veld geloven
console.log({ allSigned, chainConsistent: report.chainConsistent, possibleOmissions: report.possibleOmissions });
```

Eerlijke grens: ook zelf-herrekenen betrapt geen verborgen laatste claim en geen verborgen hele koper, want daar valt geen schakel over te struikelen. En een losse terugverwijzing hoeft geen bedrog te zijn: de eerdere claim kan ook gewoon op een andere installatie zijn vastgelegd (het D-005-geval). Voor echte zekerheid blijven de externe getuigen nodig: je eigen bewaarde kopie hierboven, en de betaling op de keten via `settlementRef`. Zie [DECISIONS.md](./DECISIONS.md) D-006.

Een openbaar, zelf-controleerbaar voorbeeld met een nagebootste verbergende host en expres-kapotte testgevallen staat in [docs/COMPLETENESS-FIXTURE.md](./docs/COMPLETENESS-FIXTURE.md). Draai het met `npm run fixture`; dezelfde controles draaien bij elke push als test. Zo kun je onze claim zelf natellen in plaats van ons op ons woord te geloven.

## Claims van andere installaties vinden (D-005)

`get_delivery_history` is per definitie lokaal: koper B ziet niet wat koper A op een andere installatie vastlegde over dezelfde verkoper. Omdat elke claim zelf-verifieerbaar is, heeft vindbaarheid geen vertrouwde index nodig. `discoverDeliveryHistory(seller, sources)` (zie `src/discovery.ts`) leest een verkopers claims uit meerdere onafhankelijke, ONvertrouwde bronnen (je lokale ledger plus elk host-onafhankelijk substraat dat je wilt lezen), ontdubbelt, herverifieert elke claim, filtert andere verkopers eruit, en draait de completeness-check over het geheel. Een bron die nep injecteert wordt geweigerd; een bron die weglaat is het D-006-probleem, meegenomen maar niet magisch opgelost.

De productie-onderlaag (EAS op Base, ERC-8004) is bewust nog niet live gekoppeld: dat kost gas en wacht op een echte integrator. De naad staat klaar. Een openbaar, draaibaar voorbeeld met twee nagebootste installaties staat in [docs/DISCOVERY-FIXTURE.md](./docs/DISCOVERY-FIXTURE.md), draai het met `npm run discovery-fixture`. Zie [DECISIONS.md](./DECISIONS.md) D-005.

### 3. `resolve_agent_identity` *(sinds 0.3.0)*

Read-only opzoeking tegen een ERC-8004 Identity Registry: wie bezit `agentId` (`ownerOf`) en waar staat zijn registratiebestand (`tokenURI`). Alleen de standaard ERC-721-interface wordt aangeroepen, niets ERC-8004-specifieks. Vereist van de aanroeper zowel `agentRegistryRef` (`"eip155:<chainId>:<registryAddress>"`) als een `rpcUrl` voor die chain: dit project bundelt bewust geen eigen RPC-provider en geen canoniek registry-adres, want ERC-8004 heeft onafhankelijke deployments per chain en de EIP-tekst zelf noemt geen vast adres. Haalt bewust NOOIT op wat `tokenURI` aanwijst (dat blijft een pointer die de aanroeper zelf desgewenst opvraagt); dat zou een SSRF-vormig risico zijn op aanroeper-gecontroleerde on-chain data.

Getest tegen een injecteerbare `ContractFactory` (`src/erc8004.test.ts`, geen netwerkafhankelijkheid) én live tegen de echte, gedeployde registry op Base mainnet (`examples/verify-erc8004-live.mjs`, `npm run build && node examples/verify-erc8004-live.mjs`). Zie [DECISIONS.md](./DECISIONS.md) D-007 voor de volledige achtergrond.

### 4. `publishReputationFeedback` *(sinds 0.6.0, library-functie, geen MCP-tool)*

Publiceert het `delivered`-feit van een al ondertekende claim naar een ERC-8004 Reputation Registry se `giveFeedback()` — dezelfde plek waar ~500k geregistreerde agents al naar reputatiesignalen kunnen kijken, in plaats van alleen naar deze installatie se eigen ledger of EAS. Het contract vereist een numeriek `value`+`valueDecimals`-veld; dit pakket verzint daar bewust geen eigen beoordelingsschaal voor. `value` is een letterlijke, mechanische spiegel van `delivered` (yes=1.0, partial=0.5, no=0.0), nooit een nieuw oordeel, en capacity-attest leest of toont dat getal zelf nergens terug. Herverifieert de claim se handtekening voordat er iets on-chain geschreven wordt.

Vereist van de aanroeper `reputationRegistryRef` (`"eip155:<chainId>:<registryAddress>"`, de Reputation Registry, niet de Identity Registry) en een `rpcUrl`, zelfde caller-levert-alles-postuur als `resolve_agent_identity`. `agentId` (de verkoper se ERC-8004-agent) moet al een geldig geregistreerde Identity-Registry-agent zijn; het contract weigert zelf feedback van de agent se eigen eigenaar ("Self-feedback not allowed").

**Bewust GEEN MCP-tool**, om dezelfde reden als EAS se `publishClaim`: dit is een schrijf-actie die een echte, gefinancierde signer en gas vereist, en deze server bundelt of bewaart bewust geen eigen private key. Beschikbaar als directe import (`src/erc8004-reputation.ts`) voor wie zelf een signer beheert.

Getest tegen een injecteerbare `ReputationContractFactory` (`src/erc8004-reputation.test.ts`, 15 tests, geen netwerkafhankelijkheid, inclusief een expliciete test dat `value` uitsluitend van `delivered` afhangt). Live-voorbeeld tegen de echte, gedeployde registry: `npm run erc8004-reputation-demo` (vereist `RPC_URL`+`PRIVATE_KEY`; registreert eerst een eigen, wegwerpbare test-agent in plaats van feedback te publiceren over een echte vreemde se identiteit). Zie [DECISIONS.md](./DECISIONS.md) D-016 voor de volledige achtergrond, inclusief waarom dit ondanks D-005's eigen trigger-criterium toch vandaag gebouwd is.

## Ondertekening

De claim wordt ondertekend door de **koper** (de partij die betaalde en dus weet wat er wel/niet aankwam), niet door de verkoper. Dit is bewust eenvoudige EIP-191 `personal_sign` over `claimId` (via `ethers.Signer#signMessage`), geen EIP-712 typed data. Dat houdt het crypto-oppervlak van deze MVP klein en makkelijk te controleren. Een latere upgrade naar EIP-712 (zoals in `mcp-paywall/src/x402.mjs`) is additief mogelijk zonder bestaande claims ongeldig te maken.

## Een claim onafhankelijk verifiëren

Elke claim in de ledger is met alleen het npm-package en de rauwe claim-bytes na te rekenen, zonder toegang tot dit project of een netwerkoproep naar ons. Geen account, geen hosted call.

```bash
npm install capacity-attest
```

```js
// verify.mjs, als ES module draaien (top-level await)
import { verifyClaim } from "capacity-attest/dist/signing.js";

const claim = JSON.parse(await (await fetch("<url naar een claim.jsonl-regel>")).text());
console.log(verifyClaim(claim));
// { ok: true } als claimId echt de hash van de inhoud is EN signature echt naar buyerAddress terugrekent
```

Let op: importeer `capacity-attest/dist/signing.js` rechtstreeks, niet het package-root. De root (`dist/index.js`) start bij het importeren meteen de MCP-server over stdio, wat een los verificatie-script laat hangen.

`verifyClaim()` controleert precies twee dingen: dat `claimId` de content-addressed hash van de claim-velden is, en dat `signature` (EIP-191) terugrekent naar `buyerAddress`. Het controleert niet of de onderliggende afwikkeling (`settlementRef`) echt on-chain klopt, dat is een losse, aparte check tegen de betreffende chain, en het controleert niet of `delivered` waar is of of `evidenceHash` een echt bewijsstuk dekt, dat blijft de eigen verklaring van de kopende agent.

Een werkend, extern gereproduceerd voorbeeld van deze exacte stappen staat in [github.com/YE-YI7/asm-spec, PR #18](https://github.com/YE-YI7/asm-spec/pull/18): een onafhankelijk project dat dit tegen een echte, live geregistreerde claim heeft gedraaid.

## Je eigen ingediende claims delen, los van een host (D-006)

`get_delivery_history` vertrouwt op de eerlijkheid van wie de MCP-server bedient: zie de `note` in dat tool-antwoord en [DECISIONS.md](./DECISIONS.md) (D-006). Elke getoonde claim is wel degelijk echt (ondertekening wordt sinds 2026-09-06 ook bij het lezen opnieuw gecontroleerd, niet alleen bij het schrijven), maar niets bewijst dat de host de VOLLEDIGE set laat zien die hij daadwerkelijk heeft.

Als jij zelf de koper bent die een claim indiende, hoef je op die host niet te wachten: jij hebt die claim zelf al ondertekend, dus jij kan 'm rechtstreeks aan een wantrouwende tegenpartij laten zien, buiten elke host om.

```js
// export-my-claims.mjs
import { claimsForSeller } from "capacity-attest/dist/ledger.js";

const myAddress = "0x...";     // jouw buyerAddress
const seller = "0x...";        // de verkoper waar het over gaat

const mine = (await claimsForSeller(seller)).filter(
  (c) => c.buyerAddress.toLowerCase() === myAddress.toLowerCase(),
);
console.log(JSON.stringify(mine, null, 2));
```

Elke claim in die lijst is zelfstandig verifieerbaar met `verifyClaim()` (zie hierboven), zonder dat de ontvanger jouw installatie of enige host hoeft te vertrouwen. Dit lost geen vindbaarheid op (D-005: hoe vindt iemand anders jouw claim zonder dat jij 'm deelt) en geen volledigheid over ALLE kopers samen (D-006: dit bewijst alleen wat JIJ indiende, niet wat een host verder mogelijk verzwijgt van andere kopers), maar het geeft een concrete, kosteloze manier om één specifiek geschil te bewijzen zonder een host te hoeven vertrouwen.

## Lokaal draaien

```bash
npm install
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run demo       # end-to-end lokale demo met TEST-sleutels, geen live infra
npm start           # start de MCP-server over stdio (bijv. voor Claude Desktop/Code als lokale MCP-server)
```

De ledger-locatie is instelbaar via `CAPACITY_ATTEST_DATA_DIR` (default: `./data` in dit package). Tests en de demo gebruiken altijd een eigen, wegwerpbare tijdelijke map, nooit de echte `data/` map.

## Architectuur

```text
src/
  schema.ts        DeliveryClaim zod-schema + content-addressing (computeClaimId, canonicalize)
  signing.ts        sign/verify van een claim (ethers, EIP-191 personal-sign)
  ledger.ts          append-only JSONL-opslag (data/claims.jsonl), nooit muteerbaar
  tools.ts           de daadwerkelijke logica achter beide MCP-tools, transport-onafhankelijk
  config.ts          waar de ledger-map leeft, lazy zodat tests 'm kunnen overriden
  index.ts            MCP-server wiring (registreert record_delivery + get_delivery_history)
examples/demo.ts   end-to-end lokaal voorbeeld met TEST-sleutels
```

`tools.ts` bevat de eigenlijke business-logica; `index.ts` vertaalt dat alleen naar MCP tool-calls. Zo kunnen tests en de demo dezelfde logica direct aanroepen zonder een stdio-transport op te tuigen.

## Relatie tot x402

Dit project verifieert of settelt zelf géén x402-betalingen, dat gebeurt al bij de betaalstap zelf (zie bijvoorbeeld `mcp-paywall/src/x402.mjs` in dit ecosysteem voor een volledige EIP-3009-verify/settle-implementatie). `settlementRef` verwijst simpelweg naar die reeds-voltooide afwikkeling. Dat betekent ook dat de MVP-koppeling met een echte x402-facilitator eenvoudig kan blijven: `settlementRef` is vrije tekst, met als aanname dat de koper 'm eerlijk invult. Een latere versie kan dat veld optioneel verifiëren tegen een echte facilitator (TODO, niet in deze MVP).
