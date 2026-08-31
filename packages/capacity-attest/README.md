# capacity-attest

MCP-server voor leverings-attestaties bij x402-capaciteitshandel tussen AI-agents.

> Status: MVP, gepubliceerd op npm (`npm install capacity-attest`) en in het officiële MCP-register (`io.github.holistis/capacity-attest`).

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

Dit is een bewuste, formeel getoetste ontwerpkeuze, niet een toevallige scope-beperking. Zie de guardrails-sectie in het project-brief als je overweegt hier iets aan toe te voegen: bij twijfel of een veld/functie hiertegenaan schuurt, laat het weg.

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

De server valideert eerst het schema, dan of `claimId` echt de hash van de inhoud is, en dan of `signature` echt terugrekent naar `buyerAddress`. Alleen dan wordt de claim toegevoegd aan de append-only ledger (`data/claims.jsonl`). Een ongeldige handtekening of een claim die al eerder is opgeslagen (zelfde `claimId`) wordt geweigerd.

### 2. `get_delivery_history`

Gegeven een `sellerAddress`, retourneert dit alle bekende claims tegen die verkoper, chronologisch (oudst eerst). Puur feitelijk, geen samengevat getal. Een kopende agent roept dit aan **vóórdat** hij betaalt, om de ruwe leveringsgeschiedenis van een potentiële verkoper te zien en zelf te beoordelen.

## Ondertekening

De claim wordt ondertekend door de **koper** (de partij die betaalde en dus weet wat er wel/niet aankwam), niet door de verkoper. Dit is bewust eenvoudige EIP-191 `personal_sign` over `claimId` (via `ethers.Signer#signMessage`), geen EIP-712 typed data. Dat houdt het crypto-oppervlak van deze MVP klein en makkelijk te controleren. Een latere upgrade naar EIP-712 (zoals in `mcp-paywall/src/x402.mjs`) is additief mogelijk zonder bestaande claims ongeldig te maken.

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

```
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
