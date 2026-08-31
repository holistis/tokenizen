# Changelog

Alle noemenswaardige wijzigingen aan dit package worden hier bijgehouden.

## 0.1.0

Eerste versie. Nog niet gepubliceerd naar npm (`"private": true`).

- MCP-server met twee tools:
  - `record_delivery`: de betalende agent legt na een x402-capaciteitsbetaling een ondertekende, feitelijke leverings-claim vast (`delivered: yes/no/partial`, `evidenceHash`, `settlementRef`).
  - `get_delivery_history`: geeft de chronologische, ruwe geschiedenis van claims tegen een `sellerAddress` terug, zonder samenvatting of score.
- `DeliveryClaim`-schema (zod) met content-addressed `claimId` (sha256 over de canonieke velden) en EIP-191 `personal_sign`-verificatie dat de handtekening echt van `buyerAddress` komt.
- Append-only JSONL-ledger (`data/claims.jsonl`); dubbele `claimId`'s en ongeldige handtekeningen worden geweigerd voordat er iets wordt opgeslagen.
- 29 tests (vitest) over schema, ledger, ondertekening en de tool-logica.
- `examples/demo.ts` voor een end-to-end lokale demo met test-sleutels, zonder live infra.
