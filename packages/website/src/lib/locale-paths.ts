// Which language an address is in. English is the base: tokenizen.nl and every address without a prefix is English. Dutch lives under /nl.
// /en is the old address of the English pages (it is what the links from GitHub, the notes and the blog point at) and means English too;
// the host redirects it to the address without the prefix, and this file understands it for the cases where it is served as it is.

export type PathLocale = "nl" | "en";

export function parsePath(pathname: string): { locale: PathLocale; rest: string } {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [prefix, locale] of [
    ["/nl", "nl"],
    ["/en", "en"],
  ] as const) {
    if (path === prefix) return { locale, rest: "/" };
    if (path.startsWith(`${prefix}/`)) return { locale, rest: path.slice(prefix.length) };
  }
  return { locale: "en", rest: path };
}

/** The address of a page in a language. `rest` is the page without any language prefix, with an optional #anchor: "/", "/checks", "/tools#status". */
export function localePath(locale: PathLocale, rest: string): string {
  const r = rest.startsWith("/") ? rest : `/${rest}`;
  if (locale === "en") return r;
  return r === "/" ? "/nl" : `/nl${r}`;
}
