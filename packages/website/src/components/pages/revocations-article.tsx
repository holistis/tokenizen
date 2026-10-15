import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { MarkdownLite } from "@/components/markdown-lite";

const TITLE = "733,203 attestations were taken back | tokenizen";
const DESCRIPTION = "Every revocation in the three largest EAS indexers is an issuer withdrawing its own statement. What that measures, and what it cannot fix.";

const BODY = `I went counting because someone told me, politely and correctly, that a signature does not make a statement true. I had no good answer, so I went looking for what the ecosystem does when a signed statement stops holding.

The numbers, taken against the three EAS indexers rather than estimated:

- Base: 678,895 revoked of 3,651,900 attestations
- Optimism: 54,213 of 1,319,189
- Ethereum mainnet: 95 of 14,956

That is 733,203 of 4,986,045, so a headline near 15 percent. The headline is the least useful part.

On Base, three schemas carry 97 percent of all revocations, and all three belong to one issuer: \`verifiedAccount\` (723,600 issued, 409,490 revoked), \`verifiedCountry\` (307,123 issued, 144,207 revoked), \`verifiedCoinbaseOne\` (189,434 issued, 103,295 revoked). An exchange revoking roughly half of its own verifications, continuously.

Anyone can reproduce it:

\`\`\`
curl -s https://base.easscan.org/graphql -H "Content-Type: application/json" \\
  -d '{"query":"{ aggregateAttestation(where: {revoked: {equals: true}}) { _count { id } } }"}'
\`\`\`

and \`groupByAttestation(by: [schemaId], where: {revoked: {equals: true}})\` for the breakdown. One warning if you repeat it: during my run the Base endpoint returned a maintenance page with a 200 status for a valid query. That reads as a zero unless you look at the body.

What I expected to find, and did not

I expected to find disputes. A registry full of signed statements, some of them wrong, and a trail of parties contesting each other.

There are no disputes, because there is no such operation. A revocation is the issuer withdrawing its own statement. All 733,203 of them. The counterparty has no move at all.

That reframes the whole picture. The need to revise a signed record is not theoretical and not rare: it is ordinary operational work at a scale of hundreds of thousands. And the only tool available is self-correction.

Where self-correction works, and where it does nothing

Self-correction works beautifully when the author has no stake in the statement being false. An exchange that no longer verifies a user has no reason to keep claiming it does. Revoking is just bookkeeping, and the numbers above are mostly that: a large, honest system keeping its own records current.

It does nothing when the author is the interested party.

Think about what an agent-to-agent payment produces. A seller attests that it delivered. A buyer attests to what it received. Both are describing their own performance, or their own entitlement, in a record that may later decide who was right. Asking either of them to revoke their own convenient statement is not a mechanism. It is a hope.

So the gap is not that signatures are weak. The gap is that a registry gives exactly one party the right to revise the record, and it hands that right to the author rather than to whoever was on the other side of the event.

What the other half looks like

Two signed accounts of one event, from parties whose interests point in opposite directions, with the two artifacts tied together so a contradiction is computable.

Concretely, in the format I work on: the buyer's claim includes the hash of the seller's signed receipt, taken over the receipt's exact transmitted bytes. So the claim cannot be about some other delivery, and it cannot quietly drift from the seller's version. If the buyer says one thing and the receipt says another, a verifier recomputes the digest, compares the fields both sides describe, and gets a disagreement out of arithmetic rather than out of a reading.

That is deliberately narrow. It does not decide who is right. Deciding is governance, and nobody should take that from a library. What it removes is the state where two parties quietly hold incompatible records and nothing in the system notices.

The honest limit, which matters here

Detecting a contradiction is not the same as making a dishonest statement expensive. Nothing I have built imposes a cost on being wrong. The three mechanisms that would are staking, a dispute process, and verifiable execution, and I have none of them.

What the counting bought me is the argument for building the cheapest one. Not an opinion that the gap exists, but the measurement: a need exercised 733,203 times, with the right to act on it held by exactly one side.

And one more number, from the other direction. Sampling one facilitator’s discovery index of 20,462 live x402 resources at six spread offsets of a hundred each, not one declared the extension that emits the counterparty receipt. Seven of the eight facilitator endpoints I tried returned no usable JSON on that path, so they are unmeasured rather than zero, and the largest index is among them. A strong indication, not a proof.

I have since stood one up myself, so the count is no longer zero, and I would rather say that than let a number I published keep implying something it stopped meaning. It is still a count of one, and both sides of it are me.

That is a strange and good place to be, because it means the hard part is not invention.

Code and the measurement scripts: github.com/holistis/tokenizen`;

export function RevocationsArticle() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const tag = document.head.querySelector('meta[name="description"]');
    const prev = tag?.getAttribute("content") ?? null;
    tag?.setAttribute("content", DESCRIPTION);
    return () => {
      document.title = prevTitle;
      if (prev !== null) tag?.setAttribute("content", prev);
    };
  }, []);

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href="/notes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Notes
        </a>
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <time dateTime="2026-10-15">2026-10-15</time>
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          733,203 attestations were taken back
        </h1>
        <MarkdownLite source={BODY} />
      </div>
    </article>
  );
}
