import { Github, Mail } from "lucide-react";

import { useLocale } from "@/i18n/context";

const GITHUB_URL = "https://github.com/holistis/tokenizen";
const CONTACT_EMAIL = "info@tokenizen.nl";

export function Footer() {
  const { t } = useLocale();

  return (
    <footer id="contact" className="scroll-mt-16 border-t border-border py-12">
      <div className="container flex flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">tokenizen</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{t.footer.tagline}</p>
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
          <p className="font-mono text-xs text-muted-foreground">{t.footer.copyright}</p>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {t.footer.legend.map((item) => (
              <li key={item.label} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span className={`size-2 rounded-full ${item.dot}`} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
