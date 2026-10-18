# tokenizen

*[English version: README.md](README.md)*

Open-source infrastructuur voor de verkoperskant van agent-commerce: ondertekende, content-geadresseerde vastleggingen van wat een agent werkelijk geleverd heeft, wat hij beheert, en onder welke voorwaarden, controleerbaar door een andere agent zonder mens ertussen.

## Wat je hiermee krijgt

Een AI-agent betaalt een andere agent of dienst, het geld wordt afgewikkeld, en daar stopt het spoor. Er is geen vastlegging of er 28.800 GPU-seconden beloofd waren en 25.230 aankwamen. De kopende agent heeft het zelf gezien en die kennis sterft met de sessie, dus de volgende agent begint weer blind.

Drie concrete dingen dichten dat gat:

- Een ondertekende leveringsclaim die de koper na afwikkeling achterlaat, inclusief het verschil tussen wat beloofd was en wat aankwam, vastgehasht aan zijn eigen inhoud zodat hij achteraf niet te wijzigen is.
- Een attestatie met een einddatum over een netwerk-endpoint, alleen afgegeven nadat de beheerder heeft bewezen dat hij dat endpoint beheert.
- Verifiers en ondertekende testvectoren, zodat iedereen een claim tegen een onafhankelijke implementatie kan nalopen in plaats van de onze te vertrouwen.

Geen reputatiescore, geen oordeel, geen financieel instrument. Een leveringsbon, geen vonnis.

## Onafhankelijk nagerekend

Code is te kopiëren, onafhankelijke verificatie niet. Alles hieronder is iemand anders die ons werk zelf heeft nagerekend in plaats van erover gelezen, met de link erbij zodat het opnieuw te controleren is.

| Wat iemand anders heeft nagerekend | Waar |
| --- | --- |
| Het `measured`-blok aangehaald als bron van waarheid voor gemeten levering in een concept-conventie voor ERC-8004 grounded feedback, vastgepind op een specifieke commit van deze repo. Die partij bouwde er zijn eigen conformance-set van vijf ondertekende vectoren om heen, plus twee verifiers die geen code delen (Node en Python), beide groen | [erc-8004/erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99), vectoren en verifiers in [predgeAI/erc8004-outcome-validator](https://github.com/predgeAI/erc8004-outcome-validator/tree/main/grounded-feedback) |
| Een onafhankelijk herbouwde Python-verifier, alleen standaardbibliotheek, met eigen secp256k1, EIP-191 en canonieke JSON, geen gedeelde code, 7 van 7 gelijk inclusief beide negatieve controles, nu een permanente regressietest in een apart gepubliceerd project | [x402#2887 (reactie)](https://github.com/x402-foundation/x402/issues/2887#issuecomment-5687398497), auteur goun7, meegeleverd in Tamga |
| Een BSV-rail-adapter op hetzelfde content-geadresseerde claimformaat, gebouwd door een losse auteur en gemergd in de spec-repo van een derde partij | [asm-spec#19](https://github.com/YE-YI7/asm-spec/pull/19), auteur EmbryoSpace |
| Live leveringsclaims die iedereen on-chain kan uitlezen, op drie losse deployments | [Base](https://base.easscan.org/attestation/view/0x81a55d54452b2cf8bdda7918f63a27bf9ff79e5025b485f7316aae6259288ccc) · [Optimism](https://optimism.easscan.org/attestation/view/0x46148283cb005aa43387fb62b2e1ccd0b001ff82dc9310ea885237fd8dea8832) · [Ethereum](https://easscan.org/attestation/view/0x40da382231eeb6186b7daf231a430488627769feb64039ae3ac671a14f7a8137) |
| Een echte `giveFeedback()`-aanroep op het ERC-8004 Reputation Registry, Base mainnet | [tx 0x2217...efc0](https://basescan.org/tx/0x221797800d5941dff62e87022083e7c6dfba3e07b35c84e56b10fdca8967efc0) |

Volledige lijst, inclusief wat nog in review is: [`packages/capacity-attest/README.md`](packages/capacity-attest/README.md).

Apart van die tabel, omdat dit geen toetsing door een derde partij is: we hebben zelf een adversariële security review gedaan voor de eerste versie die naar een blockchain schrijft. Negen bevindingen, alle negen gerepareerd, rapport openbaar. Dat was ons eigen werk, geen onafhankelijke audit, en staat daarom apart vermeld.

## Waarom dit bestaat

De keten van een agent die iets koopt of verkoopt bestaat uit zes stappen: agent, identity, rights, asset, payment, settlement. De koperskant van die keten is al druk in ontwikkeling: wallets, betaalprotocollen zoals x402, agent-identity. Wat ontbreekt is de verkoperskant: hoe leg je vast wat je als agent claimt te hebben geleverd, wat je bezit, en wat de rechten daarop zijn, op een manier die een andere agent zonder mens ertussen kan controleren. Dat is een ondertekend spoor, geen onafhankelijk bewijs van de onderliggende werkelijkheid.

Tokenizen bouwt aan dat object, niet aan de koperskant. Drie sporen zijn onafhankelijk van elkaar bij dezelfde conclusie uitgekomen: een formele interne toetsing van wat wel en niet toelaatbaar is in agent-tot-agent handel, marktonderzoek naar wat er in dit veld al bestaat en wat ontbreekt, en een inventaris van eigen code die al jaren op vergelijkbare problemen stuitte. Alle drie wezen naar hetzelfde gat: verificatie en afwikkeling aan de verkoperskant, zonder financiële constructies die niet toelaatbaar zijn.

## De ontwerpgrens

Dit project heeft een permanente, bewuste grens, voortgekomen uit een formele interne toetsing. Die grens geldt voor het hele project, niet alleen voor een los package.

Groen (dit bouwen we):

- Verificatie en audit-trails van geleverde diensten of assets
- Policy- en scope-controle tussen agents
- Echte capaciteitshandel (compute, opslag, API-credits, bandbreedte) die daadwerkelijk geleverd wordt

Geel (met randvoorwaarden):

- Settlement is spot-only: betaling tegen directe levering, geen uitgestelde afwikkeling
- Credits zijn inwisselbare vouchers voor een dienst, geen verhandelbaar financieel instrument

Rood (nooit):

- Rente of tijd-disconto op betalingen
- Leningen of kredietverlening
- Een eigen token of munt
- Factoring of invoice-financing
- Yield-producten

Bij twijfel of iets tegen deze lijn aan schuurt: het blijft weg, ongeacht hoe interessant het technisch is.

## Packages

| Package | Wat het doet | npm |
| --- | --- | --- |
| [`capacity-attest`](packages/capacity-attest) | Het kern-claimformaat en een MCP-server met `record_delivery` en `get_delivery_history`. Na een x402-betaling voor capaciteit laat de betalende agent een ondertekende, feitelijke claim achter over wat er werkelijk geleverd is, inclusief beloofd tegenover geleverd. Andere agents kunnen die geschiedenis opvragen voor ze zelf betalen. | `capacity-attest` (0.7.0 gepubliceerd, 0.8.0 nog niet gepubliceerd) |
| [`endpoint-attest`](packages/endpoint-attest) | Attestaties met einddatum over een netwerk-endpoint, alleen op verzoek van de eigenaar. De beheerder bewijst dat hij het endpoint beheert, er loopt een controle, en de uitkomst wordt een ondertekende, content-geadresseerde, verlopende attestatie. Hergebruikt het canonieke hashen en EIP-191-ondertekenen van capacity-attest in plaats van het opnieuw te bouwen. Nooit een veiligheidsscore, nooit een uitspraak over een partij die er niet om vroeg. | nog niet gepubliceerd |
| [`trust-attest-server`](packages/trust-attest-server) | MCP-server voor de trust-laag van tokenizen.nl. Een agent bewijst dat hij een endpoint beheert, een passieve controle leest wat het antwoord van dat endpoint zelf zegt over authenticatie, en de uitkomst komt terug als een ondertekende, verlopende attestatie. Eigendomsbewijs is verplicht voordat er een controle loopt. | `trust-attest-server` (0.1.0 gepubliceerd, 0.1.1 nog niet gepubliceerd) |
| [`net-guard`](packages/net-guard) | Het enige afgedwongen uitgangspunt voor netwerkverkeer van de trust-laag: een IP-controlerende, IP-vastpinnende fetch en DNS-resolver die privé-, loopback-, link-local- en cloud-metadata-adressen weigert op elke stap, ook bij redirects. | nog niet gepubliceerd, wordt `tokenizen-net-guard` |
| [`self-check-server`](packages/self-check-server) | Kleine HTTP-backend achter tokenizen.nl/check. Een browser kan `node:dns` of `node:crypto` niet zelf aanroepen, dus deze dunne laag stelt de al geteste eigendomsbewijs-functies beschikbaar via twee routes, met SSRF-bescherming en een limiet per IP voor publiek, niet-ingelogd gebruik. | niet gepubliceerd, draait als dienst |
| [`website`](packages/website) | De publieke site van tokenizen.nl, in dezelfde monorepo als de packages die hij beschrijft. | niet van toepassing |

## Lokaal draaien

Dit is een npm-workspaces monorepo. Vanuit de root:

```bash
npm install
```

Dat installeert de dependencies van alle packages onder `packages/*` in één keer. Voor het draaien, testen en bouwen van een specifiek package: volg de instructies in de README van dat package, of gebruik de workspace-flag vanuit de root, bijvoorbeeld:

```bash
npm test --workspace=capacity-attest
npm run build --workspace=capacity-attest
```

## Status

Vroeg-stadium open source. Wat dat in cijfers betekent, want het woord gebruikers verstopt het verschil: npm telde afgelopen maand 573 downloads van `capacity-attest` en 157 van `trust-attest-server`, en downloads zijn geen gebruikers. Betalende klanten zijn er niet. Wat er wel is: vier externe bouwers die op het claimformaat voortbouwen en het op commit vastpinnen. Elke betaling via ons eigen live eindpunt was tot nu toe van ons aan beide kanten. Twee packages staan op npm (`capacity-attest`, `trust-attest-server`), beide op dit moment één versie achter deze repo, de nieuwere versies zijn nog niet gepubliceerd. Het claimformaat zelf is het deel waar andere projecten al van afhangen, en het staat in minstens één externe specificatie vastgepind op commit-niveau, dus we behandelen het als vast: het breken ervan breekt hun werk, niet alleen het onze.

## Contributing

Zie [`CONTRIBUTING.md`](CONTRIBUTING.md) voor hoe je een issue of pull request indient, hoe je lokaal test, en de harde contributie-regel rond de ontwerpgrens.

## License

[MIT](LICENSE)
