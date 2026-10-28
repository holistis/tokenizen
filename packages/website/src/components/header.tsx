import { useEffect, useRef, useState } from "react";
import { ChevronDown, Github, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/i18n/context";
import type { NavLink } from "@/i18n/types";

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

/** The free tools, with their address resolved for the reader's language. Used by the dropdown and by the phone menu. */
export function checkLinks(checks: NavLink[], locale: string): NavLink[] {
  return checks.map((c) => ({ href: resolveNavHref(c.href, locale), label: c.label }));
}

// The full menu has eleven entries plus the free checks and does not fit next to the buttons
// below 1536 px: measured on the built site, the GitHub button stuck out of the screen at
// 1024, 1280 and 1440 px (in Dutch even at 1440 px) and three labels wrapped onto several
// lines. Below 2xl the hamburger takes over.
const NAV_LINK = "whitespace-nowrap font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground";

function ChecksDropdown({ label, items }: { label: string; items: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="checks-menu"
        onClick={() => setOpen((o) => !o)}
        className={`${NAV_LINK} inline-flex items-center gap-1`}
      >
        {label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <ul id="checks-menu" className="absolute left-0 top-full z-50 mt-3 w-72 rounded-md border border-border bg-background p-1 shadow-md">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="block rounded px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Header() {
  const { t, locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const checks = checkLinks(t.header.checks, locale);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <a href={resolveNavHref("#top", locale)} className="flex items-baseline gap-2 font-display text-lg font-semibold tracking-tight">
          tokenizen
          <span className="hidden font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            .nl
          </span>
        </a>

        <nav aria-label={t.header.navLabel} className="hidden items-center gap-6 2xl:flex">
          {t.header.links.map((link) => (
            <a key={link.href} href={resolveNavHref(link.href, locale)} className={NAV_LINK}>
              {link.label}
            </a>
          ))}
          <ChecksDropdown label={t.header.checksLabel} items={checks} />
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
            className="inline-flex size-11 items-center justify-center rounded-md border border-border text-foreground 2xl:hidden"
            aria-label={menuOpen ? t.header.closeMenu : t.header.openMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        // The menu hangs inside a sticky header, so the page behind it cannot be scrolled to reach what is cut off.
        // On a phone held sideways the list is taller than the screen: it scrolls itself.
        <nav
          id="mobile-menu"
          aria-label={t.header.mobileNavLabel}
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-border bg-background 2xl:hidden"
        >
          <ul className="container flex flex-col gap-1 py-3">
            {t.header.links.map((link) => (
              <li key={link.href}>
                <a
                  href={resolveNavHref(link.href, locale)}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-2 py-3 font-mono text-sm uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="mt-2 border-t border-border pt-3">
              <p className="px-2 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-primary">{t.header.checksLabel}</p>
              <ul className="flex flex-col gap-1">
                {checks.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="block rounded-md px-2 py-3 font-mono text-sm uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
            <li className="border-t border-border pt-1">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 flex items-center gap-2 rounded-md px-2 py-3 font-mono text-sm uppercase tracking-wide text-primary"
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
