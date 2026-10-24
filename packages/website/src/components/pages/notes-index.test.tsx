import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlogIndex, NotesIndex, entriesOfKind } from "@/components/pages/notes-index";
import { BLOG_POSTS, MISSION, postPath } from "@/data/blog-posts";
import { LocaleProvider, type Locale } from "@/i18n/context";

const render = (locale: Locale, page: "blog" | "notes") =>
  renderToStaticMarkup(<LocaleProvider locale={locale}>{page === "blog" ? <BlogIndex /> : <NotesIndex />}</LocaleProvider>);

const LOCALES: Locale[] = ["nl", "en"];

describe("the blog and the notes are two places", () => {
  for (const locale of LOCALES) {
    it(`[${locale}] the blog lists blogs only, with no mission block`, () => {
      const html = render(locale, "blog");
      for (const post of BLOG_POSTS) {
        const listed = html.includes(postPath(post.slug));
        expect(listed, post.slug).toBe(post.kind === "blog");
      }
      expect(html).not.toContain(MISSION.eyebrow);
      expect(html).not.toContain(MISSION.headline);
      // The seven older and newer notes must not be in the blog either.
      expect(html).not.toContain("/notes/733203-attestations-were-taken-back");
      expect(html).not.toContain("/notes/the-hierarchy-of-agent-trust");
    });

    it(`[${locale}] the notes list every note and no blog, and no mission block either`, () => {
      const html = render(locale, "notes");
      for (const post of BLOG_POSTS) {
        expect(html.includes(postPath(post.slug)), post.slug).toBe(post.kind === "note");
      }
      expect(html).toContain("/notes/733203-attestations-were-taken-back");
      expect(html).toContain("/notes/nine-ways-to-fake-a-delivery-claim");
      expect(html).not.toContain(MISSION.eyebrow);
    });
  }

  it("shows the pinned blog first, marked as pinned, and keeps it there whatever its date", () => {
    const blogs = entriesOfKind("blog");
    expect(blogs[0]?.pinned).toBe(true);
    expect(blogs[0]?.slug).toBe("/notes/check-pay-prove");
    const html = render("en", "blog");
    expect(html).toContain("Pinned");
    expect(html.indexOf("Check. Pay. Prove.")).toBeGreaterThan(-1);
    expect(render("nl", "blog")).toContain("Vastgepind");
  });

  it("sorts a pinned entry above a newer one", () => {
    const entries = entriesOfKind("blog");
    const pinnedIndex = entries.findIndex((e) => e.pinned);
    const newer = entries.findIndex((e) => !e.pinned && e.date > (entries[pinnedIndex]?.date ?? ""));
    if (newer !== -1) expect(pinnedIndex).toBeLessThan(newer);
    expect(pinnedIndex).toBe(0);
  });

  it("points each page at the other", () => {
    expect(render("en", "blog")).toContain('href="/en/notes"');
    expect(render("en", "notes")).toContain('href="/en/blog"');
    expect(render("nl", "blog")).toContain('href="/notes"');
    expect(render("nl", "notes")).toContain('href="/blog"');
  });

  it("keeps post urls where they were, so links that are already out there still work", () => {
    expect(postPath("check-pay-prove")).toBe("/notes/check-pay-prove");
    expect(postPath("official-sources")).toBe("/notes/official-sources");
    expect(postPath("we-measured-our-scan")).toBe("/notes/we-measured-our-scan");
  });

  it("uses no long dashes in either index", () => {
    for (const page of ["blog", "notes"] as const) {
      for (const locale of LOCALES) expect(render(locale, page)).not.toMatch(/[–—]/);
    }
  });
});
