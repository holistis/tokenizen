// What a reader reads of a rendered page, for tests: the text between the tags. The tags are skipped by walking the characters, not by a pattern,
// and the few entities React writes are decoded in one pass, so nothing is unescaped twice.

const ENTITIES: Record<string, string> = { amp: "&", "#x27": "'", quot: '"', lt: "<", gt: ">", nbsp: " " };

export function readableText(html: string, options: { gap?: string; collapse?: boolean } = {}): string {
  const { gap = " ", collapse = true } = options;
  let text = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") {
      inTag = true;
      text += gap;
    } else if (ch === ">" && inTag) {
      inTag = false;
    } else if (!inTag) {
      text += ch;
    }
  }
  const decoded = text.replace(/&(amp|#x27|quot|lt|gt|nbsp);/g, (_match, name: string) => ENTITIES[name] ?? "");
  return collapse ? decoded.replace(/\s+/g, " ") : decoded;
}
