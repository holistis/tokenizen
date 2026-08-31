# Changelog

Alle noemenswaardige wijzigingen aan dit package worden hier bijgehouden.

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
