import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { X402CheckPage, X402CheckResultView, X402_CHECK_COPY, localizeApiError, reproduceCommand } from "@/components/pages/x402-check-page";
import { LocaleProvider, type Locale } from "@/i18n/context";
import type { X402CheckResult } from "@/lib/check-api";

const LONG_DASHES = /[–—]/;

const LEVELS = [
  { level: 0, name: "asks for payment the way x402 says", requirement: "r0", status: "pass", evidence: "exact on eip155:8453, 1000 to 0x2888" },
  { level: 1, name: "declares the offer-receipt extension", requirement: "r1", status: "fail", evidence: "no offer-receipt in extensions (no extensions)" },
  { level: 2, name: "signs its offer, and the signature verifies", requirement: "r2", status: "not_evaluated", evidence: "" },
  { level: 3, name: "level three", requirement: "r3", status: "not_measured", evidence: "needs a real settlement, not attempted" },
] as X402CheckResult["ladder"]["levels"];

function sample(overrides: Partial<X402CheckResult> = {}): X402CheckResult {
  return {
    ok: true,
    cached: false,
    url: "https://seller.example.com/api/route",
    method: "POST",
    measuredAt: "2026-10-24T12:00:00.000Z",
    summary: "It asks for payment in a form a buyer client accepts. On the receipt ladder it reaches level 0.",
    buyerCheck: { status: "pass", httpStatus: 402, source: "header", x402Version: 2, problems: [], warnings: [] },
    ladder: { highestLevel: 0, levels: LEVELS, methodRetried: null, definition: "https://github.com/holistis/agent-receipt-verify/blob/main/CONFORMANCE.md" },
    requestsMade: 1,
    limits: ["This check never pays.", "Nothing is stored on our side."],
    ...overrides,
  };
}

const renderPage = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <X402CheckPage />
    </LocaleProvider>,
  );

const h1Count = (html: string) => (html.match(/<h1[\s>]/g) ?? []).length;
/** The words a reader sees: markup and attribute values left out. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");

describe("X402CheckPage", () => {
  const html = renderPage("en");

  it("says up front that it never pays and stores nothing", () => {
    expect(html).toContain("never pays");
    expect(html).toContain("We store nothing");
  });

  it("offers a URL field and both methods, POST first", () => {
    expect(html).toContain('id="x402-url"');
    expect(html).toContain("POST (the usual case)");
    expect(html).toContain("GET");
    expect(html).toContain('name="x402-method"');
  });

  it("uses no long dashes and no double asterisks in text for readers", () => {
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("**");
  });

  it("links to the open source tool and its ladder definition only over https", () => {
    expect(html).toContain("https://github.com/holistis/agent-receipt-verify");
    expect(html).not.toMatch(/href="http:\/\//);
  });

  it("is a dark page with a photograph on top, one h1, the free chip and the home link in the reader's language", () => {
    expect(html).toContain('class="cinema"');
    expect(html).toContain("/media/site/betaling.webp");
    expect(h1Count(html)).toBe(1);
    expect(html).toContain("Check your x402 endpoint. Free, live, nothing to install.");
    expect(html).toContain(">free<");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/en"');
  });
});

describe("X402CheckPage in Dutch", () => {
  const html = renderPage("nl");
  const text = textOf(html);

  it("says up front that it never pays and stores nothing, as strongly as the English does", () => {
    expect(html).toContain("betaalt nooit");
    expect(html).toContain("We slaan niets op");
    expect(html).toContain("twee minuten in het geheugen");
    expect(html).toContain("een beperkt aantal keer per uur");
    expect(html).toContain("waarvoor je toestemming hebt om ze te testen");
  });

  it("has the Dutch heading, chip, labels, buttons and home link", () => {
    expect(html).toContain("Check je x402-endpoint. Gratis, live, niets te installeren.");
    expect(html).toContain(">gratis<");
    expect(html).toContain("Jouw route");
    expect(html).toContain("Endpoint-URL");
    expect(html).toContain("Methode waarmee de route antwoordt");
    expect(html).toContain("POST (het gebruikelijke geval)");
    expect(html).toContain("Controleer deze route");
    expect(html).toContain("Waarom dit bestaat");
    expect(html).toContain("De ladder en de definitie ervan zijn open source in");
    expect(html).toContain('href="/nl"');
    expect(html).toContain("/media/site/betaling.webp");
  });

  it("keeps the behaviour of the English page: same field, same method group, same https-only links", () => {
    expect(html).toContain('id="x402-url"');
    expect(html).toContain('name="x402-method"');
    expect(html).toContain("https://github.com/holistis/agent-receipt-verify");
    expect(html).not.toMatch(/href="http:\/\//);
  });

  it("has exactly one h1, in both languages", () => {
    expect(h1Count(html)).toBe(1);
    expect(h1Count(renderPage("en"))).toBe(1);
  });

  it("shows no English page text to a Dutch reader", () => {
    for (const english of [
      "Check your x402 endpoint",
      "We store nothing",
      "never pays",
      "Your route",
      "Endpoint URL",
      "Method the route answers",
      "the usual case",
      "Check this route",
      "Why this exists",
      "The ladder and its definition",
      "Paste the URL",
      "Two answers come",
      "double click",
    ]) {
      expect(text).not.toContain(english);
    }
    expect(html).not.toContain(">free<");
  });

  it("uses no long dashes and no double asterisks in either language, and never the u-form in Dutch", () => {
    for (const page of [html, renderPage("en")]) {
      expect(page).not.toMatch(LONG_DASHES);
      expect(page).not.toContain("**");
    }
    expect(text).not.toMatch(/\b(u|uw|uzelf)\b/i);
  });
});

describe("the copy of the x402 check page", () => {
  const strings = (value: unknown, path = ""): Array<[string, string]> => {
    if (typeof value === "string") return [[path, value]];
    if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
    return [];
  };
  const en = strings(X402_CHECK_COPY.en);
  const nl = strings(X402_CHECK_COPY.nl);

  it("has the same sentences in both languages, and a Dutch one that is not the English one", () => {
    expect(nl.map(([k]) => k).sort()).toEqual(en.map(([k]) => k).sort());
    const enByKey = new Map(en);
    for (const [key, value] of nl) {
      if (key === "methodGet") continue; // the HTTP verb
      expect(value, key).not.toBe(enByKey.get(key));
    }
  });

  it("has no long dashes and no double asterisks in any of them, the page title and description and the error messages included", () => {
    for (const [key, value] of [...en, ...nl]) {
      expect(value, key).not.toMatch(LONG_DASHES);
      expect(value, key).not.toContain("**");
    }
  });

  it("keeps the Dutch to the je form and the title and description to the point", () => {
    for (const [key, value] of nl) expect(value, key).not.toMatch(/\b(u|uw|uzelf)\b/i);
    expect(X402_CHECK_COPY.nl.title).toBe("Gratis x402-endpointcheck | tokenizen");
    expect(X402_CHECK_COPY.nl.description).toContain("betaalt nooit");
    expect(X402_CHECK_COPY.en.description).toContain("never pays");
  });
});

describe("localizeApiError", () => {
  const offline = "Could not reach the check service. It may be offline, or your connection dropped.";
  const tooMany = "Too many attempts from this connection. Please wait a few minutes and try again.";

  it("leaves English as it is", () => {
    expect(localizeApiError(offline, "en")).toBe(offline);
    expect(localizeApiError(tooMany, "en")).toBe(tooMany);
  });

  it("gives the four messages of the check client in Dutch, with their status codes", () => {
    expect(localizeApiError(offline, "nl")).toContain("niet bereikbaar");
    expect(localizeApiError(tooMany, "nl")).toContain("Te veel pogingen");
    expect(localizeApiError("The check service returned HTTP 502.", "nl")).toBe("De check-dienst gaf HTTP 502 terug.");
    expect(localizeApiError("The check service returned an unreadable response (HTTP 200).", "nl")).toContain("(HTTP 200)");
  });

  it("shows a message it does not know as it came", () => {
    expect(localizeApiError("Something else entirely.", "nl")).toBe("Something else entirely.");
  });
});

describe("X402CheckResultView", () => {
  it("shows the summary, both checks and every level, and calls the unpaid levels not measured", () => {
    const html = renderToStaticMarkup(<X402CheckResultView result={sample()} />);
    expect(html).toContain("reaches level 0");
    expect(html).toContain("Would a buyer client accept your payment request?");
    expect(html).toContain("read from the header");
    expect(html).toContain("x402 version 2");
    for (const n of [0, 1, 2, 3]) expect(html).toContain(`Level ${n}`);
    expect(html).toContain("not measured");
    expect(html).toContain("not reached");
    expect(html).toContain("which is not the same as failed");
    expect(html).not.toMatch(LONG_DASHES);
  });

  it("lists the schema problems when the buyer check fails", () => {
    const html = renderToStaticMarkup(
      <X402CheckResultView
        result={sample({
          buyerCheck: { status: "fail", httpStatus: 402, source: "body", x402Version: null, problems: ["resource.serviceName: Too big: expected string to have <=32 characters"], warnings: [] },
        })}
      />,
    );
    expect(html).toContain("serviceName");
    expect(html).toContain(">fail<");
  });

  it("says when the second method was used and when the answer is cached", () => {
    const html = renderToStaticMarkup(
      <X402CheckResultView result={sample({ cached: true, requestsMade: 2, ladder: { ...sample().ladder, methodRetried: { from: "POST", to: "GET", firstStatus: 405 } } })} />,
    );
    expect(html).toContain("answered 405 to POST");
    expect(html).toContain("two minute cache");
    expect(html).toContain("2 requests");
  });

  it("renders text that came from the endpoint as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const levels = sample().ladder.levels.map((l, i) => (i === 0 ? { ...l, evidence: hostile } : l));
    const html = renderToStaticMarkup(
      <X402CheckResultView
        result={sample({
          ladder: { ...sample().ladder, levels },
          buyerCheck: { status: "fail", httpStatus: 402, source: "body", x402Version: null, problems: [hostile], warnings: [hostile] },
        })}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });

  it("hands out a command whose quoting cannot be broken out of by the URL", () => {
    expect(reproduceCommand("https://a.example.com/x")).toBe("npx -y agent-receipt-verify 'https://a.example.com/x'");
    expect(reproduceCommand("https://a.example.com/x'; rm -rf ~; echo '")).not.toContain("'; rm");
    expect(reproduceCommand("https://a.example.com/it's")).toContain("it%27s");
  });
});

describe("X402CheckResultView in Dutch", () => {
  const warned = sample({
    cached: true,
    requestsMade: 2,
    buyerCheck: { status: "fail", httpStatus: 402, source: "header", x402Version: 2, problems: ["PROBLEM FROM THE SERVER"], warnings: ["WARNING FROM THE SERVER"] },
    ladder: { ...sample().ladder, methodRetried: { from: "POST", to: "GET", firstStatus: 405 } },
  });
  const html = renderToStaticMarkup(<X402CheckResultView result={warned} locale="nl" />);
  const text = textOf(html);

  it("gives the chrome of the result in Dutch, with the same caveats as the English", () => {
    expect(html).toContain("Zou een koperclient je betaalverzoek accepteren?");
    expect(html).toContain("gelezen uit de header");
    expect(html).toContain("x402-versie 2");
    expect(html).toContain("HTTP 402");
    for (const n of [0, 1, 2, 3]) expect(html).toContain(`Niveau ${n}`);
    expect(html).toContain("niet gemeten");
    expect(html).toContain("niet bereikt");
    expect(html).toContain("dat is niet hetzelfde als mislukt");
    expect(html).toContain("Niveau 3 tot en met 5 hebben een echte settlement nodig");
    expect(html).toContain("Wat elk niveau betekent");
    expect(html).toContain("Even naar kijken, maar geen fout");
    expect(html).toContain("Je route antwoordde 405 op POST, dus we vroegen het nog één keer met GET");
    expect(html).toContain("Dit antwoord komt uit een cache van twee minuten");
    expect(html).toContain("2 verzoeken vanaf onze server");
    expect(html).toContain("Wat dit je niet vertelt");
    expect(html).toContain("Draai de ladder zelf");
    expect(html).toContain('aria-label="Kopieer commando"');
    expect(html).toContain(">mislukt<");
    expect(html).toContain(">geslaagd<");
  });

  it("counts one request in the singular", () => {
    const one = renderToStaticMarkup(<X402CheckResultView result={sample({ requestsMade: 1 })} locale="nl" />);
    expect(one).toContain("1 verzoek vanaf onze server");
    expect(one).not.toContain("1 verzoeken");
    expect(one).not.toContain("twee minuten");
  });

  it("shows no English chrome, while the sentences of the check server stay as the server sent them", () => {
    for (const english of ["Level 0", "Would a buyer client", "read from the", "not reached", "Measured", "Run the ladder yourself", "What this does not tell you", "Copy command", "Worth a look", "which is not the same as failed"]) {
      expect(text).not.toContain(english);
    }
    expect(html).not.toContain(">fail<");
    expect(html).not.toContain(">pass<");
    expect(text).toContain("PROBLEM FROM THE SERVER");
    expect(text).toContain("WARNING FROM THE SERVER");
    expect(text).toContain("This check never pays.");
    expect(text).toContain("It asks for payment in a form a buyer client accepts.");
  });

  it("uses no long dashes, no double asterisks and no u-form", () => {
    expect(html).not.toMatch(LONG_DASHES);
    expect(html).not.toContain("**");
    expect(text).not.toMatch(/\b(u|uw|uzelf)\b/i);
  });

  it("still renders text that came from the endpoint as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const out = renderToStaticMarkup(
      <X402CheckResultView result={sample({ buyerCheck: { status: "fail", httpStatus: 402, source: "body", x402Version: null, problems: [hostile], warnings: [] } })} locale="nl" />,
    );
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});
