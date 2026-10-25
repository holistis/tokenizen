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
    dek: "The first measurement found 0 of 40. This one was written down before it ran, on contests nobody here had touched. It missed its own bar, and we are publishing it anyway.",
    description:
      "On 8 sealed audit contests our scan in production found 1 of 105 known findings, a new version 4. Our bar was 5 more, so production stays as it is.",
    tags: ["Measurements", "Tools"],
    readMinutes: 4,
    blocks: [
      {
        type: "md",
        text: `Update, 25 October: a newer version of the scan is live and found 8 of 105 on the same contests. See [the note](/notes/scan-version-3-1).

Bug Bounty Intelligence reads the Solidity of a public repository and returns a list of hypotheses to check by hand. We sell it for 5 USDC through x402. It is not an audit.

The first time we measured it, it found none of 40 known findings. We changed it, wrote down a test before running it, and ran that test once on 8 contests that nobody here had run anything on. The version in production found 1 of 105 known findings. The new version found 4. Our own bar was 5 more than production, and it found 3 more. We missed it, so production stays as it is.`,
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
];

export function postPath(slug: string): string {
  return `/notes/${slug}`;
}

export function findPostByPath(path: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => postPath(post.slug) === path);
}
