# tokenizen

Open-source infrastructuur voor agent-commerce: AI-agents leren rechten op economische assets begrijpen, verifiëren en afwikkelen.

## Waarom dit bestaat

De keten van een agent die iets koopt of verkoopt bestaat uit zes stappen: agent, identity, rights, asset, payment, settlement. De koperskant van die keten is al druk in ontwikkeling: wallets, betaalprotocollen zoals x402, agent-identity. Wat ontbreekt is de verkoperskant: hoe bewijs je wat je als agent hebt geleverd, wat je bezit, en wat de rechten daarop zijn, op een manier die een andere agent zonder mens ertussen kan verifiëren.

Tokenizen bouwt aan dat object, niet aan de koperskant. Drie sporen zijn onafhankelijk van elkaar bij dezelfde conclusie uitgekomen: een sharia-toetsing van wat wel en niet toelaatbaar is in agent-tot-agent handel, marktonderzoek naar wat er in dit veld al bestaat en wat ontbreekt, en een inventaris van eigen code die al jaren op vergelijkbare problemen stuitte. Alle drie wezen naar hetzelfde gat: verificatie en afwikkeling aan de verkoperskant, zonder financiële constructies die niet toelaatbaar zijn.

## De halal-lijn

Dit project heeft een permanente, bewuste grens, voortgekomen uit een formele sharia-toetsing. Die grens geldt voor het hele project, niet alleen voor een los package.

**Groen (dit bouwen we):**

- Verificatie en audit-trails van geleverde diensten of assets
- Policy- en scope-controle tussen agents
- Echte capaciteitshandel (compute, opslag, API-credits, bandbreedte) die daadwerkelijk geleverd wordt

**Geel (met randvoorwaarden):**

- Settlement is spot-only: betaling tegen directe levering, geen uitgestelde afwikkeling
- Credits zijn inwisselbare vouchers voor een dienst, geen verhandelbaar financieel instrument

**Rood (nooit):**

- Rente of enige vorm van riba
- Leningen of kredietverlening
- Een eigen token of munt
- Factoring of invoice-financing
- Yield-producten

Bij twijfel of iets tegen deze lijn aan schuurt: het blijft weg, ongeacht hoe interessant het technisch is.

## Packages

### `packages/capacity-attest`

Een MCP-server met twee tools: `record_delivery` en `get_delivery_history`. Na een x402-betaling voor capaciteit (GPU-uren, opslag, API-credits, bandbreedte) laat de betalende agent een cryptografisch ondertekende, feitelijke claim achter over wat er wel of niet geleverd is. Andere agents kunnen die geschiedenis van een verkoper opvragen voordat ze zelf betalen. Geen reputatiescore, geen oordeel, puur een feitelijke, append-only geschiedenis.

Zie [`packages/capacity-attest/README.md`](packages/capacity-attest/README.md) voor de volledige werking, het schema, en hoe je het lokaal draait.

### `packages/website`

De publieke site van tokenizen.nl, in dezelfde monorepo als de packages die hij beschrijft. Staat gelijktijdig in ontwikkeling met deze documentatie; zie de eigen README in die map voor de actuele status.

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

Vroeg-stadium open source. Nog niet gepubliceerd naar npm. `packages/capacity-attest` staat bewust op `"private": true` in zijn `package.json` totdat er expliciet akkoord is voor publicatie.

## Contributing

Zie [`CONTRIBUTING.md`](CONTRIBUTING.md) voor hoe je een issue of pull request indient, hoe je lokaal test, en de harde contributie-regel rond de halal-lijn.

## License

[MIT](LICENSE)
