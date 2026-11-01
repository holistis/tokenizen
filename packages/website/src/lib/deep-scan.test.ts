import { describe, expect, it } from "vitest";

import { getQuote, getReport, getStatus, isStripeUrl, startCheckout } from "@/lib/deep-scan-api";
import { euros, forgetToken, keepPolling, normaliseRepo, privateLink, readToken, saveToken, TERMS_VERSION, TOKEN_KEY } from "@/lib/deep-scan-logic";

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
  it("comes from the address first, then from storage, and only in the right form", () => {
    const s = memory();
    saveToken(s, TOKEN);
    expect(s.m.get(TOKEN_KEY)).toBe(TOKEN);
    expect(readToken(`#${"B".repeat(43)}`, s)).toBe("B".repeat(43));
    expect(readToken("", s)).toBe(TOKEN);
    expect(readToken("#kort", s)).toBe(TOKEN);
    s.setItem(TOKEN_KEY, "../../x");
    expect(readToken("", s)).toBeNull();
    expect(readToken("", null)).toBeNull();
  });
  it("survives storage that is not available, and refuses a key of the wrong form", () => {
    expect(readToken("", throwing)).toBeNull();
    expect(saveToken(throwing, TOKEN)).toBe(false);
    expect(() => forgetToken(throwing)).not.toThrow();
    expect(saveToken(memory(), "nope")).toBe(false);
    const s = memory(); saveToken(s, TOKEN); forgetToken(s);
    expect(readToken("", s)).toBeNull();
  });
  it("puts the key after the # in the private link, in the language of the reader", () => {
    expect(privateLink("https://tokenizen.nl", "en", TOKEN)).toBe(`https://tokenizen.nl/scan/status#${TOKEN}`);
    expect(privateLink("https://tokenizen.nl", "nl", TOKEN)).toBe(`https://tokenizen.nl/nl/scan/status#${TOKEN}`);
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
    expect(keepPolling("AFWIJKEND", true, false)).toBe(false);
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
    await startCheckout(TOKEN, TERMS_VERSION, fakeFetch(200, { ok: true, url: "x" }, calls));
    await getQuote("owner/name", fakeFetch(200, { ok: true }, calls));
    expect(calls.map((c) => c.url.replace(/^https?:\/\/[^/]+/, ""))).toEqual(["/v1/status", "/v1/report", "/v1/checkout", "/v1/quote"]);
    for (const c of calls) {
      expect(c.init.method).toBe("POST");
      expect(c.url).not.toContain(TOKEN);
      expect(JSON.parse(String(c.init.body))).toBeTypeOf("object");
    }
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ token: TOKEN, akkoord: true, voorwaardenVersie: TERMS_VERSION });
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
