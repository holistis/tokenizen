import type { ReactNode } from "react";
import { ArrowUpRight, Mail } from "lucide-react";

import { Brothers } from "@/components/home/lower-sections";
import { HashMark } from "@/components/matrix/hash-mark";
import { MissStrip } from "@/components/matrix/miss-strip";
import { useMeta } from "@/components/pages/legal-page";
import { Button } from "@/components/ui/button";
import { ADVISORY_URL, CONTACT_EMAIL, GITHUB_URL } from "@/data/home-copy";
import { Problem } from "@/components/sections/problem";
import { WhyNow } from "@/components/sections/why-now";
import { Product } from "@/components/sections/product";
import { SecondPillar } from "@/components/sections/second-pillar";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Boundaries } from "@/components/sections/boundaries";
import { OpenSource } from "@/components/sections/open-source";
import { Status } from "@/components/sections/status";

// The offer pages share one frame: a status chip, the promise, then the same three blocks as the cards on the homepage
// (what you get, how you check it, what it is not), then the way to start. The cover pattern is made from the title and is decoration.

export function OfferFrame({
  chip,
  title,
  lead,
  metaTitle,
  metaDescription,
  children,
}: {
  chip: string;
  title: string;
  lead: string;
  metaTitle: string;
  metaDescription: string;
  children: ReactNode;
}) {
  useMeta(metaTitle, metaDescription);
  return (
    <article className="border-t border-border py-14 md:py-20">
      <div className="container">
        <div className="grid gap-8 lg:grid-cols-[1fr_9rem] lg:items-start">
          <div>
            <a href="/en" className="block w-fit font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground">
              tokenizen.nl
            </a>
            <p className="mt-6 inline-flex rounded-sm border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-primary">{chip}</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] sm:text-5xl md:text-6xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{lead}</p>
          </div>
          <HashMark seed={title} className="hidden size-36 text-[color:var(--altitude)] opacity-70 lg:block" />
        </div>
        <div className="mt-12 space-y-12">{children}</div>
      </div>
    </article>
  );
}

export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-border pt-6 lg:grid-cols-[14rem_1fr] lg:gap-8">
      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.15em] text-[color:var(--altitude)]">{label}</h2>
      <div className="max-w-3xl space-y-4 text-base leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function LinkOut({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wide text-primary underline-offset-2 hover:underline">
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function Contact({ subject, label }: { subject: string; label: string }) {
  return (
    <Button asChild size="lg">
      <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}>
        <Mail className="size-4" aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}

export function ChecksPage() {
  const tools = [
    {
      href: "/en/cra-check",
      name: "Eight security signals in a GitHub repository",
      text: "Name a public repository and see which of eight selected signals, related to topics in the EU Cyber Resilience Act, are visible in it: a security policy that names a contact, an SBOM, proof of where releases come from, pinned dependencies, automatic updates, a security scan, recent maintenance and a licence. It reads public pages only and stores no report.",
    },
    {
      href: "/en/x402-check",
      name: "Free x402 endpoint check",
      text: "Paste the URL of an x402 route you run and see, from one anonymous request that never pays, whether the payment request passes the official buyer schema and how far up the receipt ladder it gets. Nothing is stored.",
    },
    {
      href: "/en/check",
      name: "Prove you own an endpoint",
      text: "A free, live check that an endpoint is yours, without an account.",
    },
  ];
  return (
    <OfferFrame
      chip="free"
      title="Free checks"
      lead="Three checks you can run in a minute. Each one says what it looked at, and each one says what it cannot tell you."
      metaTitle="Free checks | tokenizen"
      metaDescription="Free checks of a public GitHub repository, an x402 payment endpoint and the ownership of an endpoint."
    >
      <Block label="The three checks">
        <ul className="space-y-6">
          {tools.map((t) => (
            <li key={t.href}>
              <h3 className="font-display text-2xl">{t.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
              <p className="mt-3">
                <LinkOut href={t.href}>Open the check</LinkOut>
              </p>
            </li>
          ))}
        </ul>
      </Block>
      <Block label="What they are not">
        <p>
          The repository check is not a conformity assessment and not legal advice: eight signals are a selection and not one per legal requirement. A signal
          that is not visible may exist elsewhere.
        </p>
      </Block>
      <Block label="Want it every week">
        <p>The Signal log runs the repository check weekly and writes each result into a log with a timestamp you can check without us.</p>
        <p>
          <LinkOut href="/en/signal-log">See the Signal log</LinkOut>
        </p>
      </Block>
    </OfferFrame>
  );
}

export function SecurityPage() {
  return (
    <OfferFrame
      chip="on request"
      title="Security research. What we can show, and what we cannot yet."
      lead="We find the leaks. Some of what we found we may show, some we may not, and some will follow when the fix is out."
      metaTitle="Security research | tokenizen"
      metaDescription="Security research by two brothers in Eindhoven: a published High advisory, our own record including what was rejected, and how we will show the rest."
    >
      <Block label="What we do">
        <p>
          We read the pipelines and automation of software projects the way an attacker does: the files that run when someone opens an issue or a pull request, and
          the credentials those runs can reach. When we find a hole we report it privately to the maintainers, and we tell you what we found if you ask us to look at
          yours.
        </p>
      </Block>
      <Block label="The public example">
        <p>
          A published GitHub security advisory with severity High: prompt injection in an issue automation workflow could expose workflow credentials. Our account is
          credited as the reporter. The severity is the one in the published advisory, set by the project, and it has no CVE. It opens without a login.
        </p>
        <p>
          <LinkOut href={ADVISORY_URL}>Open the advisory</LinkOut>
        </p>
      </Block>
      <Block label="The whole record">
        <p>
          From our own records: we filed 81 reports so far. The receiver confirmed 5, from two known technology companies and three open-source projects, one of them
          the advisory above. For 2 more the receiver acknowledged the report or fixed it without answering us. The rest were rejected, were duplicates of earlier
          reports, were withdrawn by us because our analysis was wrong, have had no answer, or are still waiting. The names stay private.
        </p>
        <p className="text-sm text-muted-foreground">These are our own records. They are not an outside audit of us.</p>
      </Block>
      <Block label="Sealed dossiers (planned)">
        <p>
          Reports under embargo cannot be shown. We plan to put each one on a public list with its date and a fingerprint, without its content. When the fix is out we
          publish the dossier, and anyone can recompute the fingerprint and see that we had it on that date. It is the same idea as our Signal log. It is not live yet.
        </p>
      </Block>
      <Block label="What it is not">
        <p>Not a penetration test of your production systems and not a certificate. You get a written report with proof for each finding, privately.</p>
      </Block>
      <Block label="Start">
        <Contact subject="Security research" label="Write to us" />
      </Block>
    </OfferFrame>
  );
}

export function ScanPage() {
  return (
    <OfferFrame
      chip="pay per scan"
      title="Smart contract scan"
      lead="A scan that returns hypotheses for you to review. It finds some of what a human audit finds, and we publish how much."
      metaTitle="Smart contract scan | tokenizen"
      metaDescription="A smart contract scan with a public scoreboard that includes what it missed. Pay per scan over x402."
    >
      <Block label="What you get">
        <p>A report of AI-generated hypotheses about your contract, to be reviewed by hand. The quick scan costs 1 dollar and returns the first 15 hypotheses; the full scan costs 5 dollars. You pay in USDC on Base over x402. A scan takes about 20 to 45 seconds.</p>
        <p>
          <LinkOut href="/en/notes/official-sources">Price and payment address: the official sources</LinkOut>
        </p>
      </Block>
      <Block label="How you check it">
        <p>
          The public scoreboard lists every run, each row linking to the rule written before the run and the result after it. Version 3.1 found 8 of 105 known
          findings in its first 15 hypotheses, on the same eight contests as our sealed run, which were no longer secret by then, after two changes at once. In
          the sealed run the earlier versions found 1 and 4. Each square below is one known finding.
        </p>
        <MissStrip label="8 of 105 known findings found, 97 missed" />
        <p>
          <LinkOut href="/en/scoreboard">Open the scoreboard</LinkOut>
        </p>
      </Block>
      <Block label="What it is not">
        <p>It is not an audit and gives no guarantee that a contract is safe. It missed 97 of 105 known findings in that run.</p>
      </Block>
    </OfferFrame>
  );
}

export function ToolsPage() {
  // The descriptions follow the package descriptions on npm (read 28 October 2026). The licences differ per tool, so none is promised here.
  const tools = [
    {
      name: "capacity-attest",
      text: "After an x402 payment for capacity, the paying agent leaves a signed, factual claim of what was actually delivered. A record, not a score and not a verdict.",
      href: "https://www.npmjs.com/package/capacity-attest",
    },
    {
      name: "agent-receipt-verify",
      text: "Checks x402 endpoint conformance before an agent pays, and links the receipt to its settlement.",
      href: "https://www.npmjs.com/package/agent-receipt-verify",
    },
    {
      name: "x402-lint",
      text: "Checks an x402 seller's own payment-required (402) response against the real client-side schema.",
      href: "https://www.npmjs.com/package/@alghanima/x402-lint",
    },
    {
      name: "muraqib-agent-watch",
      text: "A free, instant capability check for any MCP server: it lists what the server can actually do (money, files, outbound messages, destructive actions, credentials) and flags tools that do not state their own safeguard.",
      href: "https://www.npmjs.com/package/muraqib-agent-watch",
    },
  ];
  return (
    <>
      <OfferFrame
        chip="open source"
        title="Open-source tools"
        lead="Run them yourself, so you do not have to believe us."
        metaTitle="Open-source tools | tokenizen"
        metaDescription="Open-source tools for payments between agents: capacity-attest, agent-receipt-verify, x402-lint and muraqib-agent-watch."
      >
        <Block label="The tools">
          <ul className="space-y-4">
            {tools.map((tool) => (
              <li key={tool.name}>
                <h3 className="font-mono text-sm text-foreground">{tool.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.text}</p>
                <p className="mt-2">
                  <LinkOut href={tool.href}>On npm</LinkOut>
                </p>
              </li>
            ))}
          </ul>
          <p>
            <LinkOut href={GITHUB_URL}>The code on GitHub</LinkOut>
          </p>
        </Block>
        <Block label="What they are not">
          <p>No score, no verdict and no token of our own.</p>
        </Block>
      </OfferFrame>
      <Problem />
      <WhyNow />
      <Product />
      <SecondPillar />
      <HowItWorks />
      <Boundaries />
      <OpenSource />
      <Status />
    </>
  );
}

export function ConsultancyPage() {
  return (
    <OfferFrame
      chip="a conversation"
      title="Talk to Ahmed"
      lead="Start with a conversation about where you stand."
      metaTitle="Talk to Ahmed | tokenizen"
      metaDescription="A conversation about security, the EU Cyber Resilience Act or payments between agents, with Ahmed Ouadoudi of AO Services in Eindhoven."
    >
      <Block label="What you get">
        <p>A conversation about security, the EU Cyber Resilience Act or payments between agents, with the brother who does our consultancy and communication.</p>
      </Block>
      <Block label="How you check it">
        <p>Ask for our measurements. We show how each one was made and what it leaves out.</p>
      </Block>
      <Block label="What it is not">
        <p>No legal advice, no certificate and no promise of a result.</p>
      </Block>
      <Block label="Start">
        <Contact subject="A conversation with Ahmed" label="Write to Ahmed" />
      </Block>
    </OfferFrame>
  );
}

export function AboutPage() {
  useMeta("Two brothers, one company | tokenizen", "Abdellah and Ahmed Ouadoudi run AO Services in Eindhoven: security research, free checks, a log with a timestamp outside our control.");
  return (
    <div className="border-t border-border">
      <Brothers locale="en" level={1} />
      <section className="border-t border-border py-12">
        <div className="container max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            AO Services, Lochemstraat 49, 5651 EL Eindhoven. KvK 86816632. VAT NL004319767B61. <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <p>
            Terms: <a className="underline underline-offset-2" href="/en/terms">tokenizen.nl/en/terms</a>. Privacy: <a className="underline underline-offset-2" href="/en/privacy">tokenizen.nl/en/privacy</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
