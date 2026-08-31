/**
 * Kleine, dependency-vrije JSON-"highlighter". Geen syntax-highlight-library
 * nodig voor één statisch code-voorbeeld: dit tokeniseert met een enkele
 * regex en wijst kleuren toe via de bestaande design-tokens. Input komt
 * altijd uit onze eigen broncode (nooit user-input), dus de handmatige
 * escape hieronder is voldoende.
 */
function highlightJson(json: string): string {
  const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-primary"; // getallen
      if (/^"/.test(match)) {
        cls = /:\s*$/.test(match) ? "text-muted-foreground" : "text-rule-green";
      } else if (/^(true|false)$/.test(match)) {
        cls = "text-rule-green";
      } else if (match === "null") {
        cls = "text-muted-foreground";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

interface CodeBlockProps {
  label: string;
  code: string;
}

export function CodeBlock({ label, code }: CodeBlockProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2">
        <span className="size-2 rounded-full bg-rule-red/60" aria-hidden="true" />
        <span className="size-2 rounded-full bg-rule-yellow/60" aria-hidden="true" />
        <span className="size-2 rounded-full bg-rule-green/60" aria-hidden="true" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">{label}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-xs leading-relaxed md:text-[13px]">
        <code
          className="font-mono"
          // eslint-disable-next-line react/no-danger -- statische, zelf-gegenereerde code, geen user-input
          dangerouslySetInnerHTML={{ __html: highlightJson(code) }}
        />
      </pre>
    </div>
  );
}
