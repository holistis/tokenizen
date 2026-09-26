# NLnet CodeSupply — concept-aanvraag voor Capacity Attest

Status: CONCEPT, nog niet ingediend. Wacht op koning-akkoord op de exacte tekst voor indiening op nlnet.nl/propose/ (fonds: CodeSupply, deadline eerstvolgende ronde 3 november 2026, 12:00 CET).

Elk veld hieronder komt 1-op-1 overeen met een veld op het echte formulier. Tekens zijn geteld op het Engelse concept (dit gaat in het Engels in, NLnet is internationaal).

---

## Select a fund

CodeSupply Fund

---

## Proposal title

Capacity Attest — verifiable delivery attestations for agent-to-agent service trades

---

## Project website(s) / repositories

- https://github.com/holistis/tokenizen (monorepo; the package itself is at `packages/capacity-attest`)
- https://www.npmjs.com/package/capacity-attest
- https://tokenizen.nl

---

## Project summary (max 1000 characters)

> Draft, 1000 tekens is kort, dus dit is bewust dicht op de kern.

Capacity Attest is an open source (MIT) MCP server and library that lets AI agents leave a cryptographically signed, factual record after a paid transaction: did the seller actually deliver what was promised (GPU-hours, storage, API credits, bandwidth)? No reputation score, no judgment — just a content-addressed, buyer-signed claim any other agent can verify offline with only the npm package, no server or index to trust. Claims can additionally be published as on-chain attestations (Ethereum Attestation Service on Base) and fed into the ERC-8004 Reputation Registry, so discovery works across installations without a central authority. The core primitive is already live: real EAS attestations and a real ERC-8004 `giveFeedback()` transaction exist on Base mainnet today, verifiable by anyone, and two independent third-party projects have already merged pull requests using the package as a dependency. This proposal funds hardening cross-installation discovery, adding a second chain adapter, and a full external security audit.

(Karakters: ongeveer 980, past binnen de 1000-limiet — bij indienen nog exact tellen.)

---

## Proposed effort

### Budget amount

€18.000

### Budget breakdown (max 4000 characters)

This is a solo-maintainer effort; the budget covers the applicant's own time at a modest, NLnet-typical rate, no subcontracting.

1. **Cross-installation discovery hardening (€6,000, ~6 weeks)**
   The `discoverDeliveryHistory()` aggregation layer and the EAS-backed source (`src/eas.ts`, `src/discovery.ts`) already exist and are unit-tested, but have never been exercised against real-world adversarial conditions at scale: a source returning tens of thousands of claims, a source that is slow/flaky, concurrent discovery calls sharing rate-limited RPC quota. This work package adds: pagination and backpressure for `easSource`, a second production-grade source implementation (see below), a fuzz/property-based test suite specifically targeting the aggregation and completeness-detection logic (`src/completeness.ts`), and a runnable, documented example combining local ledger + EAS discovery into one CLI tool (`examples/reputation-lookup.mjs`) so integrators have a working reference instead of just library functions.

2. **A second chain adapter — Ethereum mainnet / Optimism via EAS (€5,000, ~5 weeks)**
   EAS is deployed identically on multiple OP-Stack chains and on Ethereum mainnet with a different (but structurally similar) contract. Today Capacity Attest only reads/writes Base. This work package generalizes `src/eas.ts` so the same schema and discovery logic work against any EAS deployment the caller points it at, with Ethereum mainnet and one additional OP-Stack chain (Optimism) as the concretely tested targets, closing the current single-chain lock-in that limits who can discover a seller's claims.

3. **Independent external security audit (€5,000, ~2 weeks elapsed, mostly external reviewer time)**
   The 0.6.0 on-chain write path already went through a documented, dated internal adversarial review (`docs/SECURITY-REVIEW-2026-09-11.md`, ten findings, all fixed with regression tests) — but an internal review is not an independent one. This budget line pays a genuinely independent, external smart-contract/crypto reviewer (scope: `src/signing.ts`, `src/eas.ts`, `src/erc8004-reputation.ts`, the on-chain write paths only) to produce a public report before this project asks any third party to rely on it at real scale.

4. **Documentation, examples, and maintenance (€2,000, ongoing across the grant period)**
   English-language integration guide beyond the current README, a second real-world worked example (a second independent x402 seller integrating the tool, documented step by step), and routine dependency/security maintenance for the grant period.

No paid subcontractors; the applicant does all listed work personally. Time estimates are calendar weeks at reduced part-time intensity (this is maintained alongside other work), not full-time weeks.

### Comparison with existing efforts (max 4000 characters)

The closest existing pattern is software-supply-chain provenance: **in-toto** attestations and **SLSA** provenance, which let a build system produce signed, verifiable metadata about how an artifact was produced, so a consumer doesn't have to trust the builder blindly. Capacity Attest borrows the same core idea — a signed, content-addressed, independently re-verifiable claim, with no dependency on a trusted index — but applies it to a different point in a different chain: not "how was this software artifact built," but "did this already-paid-for service delivery (compute, storage, API access) between two economic agents actually happen as promised." In-toto/SLSA claims are typically anchored in a transparency log (e.g. Sigstore/Rekor) or a CI provenance store; Capacity Attest anchors optionally on a public blockchain (EAS on Base/Ethereum), chosen specifically because the agents already transacting via the x402 payment protocol are already chain-native, so no new trust root needs to be introduced for them.

Within the emerging "AI agent economy" space specifically, the closest adjacent standard is **ERC-8004** (Trustless Agents, an Ethereum standard for agent identity and reputation via three on-chain registries: Identity, Reputation, Validation). ERC-8004 defines *where* reputation signals can be published and read, but is deliberately silent on *what a legitimate reputation signal actually is* — any contract-valid `feedback` call is accepted at face value. Capacity Attest is not a competing standard; it is a concrete, opinionated answer to that open question for one well-defined case (capacity delivery), and it already writes into ERC-8004's own Reputation Registry rather than inventing a parallel one. Other ERC-8004-adjacent projects found during a review of the ecosystem build agent identity tooling, agent discovery, or trading-focused agent frameworks — none, as far as this research found, focus specifically on the seller-side delivery-proof problem Capacity Attest addresses; the emerging tooling in this space (wallets, agent identity, payment rails like x402 itself) is concentrated almost entirely on the buyer/payment side of the transaction, which this proposal's own design rationale documents.

This is not a rewrite-from-scratch proposal: the core primitive (schema, signing, ledger, MCP tools, EAS write/discover, ERC-8004 read/write) is already built, tested (541 automated tests), and has real, unprompted third-party adoption (two independent GitHub projects have merged PRs using it as a dependency, without the maintainer soliciting them). This grant funds hardening what already works into something a security-conscious integrator can rely on at real scale, not inventing the concept.

### Technical challenges (max 4000 characters)

[CONCEPT — dit stuk vraagt om de meeste technische precisie en is het langst, hier een eerste versie; bij indienen nog een keer laten meelezen tegen de actuele code]

1. **Cross-source discovery without a trust root is a genuinely hard aggregation problem, not just a fetch-and-merge.** `discoverDeliveryHistory()` must treat every source (including EAS itself) as actively adversarial: a source can inject a forged-but-well-shaped claim, can flood volume to exhaust resources, or can simply omit claims (the "D-006 completeness" problem documented in this project's own `DECISIONS.md`). The current implementation caps volume per source and re-verifies every claim regardless of source, but has not yet been fuzz-tested against pathological adversarial inputs at the scale a real multi-chain deployment would see. That is this proposal's first, largest technical risk to retire.

2. **Generalizing the EAS adapter across chains without silently breaking schema compatibility.** EAS's contract addresses are identical across OP-Stack chains (a fixed predeploy address) but different on Ethereum mainnet, and the schema UID is itself a deterministic hash over the schema string plus chain-specific parameters. A naive "just change the RPC URL" approach risks producing claims under a *different* schema UID on a second chain, silently fragmenting discoverability instead of extending it. The work package above explicitly budgets time to get this cross-chain schema identity right and test it, not just to point the existing code at a second RPC endpoint.

3. **An external security audit for a project this size is unusually hard to source affordably**, because most audit firms are priced for much larger, funded protocols. Part of this budget line's realistic scope is finding a reviewer willing to scope a smaller, well-defined engagement (four specific files, not "audit the whole system"), which is itself a real, non-trivial task for a solo maintainer without an existing audit-firm relationship.

### Ecosystem & engagement (max 2000 characters)

Capacity Attest depends only on `ethers`, `zod`, and the official `@modelcontextprotocol/sdk` — no exotic or single-maintainer dependencies. It is published on npm and in the official MCP registry (`io.github.holistis/capacity-attest`), and is designed to be usable as a plain library even outside an MCP context (every MCP tool is a thin wrapper over a plain exported function in `src/tools.ts`).

Real, verifiable third-party engagement to date: two merged pull requests in an independent project (`YE-YI7/asm-spec`, one for an Ethereum/Base integration, one for a Bitcoin SV rail adapter built on the same claim format, contributed by a separate author, EmbryoSpace); a third integration proposal open for review in another independent agent-spec project (`omworldprotocol/om-world`); and a from-scratch, stdlib-only Python re-implementation of the verification logic by an unrelated developer, now a permanent regression test inside a separately published PyPI package (`tamga-protocol`). None of this adoption was solicited by the maintainer; all of it happened because the underlying claim format and its cryptographic verification path are open, documented, and reusable without needing this project's own server or blessing.

### Your experience (max 2000 characters)

[TE VOLLEN DOOR ABDELLAH — ik heb hier geen betrouwbare feiten over, wil niks verzinnen. Vraagt om: relevante achtergrond/ervaring die aantoont dat jij dit project kan afmaken. Denk aan: hoe lang doe je al softwareontwikkeling, andere open-source/technische projecten die je hebt gebouwd of onderhouden (bijvoorbeeld andere npm-packages in dit ecosysteem zoals mcp-paywall/al-yad-mcp-server/3ilm-mcp als die publiek zijn), en waarom jij de aangewezen persoon bent om dit specifieke werkpakket te doen. Zodra jij me dit geeft schrijf ik het in NLnet's toon uit.]

### Other funding sources (max 1000 characters)

This project has not previously received any grant, subsidy, or investment. A separate, no-deadline nomination for Base's "Builder Grants" program (a small, ETH-denominated, retroactive reward for already-shipped work, not a competitive grant) is in preparation in parallel; if awarded, it would be a one-time, unrelated reward (typically 1-5 ETH) for work already completed before this proposal, not overlapping funding for the work packages described above.

---

## AI disclosure

**Have you used generative AI?** Yes.

**Which model, for what (draft — NLnet asks for real specificity here, up to 8000 characters, so this should end up being thorough, not a one-liner):**

This project has been built in close, ongoing collaboration with Claude (Anthropic), used as a coding assistant and adversarial reviewer throughout — including, transparently, the drafting of this very proposal. Concretely: [CONCEPT, in te vullen met een eerlijke beschrijving van HOE dit precies ging — bijvoorbeeld: architecture/design decisions and the halal-guardrail review were human-directed; Claude wrote the initial implementation of most modules under human review; the adversarial security review of 0.6.0 (docs/SECURITY-REVIEW-2026-09-11.md) was performed by Claude acting as an internal adversarial reviewer, explicitly NOT presented anywhere as an independent third-party audit — which is also why this proposal's own budget includes a REAL external audit as work package 3]. Nothing produced with AI assistance is presented anywhere in this project's own materials as human-authored work that it is not; the project's own README explicitly labels its internal security review as internal, not external, for exactly this reason.

---

## Contact information

[TE VOLLEN DOOR ABDELLAH: naam/pseudoniem waaronder je wilt indienen, e-mailadres, land, applicant-type (waarschijnlijk "individual"/zelfstandige, NLnet's exacte 7 opties nog checken op het echte formulier).]

---

## Openstaande punten voor de koning, geen vraag nu, gewoon een lijst voor als je hierop terugkomt

- "Your experience"-sectie: ik kan dit niet eerlijk invullen zonder jouw input, zie de placeholder hierboven.
- Contactgegevens: welke naam/pseudoniem, welk e-mailadres.
- Budget (€18.000, verdeeld over 4 werkpakketten): is dit een bedrag waar jij achter staat, of wil je het hoger/lager/anders verdeeld?
- AI-disclosure-sectie: ik heb een eerlijk concept geschreven, wil dat je 'm leest voor het de deur uitgaat, dit is het gevoeligste onderdeel van de hele aanvraag.

---

## Aanvullingen ronde 2 (2026-09-27, /loop), niet in het NLnet-voorstel zelf, losse bevindingen voor de koning

**Tinkerer Track-plan (Open Agent Hackathon, bouwvenster 15-20 okt):** gebruik Zetaris (een van de twee genoemde sponsortechnologieën). Zetaris is een gefedereerde data-queryplatform: "query distributed data sources in real-time without moving/centralizing them." Dat past vrijwel 1-op-1 op capacity-attest's eigen D-005-probleem (cross-installatie claim-discovery zonder centrale, vertrouwde index). Het "nieuwe werk tijdens het venster": een Zetaris-gebaseerde federatielaag bovenop `discoverDeliveryHistory()` die meerdere onafhankelijke claim-bronnen (verschillende lokale ledgers, EAS op meerdere chains) als één doorzoekbare, maar nooit gecentraliseerde, view ontsluit. Sterk verhaal voor een jury: "onze eigen architectuur weigerde al een centrale index te worden, Zetaris laat zien hoe je dat toch doorzoekbaar maakt." Nog niet gebouwd, mag ook pas vanaf 15 oktober.
