// deep-scan-logic.ts: the small pure parts of the deep scan pages (checking a repository name, showing a price, keeping the private key of a report in the
// browser). No network and no React here, so each part is tested on its own.

import type { Locale } from "@/i18n/context";

/** The version of the terms that the checkbox refers to. The server refuses a payment started with another version. */
export const TERMS_VERSION = "2026-11-01";
/** The sentence a customer ticks, per version of the terms and per language. An old version keeps its sentence here, so a confirmation of an old order shows what that customer saw. */
export const CONSENT: Record<string, Record<Locale, string>> = {
  "2026-11-01": {
    en: "I have read the terms of the deep scan and the privacy statement. I ask you to start the scan right after my payment, and I understand that if I am a consumer my right of withdrawal ends once the report is fully delivered.",
    nl: "Ik heb de voorwaarden van de diepe scan en de privacyverklaring gelezen. Ik vraag je de scan direct na mijn betaling te starten en ik begrijp dat, als ik consument ben, mijn herroepingsrecht eindigt zodra het rapport volledig is geleverd.",
  },
};
export const consentFor = (version: string | null | undefined, lang: Locale): string | null => (version ? CONSENT[version]?.[lang] ?? null : null);

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const TOKEN_KEY = "tokenizen.deepscan.token";

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;

/** owner/name or a github.com address, as owner/name. Anything else is null. */
export function normaliseRepo(input: string): string | null {
  if (typeof input !== "string" || input.length > 200) return null;
  let s = input.trim();
  const m = /^https:\/\/github\.com\/([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?\/?$/i.exec(s);
  if (m) s = `${m[1]}/${m[2]}`;
  if (!REPO_RE.test(s)) return null;
  const name = s.split("/")[1];
  if (name === "." || name === "..") return null;
  return s;
}

/** A price in euro cents as the reader's language writes it: € 75.84 or € 75,84. */
export function euros(cents: number, locale: Locale): string {
  if (!Number.isInteger(cents) || cents < 0) return "";
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-IE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MAX_SAVED = 10;
export interface SavedOrder { token: string; at: string }

/** The keys this browser saved at checkout, newest first. Storage can be unavailable, empty or hold something else: then the list is empty. */
export function savedOrders(storage: MinimalStorage | null): SavedOrder[] {
  try {
    const raw = storage?.getItem(TOKEN_KEY) ?? null;
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is SavedOrder => Boolean(x) && typeof x === "object" && TOKEN_RE.test(String((x as SavedOrder).token)) && typeof (x as SavedOrder).at === "string")
      .map((x) => ({ token: x.token, at: x.at.slice(0, 40) }))
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

/** The key of a report: from the address after the # (that part never goes to a server), else the newest saved one. */
export function readToken(hash: string, storage: MinimalStorage | null): string | null {
  const fromHash = hash.replace(/^#/, "");
  if (TOKEN_RE.test(fromHash)) return fromHash;
  return savedOrders(storage)[0]?.token ?? null;
}

/** Called when the reader goes to the payment page, not when a price is shown: a price nobody paid for leaves nothing behind. Keeps the newest ten. */
export function saveToken(storage: MinimalStorage | null, token: string, at: string = new Date().toISOString()): boolean {
  if (!TOKEN_RE.test(token) || storage === null) return false;
  try {
    const rest = savedOrders(storage).filter((o) => o.token !== token);
    storage.setItem(TOKEN_KEY, JSON.stringify([{ token, at }, ...rest].slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false;
  }
}

export function forgetToken(storage: MinimalStorage | null, token?: string): void {
  try {
    if (token === undefined) return storage?.removeItem(TOKEN_KEY);
    const rest = savedOrders(storage).filter((o) => o.token !== token);
    if (rest.length === 0) storage?.removeItem(TOKEN_KEY);
    else storage?.setItem(TOKEN_KEY, JSON.stringify(rest));
  } catch {
    /* nothing to forget */
  }
}

/** The address a reader can keep to open the report again. The key sits after the #, so it is not sent to any server when the page loads. */
export function privateLink(origin: string, locale: Locale, token: string): string {
  return `${origin}${locale === "nl" ? "/nl" : ""}/scan/status#${token}`;
}

export type OrderState = "OFFERTE" | "WACHT_OP_BETALING" | "BETAALD" | "BEZIG" | "KLAAR" | "MISLUKT" | "AFWIJKEND" | "VERLOPEN";
export const FINAL_STATES: readonly OrderState[] = ["KLAAR", "MISLUKT", "AFWIJKEND", "VERLOPEN"];

export interface ConfirmationInput {
  repo: string; lines: number; priceCents: number; paidAt: string | null; agreedAt: string | null; termsVersion: string | null; consent: string | null; locale: Locale;
}

/** The order confirmation a customer can keep: what was bought, for how much, when they agreed and to which sentence. Plain text, no markup. */
export function orderConfirmation(i: ConfirmationInput): string {
  const nl = i.locale === "nl";
  const when = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : nl ? "onbekend" : "unknown");
  return [
    nl ? "Bevestiging van je bestelling: diepe scan, tokenizen.nl" : "Confirmation of your order: deep scan, tokenizen.nl",
    "",
    `${nl ? "Repository" : "Repository"}: ${i.repo}`,
    `${nl ? "Regels Solidity in scope" : "Lines of Solidity in scope"}: ${i.lines}`,
    `${nl ? "Prijs (inclusief btw)" : "Price (VAT included)"}: ${euros(i.priceCents, i.locale)}`,
    `${nl ? "Betaald op (UTC)" : "Paid at (UTC)"}: ${when(i.paidAt)}`,
    `${nl ? "Akkoord gegeven op (UTC)" : "Agreement given at (UTC)"}: ${when(i.agreedAt)}`,
    `${nl ? "Versie van de voorwaarden" : "Version of the terms"}: ${i.termsVersion ?? (nl ? "onbekend" : "unknown")}`,
    "",
    nl ? "De zin waarmee je akkoord ging:" : "The sentence you agreed to:",
    i.consent ?? (nl ? `(De zin van versie ${i.termsVersion ?? "onbekend"} staat niet in deze pagina. Mail info@tokenizen.nl en we sturen hem.)` : `(The sentence of version ${i.termsVersion ?? "unknown"} is not on this page. Email info@tokenizen.nl and we will send it.)`),
    "",
    nl ? "Vragen: info@tokenizen.nl" : "Questions: info@tokenizen.nl",
    "",
  ].join("\n");
}

export interface ConfirmationStatus {
  repo: string; regels: number; prijsCenten: number; betaaldOp?: string | null; akkoordOp?: string | null; akkoordVersie?: string | null; akkoordTaal?: string | null;
}

/** The confirmation for a paid order, in the language the customer agreed in (the server keeps it), with the sentence of the version he agreed to. */
export function confirmationFor(status: ConfirmationStatus, viewerLocale: Locale): string {
  const lang: Locale = status.akkoordTaal === "nl" ? "nl" : status.akkoordTaal === "en" ? "en" : viewerLocale;
  return orderConfirmation({
    repo: status.repo, lines: status.regels, priceCents: status.prijsCenten, paidAt: status.betaaldOp ?? null, agreedAt: status.akkoordOp ?? null,
    termsVersion: status.akkoordVersie ?? null, consent: consentFor(status.akkoordVersie, lang), locale: lang,
  });
}

/** Polling stops when the order is in a state that does not change by itself (a refund still being made keeps it going). */
export function keepPolling(state: OrderState, refund: boolean, refunded: boolean): boolean {
  if (!FINAL_STATES.includes(state)) return true;
  return refund && !refunded && state !== "AFWIJKEND";
}
