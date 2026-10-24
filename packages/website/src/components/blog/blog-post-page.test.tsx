import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlogPostPage } from "@/components/blog/blog-post-page";
import { NotesIndex } from "@/components/pages/notes-index";
import { BLOG_POSTS, MISSION } from "@/data/blog-posts";
import { LocaleProvider, type Locale } from "@/i18n/context";

const post = BLOG_POSTS[0]!;

const renderPost = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <BlogPostPage post={post} />
    </LocaleProvider>,
  );

const renderIndex = (locale: Locale) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <NotesIndex />
    </LocaleProvider>,
  );


describe("BlogPostPage images", () => {
  const metBeelden = BLOG_POSTS.find((p) => p.blocks.some((b) => b.type === "image"))!;
  const html = renderToStaticMarkup(
    <LocaleProvider locale="en">
      <BlogPostPage post={metBeelden} />
    </LocaleProvider>,
  );

  it("renders every image with alt text, a caption, fixed dimensions and lazy loading", () => {
    const beelden = metBeelden.blocks.filter((b) => b.type === "image") as Array<{ src: string; alt: string; caption: string; width: number; height: number }>;
    expect(beelden.length).toBeGreaterThanOrEqual(2);
    for (const b of beelden) {
      expect(html).toContain(b.src);
      expect(html).toContain(b.alt);
      expect(html).toContain(b.caption);
      expect(b.alt.length).toBeGreaterThan(30);
      expect(b.src.startsWith("/media/")).toBe(true);
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
    }
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="1376"');
  });

  it("says in the caption that an illustration was generated with AI", () => {
    for (const b of metBeelden.blocks) if (b.type === "image") expect(b.caption).toMatch(/generated with AI/);
  });
});

describe("BlogPostPage", () => {
  it("shows the title, the dek, the date and the read time", () => {
    const html = renderPost("en");
    expect(html).toContain("<h1");
    expect(html).toContain(post.title);
    expect(html).toContain(post.dek);
    // React prints the attribute as dateTime in static markup; the browser reads it either way.
    expect(html).toMatch(new RegExp(`datetime="${post.date}"`, "i"));
    expect(html).toContain(`${post.readMinutes} min read`);
  });

  // The video is the centrepiece for readers who do not read. It needs controls,
  // a poster so the page does not open on a black box, and a transcript for
  // people and agents who cannot play it.
  it("embeds the video with controls, a poster and a transcript", () => {
    const html = renderPost("en");
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain('poster="/media/check-pay-prove-poster.jpg"');
    expect(html).toContain('src="/media/check-pay-prove.mp4"');
    expect(html).toContain("Transcript");
    expect(html).toContain("Grounded. This was our own test");
  });

  it("carries the three commands people are asked to run", () => {
    const html = renderPost("en");
    expect(html).toContain("npx muraqib-agent-watch");
    expect(html).toContain("npx -y agent-receipt-verify");
    expect(html).toContain("attempt-identity");
  });

  it("links the two real transactions on a block explorer, opening in a new tab safely", () => {
    const html = renderPost("en");
    expect(html).toContain("https://basescan.org/tx/0x7160db5eceb012012d75ef0331f14ca164050c246f879b94e3dbff235e91e7eb");
    expect(html).toContain("https://basescan.org/tx/0xa661b2ffd344926ddd5e31dc0c481212ba2d973fdb0c08a461d4c903f15d3936");
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("states the limits and the mission on the same page", () => {
    const html = renderPost("en");
    expect(html).toContain("What we do not claim");
    expect(html).toContain("not evidence of adoption");
    expect(html).toContain(MISSION.headline);
  });

  // An English reader must stay on the English site when following an internal
  // link, and a Dutch reader on the Dutch one.
  it("keeps internal links in the reader's language", () => {
    expect(renderPost("en")).toContain('href="/en/notes/zero-of-600-x402-services-sign-a-receipt"');
    expect(renderPost("nl")).toContain('href="/notes/zero-of-600-x402-services-sign-a-receipt"');
    expect(renderPost("en")).toContain('href="/en/notes"');
    expect(renderPost("nl")).toContain('href="/notes"');
  });
});

describe("NotesIndex as the blog", () => {
  it("features the newest post and shows the mission", () => {
    const html = renderIndex("en");
    expect(html).toContain(post.title);
    expect(html).toContain("/en/notes/check-pay-prove");
    expect(html).toContain(MISSION.headline);
    expect(html).toContain("Start here");
  });

  it("still lists the earlier notes", () => {
    const html = renderIndex("en");
    expect(html).toContain("733,203 attestations were taken back");
    expect(html).toContain("The hierarchy of agent trust");
  });

  it("is called Blog in both languages", () => {
    expect(renderIndex("en")).toContain(">Blog<");
    expect(renderIndex("nl")).toContain(">Blog<");
  });
});
