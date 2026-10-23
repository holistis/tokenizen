// markdown-lite.tsx — just enough markdown for the notes, and nothing more.
//
// The first article on this site was hand-converted to JSX. That is fine once
// and wrong twice: every future piece would cost the same conversion, and a
// hand-conversion is where a typo silently changes a quoted command. This takes
// the article text as written and renders the handful of constructs the notes
// actually use: headings, paragraphs, flat bullet lists, fenced code, inline
// code, links.
//
// Deliberately not a markdown parser. No tables, no images, no nested lists, no
// emphasis. If a note needs one of those, add it here with a test rather than
// reaching for a dependency that brings a parser and its own escaping rules.

import type { JSX } from "react";

function renderInline(text: string, keyPrefix: string): Array<JSX.Element | string> {
  const out: Array<JSX.Element | string> = [];
  // `code` and [label](href), scanned together so neither eats the other.
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <code key={`${keyPrefix}-c${i}`} className="font-mono text-[13px]">
          {m[1].slice(1, -1)}
        </code>,
      );
    } else if (m[2] && m[3]) {
      const label = m[2].slice(1, m[2].indexOf("]"));
      out.push(
        <a
          key={`${keyPrefix}-a${i}`}
          href={m[3]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-4"
        >
          {label}
        </a>,
      );
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ source }: { source: string }): JSX.Element {
  const blocks: JSX.Element[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push(
        <pre
          key={`b${key++}`}
          className="mt-5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed"
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={`b${key++}`} className="mt-12 font-display text-xl font-semibold tracking-tight md:text-2xl">
          {line.slice(3).trim()}
        </h2>,
      );
      i += 1;
      continue;
    }

    // A flat bullet list: consecutive lines that start with "- ". Before this,
    // such lines were joined into one paragraph with the dashes still in it.
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) {
        items.push(lines[i]!.slice(2).trim());
        i += 1;
      }
      const listKey = `b${key++}`;
      blocks.push(
        <ul key={listKey} className="mt-5 list-disc space-y-2 pl-6 text-base leading-relaxed text-muted-foreground">
          {items.map((item, n) => (
            <li key={`${listKey}-${n}`}>{renderInline(item, `${listKey}-${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // A paragraph runs until a blank line, a fence, a heading or a bullet list.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.startsWith("```") &&
      !lines[i]!.startsWith("## ") &&
      !lines[i]!.startsWith("- ")
    ) {
      para.push(lines[i]!);
      i += 1;
    }
    const text = para.join(" ");
    blocks.push(
      <p key={`b${key++}`} className="mt-5 text-base leading-relaxed text-muted-foreground">
        {renderInline(text, `b${key}`)}
      </p>,
    );
  }

  return <>{blocks}</>;
}
