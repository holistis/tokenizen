import { useState } from "react";
import { Github, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/i18n/context";

const GITHUB_URL = "https://github.com/holistis/tokenizen";

// The nav hrefs are anchors on the homepage ("#product") or site paths ("/notes").
// On any other page a bare anchor points at that page itself, and a bare path
// drops an English reader onto the Dutch site. Resolve both against the reader's
// language and the homepage, so the menu works from the blog too.
export function resolveNavHref(href: string, locale: string, pathname?: string): string {
  const home = locale === "en" ? "/en" : "/";
  if (href.startsWith("#")) {
    const path = (pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname)).replace(/\/+$/, "") || "/";
    const onHome = path === "/" || path === "/en";
    return onHome ? href : `${home}${href}`;
  }
  if (href.startsWith("/")) return locale === "en" ? `/en${href}` : href;
  return href;
}

export function Header() {
  const { t, locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <a href={resolveNavHref("#top", locale)} className="flex items-baseline gap-2 font-display text-lg font-semibold tracking-tight">
          tokenizen
          <span className="hidden font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            .nl
          </span>
        </a>

        <nav aria-label={t.header.navLabel} className="hidden items-center gap-6 lg:flex">
          {t.header.links.map((link) => (
            <a
              key={link.href}
              href={resolveNavHref(link.href, locale)}
              className="font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              <Github className="size-3.5" aria-hidden="true" />
              {t.header.github}
            </a>
          </Button>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground lg:hidden"
            aria-label={menuOpen ? t.header.closeMenu : t.header.openMenu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label={t.header.mobileNavLabel} className="border-t border-border bg-background lg:hidden">
          <ul className="container flex flex-col gap-1 py-3">
            {t.header.links.map((link) => (
              <li key={link.href}>
                <a
                  href={resolveNavHref(link.href, locale)}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-2 py-2 font-mono text-sm uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 font-mono text-sm uppercase tracking-wide text-primary"
              >
                <Github className="size-3.5" aria-hidden="true" />
                {t.header.github}
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
