// One mark per known finding of the sealed run: a filled square for each one the scan found, a ring for each one it missed.
// The numbers are those of the published note about version 3.1 (8 of 105). Shape carries the meaning, not only colour.

const COLS = 21;
const PITCH = 10;

export const SCAN_FOUND = 8;
export const SCAN_KNOWN = 105;

export function MissStrip({ found = SCAN_FOUND, known = SCAN_KNOWN, label }: { found?: number; known?: number; label: string }) {
  const rows = Math.ceil(known / COLS);
  return (
    <svg viewBox={`0 0 ${COLS * PITCH} ${rows * PITCH}`} role="img" aria-label={label} className="h-auto w-full max-w-xl">
      {Array.from({ length: known }, (_, i) => {
        const x = (i % COLS) * PITCH + 1.5;
        const y = Math.floor(i / COLS) * PITCH + 1.5;
        return i < found ? (
          <rect key={i} className="cell-visible" x={x} y={y} width={7} height={7} rx={1} />
        ) : (
          <rect key={i} className="cell-hidden" x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1} />
        );
      })}
    </svg>
  );
}
