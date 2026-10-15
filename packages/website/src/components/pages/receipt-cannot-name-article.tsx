import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { MarkdownLite } from "@/components/markdown-lite";

const TITLE = "A signed receipt that cannot name its own payment | tokenizen";
const DESCRIPTION = "A receipt that verifies, carries an authorized signature, and cannot tell you which payment it is about. What that costs, who caught the error in it, and what changed the same day.";

const BODY = `I paid my own API one tenth of a cent yesterday to find out whether the receipt it hands back is worth anything. It is signed, it verifies, the key is provably mine, and it cannot tell you which payment it is about.

That is not a bug in my code. It took me most of a day to establish that, and the answer turned out to be the interesting part.

## The thing everyone agrees on

When one agent pays another for an API call, two parties end up with an account of what happened, and they are not the same account. The seller knows what it served. The buyer knows what arrived. x402 ships an official extension for the seller's half: a signed receipt, offered in its own documentation for audit trails and dispute resolution.

I had built the buyer's half, a signed claim of what was delivered, which names the seller's receipt by the hash of its exact bytes so the two pin each other. Then I went looking for receipts to pin to.

There are none. Sampling one facilitator's discovery index of 20,462 live x402 resources at six spread offsets of a hundred each, not one declares the extension. Seven of the eight facilitator addresses I tried returned no usable JSON on that path, so they are unmeasured rather than zero, and the largest index is among them. A strong indication, not a proof.

So I made one, and that is where it got interesting.

## Declared, and not true

The route declares \`includeTxHash: true\`, which is the documented way to say the receipt should name the settlement it is about. Here is the response to a real payment, one payload, two values that disagree:

\`\`\`json
{ "success": true,
  "transaction": "0x98f4d101d834572b01c98159e7da650da73cff2a17ed68878e3a0783827069cd",
  "extensions": { "offer-receipt": { "info": { "receipt": { "payload": {
      "payer": "0x87f344b6...", "issuedAt": 1792080801, "transaction": "" }}}}}}
\`\`\`

The settlement result carries the hash. The receipt signed in the same breath does not.

Before going further, a correction to the first version of this post. I originally paired that receipt with settlement \`0xd22cfc2d...ecc749\`. It belongs to \`0x98f4d101...7069cd\`. Both are mine, six minutes apart, same payer, same payee, same amount, and I had run the script twice. babyblueviper1 caught it by checking both hashes on chain and noticing that the receipt's \`issuedAt\` of 16:13:21 sits one second before the second block at 16:13:22, while the first settled at 16:07:00. I have since re-read both receipts and confirmed it: the earlier receipt's \`issuedAt\` is 16:06:58, which is the one that belongs to \`0xd22c\`.

That mistake is the argument, better than I made it. With an empty transaction field, a receipt can only be matched to a settlement by payer, payee, amount and time. Two identical payments six minutes apart were already ambiguous on that basis, and a one-second gap was the only thing that separated them. For a seller with repeat buyers at a fixed price, that is not an edge case, it is Tuesday.

I traced the cause rather than guessed, because a public claim about someone else's code should survive someone else reading it. Called directly, the extension honours the flag exactly as documented: give it a declaration with \`includeTxHash: true\` and a populated result, and the hash lands in the receipt. The failure is upstream of that. The route's declaration is passed through an enrichment step that assigns over the key rather than merging into it, so by the time the receipt is signed, the object being read is the enrichment output and the flag is simply not in it. A declaration that cannot survive to the moment it is read is a declaration that can never take effect.

Filed, with the lines and a reproduction. That part is ordinary open-source maintenance.

## The part that is not ordinary

A receipt with an empty transaction field still verifies. The signature is valid. The key is authorized. Every check you can run on it passes.

And it is almost useless, because it cannot be joined to anything. It asserts that somebody paid for a resource at a time. It cannot tell you which payment, so it cannot be set beside the buyer's account of the same event, so a disagreement between the two parties stays a disagreement rather than becoming arithmetic.

This is the distinction that keeps surfacing wherever people are trying to make agent behaviour checkable, and it is worth naming plainly. A label is something a system asserts about itself. A checkable state is something a third party can recompute from evidence that neither party controls. Signatures are very good at producing the first and do nothing on their own to produce the second.

Here is the uncomfortable version of that. Across Base, Optimism and Ethereum mainnet there are 733,203 revoked attestations out of 4,986,045. On Base, three schemas from a single issuer account for 97 percent of them, revoking roughly half of everything they issue. Every one of those events is an issuer withdrawing its own statement, because withdrawal is the only operation a registry offers. The counterparty has no move at all.

Self-correction works beautifully when the author has no stake in the statement being false. It does nothing when the author is the interested party, which is exactly the agent-delivery case: a seller attesting to its own performance, a buyer attesting to its own entitlement.

## What actually closes it

Two signed accounts of one event, from parties whose interests point in opposite directions, tied together tightly enough that a contradiction between them is computable rather than interpretive.

Tightly enough is doing real work in that sentence. It is why the empty transaction field matters more than it looks. The tie has to be to something neither side can quietly restate: a settlement on a public ledger, a digest over bytes that were actually transmitted, an identifier that survives a change of wire format. Get the tie wrong and you have two signed documents that are each perfectly valid and cannot be placed beside each other.

What this does not do, and I would rather say it than have it assumed: detecting a contradiction is not the same as making a dishonest statement expensive. Nothing here imposes a cost on being wrong. Staking, a dispute process and verifiable execution are the mechanisms that would, and I have none of them. What the measurement buys is the argument for building the cheapest one, grounded in a need that is exercised 733,203 times with the right to act on it held by exactly one side.

## Try it rather than believe it

The route is live on Base Sepolia, so the money is fake and the cryptography is not:

\`\`\`bash
curl -i -X POST https://api.tokenizen.nl/api/paid/verify-ownership \\
  -H "Content-Type: application/json" \\
  -d '{"endpoint":"https://api.tokenizen.nl/sse","ownerAddress":"0x1111111111111111111111111111111111111111","method":"dns-txt"}'
\`\`\`

It answers 402 with the requirements in the \`Payment-Required\` header, not the body, which is worth knowing before you conclude somebody's service is broken. Base64-decode it and you get a signed offer. Recover the signature against the domain \`{name: "x402 offer", version: "1", chainId: 1}\` and the offer types from the specification, in order: version, resourceUrl, scheme, network, asset, payTo, amount, validUntil.

Then check that the recovered key is allowed to speak for the host, which the specification is blunt about being a separate question: a valid signature is not authorization, and anyone can sign a receipt for any resourceUrl.

\`\`\`bash
dig +short TXT _controllers.tokenizen.nl
"v=1;controller=did:pkh:eip155:1:0x4E1174b774643B6AD9EE966A81ea1e3665D1159a"
\`\`\`

Same key. Two commands, no trust in me required.

If you are implementing the client side of this extension, point your client at that route. You get a live signed artifact instead of a fixture you wrote yourself and therefore cannot be surprised by. It costs me nothing, and if it is wrong I would rather hear it from you than publish it twice.

## What happened within hours of posting this

Two people checked it rather than agreed with it, and both produced something I did not have.

The first re-read both of my transaction hashes on chain and found that I had paired the receipt with the wrong one. Two payments, six minutes apart, same payer, same payee, same amount, because I had run the client twice. A one-second gap in \`issuedAt\` was the only thing that distinguished them. That is the ambiguity the empty field creates, demonstrated on me, and it is a sharper statement of the problem than the one I wrote. He also proposed binding the receipt to the EIP-3009 authorization nonce, which the seller holds before settlement runs, so it resolves one stage earlier than the missing hash and does not wait on the bug being fixed.

The second went and checked his own reference verifier against this case before replying, found that a receipt with an empty \`transaction\` and every other check green would have passed it too, and closed that gap the same day: a \`transaction_present\` hard-fail, a new conformance vector that is an existing passing vector with the field emptied, and a new invariant in his spec text. He also ran a probe showing all four of his vectors land red, because a check that cannot be made to fire is indistinguishable from a comment.

The consequence for me is worth stating plainly: a verifier with that invariant now correctly rejects every receipt my live route issues, because the field is empty in all of them. That is the right outcome. It also means that until the declaration bug is fixed, a seller using this extension cannot produce an artifact that satisfies the invariant at all, however the route is declared. The gap is not between two implementations. It is one layer below both.

None of that came from publishing. It came from putting a number and a reproduction somewhere the people who care about the number already were, and being wrong in public in a way that could be checked.

One honest note on what the payment proved. Buyer and seller were both me. It demonstrates the chain runs end to end. It is not evidence that anyone uses it, and the first external caller will be a bigger milestone than anything in this post.

Code and the measurement scripts are open: github.com/holistis/tokenizen`;

export function ReceiptCannotNameArticle() {
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
          A signed receipt that cannot name its own payment
        </h1>
        <MarkdownLite source={BODY} />
      </div>
    </article>
  );
}
