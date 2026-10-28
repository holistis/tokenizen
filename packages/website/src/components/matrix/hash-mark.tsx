import { cellPath, hashMarkCells } from "@/lib/hash-mark";
import { cn } from "@/lib/utils";

/** The pattern made from a text. Decorative: it carries no meaning, so it is hidden from screen readers. */
export function HashMark({ seed, className }: { seed: string; className?: string }) {
  const cells = hashMarkCells(seed);
  const s = 10;
  const d = cells
    .flatMap((row, r) => row.map((kind, c) => cellPath(kind, c * s, r * s, s)))
    .filter(Boolean)
    .join("");
  return (
    <svg viewBox={`0 0 ${cells.length * s} ${cells.length * s}`} aria-hidden="true" focusable="false" className={cn("block h-auto w-full", className)}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}
