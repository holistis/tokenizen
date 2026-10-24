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
        "href": "#controle",
        "label": "Inspection"
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
      },
      {
        "href": "/blog",
        "label": "Blog"
      },
      {
        "href": "/notes",
        "label": "Notes"
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
    "eyebrow": "Open source infrastructure for the AI agent economy",
    "h1Line1": "AI agents are about to do business with each other.",
    "h1Line2": "Nobody can check what actually happened.",
    "body": "An AI agent buys something from another agent and pays within a second. Whether what was promised actually arrived is recorded nowhere. We turn that into signed receipts. Two kinds: a receipt of what was delivered, and a receipt of what an inspection of that agent actually found. Both readable by whoever does business next.",
    "clarifier": "The buyer signs the claim, because only the buyer knows what actually arrived. What it produces is still the seller's track record: the evidence a good seller can point to for the next buyer.",
    "trustLine": "No token · no lending · no yield",
    "ctaPrimary": "View the code on GitHub",
    "ctaSecondary": "How it works",
    "installLabel": "or try it directly:"
  },
  "problem": {
    "eyebrow": "The problem",
    "h2": "Paying already happens by itself. Checking what you got does not.",
    "body": "An agent pays within a second for compute, storage or access to a service. If it got less than promised, that disappears the moment the session ends. Nothing is left for anyone to look at later. No complaint, no proof, no memory.",
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
    "eyebrow": "Pillar 1: proof of delivery",
    "h2": "A receipt of what was delivered. No score, no verdict.",
    "body": "Once an agent has paid, it records whether it got what was promised: yes, no, or partial. That receipt is signed and cannot be changed afterwards. Anyone who later wants to deal with that same seller can look up the history before paying.",
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
  "secondPillar": {
    "eyebrow": "Pillar 2",
    "h2": "Proof of inspection, not proof of safety.",
    "body": "A company letting a stranger's AI agent in has nothing but the vendor's own brochure. Pillar 2 turns that into a receipt anyone can check: the owner first proves the endpoint is theirs, gives permission, and we record what we actually found. Signed, dated, and readable by anyone.",
    "cards": [
      {
        "title": "The owner proves it is theirs",
        "body": "They publish a token in their DNS or as a file on their own server. That proves they control the endpoint, the same way a note in your letterbox proves the house is yours.",
      },
      {
        "title": "They give permission",
        "body": "We never touch an endpoint without explicit consent, and we never list one whose owner did not ask for it.",
      },
      {
        "title": "We write down what we saw",
        "body": "No score and no verdict. Whatever we could not establish is called inconclusive, and it says so.",
      },
    ],
    "honestNote": "We never stamp something safe. A test can show that something is wrong, but it can never prove that nothing is.",
    "ctaLabel": "Try it, free",
    "ctaNote": "Free, no account needed. The paid attestation is deliberately still switched off.",
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
  "metingen": {
    "eyebrow": "What we measured",
    "h2": "Our own check turned out to be wrong. We tracked it down, fixed it, and wrote it down here.",
    "body": "A program that buys something on its own wants to know up front whether the seller asks for money properly. We built a free checking program for that. In October we ran it against sixty real sellers, and it turned out to be telling most of them they were doing it wrong. The fault was ours: our program was knocking on the wrong door. It is fixed now. It is here because a number without a method is worth nothing, and because anyone who hides their own mistake is not worth believing on their next number either.",
    "rows": [
      {
        "date": "18 October 2026",
        "title": "From sixty four percent wrong to zero",
        "body": "We took sixty sellers from the public Coinbase list and asked each of them once for a price. Fifty nine really do ask for money. Of those fifty nine, thirty eight were wrongly failed by us. After the fix: none. The method and the raw output are in the code, so you can redo it yourself."
      },
      {
        "date": "October 2026",
        "title": "Four builders now use our way of counting",
        "body": "In the public discussions about these agreements, four people adopted our breakdown. The one that matters most is the difference between this is wrong and I could not check this. That sounds small and it is not: anyone who merges those two blames an honest seller for a failure at the checker end."
      },
      {
        "date": "as of today",
        "title": "No paying customer yet",
        "body": "Zero. Nobody outside this project pays for this yet. We would rather write that down ourselves than have someone find it out."
      },
      {
        "date": "last fourteen days",
        "title": "A hundred people looked, nobody installed",
        "body": "A hundred and two people pulled the code to look at it. The install count is zero. That means we are being found and not convincing anyone, which is a different problem from being unknown."
      }
    ],
    "footer": "Every line above carries a date and a way of measuring. If a number changes, the line changes and the date stays visible. That way you can see whether something is still true instead of having to assume it. The code and the raw output are at github.com/holistis/agent-receipt-verify, so you can recheck every line above yourself."
  },
  "status": {
    "eyebrow": "Status, honestly",
    "h2": "No paying customers. Three outside parties building on the format, and work others checked themselves.",
    "body": "Tokenizen is open source and in active development. There are no paying customers and no partnerships, and we say that plainly. What does exist: three parties outside this project now build on the claim format. One of them rebuilt our verifier from scratch in another language and ships it inside their own package. Another cites the measured block as the source of truth for metered delivery in their own draft specification, pinned to a commit of this repo. The next thing that counts is getting the signed test vectors into an official conformance set, so that anyone joining later has to pass them.",
    "checkpoints": [
      {
        "title": "npm publication",
        "body": "capacity-attest is live on npm and in the MCP registry, currently at 0.7.0, with 0.8.0 waiting on a registry hold.",
        "achieved": true
      },
      {
        "title": "First external use",
        "body": "Someone outside this project depending on capacity-attest without us demonstrating it first. Three parties now do: a draft ERC-8004 convention that pins this repo by commit hash, an independently rebuilt verifier shipped inside someone else's published package, and a BSV rail adapter built on the same claim format by a separate author.",
        "achieved": true
      },
      {
        "title": "Independent verification by someone else's code",
        "body": "An outside party rebuilt the verifier from scratch, standard library only, with its own secp256k1, EIP-191 and canonical JSON implementation. Seven of seven vectors match, including both negative controls, and it now runs as a permanent regression test inside their own published package.",
        "achieved": true
      },
      {
        "title": "An external agent calling record_delivery itself",
        "body": "Others verify our claims and depend on the format, but we have no evidence yet of an agent from another party writing a delivery claim through the MCP tool in production. Until we see it, this stays open.",
        "achieved": false
      },
      {
        "title": "The format in an official conformance set",
        "body": "The measured block already sits inside one party's own conformance set, which has five signed vectors and two verifiers built around it. On 14 October the author writing the ERC-8004 grounded-feedback vocabulary said those five vectors can go into the shared conformance set as-is, alongside fixtures from two other parties. That is a commitment from the person drafting it, not a published decision, so this stays open until the vectors are actually in the set.",
        "achieved": false
      }
    ],
    "proof": {
      "title": "Independently verified",
      "body": "Independent checks by other people rather than by us: a real payment claim verified by an external project on September 1, 2026, with the same claimId and the same signature recovered to the buyer; a verifier rebuilt from scratch in another language; live delivery claims readable by anyone on three separate chains; and a real giveFeedback call against the ERC-8004 Reputation Registry on Base mainnet. Each one is linked from the repository so it can be checked again.",
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
  "trustRadar": {
    "metaTitle": "Trust Radar | tokenizen",
    "metaDescription": "A free, public list of MCP servers whose owners requested and passed an ownership-verified check. Not a security audit, and never a listing an owner did not ask for.",
    "eyebrow": "Free & public",
    "h1": "Trust Radar",
    "intro": "A public list of MCP servers whose owners requested a check, proved they control the endpoint, and let the signed result be published here.",
    "disclaimer": "This is not a general security audit, and it is never a listing an owner did not ask for. Every entry below is a self-requested, ownership-verified check: the owner proved control of the domain (DNS TXT or a well-known file) before the signed result was published. “Checks passed” means the signed checks ran and none of them failed. It is not a guarantee that the server is safe.",
    "checkedLabel": "Checked",
    "mailSubject": "Trust Radar: request a check",
    "empty": {
      "title": "No confirmed endpoints yet.",
      "body": "Nothing is listed here until an owner requests a check, proves they control the endpoint, and lets the signed result be published. We never list an endpoint whose owner did not ask.",
      "cta": "Be the first, request a free attestation",
    },
    "badges": {
      "checksPassed": "Checks passed",
      "openUnclear": "Open, unclear",
      "selfDeclaredUnsafe": "Self-declared unsafe",
    },
  },
  "noscript": {
    "h1": "Tokenizen: proof of delivery for the AI agent economy",
    "body": "Tokenizen builds open-source infrastructure for the seller side of the AI agent economy: verifiable proof that a seller genuinely holds a right, and that what was delivered matches what was promised.",
    "h2": "Capacity Attest",
    "productBody": "When an AI agent pays another agent via the x402 protocol for capacity (GPU-hours, storage, API credits, bandwidth), the paying agent leaves a cryptographically signed claim after settlement stating whether what was delivered matched what was promised. Other agents can look up that history before doing business with a seller.",
    "link": "View the code on GitHub"
  }
};
