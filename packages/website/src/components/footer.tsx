import { Github, Mail } from "lucide-react";

import { useLocale } from "@/i18n/context";
import { resolveNavHref } from "@/components/header";

const GITHUB_URL = "https://github.com/holistis/tokenizen";
const MAINTAINER_URL = "https://github.com/holistis";
const CONTACT_EMAIL = "info@tokenizen.nl";
// The trader behind the paid service, shown on every page (a webshop must show it). The same data is in the terms and the privacy statement.
export const BUSINESS_LINE = "AO Services · KvK 86816632 · BTW NL004319767B61 · Lochemstraat 49, 5651 EL Eindhoven";

// The three coloured dots explain the coloured rules in the "limits" section of
// the homepage. On any other page (the blog, the self-check) there is no such
// section, so the legend there is a row of dots that explains nothing.
export function showsRuleLegend(pathname?: string): boolean {
  const path = (pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname)).replace(/\/+$/, "") || "/";
  return path === "/" || path === "/en";
}

export function Footer() {
  const { t, locale } = useLocale();
  const legend = showsRuleLegend();

  return (
    <footer id="contact" className="scroll-mt-16 border-t border-border py-12">
      <div className="container flex flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">tokenizen</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{t.footer.tagline}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {t.footer.maintainedBy}{" "}
              <a
                href={MAINTAINER_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="text-foreground underline-offset-2 hover:underline"
              >
                holistis
              </a>
            </p>
          </div>

          <div className="flex flex-col gap-3 font-mono text-sm">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 text-foreground hover:text-primary"
            >
              <Mail className="size-4" aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 text-foreground hover:text-primary"
            >
              <Github className="size-4" aria-hidden="true" />
              {t.footer.githubLabel}
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-xs text-muted-foreground">{t.footer.copyright}</p>
            <p className="break-words font-mono text-xs text-muted-foreground" data-testid="business-line">{BUSINESS_LINE}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
              {[
                { href: "/signal-log", label: t.footer.signalLogLabel },
                { href: "/terms", label: t.footer.termsLabel },
                { href: "/privacy", label: t.footer.privacyLabel },
              ].map((l) => (
                <a key={l.href} href={resolveNavHref(l.href, locale)} className="text-foreground underline-offset-2 hover:underline">
                  {l.label}
                </a>
              ))}
            </p>
          </div>

          {legend ? (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {t.footer.legend.map((item) => (
                <li key={item.label} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className={`size-2 rounded-full ${item.dot}`} aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
