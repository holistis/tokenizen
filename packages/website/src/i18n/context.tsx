import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { nl } from "./nl";
import { en } from "./en";
import type { Dictionary } from "./types";

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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useMemo(() => localeFromPathname(window.location.pathname), []);
  const t = DICTIONARIES[locale];
  const otherLocale: Locale = locale === "nl" ? "en" : "nl";

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.title = t.meta.title;

    const setMeta = (selector: string, attr: string, value: string) => {
      const el = document.head.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", t.meta.description);
    setMeta('meta[property="og:locale"]', "content", t.meta.ogLocale);
    setMeta('meta[property="og:title"]', "content", t.meta.ogTitle);
    setMeta('meta[property="og:description"]', "content", t.meta.ogDescription);
    setMeta('meta[property="og:url"]', "content", window.location.origin + (locale === "en" ? "/en" : "/"));
    setMeta('meta[name="twitter:title"]', "content", t.meta.twitterTitle);
    setMeta('meta[name="twitter:description"]', "content", t.meta.twitterDescription);

    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", window.location.origin + (locale === "en" ? "/en" : "/") + "");
  }, [locale, t]);

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
