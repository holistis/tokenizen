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
  | { type: "facts"; heading: string; intro: string; items: FactItem[] }
  | { type: "mission" }
  | { type: "cta"; heading: string; text: string; links: Array<{ label: string; href: string }> };

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

It also says nothing about how good the scan is. The scan sends only part of a repository to its analysis step and returns raw hypotheses. The limits, with measured numbers, are at the top of the repository README, and a test on closed audit contests is pre-registered there.`,
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
