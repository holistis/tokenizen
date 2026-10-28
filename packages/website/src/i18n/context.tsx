import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { nl } from "./nl";
import { en } from "./en";
import type { Dictionary } from "./types";
import { applyHeadPlan, headPlan } from "@/lib/page-head";

export type Locale = "nl" | "en";

const DICTIONARIES: Record<Locale, Dictionary> = { nl, en };

interface LocaleContextValue {
  locale: Locale;
  t: Dictionary;
  otherLocale: Locale;
  /** Bouwt de URL voor de andere taal, met behoud van pad en hash. */
  switchLocaleHref: () => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function localeFromPathname(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "nl";
}

/** Haalt het "/en"-prefix eraf zodat we het pad onder beide talen kunnen vergelijken. */
function stripLocalePrefix(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3);
  return pathname;
}

export function LocaleProvider({ children, locale: forcedLocale }: { children: ReactNode; locale?: Locale }) {
  // In the browser the locale comes from the path, which is what we want in
  // production. A caller may pass one explicitly instead, which is how tests
  // render a page in a chosen language: this suite runs with no DOM at all
  // (vitest environment "node"), so reading window.location would throw and the
  // page could never be asserted in either language.
  const locale = useMemo(
    () => forcedLocale ?? localeFromPathname(window.location.pathname),
    [forcedLocale],
  );
  const t = DICTIONARIES[locale];
  const otherLocale: Locale = locale === "nl" ? "en" : "nl";

  // Only what is true for every page: the language. The title, description and address of a page
  // belong to that page (see usePageHead); this effect runs after the page's own effect and used to
  // overwrite them with the homepage's.
  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.head.querySelector('meta[property="og:locale"]')?.setAttribute("content", t.meta.ogLocale);
  }, [t]);

  const switchLocaleHref = () => {
    const restOfPath = stripLocalePrefix(window.location.pathname);
    const prefix = otherLocale === "en" ? "/en" : "";
    const path = restOfPath === "/" ? prefix || "/" : `${prefix}${restOfPath}`;
    return `${path}${window.location.hash}`;
  };

  return (
    <LocaleContext.Provider value={{ locale, t, otherLocale, switchLocaleHref }}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale moet binnen een LocaleProvider gebruikt worden");
  return ctx;
}

/**
 * Called once by the app. `known` says whether the app has a page of its own for this path; any other
 * path shows the homepage. Every page gets its own canonical address, og:url and language alternates.
 * The title and descriptions are the homepage's only on the homepage: any other page sets its own,
 * and this effect, which runs after the page's, must leave them alone.
 */
export function usePageHead(known: boolean): void {
  const { t } = useLocale();

  useEffect(() => {
    applyHeadPlan(document, headPlan(window.location.origin, window.location.pathname, known));
    const setMeta = (selector: string, value: string) => document.head.querySelector(selector)?.setAttribute("content", value);

    if (known) {
      // The page has set its own title and description (its effect ran first). The sharing tags say the same.
      const description = document.head.querySelector('meta[name="description"]')?.getAttribute("content");
      setMeta('meta[property="og:title"]', document.title);
      setMeta('meta[name="twitter:title"]', document.title);
      if (description) {
        setMeta('meta[property="og:description"]', description);
        setMeta('meta[name="twitter:description"]', description);
      }
      return;
    }

    document.title = t.meta.title;
    setMeta('meta[name="description"]', t.meta.description);
    setMeta('meta[property="og:title"]', t.meta.ogTitle);
    setMeta('meta[property="og:description"]', t.meta.ogDescription);
    setMeta('meta[name="twitter:title"]', t.meta.twitterTitle);
    setMeta('meta[name="twitter:description"]', t.meta.twitterDescription);
  }, [known, t]);
}
