import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChallengeCard, SELF_CHECK_COPY, SelfCheckPage, VerifiedCard, VerifyResultView } from "@/components/pages/self-check-page";
import { LocaleProvider, type Locale } from "@/i18n/context";
import type { ChallengeResult, VerifyResult } from "@/lib/check-api";

const LONG_DASHES = /[–—]/;
const U_FORM = /\b(u|uw|uzelf)\b/i;

const renderPage = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <SelfCheckPage />
    </LocaleProvider>,
  );

const h1Count = (html: string) => (html.match(/<h1[\s>]/g) ?? []).length;
/** The words a reader sees: markup and attribute values left out. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");

const CHALLENGE: ChallengeResult = {
  ok: true,
  dnsTxt: { location: "_tokenizen-challenge.api.example.com", token: "tokenizen-verify=abc123" },
  wellKnownFile: { location: "https://api.example.com/.well-known/tokenizen-challenge.txt", token: "abc123" },
  instructions: "Publish exactly one of these.",
};

const VERIFIED: VerifyResult = { ok: true, method: "dns-txt", location: "_tokenizen-challenge.api.example.com", verifiedAt: "2026-10-24T12:00:00.000Z" };
const NOT_VERIFIED: VerifyResult = { ok: false, method: "dns-txt", location: "", reason: "REASON FROM THE SERVER" };

describe("SelfCheckPage in English", () => {
  const html = renderPage("en");

  it("is a dark page with a photograph on top, one h1, the free chip and the home link", () => {
    expect(html).toContain('class="cinema"');
    expect(html).toContain("/media/site/kluis.webp");
    expect(h1Count(html)).toBe(1);
    expect(html).toContain("Prove you own an endpoint. Free, live, no account.");
    expect(html).toContain(">free<");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/en"');
  });

  it("keeps its wording and says up front that nothing is stored", () => {
    expect(textOf(html)).toContain("This runs the same ownership proof endpoint-attest uses: an ACME-style challenge");
    expect(html).toContain("This does not store your endpoint, your address, or the result anywhere.");
    expect(html).toContain("Step 1");
    expect(html).toContain("get your verification token");
    expect(html).toContain("Endpoint URL");
    expect(html).toContain("Your address (0x…)");
    expect(html).toContain("Get verification token");
  });

  it("offers the two fields with the ids it always had, and neither step 2 nor the verified card before the first answer", () => {
    expect(html).toContain('id="endpoint"');
    expect(html).toContain('id="ownerAddress"');
    expect(html).not.toContain("Step 2");
    expect(html).not.toContain("full trust attestation");
  });

  it("uses no double asterisks", () => {
    expect(html).not.toContain("**");
  });

  // The English wording had long dashes in nine strings (meta description, privacy note, step titles, address message, file note, verify
  // button, attestation text, coming-soon badge). They are gone: no long dash anywhere in text for readers, in the page or in the table.
  it("has no long dashes in the English page or in its copy table", () => {
    expect(html).not.toMatch(LONG_DASHES);
    expect(JSON.stringify(SELF_CHECK_COPY.en)).not.toMatch(LONG_DASHES);
  });
});

describe("SelfCheckPage in Dutch", () => {
  const html = renderPage("nl");
  const text = textOf(html);

  it("is a dark page with a photograph on top, one h1, the gratis chip and the home link in Dutch", () => {
    expect(html).toContain('class="cinema"');
    expect(html).toContain("/media/site/kluis.webp");
    expect(h1Count(html)).toBe(1);
    expect(html).toContain("Bewijs dat een endpoint van jou is. Gratis, live, zonder account.");
    expect(html).toContain(">gratis<");
    expect(html).toContain('href="/nl"');
  });

  it("says up front that nothing is stored, as the English does, and has the Dutch form", () => {
    expect(html).toContain("Deze check slaat je endpoint, je adres en de uitkomst nergens op.");
    expect(html).toContain("er wordt niets in een database geschreven");
    expect(html).toContain("Stap 1: haal je verificatietoken op");
    expect(html).toContain("Endpoint-URL");
    expect(html).toContain("Jouw adres (0x…)");
    expect(html).toContain("Haal verificatietoken op");
    expect(html).toContain('id="endpoint"');
    expect(html).toContain('id="ownerAddress"');
    expect(html).not.toContain("Stap 2");
  });

  it("shows no English page text to a Dutch reader", () => {
    for (const english of [
      "Prove you own",
      "Free, live, no account",
      "This does not store",
      "Step 1",
      "get your verification token",
      "Endpoint URL",
      "Your address",
      "Get verification token",
      "Start over",
      "ACME-style",
    ]) {
      expect(text).not.toContain(english);
    }
    expect(html).not.toContain(">free<");
  });

  it("uses no long dashes, no double asterisks and never the u-form", () => {
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("**");
    expect(text).not.toMatch(U_FORM);
  });
});

describe("step 2 of the self-check", () => {
  it("gives the DNS way in English, as it was", () => {
    const html = renderToStaticMarkup(<ChallengeCard challenge={CHALLENGE} method="dns-txt" onMethodChange={() => {}} onVerify={() => {}} />);
    expect(html).toContain("Publish EXACTLY ONE of these two.");
    expect(html).toContain("DNS TXT record");
    expect(html).toContain("Well-known file");
    expect(html).toContain("Create a");
    expect(html).toContain("With this exact value.");
    expect(html).toContain("_tokenizen-challenge.api.example.com");
    expect(html).toContain("tokenizen-verify=abc123");
    expect(html).toContain('aria-label="Copy token"');
    expect(html).toContain("verify now");
  });

  it("gives the DNS way in Dutch, with the token as it is and the button in Dutch", () => {
    const html = renderToStaticMarkup(<ChallengeCard locale="nl" challenge={CHALLENGE} method="dns-txt" onMethodChange={() => {}} onVerify={() => {}} />);
    const text = textOf(html);
    expect(html).toContain("Stap 2: publiceer het token en verifieer dan");
    expect(html).toContain("Publiceer PRECIES ÉÉN van deze twee.");
    expect(html).toContain("DNS TXT-record");
    expect(html).toContain("Well-known-bestand");
    expect(html).toContain('<span class="font-mono">TXT</span>-record aan op:');
    expect(html).toContain("Met precies deze waarde.");
    expect(html).toContain("DNS-propagatie kan een paar minuten duren");
    expect(html).toContain("_tokenizen-challenge.api.example.com");
    expect(html).toContain("tokenizen-verify=abc123");
    expect(html).toContain('aria-label="Kopieer token"');
    expect(html).toContain("Ik heb het gepubliceerd, verifieer nu");
    expect(html).toContain('aria-pressed="true"');
    for (const english of ["Step 2", "Publish EXACTLY", "Create a", "With this exact value", "Copy token", "verify now"]) expect(text).not.toContain(english);
    expect(html).not.toMatch(LONG_DASHES);
    expect(text).not.toMatch(U_FORM);
  });

  it("gives the well-known-file way in both languages", () => {
    const en = renderToStaticMarkup(<ChallengeCard challenge={CHALLENGE} method="well-known-file" onMethodChange={() => {}} onVerify={() => {}} />);
    expect(en).toContain("Serve exactly these bytes (nothing else) at:");
    expect(en).toContain("tokenizen-challenge.txt");
    const nl = renderToStaticMarkup(<ChallengeCard locale="nl" challenge={CHALLENGE} method="well-known-file" onMethodChange={() => {}} onVerify={() => {}} />);
    expect(nl).toContain("Serveer precies deze bytes (niets anders) op:");
    expect(nl).toContain("Geen omringende HTML, geen extra inhoud erachter, alleen het token zelf.");
    expect(nl).toContain("tokenizen-challenge.txt");
    expect(nl).not.toMatch(LONG_DASHES);
  });

  it("shows the outcome of a verification in the reader's language, with the server's reason as it came", () => {
    const nlOk = renderToStaticMarkup(<VerifyResultView locale="nl" result={VERIFIED} />);
    expect(nlOk).toContain("Eigenaarschap geverifieerd op");
    expect(nlOk).not.toContain("Ownership verified");
    const enOk = renderToStaticMarkup(<VerifyResultView result={VERIFIED} />);
    expect(enOk).toContain("Ownership verified at");

    const nlNo = renderToStaticMarkup(<VerifyResultView locale="nl" result={NOT_VERIFIED} />);
    expect(nlNo).toContain("Nog niet geverifieerd: REASON FROM THE SERVER");
    expect(nlNo).not.toContain("Not verified yet");
    const enNo = renderToStaticMarkup(<VerifyResultView result={NOT_VERIFIED} />);
    expect(enNo).toContain("Not verified yet: REASON FROM THE SERVER");

    const inCard = renderToStaticMarkup(<ChallengeCard locale="nl" challenge={CHALLENGE} method="dns-txt" onMethodChange={() => {}} onVerify={() => {}} verifyResult={NOT_VERIFIED} />);
    expect(inCard).toContain("Nog niet geverifieerd: REASON FROM THE SERVER");
  });

  it("renders a reason that came from the server as text, never as markup", () => {
    const hostile: VerifyResult = { ok: false, method: "dns-txt", location: "", reason: '<img src=x onerror="alert(1)">' };
    const html = renderToStaticMarkup(<VerifyResultView locale="nl" result={hostile} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("the card after a successful verification", () => {
  it("is not billed and has no payment button, in either language", () => {
    for (const locale of ["en", "nl"] as const) {
      const html = renderToStaticMarkup(<VerifiedCard locale={locale} />);
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<form");
      expect(html).toContain("<em>EndpointAttestation</em>");
      expect(html).toContain("x402");
    }
  });

  it("keeps the English wording", () => {
    const html = renderToStaticMarkup(<VerifiedCard />);
    expect(html).toContain("full trust attestation");
    expect(html).toContain("Ownership proven.");
    expect(html).toContain("Coming soon");
    expect(html).toContain("This is not billed yet and there is no button for it here on purpose");
  });

  it("says the same in Dutch: not billed yet, no button on purpose, over x402 later", () => {
    const html = renderToStaticMarkup(<VerifiedCard locale="nl" />);
    const text = textOf(html);
    expect(html).toContain("Hoe nu verder: de volledige trust attestation");
    expect(html).toContain("Eigenaarschap bewezen.");
    expect(html).toContain("Binnenkort: betaalde stap, prijs wordt nog bekendgemaakt");
    expect(html).toContain("Hier wordt nog niets voor gefactureerd en er staat hier bewust geen knop voor");
    expect(html).toContain("loopt het via x402");
    for (const english of ["Ownership proven", "Coming soon", "not billed yet", "What's next"]) expect(text).not.toContain(english);
    expect(html).not.toMatch(LONG_DASHES);
    expect(text).not.toMatch(U_FORM);
  });
});

describe("the copy of the self-check page", () => {
  const strings = (value: unknown, path = ""): Array<[string, string]> => {
    if (typeof value === "string") return [[path, value]];
    if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
    return [];
  };
  // dateLocale is a setting, not a sentence: English leaves it to the reader's own.
  const en = strings(SELF_CHECK_COPY.en).filter(([k]) => k !== "dateLocale");
  const nl = strings(SELF_CHECK_COPY.nl).filter(([k]) => k !== "dateLocale");

  it("has the same sentences in both languages, and a Dutch one that is not the English one", () => {
    expect(nl.map(([k]) => k).sort()).toEqual(en.map(([k]) => k).sort());
    const enByKey = new Map(en);
    for (const [key, value] of nl) expect(value, key).not.toBe(enByKey.get(key));
  });

  it("has no long dashes, no double asterisks and no u-form in the Dutch ones, the page title, description and error messages included", () => {
    for (const [key, value] of nl) {
      expect(value, key).not.toMatch(LONG_DASHES);
      expect(value, key).not.toContain("**");
      expect(value, key).not.toMatch(U_FORM);
    }
    for (const [key, value] of en) expect(value, key).not.toContain("**");
  });

  it("names the page in Dutch as the rest of the site does", () => {
    expect(SELF_CHECK_COPY.nl.h1).toContain("Bewijs dat een endpoint van jou is");
    expect(SELF_CHECK_COPY.nl.title).toContain("eigenaarschap");
    expect(SELF_CHECK_COPY.nl.dateLocale).toBe("nl-NL");
    expect(SELF_CHECK_COPY.en.dateLocale).toBeUndefined();
  });
});
