import { useEffect } from "react";
import { ArrowLeft, Mail } from "lucide-react";

const TITLE = "The Hierarchy of Agent Trust | tokenizen";
const DESCRIPTION =
  "Some proof is better than other proof. A story about a mill, a board, a forgery, and why capacity-attest deliberately stops at evidence instead of judgment.";
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

export function HierarchyOfAgentTrustArticle() {
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
          The Hierarchy of Agent Trust
        </h1>
        <p className="mt-4 text-sm italic text-muted-foreground">
          Some proof is better than other proof. A story, without any prerequisites or jargon.
        </p>

        <div className="mt-8 space-y-5 text-base leading-relaxed text-foreground/90">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">The mill</h2>
          <p>
            Imagine a village crossed by trade routes. Merchants pass through constantly, never the same ones
            twice. Just outside the village stands a mill. Travelers bring their wheat, pay the miller in advance,
            and come back the next morning for flour.
          </p>
          <p>
            The villagers never worry about the miller. They have known him for years. If he ever shorted someone
            on flour, the whole village would know by lunchtime, and nobody would bring him wheat again. His
            reputation does the work.
          </p>
          <p>
            The traveling merchants have no such luck. They pass through once. By the time a merchant discovers
            the miller shorted them a sack, they are three villages away, and the miller has already forgotten
            their face. The next merchant who arrives has no way to know if this mill is honest or not. They are
            deciding blind, every single time.
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">The board</h2>
          <p>
            One merchant has an idea. Before leaving town, she nails a small wooden board to the mill&rsquo;s outer
            wall. On it, she writes what she brought, what she got back, and the date. The next merchant who
            arrives reads the board before handing over their wheat.
          </p>
          <p>
            Other merchants start doing the same. Within a season, the board is full of notes. A merchant arriving
            for the first time can read ten honest strangers&rsquo; experiences before deciding whether to trust
            this mill. The board does, for travelers, roughly what years of shared history does for villagers.
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">The forgery</h2>
          <p>
            A rival miller notices this and sees an opportunity. He pays a friend to nail a glowing note to his own
            mill&rsquo;s board, without the friend ever having brought a single sack of wheat. Now the board says
            something that never happened.
          </p>
          <p>
            The villagers realize the board only works if everyone trusts every note on it equally. One forged
            note poisons the whole board, because a new merchant cannot tell which notes are honest and which
            were paid for.
          </p>
          <p>
            So they add a rule: every note must be signed, and the signature must be checkable. Not a name anyone
            could write, but a mark tied to exactly one person, one that cannot be copied onto someone else&rsquo;s
            note. A blacksmith in town starts making small signet rings, each one unique, each one leaving a mark
            nobody else can reproduce. From then on, a note only counts if its mark can be verified against the
            person who claims to have written it.
          </p>
          <p>
            This does not stop the rival miller from posting his own false note under his own real signature. But
            it does mean that when he does, everyone can see, without doubt, that it was him who wrote it, not an
            anonymous forger. Lying under your own signed mark is a different, riskier act than lying anonymously,
            and the two are no longer indistinguishable.
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            The next problem, and the wall
          </h2>
          <p>
            The merchants think they have solved it. Then someone asks the obvious next question: what stops a
            merchant from writing a bad note about an honest miller, out of spite, or because a rival miller paid
            them to?
          </p>
          <p>
            The village elders take this seriously and spend a long time on it. They try nine different ideas, one
            after another.
          </p>
          <p>
            They try making a false note cost something, a small fine paid when posting a note. But a merchant
            with nothing to lose, passing through once, pays it without blinking. They try asking three merchants
            to agree before a note counts, but a rival miller can hire three friends just as easily as one. They
            try a waiting period before a note is trusted, they try requiring the merchant prove who they are
            beyond a doubt, they try a village judge who reviews disputed notes. Every version runs into the same
            two walls.
          </p>
          <p>
            Either the check is optional, and a merchant who wants to lie simply skips it and posts anyway, at no
            cost. Or the check requires someone, some judge, some panel, some elder, to decide whose note to
            believe, and the moment you need a judge, you need to trust the judge, which is the exact same problem
            one level up. Nine designs, nine times the same two walls.
          </p>
          <p>
            The elders write this down plainly, rather than pretend they solved it: the board proves who said
            what, and when. It does not, and structurally cannot on its own, prove who is telling the truth.
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            What the board actually is
          </h2>
          <p>
            So the board stays exactly what it always was: a place where a real, identifiable person leaves a
            real, checkable record of what they experienced. Nothing more. Not a court, not a judge, not a score.
            A miller with ten honest notes and one bad one is not ranked, averaged, or given a grade. A new
            merchant reads all eleven and decides for themselves, the way a person always has.
          </p>
          <p>This is a smaller promise than the village first hoped for. It is also the only one the board can actually keep.</p>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Where this is going</h2>
          <p>
            Agents buying capacity from other agents, GPU-hours, storage, API access, have exactly the mill&rsquo;s
            problem, at a much larger scale. Every transaction is between two parties who may never interact
            again, with no shared history and no village gossip to fall back on. capacity-attest is the board:
            after an agent pays for capacity, it signs a plain factual record of what it received. The signature
            is checkable by anyone, offline, the same way the merchant&rsquo;s mark on the mill&rsquo;s board was
            checkable by anyone who knew the trick.
          </p>
          <p>
            It carries the same honest limit the elders wrote down. It proves what a specific, identifiable buyer
            said happened, at a specific time. It does not, cannot, and does not claim to prove who is right when
            two signed records disagree. That is a harder, separate problem, one about authority rather than
            evidence, and conflating the two is exactly the mistake that poisoned the mill&rsquo;s board in the
            first place.
          </p>
          <p>
            Villages eventually grew clearinghouses and banks once enough trade and enough disputes made a plain
            board insufficient on its own. Whether agent commerce needs the same, and who builds it, is a question
            for a later chapter. For now, the board is useful precisely because it does not pretend to be one.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-2 rounded-lg border border-border bg-card p-6">
          <p className="text-sm leading-relaxed text-foreground/80">
            If this framing is useful for explaining your own delivery, receipt, or trust problem to someone new
            to the space, feel free to reuse it. If you want the adversarial-testing version instead of the story
            version, get in touch.
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
