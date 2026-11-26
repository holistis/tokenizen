# capacity-attest

MCP-server voor leverings-attestaties bij x402-capaciteitshandel tussen AI-agents.

> Status: MVP, gepubliceerd op npm (`npm install capacity-attest`) en in het officiële MCP-register (`io.github.holistis/capacity-attest`).

## Door anderen gecontroleerd, en wat je zelf kunt nagaan

Alles hieronder is aanklikbaar. Deel één is gecontroleerd door mensen buiten dit project. Deel twee noemt on-chain feiten die we zelf publiceerden, die iedereen kan lezen en decoderen.

### Deel één: gecontroleerd door mensen buiten dit project

| Wat | Door wie | Status |
|---|---|---|
| Gebruikt `capacity-attest@0.2.0` als echte dependency, verifieert claim-digest/claimId/handtekening via onze eigen code | [YE-YI7/asm-spec#18](https://github.com/YE-YI7/asm-spec/pull/18) | Gemerged |
| BSV-rail-adapter op hetzelfde content-geadresseerde claim-formaat | [YE-YI7/asm-spec#19](https://github.com/YE-YI7/asm-spec/pull/19) (auteur EmbryoSpace) | Gemerged |
| Een derde partij haalde onze twee testattestaties van Base mainnet en las ze terug; de draad corrigeerde ook wie het gas betaalde en wie de koper is. | [x402-foundation/x402#3379](https://github.com/x402-foundation/x402/issues/3379) | Publiek, doorlopend |
| Voorgesteld als koperszijde-aanvulling op een andermans agent-spec | [omworldprotocol/om-world#18](https://github.com/omworldprotocol/om-world/pull/18) | In review, nog niet gemerged |
| Een van de grond af herbouwde Python-verifier van een externe ontwikkelaar (alleen standaardbibliotheek, eigen code voor secp256k1, EIP-191 en canonieke JSON): 7 van 7 vectoren komen overeen, inclusief beide negatieve controles (vervalste handtekening, geknoeide claim). Hij zit in hun gepubliceerde pakket (`pip install tamga-protocol`), en een regressietest tegen onze vectoren draait in hun repository. | [x402-foundation/x402#2887 (comment)](https://github.com/x402-foundation/x402/issues/2887#issuecomment-5687398497), auteur goun7 | Meegeleverd in hun gepubliceerde pakket |
| Ontdekte, door het echte gepubliceerde pakket daadwerkelijk te draaien in plaats van er alleen over te lezen, dat npm nog een oudere versie had dan `main` en dat een gedocumenteerd commando (`npx capacity-attest-fiscal-check`) 404'de tegen het echte register | [YE-YI7, registry#1300](https://github.com/modelcontextprotocol/registry/discussions/1300#discussioncomment-19603893) | Dezelfde dag gefixt: `capacity-attest@0.14.0` gepubliceerd, commando gecorrigeerd naar de versie-vastgepinde vorm, opnieuw geverifieerd in een schone installatie zonder workspace-links |

### Deel twee: on-chain feiten die we zelf publiceerden

| Wat | Waar | Status |
|---|---|---|
| Live delivery-claims als on-chain attestaties op Base mainnet, door iedereen te decoderen | [delivered=yes](https://base.easscan.org/attestation/view/0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc) · [delivered=no](https://base.easscan.org/attestation/view/0xe736b005cbcb54f8f196ac64ef09d75d939c8a18c0d5d9670b5c5025c07398c4) | Live |
| Hetzelfde, live op een tweede en derde chain (WP2), bewijst dat de EAS-bron over meerdere deployments werkt, niet alleen Base | [Optimism](https://optimism.easscan.org/attestation/view/0x46148283cb005aa43387fb62b2e1ccd0b001ff82dc9310ea885237fd8dea8832) · [Ethereum mainnet](https://easscan.org/attestation/view/0x40da382231eeb6186b7daf231a430488627769feb64039ae3ac671a14f7a8137) | Live |
| Een echte `giveFeedback()`-aanroep op het ERC-8004 Reputation Registry, Base mainnet, verstuurd door een testagent die wij registreerden | [tx 0x2217...efc0](https://basescan.org/tx/0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0) | Live |

**Eerlijk apart gehouden van bovenstaande tabellen, want dit is geen derde-partij-controle:** voor 0.6.0 (de eerste keer dat dit pakket echt naar de blockchain schrijft) hebben we zelf een adversariële security review uitgevoerd. Negen bevindingen, allemaal gefixt: zeven met een eigen regressietest, een gecontroleerd via een packaging-check (`npm pack --dry-run`, geen unit test), en een pure documentatiefix. Geen onafhankelijke audit door een externe partij. Volledig, controleerbaar verslag: [docs/SECURITY-REVIEW-2026-09-11.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/SECURITY-REVIEW-2026-09-11.md).

Een tweede, zelfde soort review, zelfde regel (eigen werk, nooit "onafhankelijk"): de fiscal-controls-v2-herziening en de drie stukken daarna gebouwd in 0.13.0/0.14.0 (durable spend-cap-opslag, afschrijvings-corroboratie, de `fiscal-check`-CLI). 30 bevindingen over de hele ronde, de meeste gerepareerd met een genoemde regressietest, enkele bewust open gelaten met de reden erbij, inclusief een echte, met naam genoemde buitenstaander (YE-YI7) die zelf twee vragen stelde, apart aangehaald en nooit meegeteld als "onafhankelijk bevestigd". Volledig, controleerbaar verslag (Engels): [docs/SECURITY-REVIEW-2026-11-13.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/SECURITY-REVIEW-2026-11-13.md).

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
- **Geen eigen identity-, autoriteits- of geschillenlaag.** `externalRefs` (zie hieronder) is puur een citaat naar een systeem van een ander (ERC-8004, AP2, Legal Context Protocol, ...). Dit project resolvet, verifieert of beoordeelt die verwijzing zelf nooit. Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-007 t/m D-013 voor waarom dit bewust geen eigen protocol is geworden.

Dit is een bewuste, formeel getoetste ontwerpkeuze, niet een toevallige scope-beperking. Zie de guardrails-sectie in het project-brief als je overweegt hier iets aan toe te voegen: bij twijfel of een veld/functie hiertegenaan schuurt, laat het weg.

Bewust uitgestelde features (verankering, tussentijdse status, formele conformance-vectoren), inclusief de precieze voorwaarde waaronder we ze alsnog zouden bouwen: zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md).

Verder lezen: [negen manieren om een leverings-claim te vervalsen, en waarom geen enkele volledig werkte](https://tokenizen.nl/en/notes/nine-ways-to-fake-a-delivery-claim), de publieke versie van D-014/D-018 hierboven.

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
| `externalRefs` | *(optioneel, sinds 0.3.0)* ongeverifieerde verwijzingen naar andere agent-economie-infrastructuur: `sellerAgentRef`/`buyerAgentRef` (bv. een ERC-8004-agent-id of DID), `mandateRef`+`mandateIssuerDid` (een extern uitgegeven AP2/AAE-mandaat), `intentRef` (een extern AP2 IntentMandate), `disputeContext` (`protocol`+`termsHash`+optioneel `resolutionRef`, bv. een Legal Context Protocol-verwijzing). Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-007 t/m D-013 |
| `priorClaimId` | *(optioneel, sinds 0.4.0)* de `claimId` van jouw vorige claim over dezelfde `sellerAddress`, zodat jouw claims over die verkoper een ketting vormen. Weggelaten bij je eerste claim over een verkoper. Zit in de ondertekende inhoud, dus een host kan het niet weghalen. Laat een lezer een host betrappen die een middelste claim verbergt. Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-006 |
| `offerReceiptHash` | *(optioneel, sinds 0.8.0)* sha256-hex van de door de verkoper ondertekende [x402 offer-receipt](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md) waar deze claim het antwoord op is, genomen over het bonnetje precies zoals het verstuurd werd. Hun bonnetje is de verklaring van de verkoper dat er geleverd is; deze claim is de verklaring van de koper over wat er werkelijk aankwam. Door die twee aan elkaar te knopen heeft een geschil beide kanten van het verhaal, in plaats van alleen die van de belanghebbende partij. Zit in de ondertekende inhoud, dus de verwijzing kan er na het ondertekenen niet in geruild of uit gehaald worden. Uitgewerkt voorbeeld met beide helften en echte handtekeningen: [`examples/offer-receipt-link-testvector.json`](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/examples/offer-receipt-link-testvector.json) |

De server valideert eerst het schema, dan of `claimId` echt de hash van de inhoud is, en dan of `signature` echt terugrekent naar `buyerAddress`. Alleen dan wordt de claim toegevoegd aan de append-only ledger (`data/claims.jsonl`). Een ongeldige handtekening of een claim die al eerder is opgeslagen (zelfde `claimId`) wordt geweigerd.

### 2. `get_delivery_history`

Gegeven een `sellerAddress`, retourneert dit alle bekende claims tegen die verkoper op déze installatie, chronologisch (oudst eerst). Puur feitelijk, geen samengevat getal. Een kopende agent roept dit aan **vóórdat** hij betaalt, om de ruwe leveringsgeschiedenis van een potentiële verkoper te zien en zelf te beoordelen.

Het antwoord bevat naast `sellerAddress`, `count` en `claims` ook `scope` (altijd `"local-ledger"`) en `note`: een vaste, feitelijke tekst die uitlegt dat dit resultaat alleen de lokale ledger van déze installatie weerspiegelt. Een lege of korte geschiedenis betekent niet dat de verkoper een schone staat van dienst heeft, het kan ook betekenen dat er hier simpelweg nog geen claims zijn vastgelegd. Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) (D-005) voor de bredere architectuurvraag hierachter: hoe vindt een koper claims die op een ándere installatie zijn vastgelegd.

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

Eerlijke grens: ook zelf-herrekenen betrapt geen verborgen laatste claim en geen verborgen hele koper, want daar valt geen schakel over te struikelen. En een losse terugverwijzing hoeft geen bedrog te zijn: de eerdere claim kan ook gewoon op een andere installatie zijn vastgelegd (het D-005-geval). Voor echte zekerheid blijven de externe getuigen nodig: je eigen bewaarde kopie hierboven, en de betaling op de keten via `settlementRef`. Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-006.

Een openbaar, zelf-controleerbaar voorbeeld met een nagebootste verbergende host en expres-kapotte testgevallen staat in [docs/COMPLETENESS-FIXTURE.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/COMPLETENESS-FIXTURE.md). Draai het met `npm run fixture`; dezelfde controles draaien bij elke push als test. Zo kun je onze claim zelf natellen in plaats van ons op ons woord te geloven.

## Claims van andere installaties vinden (D-005)

`get_delivery_history` is per definitie lokaal: koper B ziet niet wat koper A op een andere installatie vastlegde over dezelfde verkoper. Omdat elke claim zelf-verifieerbaar is, heeft vindbaarheid geen vertrouwde index nodig. `discoverDeliveryHistory(seller, sources)` (zie `src/discovery.ts`) leest een verkopers claims uit meerdere onafhankelijke, ONvertrouwde bronnen (je lokale ledger plus elk host-onafhankelijk substraat dat je wilt lezen), ontdubbelt, herverifieert elke claim, filtert andere verkopers eruit, en draait de completeness-check over het geheel. Een bron die nep injecteert wordt geweigerd; een bron die weglaat is het D-006-probleem, meegenomen maar niet magisch opgelost.

De productie-onderlaag is live, op alle drie de chains die dit project ondersteunt: EAS-attestaties bestaan op Base mainnet, Optimism mainnet en Ethereum mainnet, elk zelfstandig te controleren via een openbare block-explorer-link, niet alleen beschreven. Een openbaar, draaibaar voorbeeld met twee nagebootste installaties staat in [docs/DISCOVERY-FIXTURE.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/DISCOVERY-FIXTURE.md), draai het met `npm run discovery-fixture`. Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-005.

Een tweede, niet-EAS productieklare `ClaimSource` bestaat ook: `httpClaimSource` (`src/http-source.ts`), een simpel HTTP-eindpunt volgens de conventie `GET <url>?seller=<address>` -> een JSON-array van claims. `examples/reputation-lookup.mjs` is een draaibare CLI die de lokale ledger met beide productiebronnen combineert in één echte opzoeking. [docs/INTEGRATION-GUIDE.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/docs/INTEGRATION-GUIDE.md) loopt door alle drie brontypen heen met echte code, plus twee onafhankelijke, echte integraties gebouwd door andere projecten.

### 3. `resolve_agent_identity` *(sinds 0.3.0)*

Read-only opzoeking tegen een ERC-8004 Identity Registry: wie bezit `agentId` (`ownerOf`) en waar staat zijn registratiebestand (`tokenURI`). Alleen de standaard ERC-721-interface wordt aangeroepen, niets ERC-8004-specifieks. Vereist van de aanroeper zowel `agentRegistryRef` (`"eip155:<chainId>:<registryAddress>"`) als een `rpcUrl` voor die chain: dit project bundelt bewust geen eigen RPC-provider en geen canoniek registry-adres, want ERC-8004 heeft onafhankelijke deployments per chain en de EIP-tekst zelf noemt geen vast adres. Haalt bewust NOOIT op wat `tokenURI` aanwijst (dat blijft een pointer die de aanroeper zelf desgewenst opvraagt); dat zou een SSRF-vormig risico zijn op aanroeper-gecontroleerde on-chain data.

Getest tegen een injecteerbare `ContractFactory` (`src/erc8004.test.ts`, geen netwerkafhankelijkheid) én live tegen de echte, gedeployde registry op Base mainnet (`examples/verify-erc8004-live.mjs`, `npm run build && node examples/verify-erc8004-live.mjs`). Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-007 voor de volledige achtergrond.

### 4. `publishReputationFeedback` *(sinds 0.6.0, library-functie, geen MCP-tool)*

**Let op:** deze functie staat al sinds 0.6.0 op npm, en de nu gepubliceerde versie staat daar ver voorbij, maar dit document beschrijft de code op de `main`-branch, die voor kan lopen op wat echt gepubliceerd is. Check altijd `npm view capacity-attest version` voor de versie die nu echt live staat, voor je op een functie of commando hieruit vertrouwt.

Publiceert het `delivered`-feit van een al ondertekende claim naar een ERC-8004 Reputation Registry se `giveFeedback()`, dezelfde plek waar ~500k geregistreerde agents al naar reputatiesignalen kunnen kijken, in plaats van alleen naar deze installatie se eigen ledger of EAS. Het contract vereist een numeriek `value`+`valueDecimals`-veld; dit pakket verzint daar bewust geen eigen beoordelingsschaal voor. `value` is een letterlijke, mechanische spiegel van `delivered` (yes=1.0, partial=0.5, no=0.0), nooit een nieuw oordeel, en capacity-attest leest of toont dat getal zelf nergens terug. Herverifieert de claim se handtekening voordat er iets on-chain geschreven wordt.

Vereist van de aanroeper `reputationRegistryRef` (`"eip155:<chainId>:<registryAddress>"`, de Reputation Registry, niet de Identity Registry), `agentRegistryRef` (dezelfde chain, maar de Identity Registry) en een `rpcUrl`, zelfde caller-levert-alles-postuur als `resolve_agent_identity`. `agentId` (de verkoper se ERC-8004-agent) moet al een geldig geregistreerde Identity-Registry-agent zijn; het contract weigert zelf feedback van de agent se eigen eigenaar ("Self-feedback not allowed"). Sinds de adversariele review van 2026-09-11 wordt `agentId` se geregistreerde eigenaar (via `agentRegistryRef`) ook altijd tegen `claim.sellerAddress` gecontroleerd voor er iets on-chain geschreven wordt, zonder die controle kon een aanroeper een echte, geldig ondertekende claim aan een willekeurig ander agentId hangen.

**Bewust GEEN MCP-tool**, om dezelfde reden als EAS se `publishClaim`: dit is een schrijf-actie die een echte, gefinancierde signer en gas vereist, en deze server bundelt of bewaart bewust geen eigen private key. Beschikbaar als directe import (`src/erc8004-reputation.ts`) voor wie zelf een signer beheert.

Getest tegen een injecteerbare `ReputationContractFactory` (`src/erc8004-reputation.test.ts`, 19 tests, geen netwerkafhankelijkheid, inclusief een expliciete test dat `value` uitsluitend van `delivered` afhangt, en drie tests voor de agentId-eigenaarschapscontrole) én live tegen de echte, gedeployde registry op Base mainnet (`examples/erc8004-reputation-live-demo.ts`, `npm run erc8004-reputation-demo`): op 2026-09-10 bevestigd via een eigen, wegwerpbare test-agent (agentId 85888) en een echte `giveFeedback()`-aanroep, [tx 0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0](https://basescan.org/tx/0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0), onafhankelijk teruggecontroleerd via een losse `eth_getTransactionReceipt`-aanroep. Zie [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) D-016 voor de volledige achtergrond, inclusief waarom dit ondanks D-005's eigen trigger-criterium toch vandaag gebouwd is.

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

## Wat veilig is om op te bouwen

Als je je eigen verifier schrijft, of deze repo vastpint in een specificatie, is dit het stuk dat je nodig hebt: wat niet onder je verandert.

Vier dingen liggen vast, en een claim die vandaag wordt ondertekend moet over jaren nog steeds kloppen:

- De canonieke vorm waarover een claim gehasht wordt, byte voor byte, zoals gespecificeerd in [`docs/metered-delivery-spec.md`](docs/metered-delivery-spec.md).
- Hoe `claimId` uit die canonieke vorm wordt afgeleid.
- Het EIP-191-bericht dat ondertekend wordt, en dat de handtekening terugrekent naar `buyerAddress`.
- De strikte `issuedAt`-vorm, `YYYY-MM-DDTHH:MM:SS.sssZ` met precies drie decimalen.

Een nieuw optioneel veld toevoegen is geen breuk en kan in een minor-versie, want een oude verifier die een nieuwe claim leest, krijgt nog steeds dezelfde `claimId` voor de velden die hij kent. Een veld weghalen, hernoemen, de canonieke vorm herordenen, of de hash-berekening veranderen zou elke ooit ondertekende claim ongeldig maken, dus dat behandelen we als iets wat we niet doen, niet als iets wat we versioneren.

Die belofte wordt gecontroleerd, niet alleen beweerd. De gepubliceerde testvectoren in [`examples/`](examples) dragen elke tussenstap apart: de canonieke preimage, zijn bytelengte, de `claimId`, de EIP-191-digest, de handtekening en het verwachte teruggerekende adres. Twee losstaande scripts verifiëren ze bij elke CI-run, en beide zijn bewuste herimplementaties die één JSON-bestand lezen en nooit de eigen broncode van dit package importeren, dus ze kunnen niet slagen door het gewoon eens te zijn met de code die ze zouden moeten controleren. Breek het formaat en CI gaat rood voor er iets gepubliceerd kan worden.

Als een breuk ooit echt onvermijdelijk wordt, verschijnt die als een nieuwe major-versie onder een andere package-naam, de oude blijft werken en gepubliceerd, en de reden gaat in [DECISIONS.md](DECISIONS.md) voordat de code verandert. Partijen die een commit hebben vastgepind, worden door ons niet verplaatst.

## Je eigen ingediende claims delen, los van een host (D-006)

`get_delivery_history` vertrouwt op de eerlijkheid van wie de MCP-server bedient: zie de `note` in dat tool-antwoord en [DECISIONS.md](https://github.com/holistis/tokenizen/blob/main/packages/capacity-attest/DECISIONS.md) (D-006). Elke getoonde claim is wel degelijk echt (ondertekening wordt sinds 2026-09-06 ook bij het lezen opnieuw gecontroleerd, niet alleen bij het schrijven), maar niets bewijst dat de host de VOLLEDIGE set laat zien die hij daadwerkelijk heeft.

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

## HTTP-bereikbare variant, voor deployments die een netwerk-eindpunt nodig hebben

Sommige MCP-registers en -gidsen vereisen een bereikbaar HTTPS-eindpunt voordat ze een server vermelden. `capacity-attest-http` (`src/http-server.ts`) is die variant: een gewone Node-HTTP-server die het MCP Streamable HTTP-transport spreekt op `POST /mcp`.

Hij is bewust smaller dan de stdio-server hierboven: alleen de twee read-only, zonder-bijeffect-tools worden blootgesteld (`get_delivery_history`, `resolve_agent_identity`). `record_delivery` bewust niet. De ledger van de stdio-server is een lokaal, één-installatie-ontwerp; schrijfacties achter een publiek, ongeauthenticeerd HTTP-eindpunt zetten roept een echte vraag op (in wiens ledger schrijft een anonieme aanroeper) die dit bestand niet voor je beantwoordt. Zie de opmerking bovenaan `http-server.ts` voor de volledige redenering, en voor hoe de 4 verplichte checks (auth, data-validatie, blootstelling, rate-limiting) worden toegepast.

```bash
npm run start:http     # luistert standaard op :8402, override met PORT=
```

```bash
curl -X POST http://localhost:8402/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Fiscal controls, voor je ooit betaalt

`GET /.well-known/fiscal-controls.json` antwoordt, statisch en zonder betaling of auth, welke van de betaalde tools van deze server een server-side signing key vasthoudt, of er een spend cap is en wat die precies telt, en wat het intrekkingspad is als de key ooit gecompromitteerd wordt. Dit controleert wat de server *beweert*, niet of het waar is; echtheid rust op de eigen TLS van de verbinding, het document zelf is niet apart ondertekend. Dit is een andere laag dan x402 se eigen per-call-prijs (`accepts[]`, pas zichtbaar na een eerste poging) en dan de bazaar-discovery-extensie hieronder (wat een tool doet, niet wat hij riskeert); zie de koptekst van `src/fiscal-controls.ts` voor de volledige redenering. `validateFiscalControls()` uit datzelfde bestand laat iedereen de vorm van dit document controleren, ook dat van een derde partij.

De veldnamen komen 1:1 overeen met de 7 voorgestelde velden in [modelcontextprotocol/registry#1300](https://github.com/modelcontextprotocol/registry/discussions/1300), dus dekking tegen dat exacte voorstel is controleerbaar, niet alleen tegen onze eigen parafrase ervan, maar dekking van de zeven *onderwerpen*, elk met expliciete grenzen, geen semantische gelijkwaardigheid aan de originele categorieën (YE-YI7 se eigen formulering, 13 nov 2026): `paid_action_surface` (welke actie kosten kan veroorzaken), `approval_source` (`human_approval_threshold` hier, `null` betekent niets geconfigureerd, dat vouwt de vijf goedkeuringsbron-categorieën van de post samen tot twee), `spend_cap` (een gestructureerd object, zie hieronder, nooit een kaal getal), `charge_evidence` en `audit_trail` (welk niet-geheim bonnetje een kosten bewijst, en waar het zelfstandig te controleren is; de instromende betalingsreferentie en het bewijs van de resulterende actie worden als twee aparte feiten vermeld, allebei wijzend naar tools die dit package al meeleverde: `get_delivery_history`/`discover_delivery_history`, of het on-chain ERC-8004 Reputation Registry zelf, nooit nieuwe infrastructuur), `revocation_path`, en `next_safe_threshold` (eerlijk `null` voor beide tools vandaag, er is hier geen mechanisme dat een cap automatisch verhoogt). Zie `DECISIONS.md` D-021/D-022 voor de volledige tabel per tool.

`spend_cap`, als die niet `null` is, vermeldt zijn `unit` (`"paid-attempts"`, een telling van betaalde aanroepen, GEEN valuta-plafond op wat een aanroeper uitgeeft; de tools van vandaag gebruiken nooit `"currency"`), `scope`, `persistence`, en `reservation_before_settlement`. Standaard is `scope` `"server-instance"` en `persistence` `"in-memory"` (`reset_on_restart: true`), de eigen telling van dit ene proces, niet gedeeld over hoeveel instanties er ook achter een load balancer draaien. `CAPACITY_ATTEST_SPEND_CAP_DURABLE=1` instellen (zie hieronder) schakelt de *echte* cap om naar een cross-process, op schijf opgeslagen, lock-beschermde store, en dit document meldt dat ook eerlijk: `scope: "all-instances"`, `persistence: "durable"`, `reset_on_restart: false`, live afgelezen van welke store er daadwerkelijk draait, nooit een tweede, met de hand overgetypte kopie ervan. Als `signer_isolation` niet `null` is, vermeldt `signer_custody` waar de claim daadwerkelijk op rust (vandaag: een private key in een in-process wallet, geïsoleerd van de fondsen en invloed van de aanroeper, NIET hardware/TEE-geïsoleerd van het eigen geheugen van dit proces), schema-afgedwongen, niet alleen gedocumenteerd, zodat geen van beide velden een sterkere garantie kan beschrijven dan de code werkelijk geeft.

```bash
curl http://localhost:8402/.well-known/fiscal-controls.json
```

Een vreemde die de claim van een willekeurige server controleert, van ons of van een derde partij, hoeft daarvoor geen code tegen dit package te schrijven. `capacity-attest-fiscal-check` is een van drie command-line-tools die dit package publiceert (zie het `bin`-veld van `package.json`), geen apart npm-package op zich, dus `npx` heeft de echte packagenaam en een echt gepubliceerde versie nodig om het te vinden:

```bash
npx --package=capacity-attest@0.14.0 capacity-attest-fiscal-check https://example.com/.well-known/fiscal-controls.json
```

Check `npm view capacity-attest version` voor de werkelijk nu gepubliceerde versie voor je een hier genoemd versienummer vertrouwt, dezelfde voorzichtigheid als de noot verderop in dit document, en zelfs als dat commando de nieuwe versie toont, kan npm se eigen CDN na een verse publicatie nog een paar minuten nodig hebben om zichzelf bij te werken met het echte bestand.

Het haalt het document op (of leest het, bij een lokaal pad), valideert het tegen hetzelfde schema hierboven, en print een rapport in gewone taal, geen capacity-attest-specifieke kennis nodig buiten de URL of het bestandspad zelf. Zie de koptekst van `src/fiscal-check-bin.ts` voor de redenering achter de uitgaande-verkeer-bescherming van de URL-tak.

Die bescherming behandelt je eigen machine net zo wantrouwend als een vijandig doelwit: `http://localhost`, loopback en elk privé-netwerkadres worden bewust geweigerd, net als een cloud-metadata-adres. Deze CLI kan dus geen `capacity-attest-http`-instantie op je eigen machine of LAN controleren, gebruik daarvoor rechtstreeks `curl` tegen het eindpunt (zie hierboven).

### Spend-cap-duurzaamheid, over proces-herstarts en replica's heen

`CAPACITY_ATTEST_SPEND_CAP_DURABLE=1` verwisselt de hourly cap van `publish_reputation_feedback` van de zero-config, single-process `InMemorySpendCapStore` naar `DurableSpendCapStore`, hetzelfde append-only-JSONL-plus-lockfile-patroon dat `ledger.ts` al gebruikt voor delivery-claims, toegepast op een per-sleutel spend-cap-gebeurtenislog onder `CAPACITY_ATTEST_DATA_DIR`. Gebruik dit wanneer meer dan één instantie van deze server één `CAPACITY_ATTEST_DATA_DIR` deelt (zodat de hourly cap echt gedeeld wordt, niet één aparte telling per instantie) of wanneer de cap een herstart moet overleven. Blijft het ongezet, dan verandert er niets aan het standaard, single-instance-gedrag van deze server. Zie de koptekst van `src/spend-cap-store.ts` voor de volledige ontwerpredenering en `bench/spend-cap-store-concurrency.mjs` voor het gemeten multi-process-resultaat.

### Afwikkelingscorroboratie, een onafhankelijke tegencontrole bovenop het eigen zeggen van de facilitator

Zet `CAPACITY_ATTEST_RPC_URL` (en optioneel `CAPACITY_ATTEST_SETTLEMENT_ASSET`) om beide betaalde tools se `onAfterSettlement`-hooks een ZACHTE, niet-blokkerende on-chain-controle te laten afvuren, via `eip3009-authorizer-from-tx.ts`, of de afwikkeling die de facilitator meldde ook echt op-chain klopt. Dit blokkeert, vertraagt of laat nooit de echte actie falen waar het naast draait: allebei ongezet (de standaard) maakt dat elke aanroep onmiddellijk `'skipped'` teruggeeft, voor elke netwerkpoging, en een trage of falende RPC blokkeert nooit de schrijf-/chain-aanroep waar het bij hoort, alleen gelogde uitkomsten (`settlement_corroboration_result` / `settlement_corroboration_mismatch`), server-side. Zie de koptekst van `src/settlement-corroboration.ts` voor de volledige ontwerpredenering en niet-doelen, en `src/settlement-corroboration.bench.ts` voor het gemeten "voegt geen latency toe"-bewijs.

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

## Relatie tot AWS Bedrock AgentCore Payments

Geen overlap, geen concurrentie: verschillende stap in de keten. Bedrock AgentCore Payments (Amazon, sinds 2026) regelt de betaalstap zelf, tot en met het moment dat "the merchant verifies the payment proof... [and] returns the requested content" ([officiële AWS-documentatie](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments-how-it-works.html)). Dat bewijs is een bewijs van **betaling**, niet van **levering**: er staat nergens vastgelegd of de agent na die stap ook echt kreeg wat beloofd was. Precies daar begint `capacity-attest`. Net als bij x402 hierboven: dit project settelt geen betalingen en concurreert niet met de betaalrail, het legt vast wat er ná de betaling wel of niet daadwerkelijk aankwam, ongeacht welke rail (x402 of anders) die betaling afhandelde.
