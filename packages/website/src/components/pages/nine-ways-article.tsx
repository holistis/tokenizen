import { useEffect } from "react";
import { ArrowLeft, Mail } from "lucide-react";

const TITLE = "Nine ways to fake a delivery claim, and why none of them fully worked | tokenizen";
const DESCRIPTION =
  "capacity-attest lets a buyer sign a factual claim after an x402 payment. The obvious hole: what stops the buyer from lying? Nine independent designs, each built and broken against the real code.";
const CONTACT_EMAIL = "info@tokenizen.nl";

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

const ROUNDS = [
  {
    label: "Round one, four attempts",
    items: [
      "Active on-chain settlement verification.",
      "Sybil detection by tracing where the money came from.",
      "An external economic bond tied to a dispute reference.",
      "Corroboration between multiple buyers, modeled on isnad criticism in hadith science: a chain is only as strong as each link, verified independently.",
    ],
  },
  {
    label: "Round two, five more attempts",
    items: [
      "Proof of unique humanity (World ID, Gitcoin Passport, BrightID).",
      "A mandatory, non-optional computation cost per claim.",
      "Time as a cost that cannot be bought: a claim only counts after a waiting period on a clock nobody can fake.",
      "Real legal identity and liability through an external dispute protocol.",
      "A third party staking real capital against a specific claim, optimistic-oracle style.",
    ],
  },
];

export function NineWaysArticle() {
  useArticleMeta();

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href="/en"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          tokenizen.nl
        </a>

        <p className="mt-8 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">
          capacity-attest field notes
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Nine ways to fake a delivery claim, and why none of them fully worked
        </h1>

        <div className="mt-8 space-y-5 text-base leading-relaxed text-foreground/90">
          <p>
            capacity-attest lets a paying agent leave a signed, factual claim after an x402 payment: delivered yes,
            no, or partial, plus a hash of the evidence. Other agents can check that history before they pay the same
            seller. No score, no rating, no judgment, just a receipt.
          </p>
          <p>The obvious hole: it is the buyer who signs the claim. What stops a buyer from lying?</p>

          <blockquote className="border-l-2 border-primary/40 pl-4 text-foreground/80">
            goun7 (Tamga Protocol) put it precisely in a public thread: &ldquo;buyer-signed post-hoc claims are only a
            signal to the degree the buyer has something to lose by lying. Without a cost to a false delivered=no,
            the signal is uncorrelated noise rather than weak evidence.&rdquo;
          </blockquote>

          <p>
            That is a fair hit. We spent two rounds, nine independent designs, testing whether we could close it.
            Every design was built out and then attacked against the real code, not argued about in the abstract.
          </p>

          {ROUNDS.map((round) => (
            <div key={round.label}>
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{round.label}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-muted-foreground">
                {round.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">All killed.</p>
            </div>
          ))}

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            The actual reason, not nine separate coincidences
          </h2>
          <p>
            Every mechanism that truly imposed a cost failed for one of two reasons. Either it was optional, and an
            attacker who skips it pays nothing, that pattern repeated every single time: a voluntary check costs an
            attacker who ignores it exactly zero.
          </p>
          <p>
            Or it required trusting some claims more than others, which is a ranking, whatever you call it, and that
            collides head-on with our own rule that a delivery claim is deliberately not a score, a rating, or a
            judgment. As long as that rule holds, an attacker can always pick the unchecked path and sit there for
            free.
          </p>
          <p>This is not a lack of creativity. It is a real structural tension between two of our own design decisions.</p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Two honest, partial fragments that survived
          </h2>
          <p>
            <strong className="text-foreground">Tamper-proof calendar time.</strong> The one thing an attacker cannot
            buy with more wallets or a second script run. A maturity period is structurally healthier than a bond or
            corroboration. But the counting function this needs does not exist yet in the code, and a fixed waiting
            rule punishes a busy, honest seller exactly as hard as a patient scammer.
          </p>
          <p>
            <strong className="text-foreground">A third party with real, losable capital against one specific
            claim.</strong> The only one of the nine that provably imposes a real, non-bypassable cost the moment it
            is used. But it only works for the narrow slice of claims where the underlying fact is cheap and
            objective to check from the outside, a hash matches, an amount was transferred, not whether the delivery
            was actually good. And the minimum stake needed to make it worthwhile does not fit the small, everyday
            payments this project serves.
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Where this leaves it</h2>
          <p>
            The open question stays open. Not from lack of trying: nine separately designed mechanisms were each
            built and broken against the real code, with the same underlying reason each time. That is a structural
            limit of self-reported witness systems without a trusted referee, not a gap we just have not gotten
            around to closing yet.
          </p>
          <p>We would rather say that plainly than ship something that only looks fixed.</p>
        </div>

        <div className="mt-12 flex flex-col gap-2 rounded-lg border border-border bg-card p-6">
          <p className="text-sm leading-relaxed text-foreground/80">
            If you are building something in this space and want the same kind of adversarial pass run against your
            own delivery, receipt, or grading logic, real fixtures, fail-closed testing, a short public findings note
            at the end, get in touch.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-1 inline-flex w-fit items-center gap-2 font-mono text-sm text-foreground hover:text-primary"
          >
            <Mail className="size-4" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </article>
  );
}
