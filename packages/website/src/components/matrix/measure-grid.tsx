import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  BENCHMARK_DATE,
  BENCHMARK_NOTE_PATH,
  BENCHMARK_REPOSITORIES,
  BENCHMARK_RULES,
  BENCHMARK_SIGNALS,
  type BenchmarkSignal,
} from "@/data/cra-benchmark";

// Eight small grids, one per signal. Every grid has 110 places: one square per measured repository (109) and one empty place that is
// yours. Inside a grid the squares are sorted by result, so the picture shows how many, not which. The same place in two grids is not
// the same repository. The counts come from data/cra-benchmark.ts and nowhere else.

const COLS = 10;
const PITCH = 10;

export type CellKind = "visible" | "hidden" | "none" | "you";

/** The cells of one grid in drawing order: visible, then not visible, then not measured, then the empty place for the reader. */
export function gridCells(s: BenchmarkSignal): CellKind[] {
  return [
    ...Array<CellKind>(s.visible).fill("visible"),
    ...Array<CellKind>(s.notVisible).fill("hidden"),
    ...Array<CellKind>(s.notMeasured).fill("none"),
    "you",
  ];
}

/** Share of the measured repositories (visible plus not visible) in which the signal was visible, rounded to a whole percent. */
export function visibleShare(s: BenchmarkSignal): number {
  return Math.round((s.visible / (s.visible + s.notVisible)) * 100);
}

export type GridLocale = "en" | "nl";

const LABELS: Record<GridLocale, Record<string, string>> = {
  en: {
    visible: "visible",
    hidden: "not visible",
    none: "not measured",
    you: "your repository, not in the measurement",
    of: "of",
    measured: "measured",
    caption: "One square is one repository, sorted by result inside each grid. The same place in two grids is not the same repository.",
    stamp: "Measured",
    rules: "rule set",
    read: "Read the note with the method",
    table: "Show as a table",
    signal: "Signal",
    total: "Repositories",
  },
  nl: {
    visible: "zichtbaar",
    hidden: "niet zichtbaar",
    none: "niet gemeten",
    you: "jouw repository, niet in de meting",
    of: "van",
    measured: "gemeten",
    caption: "Een vierkant is een repository, per raster gesorteerd op uitkomst. Dezelfde plek in twee rasters is niet dezelfde repository.",
    stamp: "Gemeten op",
    rules: "regelversie",
    read: "Lees de notitie met de methode",
    table: "Toon als tabel",
    signal: "Signaal",
    total: "Repositories",
  },
};

function useArmedOnView() {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return; // without it the grid simply stays visible
    setArmed(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, armed, seen };
}

function Cell({ kind, i }: { kind: CellKind; i: number }) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * PITCH + 1.5;
  const y = row * PITCH + 1.5;
  // The animation delay grows with the index but stops at 900 ms for the last cell, so a whole grid has arrived within a second.
  const style = { "--i": Math.min(i, 112) } as CSSProperties;
  if (kind === "visible") return <rect className="cell cell-visible" style={style} x={x} y={y} width={7} height={7} rx={1} />;
  if (kind === "hidden") return <rect className="cell cell-hidden" style={style} x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1} />;
  if (kind === "none") return <line className="cell cell-none" style={style} x1={x + 0.5} y1={y + 3.5} x2={x + 6.5} y2={y + 3.5} />;
  return <rect className="cell cell-you" style={style} x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1} />;
}

function Legend({ locale }: { locale: GridLocale }) {
  const L = LABELS[locale];
  const items: Array<[CellKind, string]> = [
    ["visible", L.visible],
    ["hidden", L.hidden],
    ["none", L.none],
    ["you", L.you],
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-muted-foreground">
      {items.map(([kind, label]) => (
        <li key={kind} className="inline-flex items-center gap-2">
          <svg viewBox="0 0 10 10" className="size-3.5" aria-hidden="true">
            <Cell kind={kind} i={0} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

export function MeasureGrid({ signal, locale }: { signal: BenchmarkSignal; locale: GridLocale }) {
  const L = LABELS[locale];
  const { ref, armed, seen } = useArmedOnView();
  const cells = gridCells(signal);
  const measured = signal.visible + signal.notVisible;
  const name = locale === "nl" ? signal.nl : signal.en;
  const summary = `${name}: ${signal.visible} ${L.visible}, ${signal.notVisible} ${L.hidden}, ${signal.notMeasured} ${L.none}, ${L.of} ${BENCHMARK_REPOSITORIES}`;
  return (
    <figure ref={ref} className="grid-wave m-0" data-armed={armed} data-in={seen}>
      <svg viewBox={`0 0 ${COLS * PITCH} ${Math.ceil(cells.length / COLS) * PITCH}`} role="img" aria-label={summary} className="h-auto w-full">
        {cells.map((kind, i) => (
          <Cell key={i} kind={kind} i={i} />
        ))}
      </svg>
      <figcaption className="mt-3">
        <span className="block font-mono text-xs uppercase tracking-wide text-foreground">{name}</span>
        <span className="mt-1 block font-signage text-2xl font-bold leading-none text-foreground">
          {signal.visible} <span className="font-mono text-xs font-normal text-muted-foreground">{L.of} {measured} {L.measured} ({visibleShare(signal)}%)</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function MeasureGrids({ locale }: { locale: GridLocale }) {
  const L = LABELS[locale];
  const noteHref = `/en${BENCHMARK_NOTE_PATH}`;
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
        {BENCHMARK_SIGNALS.map((s) => (
          <MeasureGrid key={s.key} signal={s} locale={locale} />
        ))}
      </div>
      <div className="mt-8 space-y-3">
        <Legend locale={locale} />
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{L.caption}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {L.stamp} {BENCHMARK_DATE}, {BENCHMARK_REPOSITORIES} repositories, {L.rules} {BENCHMARK_RULES}.{" "}
          <a href={noteHref} className="underline underline-offset-2 hover:text-foreground">
            {L.read}
          </a>
        </p>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide hover:text-foreground">{L.table}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">{L.signal}</th>
                  <th className="py-2 pr-4 font-medium">{L.visible}</th>
                  <th className="py-2 pr-4 font-medium">{L.hidden}</th>
                  <th className="py-2 font-medium">{L.none}</th>
                </tr>
              </thead>
              <tbody>
                {BENCHMARK_SIGNALS.map((s) => (
                  <tr key={s.key} className="border-b border-border/60">
                    <th scope="row" className="py-2 pr-4 font-normal text-foreground">
                      {locale === "nl" ? s.nl : s.en}
                    </th>
                    <td className="py-2 pr-4">{s.visible}</td>
                    <td className="py-2 pr-4">{s.notVisible}</td>
                    <td className="py-2">{s.notMeasured}</td>
                  </tr>
                ))}
              </tbody>
              <caption className="mt-2 text-left text-muted-foreground">
                {L.total}: {BENCHMARK_REPOSITORIES}
              </caption>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
