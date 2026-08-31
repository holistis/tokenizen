import { Github, Mail } from "lucide-react";

const GITHUB_URL = "https://github.com/holistis/tokenizen";
const CONTACT_EMAIL = "info@holistischadviseur.nl";

const LEGEND: Array<{ dot: string; label: string }> = [
  { dot: "bg-halal-green", label: "wel: bouwen we" },
  { dot: "bg-halal-yellow", label: "met guardrail" },
  { dot: "bg-halal-red", label: "nooit, hardcoded uitgesloten" },
];

export function Footer() {
  return (
    <footer id="contact" className="scroll-mt-16 border-t border-border py-12">
      <div className="container flex flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">tokenizen</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Open-source infrastructuur voor de verkoperskant van de AI-agent-economie. Nieuw, in actieve
              ontwikkeling, halal-getoetst.
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
              github.com/holistis/tokenizen
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-muted-foreground">© 2026 tokenizen. Open source, MIT-licentie.</p>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGEND.map((item) => (
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
