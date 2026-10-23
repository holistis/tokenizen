import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownLite } from "@/components/markdown-lite";

const render = (source: string) => renderToStaticMarkup(<MarkdownLite source={source} />);

describe("MarkdownLite", () => {
  // Bullet lines used to be joined into one paragraph with the dashes still in
  // it. The older notes were written with bullets, so they rendered like that.
  it("renders consecutive dash lines as one bullet list", () => {
    const html = render("Intro line.\n\n- first item\n- second item with `code`\n\nAfter the list.");
    expect(html.match(/<ul/g)?.length).toBe(1);
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain("<code");
    expect(html).not.toContain("- first item");
    expect(html).toContain("After the list.");
  });

  it("ends a paragraph where a bullet list starts", () => {
    const html = render("A paragraph\n- a bullet right below it");
    expect(html).toContain("<p");
    expect(html).toContain("<ul");
  });

  it("keeps headings, fenced code and links working", () => {
    const html = render("## Heading\n\n```\nnpx tool\n```\n\nSee [the repo](https://github.com/holistis).");
    expect(html).toContain("<h2");
    expect(html).toContain("npx tool");
    expect(html).toContain('href="https://github.com/holistis"');
  });

  it("does not turn a dash inside a sentence into a list", () => {
    const html = render("A well-known case, not a list - just a sentence.");
    expect(html).not.toContain("<ul");
  });
});
