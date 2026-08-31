# Changelog

Alle noemenswaardige wijzigingen aan dit package worden hier bijgehouden.

## 0.1.2

Fix voor een blokkerende event loop, gevonden door een onafhankelijke code-lezende agent dezelfde dag als de 0.1.1-fixes en apart geverifieerd voor deze release.

- **Blokkerende event loop gefixt**: `acquireLock()` (de mutex uit 0.1.1) wachtte bij een bezette lock met een synchrone `while (Date.now() < until) {}` spin-loop, tot 5 seconden lang. Node.js is single-threaded, dus die spin blokkeerde niet alleen de aanroeper maar het HELE proces: in een draaiende server (precies waar dit package voor bedoeld is, een koper-agent die na een betaalde x402-aanroep meteen `record_delivery` aanroept) zou elk ander verzoek op datzelfde proces tot 5 seconden kunnen bevriezen bij lock-contentie, ook als de aanroeper zelf niet op de aanroep wachtte. Nu wacht de retry op een echte timer (`await` op `setTimeout`), waardoor de event loop vrij blijft om ander werk te doen terwijl er op de lock gewacht wordt. Dit maakt `appendClaim()` en de functies die ervan afhangen (`recordDelivery()`, en voor een consistente async-opbouw ook `claimsForSeller()`/`allClaims()`/`getDeliveryHistory()`) Promise-gebaseerd; elke aanroepplek (tools.ts, de MCP-tool-handlers in index.ts, examples/demo.ts, de hele testsuite, de bench-scripts) is nagelopen en voorzien van `await`, zodat de volgorde van lock-check-schrijf niet stilletjes kon verschuiven. Geverifieerd met een nieuw script (`bench/event-loop-non-blocking.mjs`): een `setInterval` van 10ms bleef tikken op ongeveer hetzelfde tempo (rond 60% van de naïeve 10ms-norm, gelijk aan de tempo zonder contentie) terwijl 25 gelijktijdige `appendClaim()`-aanroepen 2 seconden op een extern vastgehouden lock wachtten; bij de oude spin-loop zou dat venster van 2 seconden vrijwel 0 tikken hebben opgeleverd. `bench/ledger-concurrency.mjs` opnieuw gedraaid: nog steeds 5 van 5 schone runs, 0% dubbele records, exact zoals na de 0.1.1-fix.
- **Extra robuustheid gevonden tijdens het schrijven van de proef hierboven**: op Windows kon `acquireLock()`'s `openSync(path, "wx")` een `EPERM` teruggeven in plaats van de verwachte `EEXIST`, wanneer een net vrijgegeven lockbestand nog kort in een "pending delete"-toestand zat. Omdat de retry-logica alleen `EEXIST` als "opnieuw proberen" herkende, werd `EPERM` meteen doorgegooid, wat gewone lock-contentie op Windows soms in een harde fout veranderde in plaats van een begrensde wachttijd. Dit bleek geen regressie van de fix hierboven te zijn (reproduceerbaar op de oude synchrone code met dezelfde foutmelding), maar wel iets dat dezelfde correctheidsgarantie raakt, dus meegenomen in deze release. `EPERM` wordt nu net als `EEXIST` als "opnieuw proberen" behandeld. Voor de fix faalden op Windows 25 van 25 gelijktijdige `appendClaim()`-aanroepen na het vrijgeven van een extern vastgehouden lock; na de fix slaagden ze 3 van 3 keer volledig (25/25), en een losstaande test met 50 gelijktijdige OS-processen (die eerder incidenteel 2 van 50 schrijfacties verloor door dezelfde oorzaak) draaide daarna 3 van 3 keer schoon.

## 0.1.1

Fixes na een adversariële audit (fuzz-tests + echte multi-proces concurrency-benchmarks, 2026-08-31). Elke fix hieronder is geverifieerd met de bijbehorende test opnieuw draaien, niet alleen gelezen.

- **Race condition gefixt**: `appendClaim()` gebruikte een lees-dan-schrijf-check zonder lock. Onder echte gelijktijdige toegang vanuit meerdere processen produceerde dit in 3 van 5 testruns (60%) daadwerkelijk dubbele claims in de ledger, ondanks de gedocumenteerde "nooit dubbel"-garantie. Nu een lockfile-gebaseerde mutex (atomaire `wx`-creatie) rond de hele check-en-schrijf-sequentie, met detectie van verweesde locks. Na de fix: 5 van 5 runs schoon, 0% dubbele records.
- **Crash gefixt**: een `promisedSpec` die duizenden niveaus diep genest was (geen geldige handtekening nodig) liet `recordDelivery()` crashen met een onafgevangen `RangeError` in plaats van netjes `{ok:false, reason}` terug te geven. Nu een expliciete, niet-recursieve dieptecheck bij het schema zelf, plus een try/catch om de handtekening-verificatie in `recordDelivery()`.
- **Adres-hoofdlettergevoeligheid gefixt**: `computeClaimId()` hashte adressen exact zoals binnengekomen, terwijl de rest van de code adressen altijd case-insensitive vergeleek. Dezelfde claim met een andere hoofdletter in het adres kreeg zo een andere claimId en omzeilde de dubbele-claim-check. Adressen worden nu bij het schema zelf naar kleine letters genormaliseerd.
- **`__proto__`-datalek gefixt**: een `promisedSpec`-sleutel genaamd `__proto__` verdween stilletjes vóór het hashen (geen prototype-pollution, wel dataverlies dat twee inhoudelijk verschillende claims dezelfde claimId kon geven). `sortKeysDeep()` bouwt het canonieke object nu op met `Object.create(null)`.
- **Bovengrenzen toegevoegd**: `promisedSpec` en `settlementRef` hadden geen lengte- of groottelimiet (een string van 1MB werd in ~6ms geaccepteerd). Nu expliciete grenzen op stringlengte, objectgrootte, en nestingsdiepte.
- Vitest 2 naar 4 (5 npm-audit-kwetsbaarheden verholpen, dev-dependency-only, geen risico voor gebruikers): stond al op main sinds commit 92e6844, maar is nooit eerder echt gepubliceerd. Deze release is de eerste die het bevat.

## 0.1.0

Eerste versie. Nog niet gepubliceerd naar npm (`"private": true`).

- MCP-server met twee tools:
  - `record_delivery`: de betalende agent legt na een x402-capaciteitsbetaling een ondertekende, feitelijke leverings-claim vast (`delivered: yes/no/partial`, `evidenceHash`, `settlementRef`).
  - `get_delivery_history`: geeft de chronologische, ruwe geschiedenis van claims tegen een `sellerAddress` terug, zonder samenvatting of score.
- `DeliveryClaim`-schema (zod) met content-addressed `claimId` (sha256 over de canonieke velden) en EIP-191 `personal_sign`-verificatie dat de handtekening echt van `buyerAddress` komt.
- Append-only JSONL-ledger (`data/claims.jsonl`); dubbele `claimId`'s en ongeldige handtekeningen worden geweigerd voordat er iets wordt opgeslagen.
- 29 tests (vitest) over schema, ledger, ondertekening en de tool-logica.
- `examples/demo.ts` voor een end-to-end lokale demo met test-sleutels, zonder live infra.
