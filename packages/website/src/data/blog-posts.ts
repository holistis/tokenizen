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

/** One cell of a comparison matrix. The tone is also written out in words for readers who do not see colour. */
export interface MatrixCell {
  text: string;
  tone: "yes" | "partial" | "no";
}

export interface MatrixRow {
  label: string;
  /** Where a stranger can check what the row says. */
  href: string;
  cells: MatrixCell[];
}

export type PostBlock =
  | { type: "md"; text: string }
  | { type: "video"; src: string; poster: string; caption: string; transcript: string[] }
  | { type: "image"; src: string; alt: string; caption?: string; width: number; height: number }
  | { type: "facts"; heading: string; intro: string; items: FactItem[] }
  | { type: "matrix"; heading: string; intro: string; columns: string[]; rows: MatrixRow[]; note: string }
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
    slug: "free-tools-same-contests",
    kind: "note",
    date: "2026-10-25",
    title: "Two free tools found none of the known findings on the same contests",
    dek: "We ran Slither and Aderyn with default settings on the contests where our scan was measured. Neither matched a known High or Medium finding. What that says and what it does not.",
    description:
      "Slither found 0 of 34 and Aderyn 0 of 70 known findings on the same Code4rena contests, judged like our scan. Static tools are not built for contest logic bugs.",
    tags: ["Measurements", "Tools"],
    readMinutes: 2,
    blocks: [
      {
        type: "md",
        text: `We wanted to know how our scan compares with free tools people already use, on the same contests and with the same two judges. We ran Slither 0.11.6 and Aderyn 0.6.8 with default settings and turned each finding into a hypothesis. The plan was written down with a hash before the judges saw anything.

Neither tool matched a known High or Medium finding. Slither found 0 of 34 on the contests where it ran, and Aderyn 0 of 70. On the same contests our scan found 6 of 34 and 10 of 70 in its first 15 hypotheses. On the four newer contests, which our scan was not built on, it was 3 of 15 against 0 of 15 for each tool.

## What this does not say

- Static tools are not built to find the business-logic flaws that audit contests reward. They are free and fast and find other things, such as patterns and missing checks. A finding of theirs can be a valid Low remark that is not on the list of High and Medium findings.
- The tools ran on only part of the contests in our setup. Slither ran on 8 of 15 and Aderyn on 10 of 15, and the reasons for the others are listed. A user with a working project setup would get results on more.
- The older contests may be in the training data of the model behind our scan; the tools do not have that. The judges are language models and this is our own measurement.
- Small numbers. Read it as a description, not a ranking.

## What you can check

The hypotheses as the judges saw them, every judgement, the list of runs that did not work and the plan file are in [the results folder](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-free-tools/README.md), and both tools have a row on the [scoreboard](https://tokenizen.nl/en/scoreboard). The same procedure can be applied to the output of any other tool on the same contests.`,
      },
    ],
  },
  {
    slug: "quick-scan-standard-clients",
    kind: "note",
    date: "2026-10-25",
    title: "A standard x402 client can now buy the scan, and a quick scan costs 1 dollar",
    dek: "The scan endpoint could not be bought by a standard x402 client. That is fixed and checked with two real purchases. The official client also refuses payments above 1 dollar, so there is now a quick scan for exactly that.",
    description:
      "A standard x402 client can now buy our scan, checked with real purchases on Base. The official client caps payments at 1 dollar, hence a quick scan for 1.",
    tags: ["x402", "Tools"],
    readMinutes: 3,
    blocks: [
      {
        type: "md",
        text: `Until today the paid scan endpoint accepted only a transaction hash from a payment you had made by hand. It answered 400 to the signed authorization that a standard x402 client such as @x402/fetch sends, although its own 402 answer said that would work. We found this by testing and fixed it.

## Checked with real purchases

A throwaway address bought the full scan (5 dollars) with @x402/fetch 2.28.0 and got a signed receipt back. The six checks on the receipt pass: the signature, the signer of the live offer, the DNS record that binds the signer to the domain, the transaction on Base, the USDC transfer to our payment address, and the payer. It was a self test with our own money, so it is not a customer.

## The 1 dollar cap

The official x402 client refuses a payment above 1 dollar per request unless its owner raises the limit. The scan costs 5 dollars, so a default agent will refuse it. There is now a quick scan for exactly 1 dollar that returns the 15 hypotheses the model is most confident about; the full scan adds 15 more with lower confidence. A second throwaway address bought the quick scan with the default limit left in place, and the same six checks pass.

## What this does not show

- Two purchases, both by us. Nobody else has used it yet.
- A receipt says that the service saw a payment. It says nothing about how good the report is.
- The hit rates we published (8 of 105 and 5 of 66) are for the first 15 hypotheses, so they are the numbers of the quick scan.

The transactions, the answers, the delivered reports and the scripts are in the [full scan folder](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-v31/standard-client-purchase/README.md) and the [quick scan folder](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-v31/quick-scan-purchase/README.md).`,
      },
    ],
  },
  {
    slug: "scan-newer-contests",
    kind: "note",
    date: "2026-10-25",
    title: "The scan held its rate on nine newer contests",
    dek: "We ran the scan once on nine Code4rena contests from the last year. The first 15 hypotheses held 5 of 66 known findings, the same rate as before. What that says, and a second list in reports.",
    description:
      "Our scan found 5 of 66 known findings in its first 15 hypotheses on nine newer Code4rena contests (7.6 percent), the same rate as on Sherlock.",
    tags: ["Measurements", "Tools"],
    readMinutes: 3,
    blocks: [
      {
        type: "md",
        text: `Earlier today we published a run of the scan on 8 Sherlock contests: 8 of 105 known High and Medium findings. Those contests were no longer secret, so the open question was whether the rate holds on contests the scan was not built on.

We ran the scan once on 9 Code4rena contests from September 2025 to March 2026 and had the same two judges compare the results with the known findings in the public final reports. The rule for reading the result was written before the run: 5 percent or more of the known findings in the first 15 hypotheses means it holds.

The first 15 hypotheses held 5 of the 66 known findings (7.6 percent). The first 30 held 8 (12.1 percent). That is the same rate as on Sherlock, so by our own rule it holds.

## What this does not say

- 58 of the 66 known findings were not in the first 15. This is not a scan that finds what a human audit finds.
- Small numbers and one run per contest. A repeat could land somewhere else.
- Code4rena reports list the findings that were kept after merging duplicates and removing low ones, so the known list is a different kind of list than on Sherlock.
- Contests from early 2026 may be in the training data of a model. We do not know the cut-off dates.
- The Olas contest is bigger than the scan reads, so it read 38 percent of it. The report says so for every scan.
- The judges are language models. This is our own measurement, not an independent one.

## A second list in reports

A report can now show up to 30 hypotheses, in two lists: the 15 the model is most confident about, and 15 more with lower confidence. On the stored lists the second list held 8 known findings that the first list did not, at a slightly lower precision: about 3 in 100 hypotheses matched a known finding in the second list, against about 4 in 100 in the first. We chose this after seeing the numbers, so it is a product choice and not a pre-registered test.

## One thing we tried and dropped

A free language model that reads the code and picks the best 15 from the whole list did not beat the scan's own ordering. On four held-out sets it matched 5, 6, 7 and 4 known findings against 7, 8, 8 and 7 (some calls failed and count as zero, as the plan said, and we stopped the run before the last few finished). We do not use it.

## What you can check

The judgements of both judges, the whole lists, the plan file with its hash and the limits are in [the results folder](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-c4-fresh/README.md), and the row is on the [scoreboard](https://tokenizen.nl/en/scoreboard). How the scan finds things stays private.`,
      },
    ],
  },
  {
    slug: "scan-signs-its-offer",
    kind: "note",
    date: "2026-10-25",
    title: "The scan signs its offer, and we paid it once to see the receipt",
    dek: "The paid scan endpoint now signs its x402 offer, binds the key to its domain in DNS, and returns a signed receipt. We tested it with one real payment of our own.",
    description:
      "The scan endpoint signs its x402 offer and returns a signed receipt. One self test on Base mainnet, with a script that checks every step.",
    tags: ["x402", "Tools"],
    readMinutes: 3,
    blocks: [
      {
        type: "md",
        text: `Our paid scan endpoint now declares the offer-receipt extension of x402: the 402 answer carries a signed offer, and the answer to a paid request carries a signed receipt for the payment transaction.

## Check the offer without paying

\`npx -y agent-receipt-verify https://x402.tokenizen.nl/api/bug-intel\` reaches level 2: it asks for payment the way x402 says, declares the extension, and the signature of the offer verifies. The signer is 0xf30b0706E78b3166745E6a2f351992321088058f, a key that only signs and holds no funds. It is bound to the service domain in DNS, as section 4.5.1 of the extension describes: the TXT record at _controllers.x402.tokenizen.nl lists it as a controller.

## One real payment

We paid the endpoint once with 5.1 USDC on Base mainnet, from our own address to our own payment address. That was a self test, so it is not a customer. The service queued the scan, delivered the report 35 seconds later and returned the receipt in the body and in the PAYMENT-RESPONSE header. A script checks six things: the receipt signature recovers to an address, the live offer is signed by the same address, that address is a controller in DNS, the transaction exists on Base, it is a USDC transfer to our payment address, and the payer in the receipt is the sender. All six pass.

## What it does not show

- It shows that the service saw this payment and signed a receipt for it. It says nothing about how good the report is.
- It is one payment, by us, to ourselves. Nobody else has used the receipt yet.
- The DNS record was set about 15 minutes after that receipt was issued, and DNS keeps no history.
- It is a version 1 receipt. The salted commitment of version 2 waits for the specification.
- The conformance checker still shows level 3 as not measured, because it checks without paying.

The transaction, the answer, the delivered report and the script are in [the evidence folder](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-v31/first-real-payment/README.md).`,
      },
    ],
  },
  {
    slug: "scan-version-3-1",
    kind: "note",
    date: "2026-10-25",
    title: "The scan now finds 8 of 105 on the same contests",
    dek: "A newer version of the scan is live. On the 8 contests of our sealed run it found 8 of 105 known findings, up from 4. What that means and what it does not.",
    description:
      "Version 3.1 of our scan found 8 of 105 known findings on the same 8 contests, against 4 and 1 before. Two changes at once, one run.",
    tags: ["Measurements", "Tools"],
    readMinutes: 2,
    blocks: [
      {
        type: "md",
        text: `On 24 October we published a run of our scan on 8 Sherlock contests nobody here had touched. The scan in production found 1 of 105 known High and Medium findings, a newer version 4. Since the evening of 25 October the newer version, V3.1, is what paid scans run on.

We ran it once on the same 8 contests. It found 8 of 105 (7.6 percent). Precision went from 5.0 to 7.5 percent. A scan takes about 20 to 45 seconds and costs us 0.02 to 0.15 dollar.

## What this does not say

- Two things changed at once, a newer model and a fix of which files count, so we cannot say which one did the work.
- Those contests are no longer secret, and the models may have seen them.
- It is one run, so a repeat could land anywhere from about 6 to 10.
- 97 of the 105 known findings were still not found. This is not a scan that finds what a human audit finds.

Before the run we wrote down, in our own notes, how we would read the result: 8 or more is a clear gain. It landed exactly on that line. Those notes are not public and carry no hash, so this is less verifiable than the sealed run.

## What you can check

The judgements of both judges, the hypotheses and the hashes are in [the results folder](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-v31/README.md), and the row is on the [scoreboard](https://tokenizen.nl/en/scoreboard). How the scan finds things stays private. The next test that no model can have seen is the contests that appear after today, scored when their results are published. The scoreboard has that row waiting.`,
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

It also says nothing about how good the scan is. The scan returns AI-generated hypotheses to review by hand. In a pre-registered test on 8 sealed audit contests the version in production found 1 of 105 known High and Medium findings, and a newer version, not in production, found 4. The results, with the misses, are in the repository.`,
      },
    ],
  },
  {
    slug: "we-measured-our-scan",
    kind: "blog",
    date: "2026-10-24",
    title: "We measured our scan. It found 4 of 105.",
    dek: "The first two measurements found nothing, 0 of 31 and then 0 of 40. This one was written down before it ran, on contests nobody here had touched. It missed its own bar, and we are publishing it anyway.",
    description:
      "On 8 sealed audit contests our scan in production found 1 of 105 known findings, a new version 4. Our bar was 5 more, so production stays as it is.",
    tags: ["Measurements", "Tools"],
    readMinutes: 4,
    blocks: [
      {
        type: "md",
        text: `Correction, 26 October: this note first said that the first measurement found 0 of 40, and that the scan found none of 40 the first time. The first measurement found 0 of 31. The 0 of 40 is version 2, which added 9 findings from three new contests to those 31. The numbers in the result files were right, the note mixed them. See [the errata](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/ERRATA.md).

Update, 25 October: a newer version of the scan is live and found 8 of 105 on the same contests. See [the note](/notes/scan-version-3-1).

Bug Bounty Intelligence reads the Solidity of a public repository and returns a list of hypotheses to check by hand. We sell it for 5 USDC through x402. It is not an audit.

The first two times we measured it, it found none of the known findings, 0 of 31 and then 0 of 40. We changed it, wrote down a test before running it, and ran that test once on 8 contests that nobody here had run anything on. The version in production found 1 of 105 known findings. The new version found 4. Our own bar was 5 more than production, and it found 3 more. We missed it, so production stays as it is.`,
      },
      {
        type: "image",
        src: "/media/we-measured-our-scan-1.webp",
        alt: "A glass and brass envelope closed with a glowing hexagonal wax seal, resting on a balance scale, with thin bars of light and small glowing cubes behind it.",
        caption: "A sealed envelope on a scale: the test was committed with a hash before anyone saw a result. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "facts",
        heading: "The numbers",
        intro: "Each with the place where you can check it.",
        items: [
          {
            value: "4 of 105",
            label: "Known High and Medium findings found by the new version on the sealed set, counted only where two judges of different model families agree.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-24-sealed/README.md",
            hrefLabel: "The results",
          },
          {
            value: "1 of 105",
            label: "The same count for the scan as it runs in production, on the same contests.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-24-sealed/README.md",
            hrefLabel: "The results",
          },
          {
            value: "3 of 5",
            label: "Findings the new version found that production did not, against the 5 our rule required. The rule was written before the run.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-v3-2026-10-24.md",
            hrefLabel: "The pre-registration",
          },
          {
            value: "about a minute",
            label: "46 to 105 seconds and at most 0.064 dollar per scan, against 2.7 to 8.6 minutes for production.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-24-sealed/README.md",
            hrefLabel: "Time and cost per scan",
          },
          {
            value: "de1a23a4",
            label: "The first characters of the SHA-256 of the sealed set, committed before the run. The set is published now, so anyone can recompute it.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/bench/verzegelde-set.json",
            hrefLabel: "The set",
          },
        ],
      },
      {
        type: "md",
        text: `## What the number means

Four of 105 is a small number. The new version missed 101 known findings, including 57 of the 59 easy ones, the ones five or more auditors found, and all 14 in the middle group. It found two of the 32 that only one or two auditors found. Nobody should read this as a scan that finds what a human audit finds.

It is still the first number we can defend. The old scan found 1 of 105 on the same contests, the new one found 4, and the new one needs about a minute instead of several.

## The bar we missed

Before the run we wrote that the new version would replace the running one only if it found at least 5 known findings that the running one does not, at least twice as many as it loses, with precision not more than 2 points lower and at most 1 dollar and 20 minutes per scan. It met every part except the first: 3 instead of 5.

After the run we read the two cases where the judges disagreed. Both look like the known findings to us, with attack paths that are partly off. Counted, the new version would have reached 5. We do not count them, because the number we registered is the one both judges agree on. Our reading is ours and not independent, and it is in the results next to the strict number.

## What happens now

Production stays as it is, as the rule says. We keep working on the next version. It will be measured the same way, on contests that appear after today, and we will publish that number too, whatever it is.

How the scan finds things stays private, because that is the product. How it is measured is all open: the contests, the split, the judges, the rules written first and every output. The files the new version ran were committed by hash before the run, so they could not change afterwards.`,
      },
      {
        type: "image",
        src: "/media/we-measured-our-scan-2.webp",
        alt: "A crystal prism splits one beam of light into colored beams that fall on a stack of translucent pages, with a sealed vault glowing in the background.",
        caption: "A prism over a sealed vault: one measurement is not proof. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "md",
        text: `## How the test was built so that we could not bend it

The known findings come from the final reports of Sherlock contests, one entry per unique valid finding, with the number of wardens who found it as the measure of difficulty. A rule picked the eligible contests, and the hash of a Base block that nobody here could choose split them into a development set and a sealed set. We committed to the sealed set with a hash and did not tune on it.

Two judges of different model families decide whether a hypothesis matches a known finding. A hit counts only when both name the same finding. A person reads every disagreement and the hits. The decision rule was fixed in advance.

## What we do not claim

- That the scan finds vulnerabilities in general. Four of 105 does not show that.
- That these contests are outside the models' training data. They may not be, so absolute numbers can be too high. The comparison between the two versions on the same contests is less affected, and contests that appear after today will give a clean test.
- The judges are language models, and we have a stake in the result. That is why the disagreements are read by a person and every table is published.
- None of this is an audit, an approval or a certification.

## Check it yourself

The split can be recomputed with the script in the repository, the set hash from the published set, and the scores with the open judges and an OpenRouter key. If you find a mistake in how we measure, open an issue. We correct it in public.`,
      },
      {
        type: "cta",
        heading: "Read the results and the rule",
        text: "Everything the test needs is in the repository, including the prediction we wrote before the baseline ran.",
        links: [
          { label: "The open scoreboard", href: "https://tokenizen.nl/en/scoreboard" },
          { label: "The sealed results", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-24-sealed/README.md" },
          { label: "The pre-registration and its addendum", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-v3-2026-10-24.md" },
          { label: "The repository", href: "https://github.com/holistis/bug-bounty-intelligence-mcp" },
        ],
      },
    ],
  },
  {
    slug: "the-ruler-and-the-misses",
    date: "2026-10-26",
    title: "The ruler and the misses",
    dek: "We put our smart contract scan on the public benchmark everyone quotes, published the precision and every miss next to the recall, and left the verdicts open so you can recompute the numbers in a minute.",
    description:
      "Our contract scan on the EVMbench ruler: 29 of 117 found, 2.9 percent precision, 18 audits with nothing. Every verdict is public. What the ruler cannot see.",
    tags: ["benchmark", "evmbench", "measurement", "x402"],
    readMinutes: 7,
    kind: "blog",
    blocks: [
      {
        type: "md",
        text: `Update, 1 November 2026. The sentence below that calls one judge the closest we can get to how the benchmark counts was written before we found that the benchmark's own grader (gpt-5, reasoning effort high) can be called through OpenRouter. A copy of it on 7 audits reproduced Azimuth's count, 25 of 31 against their 26 (the note "The same 40 reports, five different counts" has the details). Our own runs have not been judged again with it. The correction is in ERRATA.md of github.com/holistis/bug-bounty-intelligence-mcp.

Some vendors of AI audit tools quote one number, 67 percent or 97 percent. Most of the public pages we read do not say how many wrong findings came with it, and we found none that lets you recompute the result from its outputs.

Our scan found 29 of the 117 known findings on the public benchmark everyone quotes. Of the 1,537 hypotheses it wrote, 45 matched one, and in 18 of the 40 audits nothing passed both judges. We ran it once, with no tuning for this run, and published all of it: the raw output, the verdict of both judges on every hypothesis, and the script that recomputes the totals. Below: what the ruler cannot see, who else shows what, and how the scan has changed from one version to the next.`,
      },
      {
        type: "image",
        src: "/media/ruler-and-the-misses-1.webp",
        alt: "A long glass ruler with engraved brass ticks on a dark slate workbench, one glowing hexagonal wax seal resting on a single mark, crumpled paper reports piled at its far end.",
        caption: "One ruler, one seal on one mark: the number is whatever it is. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "facts",
        heading: "The numbers",
        intro: "40 audits, 117 known high severity findings, one run each, two judges from different model families. Each number has the place where you can check it.",
        items: [
          {
            value: "29 of 117",
            label: "Known findings the scan found in its first 30 hypotheses, with both judges naming the same finding. The whole list holds the same 29.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-26-evmbench/evmbench-40.json",
            hrefLabel: "evmbench-40.json",
          },
          {
            value: "41 of 117",
            label: "The same list when one judge is enough, which is the closest we can get to how the benchmark counts. 49 of 117 on the whole list.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-10-26-evmbench/judge",
            hrefLabel: "the verdicts",
          },
          {
            value: "2.9 percent",
            label: "Precision, strict: 45 of the 1,537 hypotheses match a known finding, and several can hit the same one. The benchmark does not count this at all.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-26-evmbench/totals.json",
            hrefLabel: "totals.json",
          },
          {
            value: "18 of 40",
            label: "Audits where nothing the scan said was accepted by both judges. Every one of them is in the table, next to the audits where it worked.",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-26-evmbench/README.md",
            hrefLabel: "the README",
          },
        ],
      },
      {
        type: "md",
        text: `## What the ruler cannot see

EVMbench is a good public ruler: real audit contests, a fixed commit for each, a published grader. We read the grader. For every known finding it asks a language model whether the audit report describes it, and it adds up the yes answers. Nothing in it counts a finding that is wrong ([the grader code](https://github.com/openai/frontier-evals/blob/main/project/evmbench/evmbench/nano/grade/detect.py)). The authors of one of the tools measured on it say the same: the benchmark does not evaluate false positives ([their write-up](https://auditagent.nethermind.io/blog/auditagent-on-evmbench-40-repositories-120-vulnerabilities-no-repos-skipped)).

So a report that lists everything can score high. A recall ruler measures recall and was never meant to count wrong findings. One recall number is therefore half a measurement, and the other half is the precision, the misses and the method. We put all of them on the table.`,
      },
      {
        type: "image",
        src: "/media/ruler-and-the-misses-3.webp",
        alt: "A dark industrial control hall with a wall of glass tiles in six rows and seven columns, one whole row glowing steady green, two small silhouettes watching from a gantry.",
        width: 1376,
        height: 768,
      },
      {
        type: "matrix",
        heading: "Who shows what",
        intro: "We read each public page on 26 October 2026. A grey cell means we did not find it there. That is not proof that it does not exist, and if we missed something, tell us and we will correct it in public. These columns are the ones we publish, and a vendor would pick others.",
        columns: ["Price on the page", "Recall number", "Precision", "Outputs you can recompute", "Receipt you can verify", "Agent pays, no account"],
        rows: [
          {
            label: "Us",
            href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-10-26-evmbench",
            cells: [
              { text: "1 and 5 dollars, no account", tone: "yes" },
              { text: "29 of 117 strict, 41 with one judge", tone: "yes" },
              { text: "2.9 percent strict, a floor, because only known findings count", tone: "partial" },
              { text: "Raw hypotheses, both verdicts, a script that recomputes the totals", tone: "yes" },
              { text: "Signed offer and receipt, the signer bound to our domain in DNS", tone: "yes" },
              { text: "USDC on Base through x402", tone: "yes" },
            ],
          },
          {
            label: "Nethermind AuditAgent",
            href: "https://auditagent.nethermind.io/blog/auditagent-on-evmbench-40-repositories-120-vulnerabilities-no-repos-skipped",
            cells: [
              { text: "Not found. A 50 dollar credit offer is linked.", tone: "no" },
              { text: "67 percent, 80 of 120, from their own run", tone: "partial" },
              { text: "Not published", tone: "no" },
              { text: "The benchmark and its grader are public. Their outputs are not linked.", tone: "partial" },
              { text: "Not found", tone: "no" },
              { text: "Not found", tone: "no" },
            ],
          },
          {
            label: "Octane",
            href: "https://octane.security",
            cells: [
              { text: "Not found", tone: "no" },
              { text: "A 97.4 percent true positive rate. No sample size or method on the page we read.", tone: "partial" },
              { text: "Not published", tone: "no" },
              { text: "Four CVEs are claimed by product name. The rate cannot be checked.", tone: "partial" },
              { text: "Not found", tone: "no" },
              { text: "Not found", tone: "no" },
            ],
          },
          {
            label: "Almanax",
            href: "https://almanax.ai",
            cells: [
              { text: "Not found. A 7 day trial is offered.", tone: "no" },
              { text: "None published", tone: "no" },
              { text: "None published", tone: "no" },
              { text: "SOC 2 Type II is claimed on the page. We found no accuracy figure.", tone: "partial" },
              { text: "Not found", tone: "no" },
              { text: "Not found", tone: "no" },
            ],
          },
          {
            label: "Sherlock AI",
            href: "https://sherlock.xyz/post/controlled-benchmark-chatgpt-and-claude-vs-sherlock-ai",
            cells: [
              { text: "Not found", tone: "no" },
              { text: "No recall published", tone: "no" },
              { text: "About 55 percent on one project in their own test: 21 valid out of 38 reported", tone: "partial" },
              { text: "The method is described. The triage sheet is not published.", tone: "partial" },
              { text: "Not found", tone: "no" },
              { text: "Not found", tone: "no" },
            ],
          },
        ],
        note: "Sources are the pages linked in the first column, read on 26 October 2026. Prices, numbers and tests change, and a vendor may show customers more than its public page does. Our recall counts high severity findings on our own basis, so 41 of 117 and a vendor's 67 percent are not comparable.",
      },
      {
        type: "md",
        text: `Count the green cells in the first row. Then check how many of the other four rows you could recompute yourself.

## Put your row in the table

If you build or sell a scanner, run it on this ruler and publish your raw output and your verdicts. Open an issue on [the results repository](https://github.com/holistis/bug-bounty-intelligence-mcp/issues/new) with the link. We add your row to this table as you give it, with your numbers and your name, and we run the same recompute script over your files. A row we cannot check stays grey, and we write what we looked for.`,
      },
      {
        type: "md",
        text: `## Getting better, in public

Scans say they learn. This is our version history, on the same eight Sherlock contests and the same two judges, strict, 105 known findings ([the results](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-v31/README.md)):

- The scan in production until 25 October: 1 of 105.
- The first run of the next version: 4 of 105.
- Version 3.1, live since the evening of 25 October: 8 of 105.

Then the same version on nine fresh Code4rena contests from the last year: 5 of 66 in the first 15 hypotheses and 8 of 66 in the first 30 ([the results](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/results/2026-10-25-c4-fresh/README.md)). On this ruler, High findings only, it is 23 of 117 in the first 15 hypotheses and 29 in the first 30. It is a different count from the steps above and not the next step.

We also tried four ways of ranking the list better. None cleared the bar we had set, so the scan stays at 3.1. Those notes are not published yet. From now on a version replaces the last one only if it beats it on a fresh set under a rule written first. Version 3.1 was promoted on the same eight Sherlock contests, and the fresh Code4rena check came after it went live. The first time we measured the scan it found nothing ([that note](/notes/we-measured-our-scan)). We changed it and wrote it up.

For version 3 the bar was committed to the repository before the run, and you can read the history ([the pre-registration](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-v3-2026-10-24.md)). For 3.1 and for this ruler it was written in our own notes, so for those you have our word for the order.`,
      },
      {
        type: "md",
        text: `## The counting rule has a name

We call our way of counting the Two-Judge Strict Rule. A hypothesis counts only if two judges from different model families name the same known finding, and a valid hypothesis that is missing from the known list counts as wrong. The eight items are in one file ([the rule](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/MEASUREMENT-RULE-two-judge-strict.md)). Anyone can report a result under the name, or say which item they depart from.

The next measurement is fixed before it runs. It uses the first eight Code4rena contests whose final report appears after 1 November 2026, in order of publication, so nobody picks them. Version 3.1 is measured on them, and a candidate version replaces it only if it finds more and is not less precise. We publish the result whatever it is ([the pre-registration](https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-next-run-2026-10-26.md)).

Both files were stamped on Bitcoin with OpenTimestamps before we committed them, and the proof files sit next to them. A stamp stays pending until a Bitcoin block includes it, which usually takes a few hours, so verify the proof again later with the OpenTimestamps tool.`,
      },
      {
        type: "image",
        src: "/media/ruler-and-the-misses-4.webp",
        alt: "A brass and glass orrery of nested rings, each ring a little larger and brighter than the last, a thin spiral of light moving outward across the rings, small glowing cubes resting on them.",
        caption: "Each ring a version, each version measured against the last. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "md",
        text: `## Next to the x402 specification

The scan pays and proves through x402, the open standard that lets software agents pay for an HTTP resource. While we measured, three things happened around the x402 specification that we did not plan. The author of an open pull request for a new section (ruiruii, [the thread](https://github.com/x402-foundation/x402/pull/3776)) closed three points from our review within hours, and the draft links our test vectors as their interim location. It is still a draft and not a decision of the maintainers. On 26 October we reviewed those vectors ourselves, with AI reviewers that had not written them, and found real defects in our own checker: one let a collapsed identity pass, one read a Latin-1 body as windows-1252. We fixed them, released the fix as version 0.2.20 and said so in the same thread. The set now has 72 vectors over twelve clauses. Then a reviewer, NSPG13, pointed out that the section sorted repeated query values, so that ?q=a&q=b and ?q=b&q=a got one identity. We gave those two requests to 18 libraries and frameworks, and none of them treats them as equal ([the measurement](https://github.com/holistis/agent-receipt-verify/tree/main/research/repeated-query-matrix)). The section author took our replacement rule, which keeps the order in which the pairs arrived, and ran an implementation of their own over our 22 known-answer files, eleven inputs with a right and a wrong value each: all of them agree ([the comment](https://github.com/x402-foundation/x402/pull/3958#issuecomment-6424707421)). Our own two implementations, which we wrote, agree as well.

The third: smartflowproai-lang, who builds a community x402 validator and is not part of our team, added our endpoint to their table as an observed row, and added a finality field after we closed the gap they had named in our checking tool. Later they read our DNS record through four resolvers and marked the signer as bound to our domain ([the thread](https://github.com/x402-foundation/x402/issues/3396)). This is one person's tool and not a review by the specification.

You can run the checks yourself, with no account and no key:

\`\`\`
npx -y agent-receipt-verify attempt-identity
npx -y agent-receipt-verify https://x402.tokenizen.nl/api/bug-intel-quick
\`\`\`

The first runs every test vector for that section and prints a verdict for each. The second asks the scan for payment without paying, and checks that the offer is signed. The signer is bound to our domain in DNS, as section 4.5.1 of the offer-and-receipt extension describes.

## Why we publish the misses

On 26 October three people outside our team ran the recompute script from a fresh clone and got the same totals as ours: ruiruii, AgenticFinanceGraph and Tom Smart (smartflowproai-lang) ([issue 41](https://github.com/holistis/bug-bounty-intelligence-mcp/issues/41)). They checked the arithmetic from the verdict files to the table. They did not check whether the judges' verdicts were right, and nobody has checked the 117 against the benchmark's own configs yet.

We publish what lets you check instead of trust: the price on the page, the raw output, both verdicts, the receipt, the DNS record, the script that recomputes the totals, and the misses. If you find an error, send it. We correct it in public.

For engineers who build scanners, facilitators or agents: the ruler is public, the grader is public, and the verdict files here are a template you can copy.`,
      },
      {
        type: "image",
        src: "/media/ruler-and-the-misses-2.webp",
        alt: "An open ledger on an old oak desk beside a window, sheets of clear glass lying over its ruled pages so the figures show through, a brass handstamp and a small brass balance resting on the page, a stack of thread-bound papers behind.",
        caption: "A ledger you can see through, stamped and weighed. Illustration generated with AI.",
        width: 1376,
        height: 768,
      },
      {
        type: "md",
        text: `## What we do not claim

- This is not an audit. The scan missed 88 of the 117 known findings, and in 18 of the 40 audits it found nothing both judges accept.
- The ruler counts only high severity findings. The 29 older audits (2023 and 2024) are public and may be in the training data of the models behind the scan and the judges. The 7 newest audits are the cleanest and the smallest sample: 4 of 14.
- Our counting is not the benchmark's. It asks, per known finding, whether the whole report describes it. We ask, per hypothesis, whether it matches a known finding, with two judges. Our one judge number of 41 of 117 is therefore not comparable to a vendor's 67 percent.
- Precision of 2.9 percent is a floor. A hypothesis that is valid but is not in the known list counts as wrong, and we did not measure how many of those there are.
- Each audit was run once, so we cannot give a spread. Both judges are language models, and their verdicts are published so that you can check them.
- 4 of the 40 audits overlap contests we tuned on earlier. Without them the scan found 27 of 110 in its first 30 hypotheses.
- Public configs of the benchmark list 117 findings and its paper says 120. We used the 117 that can be checked.
- Our rules for this run were written in our notes before the scan. We anchored them on Bitcoin only after the run, so the anchor does not prove the order for this measurement. For the next one the order is provable, because the rule and the pre-registration were stamped before we committed them.
- 3 of the 3,074 judge answers could not be read and count as no match.
- Matrix cells show what we read on public pages on one day, not what a vendor may show its customers.`,
      },
      {
        type: "cta",
        heading: "Break our numbers",
        text: "Recompute the totals, read the misses, run the checks. If you find a mistake, we correct it in public.",
        links: [
          { label: "The results and the script", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-10-26-evmbench" },
          { label: "The next measurement, fixed in advance", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/PREREGISTRATION-next-run-2026-10-26.md" },
          { label: "Put your row in the table", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/issues/new" },
          { label: "The x402 section (open pull request)", href: "https://github.com/x402-foundation/x402/pull/3776" },
          { label: "The checks", href: "https://github.com/holistis/agent-receipt-verify" },
        ],
      },
    ],
  },
  {
    slug: "x402-security-sellers-90-days",
    kind: "note",
    date: "2026-10-27",
    title: "What x402 sellers that mention audits, security or smart contracts received in 90 days",
    dek: "We read the Bazaar index and measured what 343 sellers with audit or security routes received in 90 days. The median seller got 1.85 USDC. Our own numbers are next to it.",
    description:
      "343 x402 sellers that mention audits, security or smart contracts: median 1.85 USDC in 90 days, 3,689 USDC in total, none above 1,000. Ours included.",
    tags: ["Measurements", "x402"],
    readMinutes: 2,
    blocks: [
      {
        type: "md",
        text: `We read 84,794 of the 84,795 resources in the Coinbase Bazaar discovery index on 27 October 2026 and kept the sellers whose first route description mentions smart contracts, audits, vulnerabilities, exploits, honeypots or security scans. That gave 348 payout addresses. We could measure 343 of them; the other five are Solana addresses. For each address we read the payments received in the last 90 days from the public x402scan API.

Together the 343 received at least 3,689 USDC. The median seller received 1.85 USDC. The 90th percentile is 25.4 USDC. Eighty sellers received 10 USDC or more, seven received 100 USDC or more, and none reached 1,000 USDC in the payments we could read. The ten largest hold 39 percent of the total.

The word audit alone pulls in sellers of SEC filing alerts, VAT number checks and accessibility audits, so most of the 343 are not security tools. If we only count sellers whose first route names security, vulnerabilities, smart contracts, exploits, bug bounties, rug pulls or honeypots, that is at least 120 sellers with at least 1,340 USDC in total and a median of 1.48 USDC. The count and the total are lower bounds, because we classified each seller on one route only.

The three largest of the 343 were a website audit (369 USDC from 13 payers), a package vulnerability lookup (256 USDC from 13 payers) and a token honeypot check (at least 178 USDC from 31 payers). Among sellers whose description names a smart contract audit, the largest we found received 58 USDC from 8 payers.

What we cannot know. x402scan only shows payments settled through facilitators it indexes, and we read only the first payment option of each route, so this is mostly a measurement on Base. For 50 sellers the data stops at 1,000 payments, so their totals are lower bounds. A payment can be a test by the seller itself, and linking a payout address to a seller is an estimate.

Our own numbers. Our address is one of the 343 and is included in the totals above. x402scan shows 6.31 USDC received by our service in the same period. Of that, 6.0 USDC came from two test purchases we made ourselves on 25 October (5.00 and 1.00 USDC, with a standard x402 client from a throwaway address we created), 0.15 USDC came from our own test buyer, and 0.16 USDC came from the other 16 payers. We have not attributed those 16 to customers or to scanners.

Method, so you can repeat it: read the index with limit 1000 and a growing offset until it ends, filter on the keywords, group by payout address, then ask x402scan for the transfers to each address over 90 days.

We are Tokenizen (tokenizen.nl) and we sell on x402 ourselves, so we are not neutral here.`,
      },
    ],
  },
  {
    slug: "eight-security-signals-109-repositories",
    kind: "note",
    date: "2026-10-28",
    title: "Eight security signals in 109 public repositories of organisations in ten EU countries",
    dek: "We ran our free check on 109 public repositories with a release. In 16 percent of them a security policy with a contact was visible, and in 4 percent an SBOM. What that says, and what it does not.",
    description:
      "Eight security signals on 109 public repositories with a release: policy with contact 16 percent, SBOM 4, provenance 5. Method, our own checks and limits.",
    tags: ["Measurements", "CRA"],
    readMinutes: 7,
    blocks: [
      {
        type: "md",
        text: `Update, 28 October 2026, evening. After this note was published we changed the check at tokenizen.nl/en/cra-check so that it also reads the pipeline file of Jenkins, GitLab CI, Azure Pipelines, Bitbucket Pipelines, Travis, Drone and CircleCI when it sits at the root of a repository (rule set 2026-10-28.7). The Trivy scan in a Jenkinsfile that this note mentions as a miss is now seen. We ran the measurement again. GitHub's search results had shifted a little, and the counts moved by at most three repositories per signal: a security scan was visible in 16 of 104 repositories, a bill of materials in 5 of 102 and a security policy with a contact in 18 of 106. Where the text below says that only GitHub Actions is read, that is no longer true; the other limits stand. The text below is unchanged and describes the earlier run.

On 28 October 2026 we measured eight security signals on 109 public GitHub repositories, with the same code that runs behind our free check at tokenizen.nl/en/cra-check (rule set 2026-10-28.6). The eight signals are our own selection, made with the EU Cyber Resilience Act in mind: some relate to topics in Annex I part II of the Regulation, others are general good practice. They are not one signal for each legal requirement, and nothing here says whether anyone complies.

The sample rule and our expected shares were written down before the run, in an internal file that is not public, so the date cannot be checked from outside. For ten EU countries (the Netherlands, Germany, France, Belgium, Sweden, Finland, Ireland, Spain, Italy and Denmark) we took the first 20 organisations of the GitHub search for organisations in that country, sorted by number of public repositories. For each organisation we took the most recently pushed repository, among its first ten, that is not a fork, not archived, not a template and has at least one published release. An organisation without such a repository dropped out and was not replaced: 89 of the 200 did. Two more were skipped because their repository was already in the sample from another country list. That left 109 repositories.

The rules of the signals changed between our runs, and the requirement that a security policy names a contact was added after the sample rule was registered. Our expected shares were: security policy with a contact 40 to 65 percent, bill of materials 5 to 15, signed releases or provenance 5 to 20, lockfile 60 to 80, automatic updates 35 to 55, security scan 25 to 45, recent commit 70 to 90, licence 85 to 95. Five of the eight signals came in lower than that.

For each signal we give how many repositories show it, out of the repositories where we could measure it. A signal we could not read completely is "not measured" and is left out of the second number.`,
      },
      {
        type: "facts",
        heading: "What was visible in the public repository",
        intro: "109 repositories, measured on 28 October 2026. Each card links to the rules of that signal in the code.",
        items: [
          { value: "17 of 106", label: "show a security policy that names a contact address or a reporting link (16 percent)", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "4 of 101", label: "show a software bill of materials, as a file or as a step that makes one (4 percent)", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "5 of 101", label: "show signed releases or a provenance attestation (5 percent)", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "56 of 80", label: "show a lockfile such as package-lock.json, Cargo.lock, poetry.lock or go.sum (70 percent). A requirements.txt with exact versions and pinned GitHub Actions are not counted. We did not assess 29 repositories (no package file we recognise, a Maven, Gradle, Go or .NET project without a lockfile, or a file tree we could not read completely), so they are not in the 80", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "36 of 106", label: "show automatic dependency updates, Dependabot or Renovate (34 percent)", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "15 of 104", label: "show a security scan in a GitHub Actions workflow (14 percent)", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "88 of 109", label: "had a commit on the default branch in the last 90 days (81 percent)", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
          { value: "85 of 109", label: "declare a licence, in GitHub's licence field or in a licence file in the root (78 percent). Of the 24 without one, five have a licence file only in a subfolder, such as a font's or a bundled component's", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/src/cra-repo-check.ts", hrefLabel: "The rules in the code" },
        ],
      },
      {
        type: "md",
        text: `## What we do not claim

This is not a sample of companies. Organisations with many public repositories are larger and more active than the long tail, and the list includes universities, communities and projects that are not companies, so the numbers probably say more about the active end than about a small software firm. We use the word organisations for that reason.

"Not visible" means not visible in the public repository and its GitHub releases. A policy can sit on a website, a bill of materials on a build server, a scan in the repository settings. Of the CI systems only GitHub Actions is read, at most 12 workflow files per repository, so a scan that runs in Jenkins, GitLab CI or CircleCI is not seen: one of the cases we checked by hand was a Trivy scan in a Jenkinsfile. The Regulation applies to products with digital elements made available on the market in the course of a commercial activity (Articles 2 and 3(22) and recital 15). Free and open-source software that its manufacturer does not monetise is not treated as a commercial activity, and neither does the mere presence of regular releases make it one (recital 18), which matters here because every repository in this sample has a release. The sole act of hosting a product on an open repository does not make it available on the market (recital 20), so many repositories in this sample are probably outside the duties of manufacturers. Open-source stewards have a lighter regime of their own (recital 19 and Article 24).

Some of our definitions are stricter than GitHub's. The policy signal needs a file that names an email address or a reporting link, so a file without one is not counted even though GitHub shows a policy: in the final run that excluded two repositories. A scanner that is only set up in the configuration file of another tool, without a workflow that runs it, is not counted. A workflow that installs a bill of materials tool is counted, and we cannot see whether it ran. Signed git tags are not checked, and the patterns can count a passing mention of a tool name in a workflow. Files are matched anywhere in the tree, so a lockfile or a bill of materials in a test folder counts. A signal can be called visible from a partial read but not visible only from a complete one, so leaving the repositories we could not measure out of the second number pushes the shares up slightly. The country comes from the free-text location field of an organisation's GitHub profile, so it is approximate. The numbers are a snapshot from one hour: GitHub search results shift, and a repeat gives a slightly different sample. We publish no repository or organisation names.

## How we checked our own tool

We ran the measurement seven times while fixing the tool, and only the last run counts. Checking found several faults of ours. A failed read was once reported as "not visible". A policy that wrote its address as "security AT example.org" was called "no contact". A Docker build that attaches a provenance attestation and a bill of materials to its image was called "not visible" for both. On the other side, a workflow that deleted the CodeQL cache counted as a security scan, a version number like braces@3.0.3 counted as an email address, and addresses in templates counted as contacts. All are fixed in the code on GitHub, and the measurement was repeated.

For every repository where the policy signal was not visible (89) we asked GitHub itself, with its own detection. In the final run it agreed in 87 of the 89 cases. The two differences are policies that name no real contact, which we do not count: a template address on a .local domain, and a file without any address. The licence signal uses GitHub's own licence field, so there is nothing independent to compare it with.

For the signals for a bill of materials, provenance, scans and automatic updates, and for recent commits, we read a seeded random sample of "not visible" findings, five for each of the first four and three for the last (23 cases), in three rounds on the last three runs, with a different method (the whole file tree, every workflow file, other CI systems and the releases). We also looked at every one of the 24 gaps each for the lockfile and the licence, in the whole file tree: all 24 had no lockfile anywhere, and 5 of the 24 licence gaps have a licence file only in a subfolder. The first round found one miss, the Docker case above. The second found none: three cases were flagged, two were false alarms of our own checking script and one was a scanner that is only configured in another tool's file, which we do not count. The third found one miss of coverage, the Jenkinsfile case above, and three flagged cases that were not misses. On the other side we read the line behind each of the 41 "visible" findings of the final run for the policy, bill of materials, provenance and scan signals. All showed what the signal asks for, but two bills of materials and one provenance case only install the tool, and one scan runs npm audit fix.

This is our own checking, not an independent audit. Twenty-three cases per round says little about an error rate, and there may be faults we did not find.

## Repeat it

The sampling script is bench/cra-benchmark.mjs in github.com/holistis/tokenizen, and the three checks above are bench/cra-check-against-github.mjs, bench/cra-hand-check.mjs and bench/cra-visible-check.mjs next to it. They read public GitHub endpoints only, and a rerun gives a slightly different sample. We built the check these numbers come from, so we are not neutral here.`,
      },
      {
        type: "cta",
        heading: "Try it on your own repository",
        text: "Name a public GitHub repository and see which of the eight signals are visible in it. It is free, and reports are not stored.",
        links: [
          { label: "The free check", href: "https://tokenizen.nl/en/cra-check" },
          { label: "The benchmark script", href: "https://github.com/holistis/tokenizen/blob/main/packages/self-check-server/bench/cra-benchmark.mjs" },
        ],
      },
    ],
  },
  {
    slug: "same-reports-different-judges",
    kind: "note",
    date: "2026-11-01",
    title: "The same 40 reports, five different counts",
    dek: "We let two free judges count the findings in Azimuth's published reports. One judge gives 62 or 76 percent, two judges combined give 55 to 84, and their published score under the EVMbench grader is 86. What that does and does not say about any percentage in this field.",
    description:
      "Azimuth's 40 published EVMbench reports under two free judges: 62 to 76 percent each, 55 to 84 combined, against their published 86.",
    tags: ["Measurements"],
    readMinutes: 4,
    blocks: [
      {
        type: "md",
        text: `Update, 1 November 2026, night. After publishing this note we read the benchmark's code. The grader of the EVMbench runner is gpt-5 with reasoning effort high, and it can be called through OpenRouter for about 0.03 dollars per verdict. We ran a copy on the raw reports of 7 audits (31 known findings, 0.93 dollars in all). It finds 25 where their score is 26, and gives the same verdict as their grader on 30 of the 31 findings. On these seven audits judge 1 counts 25 as well. We did not run the copy on the other 33 audits, noya included, where our judges and their score differ most. The folder has the verdicts and the check.

Azimuth ran the detect task of EVMbench on all 40 audits and published the run with every report: 101 of 117 known findings, 86.3 percent ([their repository](https://github.com/testmachine-ai/azimuth-evmbench-101-of-117), run date 14 July 2026 in their README). We use the same ruler for our own scan, and we wanted to know how much of a percentage comes from the reports and how much from the judge. So on 31 October and 1 November 2026 we took their 40 published reports and had two free judge models decide, for each of the 117 known findings, whether the report describes it. The judging prompt is the one of the EVMbench detect grader with a fixed answer form added. The judges are gpt-oss-120b and codestral-latest, at temperature 0.1, and each answered once per finding.

Five counts of the same reports, one of them theirs.`,
      },
      {
        type: "facts",
        heading: "Five counts of the same 40 reports",
        intro: "117 known findings, all of them High severity. Each card links to the folder with every verdict, except the first, which links to their repository.",
        items: [
          { value: "101 of 117", label: "their published score, 86.3 percent", href: "https://github.com/testmachine-ai/azimuth-evmbench-101-of-117", hrefLabel: "Their repository" },
          { value: "89 of 117", label: "found by judge 1, gpt-oss-120b, on its own (76.1 percent)", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-11-01-same-reports-different-judges", hrefLabel: "All verdicts" },
          { value: "73 of 117", label: "found by judge 2, codestral-latest, on its own (62.4 percent)", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-11-01-same-reports-different-judges", hrefLabel: "All verdicts" },
          { value: "64 of 117", label: "named by both judges, which is our strict rule (54.7 percent)", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-11-01-same-reports-different-judges", hrefLabel: "All verdicts" },
          { value: "98 of 117", label: "named by at least one of the two judges (83.8 percent)", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-11-01-same-reports-different-judges", hrefLabel: "All verdicts" },
        ],
      },
      {
        type: "md",
        text: `## What it says

A percentage only means something next to the judge that produced it. One judge gives 76 percent and the other 62, a difference of 14 points. Counting a finding only when both judges agree gives 55 percent, and counting it when either agrees gives 84, a spread of 29 points. The biggest single difference sits in one audit: in 2024-04-noya, a report of 124 KB with 109 sections, judge 1 counts 10 of the 20 known findings where their score is 17. Our own scans are judged with free judges of this kind, so we do not put our numbers next to 86 percent.

## What we do not claim

We do not claim that their score is wrong. Their run used the canonical EVMbench runner and the grader that comes with it. We did not use that grader for the five counts above; the update at the top says what we found when we did. Our two judges are free models, chosen because anyone could repeat their calls at no cost on 31 October 2026, and neither is argued to equal the canonical grader: one is a code model, the other ran with low reasoning effort. We compare counts, not findings, and the same count can hide different findings. Their run logs keep the grader's answer per finding. We looked at the log of one audit (2024-04-noya) and did not compare per finding.

The judges did not read their file as published. We cut each report into sections and showed the judge a rendering of each one: severity and title, the file and function of the first evidence pointer, and the explanation. A control on the raw report file, for the seven audits where judge 1 and their score differ, shows that our rendering moved the counts: judge 1 counts 29 on the raw file where it counted 26, codestral 25 where it counted 24, and both together 19 where they counted 17, mostly in noya (judge 1: 10 became 14). In three of the seven audits judge 1 went down by one. The other 33 audits were not checked that way, so the table may understate or overstate their score under these judges by a few findings. It does not close the gap.

Each judge answered once per finding, and an answer moves with small changes: the same judge changed by one finding in five of the seven control audits when it saw the raw file. An earlier trial with two paid judges on 15 findings sits in the folder and counts nowhere; it gave 13, 13 and 12 of the 15 where the free judges gave 14, 11 and 11 on the same findings. The verdicts are not hand-checked, and some reasoning is hard to square with its answer, for example 2023-07-pooltogether H-02 with codestral, so read them before you rely on a single one. The audits are public contests, so the models behind the reports and the judges may have seen them. This is our own re-judging, not an independent audit, and nobody outside our team has recomputed it yet.

## Repeat it

The folder holds all 234 verdicts and a script, node check.mjs, that recomputes every count with no network and no key. Given a clone of their repository it also compares their scores with their RESULTS.tsv. If a count does not match, that is an error of ours, and we will correct it at the top of this note.`,
      },
      {
        type: "cta",
        heading: "Look at the verdicts",
        text: "Every verdict is a file with the judge's reasoning. Run the checker, or judge the same reports again with a judge of your choice.",
        links: [
          { label: "The folder with all verdicts", href: "https://github.com/holistis/bug-bounty-intelligence-mcp/tree/main/results/2026-11-01-same-reports-different-judges" },
          { label: "Their repository", href: "https://github.com/testmachine-ai/azimuth-evmbench-101-of-117" },
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
