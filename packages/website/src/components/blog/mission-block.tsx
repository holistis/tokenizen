import { MISSION } from "@/data/blog-posts";

// The mission, shown at the top of the blog index and at the end of every post,
// so a reader who lands on any single page sees what the work is for.
export function MissionBlock() {
  return (
    <aside
      aria-label={MISSION.eyebrow}
      className="mt-12 rounded-lg border border-border bg-muted/40 p-6 md:p-8"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{MISSION.eyebrow}</p>
      <p className="mt-3 font-display text-xl font-semibold leading-snug tracking-tight md:text-2xl">
        {MISSION.headline}
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{MISSION.text}</p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        {MISSION.promises.map((promise) => (
          <div key={promise.name}>
            <dt className="font-mono text-xs uppercase tracking-wide text-primary">{promise.name}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{promise.text}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
