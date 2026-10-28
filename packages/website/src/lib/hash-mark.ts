// A small unique pattern made from a piece of text, for covers and portraits that have no photo. It is decoration. It is not a hash of
// anything meaningful and the site never presents it as proof. Same text, same pattern; a different text, almost always another one.

/** 53-bit string hash (cyrb53). Fast and well mixed; chosen because the pattern needs to look different per title, not to be secure. */
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function stream(seed: string): () => number {
  let a = cyrb53(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 is an empty cell; 1 to 4 are a quarter circle in the top-left, top-right, bottom-right or bottom-left corner. */
export type MarkCell = 0 | 1 | 2 | 3 | 4;

const MIRROR: Record<MarkCell, MarkCell> = { 0: 0, 1: 2, 2: 1, 3: 4, 4: 3 };

/** A 6 by 6 pattern, mirrored left to right. */
export function hashMarkCells(seed: string, size = 6): MarkCell[][] {
  const next = stream(seed);
  const half = Math.ceil(size / 2);
  const rows: MarkCell[][] = [];
  for (let r = 0; r < size; r++) {
    const left: MarkCell[] = [];
    for (let c = 0; c < half; c++) {
      const v = next();
      left.push(v < 0.22 ? 0 : ((1 + Math.floor((v - 0.22) / 0.78 * 4)) as MarkCell));
    }
    const right = left.slice(0, size - half).reverse().map((k) => MIRROR[k]);
    rows.push([...left, ...right]);
  }
  return rows;
}

/** The SVG path of one cell of size s at (x, y). */
export function cellPath(kind: MarkCell, x: number, y: number, s: number): string {
  switch (kind) {
    case 1:
      return `M${x} ${y}h${s}a${s} ${s} 0 0 1 -${s} ${s}z`;
    case 2:
      return `M${x + s} ${y}v${s}a${s} ${s} 0 0 1 -${s} -${s}z`;
    case 3:
      return `M${x + s} ${y + s}h-${s}a${s} ${s} 0 0 1 ${s} -${s}z`;
    case 4:
      return `M${x} ${y + s}v-${s}a${s} ${s} 0 0 1 ${s} ${s}z`;
    default:
      return "";
  }
}
