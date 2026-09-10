import type { Dictionary } from "./types";

export const en: Dictionary = {
  "htmlLang": "en",
  "meta": {
    "title": "Tokenizen | Proof of delivery for the AI agent economy",
    "description": "Tokenizen builds open-source infrastructure for the seller side of the AI agent economy. After an x402 payment, Capacity Attest leaves a signed, factual delivery claim, so the next buyer can check a seller's history before paying themselves. No token, no interest, no loan.",
    "ogLocale": "en_US",
    "ogTitle": "Tokenizen | Proof of delivery for the AI agent economy",
    "ogDescription": "Everyone is building the buyer side of the AI agent economy (identity, spend limits, payment rails). Tokenizen builds the seller side: signed, factual proof that what was delivered matches what was promised.",
    "twitterTitle": "Tokenizen | Proof of delivery for the AI agent economy",
    "twitterDescription": "Open-source infrastructure for the seller side of the AI agent economy: a signed, factual delivery claim after every x402 payment."
  },
  "header": {
    "navLabel": "Main navigation",
    "mobileNavLabel": "Mobile navigation",
    "links": [
      {
        "href": "#probleem",
        "label": "Problem"
      },
      {
        "href": "#waarom-nu",
        "label": "Why now"
      },
      {
        "href": "#product",
        "label": "Product"
      },
      {
        "href": "#hoe-het-werkt",
        "label": "How it works"
      },
      {
        "href": "#ontwerpgrenzen",
        "label": "Limits"
      },
      {
        "href": "#open-source",
        "label": "Open source"
      },
      {
        "href": "#status",
        "label": "Status"
      }
    ],
    "github": "GitHub",
    "openMenu": "Open menu",
    "closeMenu": "Close menu"
  },
  "languageSwitch": {
    "groupLabel": "Choose language",
    "nl": "NL",
    "en": "EN"
  },
  "themeToggle": {
    "groupLabel": "Choose theme",
    "light": "Light",
    "system": "System",
    "dark": "Dark"
  },
  "hero": {
    "eyebrow": "Infrastructure for the AI agent economy · open source",
    "h1Line1": "Everyone is building the buyer side.",
    "h1Line2": "We're building the seller side.",
    "body": "Agent identity, spend limits, and payment rails are on their way (x402: per-call machine payments, Google AP2: an authorization protocol, ERC-8004: on-chain reputation registries). What's still missing: a signed record of what a seller claims to have delivered, and whether that matched what was promised. Tokenizen builds that record, starting with Capacity Attest: a signed, factual delivery claim for x402 capacity trading between agents.",
    "clarifier": "The buyer signs the claim, because only the buyer knows what actually arrived. What it produces is still the seller's track record: the evidence a good seller can point to for the next buyer.",
    "trustLine": "No token · no lending · no yield",
    "ctaPrimary": "View the code on GitHub",
    "ctaSecondary": "How it works",
    "installLabel": "or try it directly:"
  },
  "problem": {
    "eyebrow": "The problem",
    "h2": "An agent pays, gets less, and has no signed record of it.",
    "body": "An AI agent pays via x402 for capacity from another agent or service: GPU-hours, storage, API/inference credits, bandwidth. The delivery falls short: fewer hours than promised, lower quality, less storage. There is no receipt that records what was promised and what was claimed. That is not proof that the delivery itself was correct, but it is a signed record an agent can later consult and show.",
    "cards": [
      {
        "title": "The buyer knows",
        "body": "They saw the output, or they didn't. But that knowledge is lost the moment the session ends."
      },
      {
        "title": "The next buyer doesn't",
        "body": "They start blind with the same seller, with no history to check before they pay."
      },
      {
        "title": "Nobody records the claim",
        "body": "Without a signed record, there is nothing linking a promise to a claimed delivery, let alone anything the next buyer can verify."
      }
    ]
  },
  "whyNow": {
    "eyebrow": "Why now",
    "h2": "Three developments converge this year.",
    "body": "Nine domain scans (August 2026) show the same pattern: the buyer side of the agent economy gets all the attention. The seller side, and the object itself (the evidence), stays underexposed, exactly when regulation and payment rails are starting to call for it.",
    "reasons": [
      {
        "date": "July 20, 2026",
        "title": "EU Digital Product Passport register live",
        "body": "The European Commission opened the DPP register; mandatory passports follow in phases per product category (batteries from Feb. 2027). This shows that a machine-readable, finance-free asset passport is becoming a real EU standard, not that it is already mandatory everywhere."
      },
      {
        "date": "August 2, 2026",
        "title": "EU AI Act, Article 14 in effect",
        "body": "High-risk AI systems must be demonstrably overseeable by humans. That calls for a verifiable record of what an autonomous agent did, exactly the kind of auditability Tokenizen addresses, without us making an Article 14 compliance claim ourselves."
      },
      {
        "date": "ongoing",
        "title": "x402 and Google AP2 leave one question open",
        "body": "Coinbase (now Linux Foundation) and Google built the payment and authorization rails. \"What exactly am I buying, and is the seller allowed to deliver this?\" remains unanswered."
      }
    ]
  },
  "product": {
    "eyebrow": "The product: Capacity Attest",
    "h2": "A signed, factual delivery claim. No judgment, no score.",
    "body": "After an x402 settlement for capacity (GPU-hours, storage, API credits, bandwidth), the paying agent leaves a cryptographically signed claim: `delivered` (yes/no/partial) plus a hash of the evidence, content-addressed and on an append-only ledger. Other agents can query that history before doing business with a seller themselves.",
    "codeLabelRecordCall": "MCP tool call → record_delivery",
    "codeLabelHistoryCall": "MCP tool call → get_delivery_history",
    "codeLabelResult": "response",
    "note": "This is a fictional example: the addresses, hashes, and signature above are made up to illustrate the schema, not derived from a real claim. For a real, live claim, see the proof block in the Status section below. The full schema is in `packages/capacity-attest/src/schema.ts`.",
    "cards": [
      {
        "title": "record_delivery",
        "body": "The paying agent calls this after an x402 settlement. The server first validates the schema, then whether `claimId` is really the hash of the content, and then whether `signature` recovers to `buyerAddress`. Only then does the claim land on the append-only ledger."
      },
      {
        "title": "get_delivery_history",
        "body": "Given a `sellerAddress`: all known, signature-verified claims against that seller, chronologically. Purely factual: no average, no percentage, no trust score."
      }
    ]
  },
  "howItWorks": {
    "eyebrow": "How it works",
    "h2": "Four steps, no intermediary.",
    "body": "Tokenizen does not verify or settle payments itself, that already happens at x402. The ledger only records the receipt of a settlement that has already taken place.",
    "steps": [
      {
        "title": "Agent pays via x402",
        "body": "An AI agent buys capacity (GPU-hours, storage, API credits, bandwidth) from another agent or service."
      },
      {
        "title": "Buyer signs a claim",
        "body": "After settlement, the paying agent records whether what was promised arrived: yes / no / partial, plus a hash of the evidence."
      },
      {
        "title": "Claim to the ledger",
        "body": "record_delivery validates schema, claimId and signature, and writes the claim append-only. Not editable afterward."
      },
      {
        "title": "Next buyer checks first",
        "body": "Before paying, an agent calls get_delivery_history and sees that seller's raw delivery history."
      }
    ]
  },
  "boundaries": {
    "eyebrow": "Design limits",
    "h2": "Deliberately no token, no interest, no loans.",
    "body": "This is not a marketing trick. It is a deliberate, hard design boundary, and a strategic one: it keeps Tokenizen out of the most heavily regulated and most hyped corner of crypto. The boundary is explicitly built into the schema and the documentation, not glossed over.",
    "columns": [
      {
        "label": "Yes: we build",
        "items": [
          "Verification of delivery (delivered: yes/no/partial + evidence hash)",
          "Append-only audit trail, content-addressed, cannot be altered after the fact",
          "MCP tools to check a seller's history before payment",
          "Real capacity trading: GPU-hours, storage, API credits, bandwidth"
        ]
      },
      {
        "label": "With guardrail",
        "items": [
          "Settlement is spot-only (settled immediately, never on credit or term)",
          "Credits are redeemable vouchers for capacity, not a tradable instrument",
          "Evidence is stored as a hash, not as the data itself"
        ]
      },
      {
        "label": "Never: hardcoded excluded",
        "items": [
          "No native token or coin",
          "No loans",
          "No interest on payments",
          "No factoring / invoice financing",
          "No yield products"
        ]
      }
    ]
  },
  "openSource": {
    "eyebrow": "Open source & for developers",
    "h2": "The code is there. And now on npm too.",
    "body": "`capacity-attest` is an MCP server, written in TypeScript, with a comprehensive test suite. The package is live on npm (current version 0.2.0) and is registered in the official MCP registry as `io.github.holistis/capacity-attest`. An agent can call the server directly without first cloning the repository.",
    "badges": {
      "mit": "MIT license",
      "typescript": "TypeScript",
      "mcp": "Model Context Protocol",
      "status": "live on npm"
    },
    "npmLabel": "npmjs.com/package/capacity-attest",
    "installIntro": "For local development: clone the repository, install, build, and run the included end-to-end demo, which uses a disposable test wallet and does not touch any live infrastructure.",
    "localDevLabel": "local development",
    "repoButton": "Repository on GitHub",
    "terminalLabel": "install",
    "localTerminalLabel": "terminal",
    "commentBuild": "tsc -> dist/",
    "commentTest": "vitest run",
    "commentDemo": "end-to-end local demo, TEST keys, no live infra",
    "copyLabel": "Copy",
    "copiedLabel": "Copied"
  },
  "status": {
    "eyebrow": "Status, honestly",
    "h2": "New project. No customers. But a proven foundation.",
    "body": "Tokenizen just launched, is open source, and is in active development. There are no external users yet, no partnerships, no customers. We just say so. What does exist: this is built on top of proven, self-built payment and MCP infrastructure (x402, several previously published npm/MCP packages), and the first independent verification of a live claim has already happened. The first external integration is the next thing that counts.",
    "checkpoints": [
      {
        "title": "npm publication",
        "body": "capacity-attest 0.2.0 is live on npm and in the MCP registry.",
        "achieved": true
      },
      {
        "title": "First external clone/install",
        "body": "Someone outside this project cloning the repository or running npm install capacity-attest, without us demonstrating it first.",
        "achieved": false
      },
      {
        "title": "First external agent integration",
        "body": "An agent from another party that actually calls record_delivery or get_delivery_history.",
        "achieved": false
      }
    ],
    "proof": {
      "title": "Independently verified",
      "body": "An external project (ASM spec) independently verified a real payment claim on September 1, 2026: same claimId, same signature recovered to the buyer, same on-chain payment.",
      "txLabel": "View the transaction",
      "verificationLabel": "View the verification"
    },
    "limitation": {
      "title": "Known limit: the ledger is still local",
      "body": "`npm install capacity-attest` starts a local, per-installation ledger by default (configurable via `CAPACITY_ATTEST_DATA_DIR`). Two independent installations don't automatically see each other's claims through that default; that's still the next build step. What already exists in the meantime, live-verified on Base mainnet: publishing and finding claims via the Ethereum Attestation Service, and a real `giveFeedback()` connection to the ERC-8004 Reputation Registry, so the delivery fact also becomes visible where hundreds of thousands of ERC-8004 agents already look. Both are proven, opt-in building blocks: ready to use, not yet automatically active across installations."
    }
  },
  "footer": {
    "tagline": "Open-source infrastructure for the seller side of the AI agent economy. New, in active development, with fixed design limits.",
    "maintainedBy": "Maintained by",
    "githubLabel": "github.com/holistis/tokenizen",
    "copyright": "© 2026 tokenizen. Open source, MIT license.",
    "legend": [
      {
        "dot": "bg-rule-green",
        "label": "yes: we build"
      },
      {
        "dot": "bg-rule-yellow",
        "label": "with guardrail"
      },
      {
        "dot": "bg-rule-red",
        "label": "never, hardcoded excluded"
      }
    ]
  },
  "noscript": {
    "h1": "Tokenizen: proof of delivery for the AI agent economy",
    "body": "Tokenizen builds open-source infrastructure for the seller side of the AI agent economy: verifiable proof that a seller genuinely holds a right, and that what was delivered matches what was promised.",
    "h2": "Capacity Attest",
    "productBody": "When an AI agent pays another agent via the x402 protocol for capacity (GPU-hours, storage, API credits, bandwidth), the paying agent leaves a cryptographically signed claim after settlement stating whether what was delivered matched what was promised. Other agents can look up that history before doing business with a seller.",
    "link": "View the code on GitHub"
  }
};
