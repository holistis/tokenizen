// blog-posts.ts — the posts of the blog, as data.
//
// The older notes are one component each, with the text inside it. That works
// for five pieces and gets expensive after that: every new post would mean a new
// component, a new route line and a hand-written page shell. A post here is one
// entry in BLOG_POSTS. The route, the index card, the page shell and the tests
// that guard the links all come from the entry.
//
// To add a post: append an entry, add its URL to public/sitemap.xml and a line to
// public/llms.txt (blog-posts.test.ts fails until both exist), run the tests.
//
// House rules for the text, enforced by the tests: no long dashes, no markdown
// emphasis stars, and every link is https. The copy is English because it is
// written for engineers who build against specifications that are in English.

export interface FactItem {
  /** The number or short phrase that carries the fact. Kept short on purpose. */
  value: string;
  /** One sentence that says exactly what the value counts, and no more. */
  label: string;
  /** Where a stranger can check it. */
  href: string;
  hrefLabel: string;
}

export type PostBlock =
  | { type: "md"; text: string }
  | { type: "video"; src: string; poster: string; caption: string; transcript: string[] }
  | { type: "image"; src: string; alt: string; caption: string; width: number; height: number }
  | { type: "facts"; heading: string; intro: string; items: FactItem[] }
  | { type: "mission" }
  | { type: "cta"; heading: string; text: string; links: Array<{ label: string; href: string }> };

/**
 * A blog is a decision, not a default. Only a piece the owner has called a blog gets kind "blog"; everything
 * else is a note, and the default for new work is "note". Changing a post to "blog" is done when the owner
 * says "make this a blog", never on our own initiative.
 */
export type PostKind = "blog" | "note";

export interface BlogPost {
  /** The part after /notes/ . Lowercase words and dashes. */
  slug: string;
  /** ISO date. The index sorts on it. */
  date: string;
  title: string;
  /** One or two sentences under the title and on the index card. */
  dek: string;
  /** For the search result and the share card. Under 160 characters. */
  description: string;
  tags: string[];
  readMinutes: number;
  /** Shown first on the index, whatever its date. For the post a newcomer should read first. */
  pinned?: boolean;
  /** Which index lists it: /blog for "blog", /notes for "note". */
  kind: PostKind;
  blocks: PostBlock[];
}

export const MISSION = {
  eyebrow: "Our mission",
  headline: "Every payment between AI agents should be something anyone can check.",
  text: "We build the checks in the open, with the engineers who use them. A check that only we can run proves nothing to anyone else.",
  promises: [
    { name: "Open", text: "Every tool is open source and free to run." },
    { name: "Checkable", text: "Every claim on this site links to the command or the transaction behind it." },
    { name: "Honest", text: "We publish the limits first, and we correct ourselves in public." },
  ],
} as const;

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "check-pay-prove",
    date: "2026-10-23",
    title: "Check. Pay. Prove.",
    dek: "One real AI-agent payment on Base mainnet, start to finish. Every step is open to check, and every tool is free to run on your own machine.",
    description:
      "One real AI-agent payment on Base mainnet: check the tool, pay through x402, prove it from the chain. Open tools, real transactions, the commands to repeat it.",
    tags: ["Tools", "Measurements"],
    readMinutes: 4,
    pinned: true,
    kind: "blog",
    blocks: [
      {
        type: "md",
        text: `AI agents are starting to spend money. They call tools, pay for answers and rate what they got. Almost nothing checks any of it. A tool can describe itself however it likes, a seller can say it delivered, and a rating can point at nothing.

We built the checks. Then we ran them on one real deal: look at the tool, pay, and prove the payment afterwards. The video is the whole run. Below it is every command and every transaction, so you can repeat it and disagree with us on the facts.`,
      },
      {
        type: "video",
        src: "/media/check-pay-prove.mp4",
        poster: "/media/check-pay-prove-poster.jpg",
        caption: "One real deal, start to finish. 30 seconds, real transactions on Base mainnet.",
        transcript: [
          "One real deal, start to finish.",
          "First, check. Before your agent uses a tool, our free scanner shows what it can do.",
          "And whether it states its own limits.",
          "Then pay. The buyer sends five cents in USDC to the seller, through x402, on Base.",
          "Then prove. The buyer writes the rating itself, with the payment as its reference. Anyone can check it.",
          "Grounded. This was our own test, and you can verify every step yourself.",
        ],
      },
      {
        type: "md",
        text: `## 1. Check, before the agent pays

\`muraqib-agent-watch\` starts an MCP server, reads the tools it lists and flags every tool that touches money, files or credentials without stating a safeguard. In the run it looked at our own capacity-attest server and found three tools, each stating its own safeguard. That is a first look at what a tool says about itself. It does not prove the safeguard holds, and it starts the server you point it at, so run it on your own machine.

\`\`\`
npx muraqib-agent-watch npx -y capacity-attest
\`\`\`

## 2. Pay, with a real transaction

A buyer agent sent 0.05 USDC to a seller through x402 on Base mainnet: [transaction 0x7160db5e...e7eb](https://basescan.org/tx/0x7160db5eceb012012d75ef0331f14ca164050c246f879b94e3dbff235e91e7eb), block 52,989,993. The seller is registered as ERC-8004 agent 1085288 from the address that got paid, so the payment address and the agent are the same party. The whole deal cost about three cents in gas.

## 3. Prove it from the chain

Three blocks later the buyer wrote its own rating of the seller into the ERC-8004 reputation registry: [transaction 0xa661b2ff...3936](https://basescan.org/tx/0xa661b2ffd344926ddd5e31dc0c481212ba2d973fdb0c08a461d4c903f15d3936), block 52,989,996. The rating carries the payment's transaction hash as its reference. The same hash sits in two places, so the rating is tied to a payment that really happened.

Eight checks read it back from the chain. The video shows four: the rater is the payer, the paid address is the agent's bound wallet, the rater is not the agent's owner, and the payment came before the rating. All eight passed. We wrote those checks ourselves, so we also asked someone else to look. [AgenticFinanceGraph re-checked the run through a public node](https://github.com/erc-8004/erc-8004-contracts/issues/99#issuecomment-6372783904), Base's public endpoint, which they do not run, and confirmed the four facts listed above.`,
      },
      {
        type: "facts",
        heading: "What we have shipped so far",
        intro: "Six numbers, each one with the place where you can check it.",
        items: [
          {
            value: "33 to 20 to 4",
            label:
              "Secrets still leaking in 68 test cases of an open-source AI coding tool with more than 10,000 stars: before, after the maintainers' own fixes, and with our fix (pull request open).",
            href: "https://github.com/tigerless-labs/autoharness/pull/278",
            hrefLabel: "Our pull request",
          },
          {
            value: "0 of 600",
            label:
              "Live x402 services that signed a receipt in our sample of an index of 20,462 resources, when we measured on 15 October.",
            href: "/notes/zero-of-600-x402-services-sign-a-receipt",
            hrefLabel: "The measurement",
          },
          {
            value: "8 of 8",
            label: "Checks passed on a real payment on Base mainnet. A third party re-checked four of them through Base's public endpoint.",
            href: "https://github.com/erc-8004/erc-8004-contracts/issues/99#issuecomment-6372783904",
            hrefLabel: "The re-check",
          },
          {
            value: "A, 4.2 of 5",
            label: "Glama's rating for how well agent-receipt-verify describes its tools to an AI agent.",
            href: "https://glama.ai/mcp/servers/holistis/agent-receipt-verify",
            hrefLabel: "The listing",
          },
          {
            value: "3 tools",
            label: "Open source and on npm: muraqib-agent-watch, agent-receipt-verify and capacity-attest.",
            href: "https://github.com/holistis",
            hrefLabel: "The repositories",
          },
          {
            value: "#3830",
            label:
              "Our pull request on the x402 offer-and-receipt extension is named in the draft x402 specification text (draft pull request 3776, still open).",
            href: "https://github.com/x402-foundation/x402/pull/3776",
            hrefLabel: "The draft",
          },
        ],
      },
      {
        type: "md",
        text: `## What we do not claim

- Buyer and seller in this run were both ours. It tests the mechanism. It is not evidence of adoption.
- There is no paying customer yet. This is the first public run, and we are looking for the first engineers who repeat it on their own servers and endpoints.
- \`muraqib-agent-watch\` reads what a tool says about itself. It does not prove the safeguard holds.
- Passing checks say the shape of a payment and its receipt is right. They do not say the seller is honest.
- None of this is an audit, an approval or a certification.

## Run it yourself

No account and no API key. Each command is the tool as published on npm.

\`\`\`
npx muraqib-agent-watch <command that starts your MCP server>
npx -y agent-receipt-verify <URL of an x402 endpoint>
npx -y agent-receipt-verify attempt-identity
\`\`\`

The first looks at your tools before an agent trusts them. The second checks an x402 endpoint before an agent pays it. The third runs 19 test vectors for the x402 attempt-identity rule. If one of them says something wrong about your server or your endpoint, open an issue. We fix it in public, and we say so.

## Why we are doing this

Money is starting to move between machines. The people who build those machines should not have to take anyone's word for it, ours included.`,
      },
      { type: "mission" },
      {
        type: "cta",
        heading: "Try it on your own server",
        text: "The fastest way to help is to point a tool at your own server or endpoint and tell us what it got wrong.",
        links: [
          { label: "muraqib-agent-watch", href: "https://github.com/holistis/muraqib-agent-watch" },
          { label: "agent-receipt-verify", href: "https://github.com/holistis/agent-receipt-verify" },
          { label: "capacity-attest", href: "https://github.com/holistis/tokenizen/tree/main/packages/capacity-attest" },
          { label: "Open an issue", href: "https://github.com/holistis/agent-receipt-verify/issues" },
        ],
      },
    ],
  },
  {
    slug: "official-sources",
    kind: "note",
    date: "2026-10-24",
    title: "Official sources and payment addresses",
    dek: "Where our paid service lives and where its payments go, so a buyer or an agent can check an address before paying.",
    description:
      "The official repository, endpoint and payment address of Bug Bounty Intelligence, and the one command that lets you check them yourself.",
    tags: ["Official"],
    readMinutes: 1,
    blocks: [
      {
        type: "md",
        text: `Earlier this month a third party listed our project with a different payment address. The listing request was withdrawn after we pointed it out. This page exists so that nobody has to take our word, or anyone else's, for where the money goes.

## Bug Bounty Intelligence

- Repository: [holistis/bug-bounty-intelligence-mcp](https://github.com/holistis/bug-bounty-intelligence-mcp)
- Payment request: \`https://x402.tokenizen.nl/api/bug-intel\`
- Price: 5 USDC per scan, on Base (eip155:8453), through x402
- Payment address: \`0x015Eb036560216B3051339061FF68A207E0fe88f\`

## Check it yourself

The endpoint states its own payment address. This prints it, and you compare it with the line above and with the README of the repository:

\`\`\`
npx -y agent-receipt-verify https://x402.tokenizen.nl/api/bug-intel
\`\`\`

If a listing, a reply or a website gives another address for Bug Bounty Intelligence, it is not ours. Do not pay it.

## What this list is not

It covers only the service named above. It does not vouch for any other address, and it changes only through a pull request in the open repository, so its history is public.

It also says nothing about how good the scan is. The scan reads the files most likely to move funds first, in at most six parts, and returns AI-generated hypotheses to review by hand. In a pre-registered test on seven closed audit contests it found none of the 40 known High and Medium findings, with 29 percent of the in-scope code read. The results, with the misses, are in the repository README.`,
      },
    ],
  },
  {
    slug: "we-measured-our-scan",
    kind: "note",
    date: "2026-10-24",
    title: "We measured our scan. It found 0 of 40.",
    dek: "What we measured on closed audit contests, what we changed, and how the next test is sealed so that we cannot bend it.",
    description:
      "Our smart contract scan found none of 40 known findings. What we measured, what we changed, and a sealed, pre-registered test that we cannot bend.",
    tags: ["Measurements", "Tools"],
    readMinutes: 4,
    blocks: [
      {
        type: "md",
        text: `Bug Bounty Intelligence reads the Solidity of a public repository and returns a list of hypotheses to check by hand. We sell it for 5 USDC through x402. It is not an audit. Until this week we had not measured how often it finds what auditors find, and parts of our own description were stronger than the code behind them. We corrected the description, then measured.

The result is below, with the misses, and so is the test that comes next. We wrote that test down before running it.`,
      },
      {
        type: "image",
        src: "/media/we-measured-our-scan-1.webp",
        alt: "A glass and brass envelope closed with a glowing hexagonal wax seal, resting on a balance scale, with thin bars of light and small glowing cubes behind it.",
        caption: "A sealed envelope on a scale: the test is committed with a hash before anyone sees a result. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "facts",
        heading: "The numbers",
        intro: "Five numbers, each with the place where you can check it.",
        items: [
          {
            value: "0 of 40",
            label:
              "Known High and Medium findings found by version 2 of the scan: 0 of 31 on four contests it was tuned on and 0 of 9 on three new ones, with 29 percent of the in-scope code read.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/RESULTS-v2-2026-10-24.md",
            hrefLabel: "The results page",
          },
          {
            value: "15 of 40",
            label: "Known findings that sat in a file the scan did read. None of those was found either. The other 25 sat in files it never read.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/RESULTS-v2-2026-10-24.md",
            hrefLabel: "The tables",
          },
          {
            value: "14 contests",
            label:
              "Eligible Sherlock contests of 2025, chosen by a rule. Six are for development and eight are sealed, split with the hash of Base block 53022890 as the seed.",
            href: "https://basescan.org/block/53022890",
            hrefLabel: "The seed block",
          },
          {
            value: "de1a23a4",
            label:
              "The first characters of the SHA-256 of the sealed set: 8 contests and 105 known findings. The names stay private until the sealed run.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-v3-2026-10-24.md",
            hrefLabel: "The pre-registration",
          },
          {
            value: "23 of 23",
            label:
              "How often each of two judges matched a known finding to itself, and matched a finding of another contest to nothing, before they were allowed to measure anything.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/bench/kalibratie.json",
            hrefLabel: "The check of the judges",
          },
        ],
      },
      {
        type: "md",
        text: `## What the first measurement showed

Version 2 read 29 percent of the in-scope code and found none of the known findings. Most of the misses were in files it never reached, because it reads at most six parts. On the 15 findings whose file it did read, it found none either. When the answer was empty, our own rule asked a weaker model for a second attempt, and that produced a list that looked like a checklist. We have written all of this on the results page, together with the failures of the model sources behind the scan.

We also found a mistake in our own measurement after we published it. The copy we measured did not have the folder with historical patterns that production uses, so the measured prompts lacked that block. The results page now carries a correction above its tables.

## What we changed before measuring again

- Git submodules are fetched when they point to github.com, and dependencies, tests, mocks, scripts and interfaces are left out.
- Every report states how much of the code was read, and a scan with no hypotheses is delivered as that, not as a normal report.
- A free precheck says before payment whether the scan counts any Solidity in the repository.
- Every report carries a SHA-256 fingerprint, so a buyer can see that it was not changed afterwards.
- A file that is a link to something else on the server is never read. We found that the first version followed such links.

`,
      },
      {
        type: "image",
        src: "/media/we-measured-our-scan-2.webp",
        alt: "A crystal prism splits one beam of light into eight colored beams that fall on a stack of translucent pages, with a sealed vault glowing in the background.",
        caption: "One beam, eight lenses: the idea we test for the next version, reading all of the code through different lenses. It is not proven yet. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "md",
        text: `## How the next test is built so that we cannot bend it

The known findings come from the final reports of Sherlock contests, one entry per unique valid finding, with the number of wardens who found it as the measure of difficulty. A rule picks the eligible contests, and the hash of a Base block that nobody here could choose splits them into a development set and a sealed set. We commit to the sealed set with a hash and do not tune on it.

Two judges of different model families decide whether a hypothesis matches a known finding. A hit counts only when both name the same finding. A person reads every disagreement. The decision rule is fixed in advance: a new version replaces the running one only if it finds clearly more than the running one on the sealed set, at a cost and speed we also fixed. If it does not, we say so and the running version stays.

## What we do not claim

- That the scan finds vulnerabilities. It has not been shown to.
- That these contests are outside the models' training data. They may not be, so absolute numbers can be too high. Comparisons between versions on the same contests are paired, and contests that appear after today will give a clean test.
- The judges are language models, and we have a stake in the result. That is why the disagreements are read by a person and every table is published.
- None of this is an audit, an approval or a certification.

## Check it yourself

The split can be recomputed with the script in the repository, and the tests of the judges run with node. If you find a mistake in how we measure, open an issue. We correct it in public.`,
      },
      {
        type: "cta",
        heading: "Read the pre-registration and the results",
        text: "Everything the test needs is in the repository, including the prediction we wrote before the baseline ran.",
        links: [
          { label: "Pre-registration of the new test", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-v3-2026-10-24.md" },
          { label: "Results of version 2", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/RESULTS-v2-2026-10-24.md" },
          { label: "The repository", href: "https://github.com/holistis/bug-bounty-intelligence-mcp" },
        ],
      },
    ],
  },
];

export function postPath(slug: string): string {
  return `/notes/${slug}`;
}

export function findPostByPath(path: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => postPath(post.slug) === path);
}
