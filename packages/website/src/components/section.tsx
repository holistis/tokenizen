import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  index: string;
  eyebrow: string;
  children: ReactNode;
  className?: string;
}

/**
 * Doorlopend rapport-devies: elke sectie krijgt een genummerde fase-marker
 * in de kantlijn (00, 01, 02, ...), net als een vervolgparagraaf in een
 * doorlopend document. Op mobiel schuift de marker boven de kop.
 */
export function Section({ id, index, eyebrow, children, className }: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-16 border-t border-border py-16 md:py-24", className)}>
      <div className="container">
        <div className="md:grid md:grid-cols-[4.5rem_1fr] md:gap-8 lg:grid-cols-[5.5rem_1fr]">
          <div aria-hidden="true" className="mb-4 font-mono text-sm text-muted-foreground md:mb-0 md:pt-1">
            {index}
          </div>
          <div>
            <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.15em] text-primary">{eyebrow}</p>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
