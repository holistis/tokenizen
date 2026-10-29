import { Mail } from "lucide-react";

import { Portrait } from "@/components/portrait";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, HOME, type Locale } from "@/data/home-copy";

/** The two people behind the company. It lives on the About page; the homepage is about what we do, not about who we are. */
export function Brothers({ locale, level = 2 }: { locale: Locale; level?: 1 | 2 }) {
  const c = HOME[locale].brothers;
  const Heading = level === 1 ? "h1" : "h2";
  const people = [c.abdellah, c.ahmed];
  return (
    <section id="wie" aria-label={c.heading} className="scroll-mt-16 border-t border-border py-16 md:py-24">
      <div className="container">
        <Heading className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl md:text-5xl">{c.heading}</Heading>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{c.body}</p>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:max-w-4xl">
          {people.map((p) => (
            <li key={p.name}>
              <Portrait name={p.name} />
              <h3 className="mt-4 font-display text-2xl">{p.name}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-wide text-[color:var(--altitude)]">{p.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.line}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <Mail className="size-4" aria-hidden="true" />
              {c.contact}
            </a>
          </Button>
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            AO Services · Eindhoven · KvK 86816632 · {CONTACT_EMAIL}
          </p>
        </div>
      </div>
    </section>
  );
}
