// deep-scan-logic.ts: the small pure parts of the deep scan pages (checking a repository name, showing a price, keeping the private key of a report in the
// browser). No network and no React here, so each part is tested on its own.

import type { Locale } from "@/i18n/context";

/** The version of the terms that the checkbox refers to. The server refuses a payment started with another version. */
export const TERMS_VERSION = "2026-11-01";
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

/** The key of a report: from the address after the # (that part never goes to a server), else from the browser's storage. Storage can be unavailable or empty. */
export function readToken(hash: string, storage: MinimalStorage | null): string | null {
  const fromHash = hash.replace(/^#/, "");
  if (TOKEN_RE.test(fromHash)) return fromHash;
  try {
    const stored = storage?.getItem(TOKEN_KEY) ?? null;
    return stored !== null && TOKEN_RE.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveToken(storage: MinimalStorage | null, token: string): boolean {
  if (!TOKEN_RE.test(token)) return false;
  try {
    storage?.setItem(TOKEN_KEY, token);
    return storage !== null;
  } catch {
    return false;
  }
}

export function forgetToken(storage: MinimalStorage | null): void {
  try {
    storage?.removeItem(TOKEN_KEY);
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

/** Polling stops when the order is in a state that does not change by itself (a refund still being made keeps it going). */
export function keepPolling(state: OrderState, refund: boolean, refunded: boolean): boolean {
  if (!FINAL_STATES.includes(state)) return true;
  return refund && !refunded && state !== "AFWIJKEND";
}
