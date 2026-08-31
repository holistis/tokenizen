import { useState } from "react";
import { Github, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const GITHUB_URL = "https://github.com/holistis/tokenizen";

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "#probleem", label: "Probleem" },
  { href: "#waarom-nu", label: "Waarom nu" },
  { href: "#product", label: "Product" },
  { href: "#hoe-het-werkt", label: "Hoe het werkt" },
  { href: "#halal-lijn", label: "Halal-lijn" },
  { href: "#open-source", label: "Open source" },
  { href: "#status", label: "Status" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-baseline gap-2 font-display text-lg font-semibold tracking-tight">
          tokenizen
          <span className="hidden font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            .nl
          </span>
        </a>

        <nav aria-label="Hoofdnavigatie" className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              <Github className="size-3.5" aria-hidden="true" />
              GitHub
            </a>
          </Button>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground lg:hidden"
            aria-label={menuOpen ? "Sluit menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label="Mobiele navigatie" className="border-t border-border bg-background lg:hidden">
          <ul className="container flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
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
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
