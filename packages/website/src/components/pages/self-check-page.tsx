import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import {
  CheckApiError,
  getOwnershipChallenge,
  verifyOwnership,
  type ChallengeResult,
  type OwnershipMethod,
  type VerifyResult,
} from "@/lib/check-api";

const TITLE = "Free endpoint ownership check | tokenizen";
const DESCRIPTION =
  "Prove you control an endpoint with a free, live DNS or well-known-file check — the same ownership proof endpoint-attest uses, run directly in your browser.";

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

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type Step = "form" | "challenge" | "verified";

function isValidEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function SelfCheckPage() {
  useArticleMeta();

  const [step, setStep] = useState<Step>("form");
  const [endpoint, setEndpoint] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeResult | null>(null);
  const [method, setMethod] = useState<OwnershipMethod>("dns-txt");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  async function handleGetChallenge(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!isValidEndpoint(endpoint)) {
      setFormError("Enter a full http(s) URL, e.g. https://api.example.com/mcp");
      return;
    }
    if (!ETH_ADDRESS_RE.test(ownerAddress)) {
      setFormError("Enter a 0x-prefixed, 40-hex-character address — this identifies you as the requester, it is not billed or charged.");
      return;
    }

    setChallengeLoading(true);
    try {
      const result = await getOwnershipChallenge(endpoint, ownerAddress);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setChallenge(result);
      setStep("challenge");
      setVerifyResult(null);
    } catch (err) {
      setFormError(err instanceof CheckApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setChallengeLoading(false);
    }
  }

  async function handleVerify() {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await verifyOwnership(endpoint, ownerAddress, method);
      if (!result.ok && "error" in result) {
        setVerifyResult({ ok: false, method, location: "", reason: result.error });
      } else {
        setVerifyResult(result as VerifyResult);
        if ((result as VerifyResult).ok) setStep("verified");
      }
    } catch (err) {
      setVerifyResult({
        ok: false,
        method,
        location: "",
        reason: err instanceof CheckApiError ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setVerifyLoading(false);
    }
  }

  function startOver() {
    setStep("form");
    setChallenge(null);
    setVerifyResult(null);
    setFormError(null);
  }

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-2xl">
        <a
          href="/en"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          tokenizen.nl
        </a>

        <p className="mt-8 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">
          endpoint-attest · free self-check
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Prove you own an endpoint. Free, live, no account.
        </h1>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-foreground/90">
          <p>
            This runs the same ownership proof <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">endpoint-attest</code>{" "}
            uses: an ACME-style challenge (like every certificate authority already uses), checked live against your DNS or your own
            server the moment you click verify.
          </p>
          <p className="text-sm text-muted-foreground">
            This does not store your endpoint, your address, or the result anywhere. Verification runs once, live, and nothing is
            written to a database. If verification unexpectedly fails right after you published the token correctly, this free service
            may simply have restarted — request a fresh token and try again.
          </p>
        </div>

        <Card className="mt-8">
          <CardTitle>Step 1 — get your verification token</CardTitle>
          <CardDescription>
            Enter the endpoint you control and the address you want the (eventual) attestation issued to.
          </CardDescription>
          <CardContent>
            <form onSubmit={handleGetChallenge} className="space-y-4">
              <div>
                <label htmlFor="endpoint" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  Endpoint URL
                </label>
                <input
                  id="endpoint"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://api.example.com/mcp"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  disabled={step !== "form"}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ownerAddress" className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  Your address (0x…)
                </label>
                <input
                  id="ownerAddress"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x..."
                  value={ownerAddress}
                  onChange={(e) => setOwnerAddress(e.target.value)}
                  disabled={step !== "form"}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                />
              </div>

              {formError ? <p className="text-sm text-rule-red">{formError}</p> : null}

              {step === "form" ? (
                <Button type="submit" disabled={challengeLoading}>
                  {challengeLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Get verification token
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={startOver}>
                  Start over with a different endpoint
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {challenge ? (
          <Card className="mt-6">
            <CardTitle>Step 2 — publish the token, then verify</CardTitle>
            <CardDescription>Publish EXACTLY ONE of these two. Pick whichever is easier for your setup.</CardDescription>
            <CardContent className="space-y-5">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("dns-txt")}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                    method === "dns-txt"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  DNS TXT record
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("well-known-file")}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                    method === "well-known-file"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Well-known file
                </button>
              </div>

              {method === "dns-txt" ? (
                <div className="space-y-2 text-sm">
                  <p>
                    Create a <span className="font-mono">TXT</span> record at:
                  </p>
                  <TokenRow label={challenge.dnsTxt.location} value={challenge.dnsTxt.token} />
                  <p className="text-muted-foreground">
                    With this exact value. DNS propagation can take a few minutes depending on your provider.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>Serve exactly these bytes (nothing else) at:</p>
                  <TokenRow label={challenge.wellKnownFile.location} value={challenge.wellKnownFile.token} />
                  <p className="text-muted-foreground">No surrounding HTML, no trailing content — just the token itself.</p>
                </div>
              )}

              <div>
                <Button type="button" onClick={handleVerify} disabled={verifyLoading}>
                  {verifyLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  I've published it — verify now
                </Button>
              </div>

              {verifyResult ? <VerifyResultView result={verifyResult} /> : null}
            </CardContent>
          </Card>
        ) : null}

        {step === "verified" ? (
          <Card className="mt-6 border-rule-green/40">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-rule-green" aria-hidden="true" />
              What's next: the full trust attestation
            </CardTitle>
            <CardDescription>
              Ownership proven. The next step is a signed, content-addressed, 30-day <em>EndpointAttestation</em> — the checks run,
              the outcome is recorded, and the result is cryptographically signed.
            </CardDescription>
            <CardContent>
              <Badge variant="yellow">Coming soon — paid step, price to be announced</Badge>
              <p className="mt-3 text-sm text-muted-foreground">
                This is not billed yet and there is no button for it here on purpose: we are not going to put a payment flow in front
                of you before it exists. When it launches, it will run over x402 the same way the rest of tokenizen.nl does.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </article>
  );
}

function TokenRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <CopyButton value={value} copyLabel="Copy token" copiedLabel="Copied" className="shrink-0" />
    </div>
  );
}

function VerifyResultView({ result }: { result: VerifyResult }) {
  if (result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-rule-green/40 bg-rule-green-soft px-3 py-2.5 text-sm text-rule-green">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Ownership verified at {new Date(result.verifiedAt).toLocaleString()}.</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-rule-red/40 bg-rule-red-soft px-3 py-2.5 text-sm text-rule-red">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>Not verified yet: {result.reason}</span>
    </div>
  );
}
