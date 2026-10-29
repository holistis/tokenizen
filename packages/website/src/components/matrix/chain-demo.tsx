import { useEffect, useMemo, useState } from "react";

// The one-metre view: a few lines, each carrying the hash of the line before it. Change one character and every line after it no longer
// matches what was sealed. The lines are made up for the demonstration and are not our log; the hashes are real SHA-256 computed in
// the browser (Web Crypto), so anyone can repeat the sum.

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const GENESIS = "0".repeat(64);

/** Hash of each line over the hash of the line before it (the first one over 64 zeros), as a chain. */
export async function chainHashes(lines: string[]): Promise<string[]> {
  const out: string[] = [];
  let previous = GENESIS;
  for (const line of lines) {
    previous = await sha256Hex(`${previous}\n${line}`);
    out.push(previous);
  }
  return out;
}

/** Index of the first line whose hash differs from the sealed one, or -1 when the chain still matches. */
export function firstBreak(sealed: string[], now: string[]): number {
  for (let i = 0; i < sealed.length; i++) if (sealed[i] !== now[i]) return i;
  return -1;
}

export const DEMO_LINES = [
  "example/repo-a 1 policy=visible",
  "example/repo-b 2 sbom=not_visible",
  "example/repo-c 3 licence=visible",
  "example/repo-d 4 pinned=not_measured",
];

const TEXT = {
  en: {
    title: "Change a character. Watch the chain break.",
    illustration: "Illustration with made-up lines, not our log. The hashes are real SHA-256, computed in your browser.",
    sealed: "sealed",
    changed: "changed",
    same: "matches the seal",
    broken: (n: number) => `Line ${n} changed, so line ${n} and every line after it no longer matches what was sealed.`,
    intact: "Every line still matches what was sealed.",
    reset: "Reset the lines",
    line: "Line",
  },
  nl: {
    title: "Verander een teken. Zie de keten breken.",
    illustration: "Voorbeeld met verzonnen regels, niet ons logboek. De hashes zijn echt SHA-256, in je eigen browser uitgerekend.",
    sealed: "verzegeld",
    changed: "veranderd",
    same: "komt overeen met het zegel",
    broken: (n: number) => `Regel ${n} is veranderd, dus regel ${n} en alle regels erna komen niet meer overeen met het zegel.`,
    intact: "Elke regel komt nog overeen met het zegel.",
    reset: "Zet de regels terug",
    line: "Regel",
  },
} as const;

export function ChainDemo({ locale }: { locale: "en" | "nl" }) {
  const T = TEXT[locale];
  const [lines, setLines] = useState<string[]>(DEMO_LINES);
  const [sealed, setSealed] = useState<string[]>([]);
  const [now, setNow] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    chainHashes(DEMO_LINES).then((h) => alive && setSealed(h));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    chainHashes(lines).then((h) => alive && setNow(h));
    return () => {
      alive = false;
    };
  }, [lines]);

  const broke = useMemo(() => (sealed.length && now.length ? firstBreak(sealed, now) : -1), [sealed, now]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h3 className="font-display text-2xl leading-tight sm:text-3xl">{T.title}</h3>
      <ol className="mt-5 space-y-3">
        {lines.map((line, i) => {
          const off = broke !== -1 && i >= broke;
          return (
            <li key={i} className="grid gap-2 sm:grid-cols-[1.5rem_1fr_15rem] sm:items-center">
              <span className="font-signage text-lg font-bold text-muted-foreground">{i + 1}</span>
              <label className="block">
                <span className="sr-only">
                  {T.line} {i + 1}
                </span>
                <input
                  value={line}
                  onChange={(e) => setLines((cur) => cur.map((l, j) => (j === i ? e.target.value : l)))}
                  spellCheck={false}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--altitude)]"
                />
              </label>
              <p className="break-all font-mono text-xs leading-snug">
                <span className="text-muted-foreground">{(now[i] ?? "").slice(0, 24)}</span>
                <span
                  className={off ? "ml-2 inline-flex items-center gap-1 text-rule-yellow" : "ml-2 inline-flex items-center gap-1 text-rule-green"}
                >
                  {/* Shape carries the meaning as well as colour: a ring for broken, a filled square for matching. */}
                  <svg viewBox="0 0 10 10" className="size-3" aria-hidden="true">
                    {off ? <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /> : <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />}
                  </svg>
                  {off ? T.changed : T.sealed}
                </span>
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-foreground" role="status">
        {broke === -1 ? T.intact : T.broken(broke + 1)}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">{T.illustration}</p>
        <button
          type="button"
          onClick={() => setLines(DEMO_LINES)}
          className="rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {T.reset}
        </button>
      </div>
    </div>
  );
}
