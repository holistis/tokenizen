import { describe, expect, it } from "vitest";

import { getQuote, getReport, getStatus, isStripeUrl, startCheckout } from "@/lib/deep-scan-api";
import { CONSENT, confirmationFor, consentFor, euros, forgetToken, keepPolling, MAX_SAVED, normaliseRepo, orderConfirmation, privateLink, readToken, savedOrders, saveToken, TERMS_VERSION, TOKEN_KEY } from "@/lib/deep-scan-logic";

const TOKEN = "A".repeat(43);
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };

describe("normaliseRepo", () => {
  it("accepts owner/name and github addresses and returns owner/name", () => {
    expect(normaliseRepo("owner/name")).toBe("owner/name");
    expect(normaliseRepo("  https://github.com/Owner/Name.git ")).toBe("Owner/Name");
    expect(normaliseRepo("https://github.com/owner/name/")).toBe("owner/name");
  });
  it("refuses everything else", () => {
    for (const x of ["", "a", "../etc", "a/b c", "a/..", "http://github.com/a/b", "https://evil.example/a/b", "https://github.com/a/b/c/d", "a/b;rm", "x".repeat(300)]) expect(normaliseRepo(x), x).toBeNull();
  });
});

describe("euros", () => {
  it("writes a price the way the reader's language does", () => {
    expect(euros(7584, "en").replace(/\s/g, " ")).toBe("€75.84");
    expect(euros(7584, "nl").replace(/\s/g, " ")).toBe("€ 75,84");
    expect(euros(200, "en")).toBe("€2.00");
  });
  it("gives nothing for a wrong amount", () => {
    for (const x of [-1, 1.5, NaN, Infinity]) expect(euros(x as number, "en")).toBe("");
  });
});

describe("the private key of a report", () => {
  it("comes from the address first, then from the newest saved key, and only in the right form", () => {
    const s = memory();
    saveToken(s, TOKEN, "2026-11-01T10:00:00.000Z");
    expect(readToken(`#${"B".repeat(43)}`, s)).toBe("B".repeat(43));
    expect(readToken("", s)).toBe(TOKEN);
    expect(readToken("#kort", s)).toBe(TOKEN);
    s.setItem(TOKEN_KEY, "../../x");
    expect(readToken("", s)).toBeNull();
    s.setItem(TOKEN_KEY, JSON.stringify([{ token: "../../x", at: "z" }, { token: 5, at: "z" }, null]));
    expect(readToken("", s)).toBeNull();
    expect(readToken("", null)).toBeNull();
  });
  it("keeps a list: a second order does not push out the first, the newest is read, the same key is not saved twice, and the list stops at ten", () => {
    const s = memory();
    const keys = Array.from({ length: MAX_SAVED + 3 }, (_, i) => String.fromCharCode(65 + i).repeat(43));
    keys.slice(0, 2).forEach((k, i) => saveToken(s, k, `2026-11-01T10:0${i}:00.000Z`));
    expect(savedOrders(s).map((o) => o.token)).toEqual([keys[1], keys[0]]);
    expect(readToken("", s)).toBe(keys[1]);
    saveToken(s, keys[0], "2026-11-01T11:00:00.000Z");
    expect(savedOrders(s).map((o) => o.token)).toEqual([keys[0], keys[1]]);
    keys.slice(2).forEach((k) => saveToken(s, k));
    expect(savedOrders(s)).toHaveLength(MAX_SAVED);
    expect(savedOrders(s)[0].token).toBe(keys[keys.length - 1]);
  });
  it("forgets one key or all of them", () => {
    const s = memory();
    saveToken(s, TOKEN); saveToken(s, "B".repeat(43));
    forgetToken(s, "B".repeat(43));
    expect(savedOrders(s).map((o) => o.token)).toEqual([TOKEN]);
    forgetToken(s, TOKEN);
    expect(s.m.has(TOKEN_KEY)).toBe(false);
    saveToken(s, TOKEN); saveToken(s, "B".repeat(43));
    forgetToken(s);
    expect(savedOrders(s)).toEqual([]);
  });
  it("survives storage that is not available, and refuses a key of the wrong form", () => {
    expect(readToken("", throwing)).toBeNull();
    expect(saveToken(throwing, TOKEN)).toBe(false);
    expect(() => forgetToken(throwing)).not.toThrow();
    expect(saveToken(memory(), "nope")).toBe(false);
    expect(saveToken(null, TOKEN)).toBe(false);
  });
  it("puts the key after the # in the private link, in the language of the reader", () => {
    expect(privateLink("https://tokenizen.nl", "en", TOKEN)).toBe(`https://tokenizen.nl/scan/status#${TOKEN}`);
    expect(privateLink("https://tokenizen.nl", "nl", TOKEN)).toBe(`https://tokenizen.nl/nl/scan/status#${TOKEN}`);
  });
});

describe("the order confirmation", () => {
  const base = { repo: "owner/name", lines: 3792, priceCents: 7584, paidAt: "2026-11-01T12:30:00.000Z", agreedAt: "2026-11-01T12:29:10.000Z", termsVersion: "2026-11-01", consent: "I agree.", locale: "en" as const };
  it("names what was bought, the price, both times, the version of the terms and the sentence agreed to", () => {
    const t = orderConfirmation(base);
    for (const x of ["owner/name", "3792", "€75.84", "2026-11-01T12:30:00.000Z", "2026-11-01T12:29:10.000Z", "Version of the terms: 2026-11-01", "I agree."]) expect(t, x).toContain(x);
    expect(t).not.toMatch(/[–—]/);
  });
  it("is in the reader's language and says so when a time is missing or wrong", () => {
    const t = orderConfirmation({ ...base, locale: "nl", paidAt: null, agreedAt: "geen datum", termsVersion: null });
    expect(t).toContain("Betaald op (UTC): onbekend");
    expect(t).toContain("Akkoord gegeven op (UTC): onbekend");
    expect(t).toContain("Versie van de voorwaarden: onbekend");
    expect(t.replace(/\s/g, " ")).toContain("€ 75,84");
  });
});

describe("the confirmation of a paid order", () => {
  const status = { repo: "owner/name", regels: 410, prijsCenten: 820, betaaldOp: "2026-11-01T12:30:00.000Z", akkoordOp: "2026-11-01T12:29:00.000Z", akkoordVersie: "2026-11-01", akkoordTaal: "en" };
  it("uses the language the customer agreed in, not the language the page is shown in now", () => {
    const t = confirmationFor({ ...status, akkoordTaal: "en" }, "nl");
    expect(t).toContain("Confirmation of your order");
    expect(t).toContain(CONSENT["2026-11-01"].en);
    expect(t).not.toContain(CONSENT["2026-11-01"].nl);
    const n = confirmationFor({ ...status, akkoordTaal: "nl" }, "en");
    expect(n).toContain("Bevestiging van je bestelling");
    expect(n).toContain(CONSENT["2026-11-01"].nl);
  });
  it("falls back to the language of the page when the server has none, and says so honestly when it does not hold the sentence of that version", () => {
    expect(confirmationFor({ ...status, akkoordTaal: null }, "nl")).toContain("Bevestiging van je bestelling");
    const old = confirmationFor({ ...status, akkoordVersie: "2020-01-01" }, "en");
    expect(old).toContain("The sentence of version 2020-01-01 is not on this page");
    expect(old).not.toContain(CONSENT["2026-11-01"].en);
    expect(consentFor(null, "en")).toBeNull();
    expect(consentFor("2026-11-01", "en")).toBe(CONSENT["2026-11-01"].en);
  });
});

describe("keepPolling", () => {
  it("goes on until the order is final and a refund is made", () => {
    expect(keepPolling("BEZIG", false, false)).toBe(true);
    expect(keepPolling("WACHT_OP_BETALING", false, false)).toBe(true);
    expect(keepPolling("KLAAR", false, false)).toBe(false);
    expect(keepPolling("KLAAR", true, false)).toBe(true);
    expect(keepPolling("KLAAR", true, true)).toBe(false);
    expect(keepPolling("MISLUKT", true, false)).toBe(true);
    expect(keepPolling("AFWIJKEND", true, false)).toBe(true);
    expect(keepPolling("AFWIJKEND", true, true)).toBe(false);
    expect(keepPolling("AFWIJKEND", false, false)).toBe(false);
    expect(keepPolling("VERLOPEN", false, false)).toBe(false);
  });
});

function fakeFetch(status: number, body: unknown, calls: Array<{ url: string; init: RequestInit }> = []) {
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => { if (body === undefined) throw new Error("no json"); return body; } } as Response;
  }) as unknown as typeof fetch;
  return f;
}

describe("the calls to the scan service", () => {
  it("every call is a POST with a JSON body, and the key is never in the address", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    await getStatus(TOKEN, fakeFetch(200, { ok: true }, calls));
    await getReport(TOKEN, fakeFetch(200, { ok: true }, calls));
    await startCheckout(TOKEN, TERMS_VERSION, "nl", fakeFetch(200, { ok: true, url: "x" }, calls));
    await getQuote("owner/name", fakeFetch(200, { ok: true }, calls));
    expect(calls.map((c) => c.url.replace(/^https?:\/\/[^/]+/, ""))).toEqual(["/v1/status", "/v1/report", "/v1/checkout", "/v1/quote"]);
    for (const c of calls) {
      expect(c.init.method).toBe("POST");
      expect(c.url).not.toContain(TOKEN);
      expect(JSON.parse(String(c.init.body))).toBeTypeOf("object");
    }
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ token: TOKEN, akkoord: true, voorwaardenVersie: TERMS_VERSION, taal: "nl" });
  });
  it("turns a refusal, a broken answer and a lost connection into a failure with a status", async () => {
    expect(await getQuote("a/b", fakeFetch(422, { ok: false, fout: "repository niet gevonden of niet openbaar" }))).toEqual({ ok: false, status: 422, error: "repository niet gevonden of niet openbaar" });
    expect(await getQuote("a/b", fakeFetch(500, undefined))).toEqual({ ok: false, status: 500, error: "unknown" });
    expect(await getQuote("a/b", fakeFetch(200, { hallo: 1 }))).toMatchObject({ ok: false });
    const lost = (async () => { throw new TypeError("failed to fetch"); }) as unknown as typeof fetch;
    expect(await getStatus(TOKEN, lost)).toEqual({ ok: false, status: 0, error: "network" });
  });
});

describe("isStripeUrl", () => {
  it("follows only https addresses on stripe.com", () => {
    expect(isStripeUrl("https://checkout.stripe.com/c/pay/cs_test_abc")).toBe(true);
    for (const x of ["http://checkout.stripe.com/x", "https://evilstripe.com/x", "https://stripe.com.evil.example/x", "javascript:alert(1)", "//stripe.com/x", "", null, undefined, 5]) expect(isStripeUrl(x), String(x)).toBe(false);
  });
});
