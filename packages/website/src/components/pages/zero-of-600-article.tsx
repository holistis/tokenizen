import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

const TITLE = "I checked 600 live x402 services. None of them signs a receipt. | tokenizen";
const DESCRIPTION =
  "Six samples of a hundred across a facilitator index of 20,462 live x402 resources, and the offer-receipt extension appeared in none of them. The method, the commands, the limits of the number, and a live endpoint that does sign one.";

const SIGNER = "0x4E1174b774643B6AD9EE966A81ea1e3665D1159a";

function useArticleMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;

    const descriptionTag = document.head.querySelector('meta[name="description"]');
    const prevDescription = descriptionTag?.getAttribute("content") ?? null;
    descriptionTag?.setAttribute("content", DESCRIPTION);

    return () => {
      document.title = prevTitle;
      if (prevDescription !== null) descriptionTag?.setAttribute("content", prevDescription);
    };
  }, []);
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function H2({ children }: { children: string }) {
  return <h2 className="mt-12 font-display text-xl font-semibold tracking-tight md:text-2xl">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-base leading-relaxed text-muted-foreground">{children}</p>;
}

export function ZeroOf600Article() {
  useArticleMeta();

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
          I checked 600 live x402 services. None of them signs a receipt.
        </h1>

        <P>
          Zero. Not a low number, not mostly zero. Six samples of a hundred, spread across an index of 20,462 live
          resources, and the offer-receipt extension appeared in none of them.
        </P>
        <P>I went looking because I had built the other half and wanted to know whether it had anything to attach to.</P>
        <P>
          Here is the shape of the problem. When an agent pays for an API call over x402, two parties end up with an
          opinion about what happened. The seller knows what it served. The buyer knows what arrived. x402 ships an
          official extension for the seller side: a signed receipt, which the extension&rsquo;s own documentation offers
          for audit trails and dispute resolution. I had spent a while on the buyer side, a signed claim of what was
          actually delivered, which names the seller&rsquo;s receipt by the hash of its exact bytes so the two artifacts
          pin each other.
        </P>
        <P>Then it occurred to me that I had never seen one of those receipts in the wild.</P>

        <H2>How I counted</H2>
        <P>
          The x402 bazaar extension means resource servers declare themselves and facilitators catalogue them, so the
          question is answerable without asking anyone.
        </P>
        <Code>{`curl -s "https://facilitator.payai.network/discovery/resources?limit=100&offset=0"`}</Code>
        <P>
          That index reports 20,462 resources. I sampled at offsets 0, 4000, 8000, 12000, 16000 and 20300, a hundred
          each, and grepped the records for the extension&rsquo;s declaration key, which is the string{" "}
          <code className="font-mono text-[13px]">offer-receipt</code>.
        </P>
        <P>Six hundred records. Zero declarations.</P>
        <P>
          For contrast, in the same data the bazaar extension itself appears on every one of the first four hundred and
          on none of the last two hundred, so these records are not uniform and the index is not a single homogeneous
          dump.
        </P>

        <H2>What this does not prove</H2>
        <P>
          Seven of the eight facilitator addresses I tried returned HTML or a handful of bytes instead of JSON on that
          path. They are unmeasured, not zero. The largest index, Coinbase&rsquo;s, is among them.
        </P>
        <P>
          A server could also support the extension without it appearing in this catalogue, since the declaration lives
          in the 402 response and a catalogue is a secondhand record of that. I tried to settle it by requesting a live
          resource directly and got a 402 with an empty body, which told me nothing either way.
        </P>
        <P>
          So: a strong indication, not a proof. I would rather hand you the number with its edges than a rounder one
          without them.
        </P>

        <H2>Why the gap matters more than it sounds</H2>
        <P>
          A signature answers one question: who said this, and when. It does not answer whether what they said is true.
          For a receipt that distinction is the whole thing, because the party signing is the party with an interest in
          the answer. A seller attesting to its own delivery is the interested party. So is a buyer attesting to what it
          received.
        </P>
        <P>
          The usual remedy for a statement that stops being true is for its author to withdraw it. That works, and it is
          used at real scale: across Base, Optimism and Ethereum mainnet there are 733,203 revoked attestations out of
          4,986,045, and on Base three schemas from a single issuer account for 97 percent of them, revoking roughly
          half of everything they issue. Every one of those events is an issuer correcting itself.
        </P>
        <P>
          Which is exactly why it does not help here. Self-correction works when the author has no stake in the
          statement being false. It does nothing when the author is the one who benefits.
        </P>
        <P>
          The only thing that helps is the other party&rsquo;s signature on the same event. Two signed accounts of one
          delivery, from two parties with opposing interests, where a contradiction between them is arithmetic rather
          than opinion. That is what the offer-receipt extension makes possible and what nobody is emitting.
        </P>

        <H2>So I made one</H2>
        <Code>{`curl -i -X POST https://api.tokenizen.nl/api/paid/verify-ownership \\
  -H "Content-Type: application/json" \\
  -d '{"endpoint":"https://mcp.example.com/sse","ownerAddress":"0x1111111111111111111111111111111111111111","method":"dns-txt"}'`}</Code>
        <P>
          That answers 402 with a <code className="font-mono text-[13px]">Payment-Required</code> header. Base64-decode
          it and you get the payment requirements, plus an{" "}
          <code className="font-mono text-[13px]">extensions</code> object carrying{" "}
          <code className="font-mono text-[13px]">offer-receipt</code> with a signed offer inside, EIP-712 format.
        </P>
        <P>
          Note the empty response body. The requirements are in the header, not the body, which is why my earlier probe
          of somebody else&rsquo;s service looked broken when it was working perfectly.
        </P>
        <P>
          You can check the signature without trusting me. Recover it against the domain{" "}
          <code className="font-mono text-[13px]">{`{name: "x402 offer", version: "1", chainId: 1}`}</code> and the
          offer types from the specification, in order: version, resourceUrl, scheme, network, asset, payTo, amount,
          validUntil. It recovers to <code className="font-mono text-[13px]">{SIGNER}</code>.
        </P>
        <P>
          Then check that the address is allowed to speak for the domain, which is a separate question the specification
          is blunt about: a valid signature is not authorization, and anyone can sign a receipt for any resourceUrl.
        </P>
        <Code>{`dig +short TXT _controllers.tokenizen.nl
"v=1;controller=did:pkh:eip155:1:${SIGNER}"`}</Code>
        <P>Same address. That is the loop closed by a stranger with two commands.</P>
        <P>
          It runs on Base Sepolia, which means the money is fake and the cryptography is not. The price is a tenth of a
          cent. What you are buying is the receipt, because the answer itself is free at{" "}
          <code className="font-mono text-[13px]">/api/verify-ownership</code> and always will be.
        </P>

        <H2>Use it as a test fixture</H2>
        <P>
          If you are implementing the client side of offer-receipt, you need something real to test against, and as far
          as I can measure there is nothing. Point your client at that URL. It costs me nothing and you get a live,
          signed, spec-conformant artifact instead of a fixture you wrote yourself and therefore cannot be surprised by.
        </P>
        <P>
          If you find it wrong, tell me and I will fix it. If it stays up and other people start emitting these too, the
          number at the top of this page stops being interesting, which is the point.
        </P>
        <P>
          What I have not done yet: nobody has paid, so no receipt has been issued, only offers. That needs a funded
          Base Sepolia client and it is the next thing.
        </P>
        <P>
          The code is open at{" "}
          <a
            href="https://github.com/holistis/tokenizen"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-4"
          >
            github.com/holistis/tokenizen
          </a>
          .
        </P>
      </div>
    </article>
  );
}
