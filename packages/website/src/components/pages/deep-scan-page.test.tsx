import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUSINESS_LINE } from "@/components/footer";
import { COPY, DeepScanPage, DeepScanStatusPage, failureText, ReportView, StatusView } from "@/components/pages/deep-scan-page";
import type { OrderStatus, Report } from "@/lib/deep-scan-api";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { CONSENT, TERMS_VERSION, type OrderState } from "@/lib/deep-scan-logic";
import { readableText } from "@/test-utils/readable-text";

import terms from "@/data/legal/deep-scan-terms.txt?raw";
import termsNl from "@/data/legal/deep-scan-terms.nl.txt?raw";
import llms from "../../../public/llms.txt?raw";
import sitemap from "../../../public/sitemap.xml?raw";
import headers from "../../../public/_headers?raw";

const render = (locale: Locale, node: React.ReactElement) => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
const text = (locale: Locale, node: React.ReactElement) => readableText(render(locale, node));

const STATES: OrderState[] = ["OFFERTE", "WACHT_OP_BETALING", "BETAALD", "BEZIG", "KLAAR", "MISLUKT", "AFWIJKEND", "VERLOPEN", "INGETROKKEN"];
const status = (toestand: OrderState, extra: Partial<OrderStatus> = {}): OrderStatus => ({
  ok: true, repo: "owner/name", regels: 3792, prijsCenten: 7584, toestand, betaald: true, terugbetaling: false, terugbetaald: false, rapportKlaar: false, ...extra,
});
const report = (hypotheses: Report["hypotheses"], extra: Partial<Report> = {}): Report => ({
  versie: 1, gemaaktOp: "2026-11-01T12:00:00.000Z", repository: "owner/name", commit: "abc", inScope: { regels: 3800, bestanden: 20 },
  gelezen: { bestanden: 14, vanTotaal: 20, percentage: 70, nietGelezen: ["src/IFoo.sol"] }, volledig: true, hypotheses, wat: "x", meting: "y", ...extra,
});

describe("the deep scan page", () => {
  for (const locale of ["en", "nl"] as const) {
    it(`states the price rule, the refund rule and what the scan is not, in ${locale}`, () => {
      const t = text(locale, <DeepScanPage />);
      expect(t).toContain(locale === "nl" ? "0,02 euro per regel Solidity in scope, minimum 2 euro, maximum 12.000 regels" : "0.02 euro per line of Solidity in scope, minimum 2 euro, maximum 12,000 lines");
      expect(t).toContain(locale === "nl" ? "volledig terug" : "in full");
      expect(t).toMatch(locale === "nl" ? /niet is: een audit/ : /not: an audit/);
      expect(t).toMatch(locale === "nl" ? /één keer op één openbare wedstrijd/ : /once on one public contest/);
      expect(t).not.toMatch(/nog niet op een openbare maatstaf|not yet measured/);
      expect(t).toMatch(locale === "nl" ? /6 uur/ : /6 hours/);
      expect(t).toMatch(locale === "nl" ? /geen hypothese/ : /no hypotheses/);
      expect(t).toMatch(locale === "nl" ? /minder dan de helft van de code/ : /less than half of the code/);
      expect(t).toMatch(locale === "nl" ? /Lege regels en commentaar tellen mee/ : /Blank lines and comments count/);
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toContain("**");
      expect(t).not.toMatch(/guarantee|garantie|gegarandeerd/i);
    });
    it(`links to the terms, the privacy statement and the scoreboard in the reader's language in ${locale}`, () => {
      const html = render(locale, <DeepScanPage />);
      expect(html).toContain(locale === "nl" ? 'href="/nl/scoreboard"' : 'href="/scoreboard"');
    });
    it(`has the same facts in the consent sentence as in the terms in ${locale}`, () => {
      const c = COPY[locale];
      expect(c.consent, "the sentence on the page is the sentence the confirmation keeps").toBe(CONSENT[TERMS_VERSION][locale]);
      const t = locale === "nl" ? termsNl : terms;
      expect(c.consent).toMatch(locale === "nl" ? /herroepingsrecht eindigt/ : /right of withdrawal ends/);
      expect(t).toMatch(locale === "nl" ? /14 dagen/ : /14 days/);
      expect(t).toMatch(locale === "nl" ? /0,02 euro per regel/ : /0\.02 euro per line/);
      expect(t).toMatch(locale === "nl" ? /minimum van 2 euro/ : /minimum of 2 euro/);
    });
  }
  for (const locale of ["en", "nl"] as const) {
    it(`has the refund rule of the page in the terms too, with the same limits, in ${locale}`, () => {
      const tt = locale === "nl" ? termsNl : terms;
      expect(tt).toMatch(locale === "nl" ? /6 uur/ : /6 hours/);
      expect(tt).toMatch(locale === "nl" ? /minder dan de helft van de code in scope/ : /less than half of the code in scope/);
      expect(tt).toMatch(locale === "nl" ? /lege regels en commentaar inbegrepen/ : /blank lines and comments included/);
      expect(tt).toMatch(locale === "nl" ? /beperkt je wettelijke rechten niet/ : /does not limit the rights that you have by law/);
      expect(tt).not.toMatch(locale === "nl" ? /in geschil/ : /in dispute/);
      expect(tt).toMatch(locale === "nl" ? /12\.000 regels/ : /12,000 lines/);
      expect(tt).toContain("info@tokenizen.nl");
      expect(tt).not.toMatch(/[–—]/);
    });
  }
  it("every site address in the terms points to a page that exists, and a Dutch text links to the Dutch page", () => {
    const known = new Set(["privacy", "terms", "scoreboard", "deep-scan", "deep-scan-terms", "notes", "signal-log", "cra-check"]);
    for (const [name, text, lang] of [["en", terms, "en"], ["nl", termsNl, "nl"]] as const) {
      for (const m of text.matchAll(/tokenizen\.nl\/([a-z]{2})\/([a-z-]+)/g)) {
        expect(m[1], `${name}: ${m[0]}`).toBe(lang);
        expect(known.has(m[2]), `${name}: ${m[0]}`).toBe(true);
      }
    }
  });
  for (const locale of ["en", "nl"] as const) {
    it(`has the withdrawal information the Dutch rules ask for: the button, the email, the model form, and where to complain, in ${locale}`, () => {
      const tt = locale === "nl" ? termsNl : terms;
      expect(tt).toContain(locale === "nl" ? "Koop ongedaan maken" : "Cancel purchase");
      expect(tt).toMatch(locale === "nl" ? /Modelformulier voor herroeping/ : /Model withdrawal form/);
      expect(tt).toMatch(locale === "nl" ? /Naam: \[je naam\]/ : /Name: \[your name\]/);
      expect(tt).toMatch(locale === "nl" ? /Vragen en klachten: info@tokenizen\.nl\. We antwoorden binnen 14 dagen/ : /Questions and complaints: info@tokenizen\.nl\. We answer within 14 days/);
      expect(tt).toMatch(locale === "nl" ? /maken we geen rapport en betalen we de volledige prijs terug/ : /we make no report and refund the full price/);
      expect(tt).not.toMatch(locale === "nl" ? /betaal je voor wat is gedaan|stoppen we de scan/ : /you pay for what has been done|we stop the scan/);
      expect(tt.indexOf(locale === "nl" ? "Modelformulier" : "Model withdrawal form")).toBeGreaterThan(tt.indexOf(locale === "nl" ? "10." : "10. Law"));
    });
  }
  it("gives a phone number where the Dutch rules ask for it: in the terms, in the model form and in the footer of every page", () => {
    expect(terms).toContain("phone +31 6 40840108");
    expect(termsNl).toContain("telefoon +31 6 40840108");
    expect(terms.match(/\+31 6 40840108/g)).toHaveLength(2);
    expect(termsNl.match(/\+31 6 40840108/g)).toHaveLength(2);
    expect(BUSINESS_LINE).toContain("tel +31 6 40840108");
  });
  it("the terms version of the page is the date of the terms files", () => {
    expect(TERMS_VERSION).toBe("2026-11-01");
    expect(terms).toContain("Last changed: 1 November 2026.");
    expect(termsNl).toContain("Laatst gewijzigd: 1 november 2026.");
  });
  it("is in the sitemap in both languages, in llms.txt, and the policy lets the page reach the service", () => {
    for (const p of ["/deep-scan", "/nl/deep-scan", "/deep-scan-terms", "/nl/deep-scan-terms"]) expect(sitemap).toContain(`<loc>https://tokenizen.nl${p}</loc>`);
    expect(sitemap).not.toContain("/scan/status");
    expect(llms).toContain("https://tokenizen.nl/deep-scan");
    expect(headers).toContain("https://scan.tokenizen.nl");
  });
});

describe("the status page", () => {
  for (const locale of ["en", "nl"] as const) {
    it(`says something in every state, in ${locale}`, () => {
      const c = COPY[locale];
      for (const s of STATES) {
        expect(c.states[s].length, s).toBeGreaterThan(10);
        expect(c.states[s], s).not.toMatch(/[–—]/);
        expect(text(locale, <StatusView status={status(s)} report={null} c={c} />)).toContain(c.states[s]);
      }
    });
    it(`shows a refund as made or being made in ${locale}`, () => {
      const c = COPY[locale];
      expect(text(locale, <StatusView status={status("MISLUKT", { terugbetaling: true, terugbetaald: true })} report={null} c={c} />)).toContain(c.refundMade);
      expect(text(locale, <StatusView status={status("MISLUKT", { terugbetaling: true })} report={null} c={c} />)).toContain(c.refundBusy);
    });
    it(`does not show a refund line when there is none in ${locale}`, () => {
      const c = COPY[locale];
      const t = text(locale, <StatusView status={status("BEZIG", { terugbetaling: false })} report={null} c={c} />);
      expect(t).not.toContain(c.refundMade);
      expect(t).not.toContain(c.refundBusy);
    });
    it(`shows a waiting line before the first answer in ${locale}`, () => {
      expect(text(locale, <StatusView status={null} report={null} c={COPY[locale]} />)).toContain(COPY[locale].checking);
    });
  }
  it("renders without a browser: the server render of the page does not crash and shows no key", () => {
    expect(() => render("en", <DeepScanStatusPage />)).not.toThrow();
    expect(text("en", <DeepScanStatusPage />)).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});

describe("the cancel button", () => {
  for (const locale of ["en", "nl"] as const) {
    const c = COPY[locale];
    it(`is there while the order is paid and the report is not delivered, and says what happens, in ${locale}`, () => {
      for (const s of ["BETAALD", "BEZIG"] as const) {
        const t = text(locale, <StatusView status={status(s)} report={null} c={c} locale={locale} onWithdraw={() => {}} />);
        expect(t, s).toContain(c.withdrawButton);
        expect(t, s).toContain(c.withdrawLead);
      }
    });
    it(`is not there before payment, after delivery, after a withdrawal, or without a handler, in ${locale}`, () => {
      for (const s of ["OFFERTE", "WACHT_OP_BETALING", "KLAAR", "MISLUKT", "AFWIJKEND", "VERLOPEN", "INGETROKKEN"] as const) {
        expect(text(locale, <StatusView status={status(s)} report={null} c={c} locale={locale} onWithdraw={() => {}} />), s).not.toContain(c.withdrawButton);
      }
      expect(text(locale, <StatusView status={status("BEZIG", { herroepingOp: Date.UTC(2026, 10, 1, 12, 30) })} report={null} c={c} locale={locale} onWithdraw={() => {}} />)).not.toContain(c.withdrawButton);
      expect(text(locale, <StatusView status={status("BETAALD")} report={null} c={c} locale={locale} />)).not.toContain(c.withdrawButton);
    });
    it(`confirms a withdrawal with the moment, and says after delivery that the right ended, in ${locale}`, () => {
      const t = text(locale, <StatusView status={status("BEZIG", { herroepingOp: Date.UTC(2026, 10, 1, 12, 30) })} report={null} c={c} locale={locale} />);
      expect(t).toContain(c.withdrawn(locale === "nl" ? "1 nov 2026" : "1 Nov 2026").slice(0, 25));
      expect(t).toMatch(/13:30/);
      expect(text(locale, <StatusView status={status("KLAAR")} report={null} c={c} locale={locale} />)).toContain(c.withdrawLate);
    });
    it(`has no long dashes and a name for the button that says what it does, in ${locale}`, () => {
      for (const x of [c.withdrawLead, c.withdrawButton, c.withdrawBusy, c.withdrawError, c.withdrawn("x"), c.withdrawLate, c.states.INGETROKKEN]) expect(x).not.toMatch(/[–—]/);
      expect(c.withdrawButton).toMatch(locale === "nl" ? /ongedaan/ : /Cancel/);
    });
  }
  for (const locale of ["en", "nl"] as const) {
    it(`asks to confirm before it cancels, and the confirm step has its own buttons, in ${locale}`, () => {
      const c = COPY[locale];
      const stap2 = text(locale, <StatusView status={status("BEZIG")} report={null} c={c} locale={locale} onWithdraw={() => {}} onWithdrawConfirm={() => {}} onWithdrawKeep={() => {}} confirming />);
      expect(stap2).toContain(c.withdrawConfirmLead);
      expect(stap2).toContain(c.withdrawConfirmButton);
      expect(stap2).toContain(c.withdrawKeep);
      expect(stap2).not.toContain(c.withdrawButton);
      const stap1 = text(locale, <StatusView status={status("BEZIG")} report={null} c={c} locale={locale} onWithdraw={() => {}} onWithdrawConfirm={() => {}} onWithdrawKeep={() => {}} />);
      expect(stap1).toContain(c.withdrawButton);
      expect(stap1).not.toContain(c.withdrawConfirmButton);
      for (const x of [c.withdrawConfirmLead, c.withdrawConfirmButton, c.withdrawKeep]) expect(x).not.toMatch(/[–—]/);
    });
  }
  it("says a failed part makes the report possibly incomplete, not refunded", () => {
    expect(COPY.en.partial).toMatch(/incomplete/);
    expect(COPY.nl.partial).toMatch(/onvolledig/);
    expect(COPY.en.refundRule).not.toMatch(/part of the scan failed/);
    expect(COPY.nl.refundRule).not.toMatch(/een deel van de scan mislukte/);
    expect(terms).not.toMatch(/if part of the scan failed or/);
    expect(terms).toMatch(/If part of the scan could not finish but the scan still read half of the code or more/);
    expect(termsNl).toMatch(/Kon een deel van de scan niet worden afgemaakt/);
  });
  it("shows the error line when the cancellation did not go through", () => {
    const t = text("en", <StatusView status={status("BETAALD")} report={null} c={COPY.en} locale="en" onWithdraw={() => {}} withdrawError />);
    expect(t).toContain(COPY.en.withdrawError);
  });
});

describe("the report", () => {
  it("shows every hypothesis as text and never as markup", () => {
    const evil = report([{ title: '<script>alert("x")</script>', severity: "High", file: "A.sol", function: "f()", description: "<img src=x onerror=alert(1)>", impact: "i", recommendation: "r", attackPath: "a", confidence: 0.456 }]);
    const html = render("en", <ReportView report={evil} c={COPY.en} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(readableText(html)).toContain("0.46 / 1");
    expect(readableText(html)).not.toContain("46%");
  });
  it("says so when nothing was found, and that the payment is refunded, in both languages", () => {
    for (const locale of ["en", "nl"] as const) {
      const t = text(locale, <ReportView report={report([])} c={COPY[locale]} />);
      expect(t).toContain(COPY[locale].nothingFound);
      expect(t).not.toContain(COPY[locale].hypothesisCount(0));
    }
  });
  it("says so when part of the code could not be read, and names the files it did not read", () => {
    const t = text("en", <ReportView report={report([{ title: "x" }], { volledig: false })} c={COPY.en} />);
    expect(t).toContain(COPY.en.partial);
    expect(t).toContain("src/IFoo.sol");
    expect(t).toContain("14 of 20 contract files read");
  });
  it("counts hypotheses with the right singular and plural", () => {
    expect(COPY.en.hypothesisCount(1)).toBe("1 hypothesis");
    expect(COPY.en.hypothesisCount(2)).toBe("2 hypotheses");
    expect(COPY.nl.hypothesisCount(1)).toBe("1 hypothese");
  });
  it("always carries the line that this is not an audit", () => {
    for (const locale of ["en", "nl"] as const) expect(text(locale, <ReportView report={report([{ title: "x" }])} c={COPY[locale]} />)).toMatch(locale === "nl" ? /geen audit/ : /not an audit/);
  });
});

describe("failureText", () => {
  it("turns the service's Dutch sentences and statuses into the reader's language", () => {
    for (const locale of ["en", "nl"] as const) {
      const c = COPY[locale];
      expect(failureText({ ok: false, status: 0, error: "network" }, c)).toBe(c.errors.network);
      expect(failureText({ ok: false, status: 429, error: "x" }, c)).toBe(c.errors.rate);
      expect(failureText({ ok: false, status: 503, error: "x" }, c)).toBe(c.errors.busy);
      expect(failureText({ ok: false, status: 422, error: "repository niet gevonden of niet openbaar" }, c)).toBe(c.errors.notFound);
      expect(failureText({ ok: false, status: 422, error: "repository is te groot voor een geautomatiseerde scan" }, c)).toBe(c.errors.tooBig);
      expect(failureText({ ok: false, status: 422, error: "geen Solidity in scope gevonden" }, c)).toBe(c.errors.noSolidity);
      expect(failureText({ ok: false, status: 500, error: "iets anders" }, c)).toBe(c.errors.generic);
    }
  });
});

describe("an unknown key", () => {
  it("has its own sentence in both languages and no long dashes", () => {
    for (const locale of ["en", "nl"] as const) {
      expect(COPY[locale].errors.unknownKey.length).toBeGreaterThan(20);
      expect(COPY[locale].errors.unknownKey).not.toMatch(/[–—]/);
    }
  });
});
