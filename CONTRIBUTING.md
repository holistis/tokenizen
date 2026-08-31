# Contributing

Tokenizen is een klein, vroeg-stadium open-source project. Bijdragen zijn welkom, maar houd de schaal in gedachten: dit is geen groot consumentenproduct met een uitgebreid proces, het is een monorepo met een paar packages die nog aan het uitkristalliseren zijn.

## Een issue indienen

Gebruik `.github/ISSUE_TEMPLATE/bug_report.md` als startpunt. Beschrijf kort:

- Wat je verwachtte en wat er echt gebeurde
- Welk package het betreft (bijvoorbeeld `packages/capacity-attest`)
- Stappen om te reproduceren, inclusief Node-versie

Voor ideeën of vragen die geen bug zijn: open gewoon een issue zonder template, of een discussie als die aanstaat op de repo.

## Een pull request indienen

1. Fork de repo en werk op een eigen branch, nooit direct op `main`.
2. Houd de PR gericht op één ding. Een PR die twee ongerelateerde dingen tegelijk oplost is moeilijker te beoordelen en duurt langer om te mergen.
3. Zorg dat de bestaande tests van het package dat je aanraakt nog slagen (zie hieronder).
4. Vul de PR-checklist in (`.github/pull_request_template.md`), inclusief de checkbox over de ontwerpgrens.
5. Beschrijf in de PR-omschrijving wat en waarom, niet alleen wat.

## Lokaal testen

Dit is een npm-workspaces monorepo. Vanuit de root:

```bash
npm install
```

Per package testen:

```bash
npm test --workspace=<package-naam>
```

Bijvoorbeeld voor het bestaande package:

```bash
npm test --workspace=capacity-attest
```

Waar een package een build-stap heeft, draai die ook voor je een PR opent:

```bash
npm run build --workspace=<package-naam>
```

CI draait dezelfde commando's automatisch op elke push en PR (zie `.github/workflows/ci.yml`).

## Code-stijl

- TypeScript, geen `any` tenzij het een grens met een externe library is, en dan met een comment waarom.
- Kleine, leesbare functies boven cleverness.
- Geen em-dash in code-comments of gebruikersgerichte tekst; gebruik een punt of komma.
- Volg de bestaande structuur van een package (zie de architectuur-sectie in de README van dat package) in plaats van een eigen patroon te introduceren.

## De ontwerpgrens (harde regel)

Tokenizen heeft een permanente grens die voortkomt uit een formele interne toetsing, beschreven in de root-README. Deze grens is niet onderhandelbaar en geldt voor elke bijdrage, ongeacht technische kwaliteit:

**Pull requests die rente, leningen, yield-producten, factoring/invoice-financing, of een eigen token/munt toevoegen worden niet geaccepteerd.**

Dit geldt ook voor functionaliteit die er in eerste instantie neutraal uitziet maar in de praktijk een van deze dingen faciliteert (bijvoorbeeld een "credit"-veld dat verhandelbaar wordt gemaakt, of een uitgestelde-betaling-mechaniek die op krediet neerkomt). Twijfel je of iets binnen de lijn valt: open eerst een issue om het te bespreken voor je tijd in de implementatie steekt.

## Vragen

Open een issue, of neem contact op via `info@holistischadviseur.nl`.
