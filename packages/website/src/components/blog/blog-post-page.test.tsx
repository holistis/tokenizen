import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlogPostPage } from "@/components/blog/blog-post-page";
import { BlogIndex } from "@/components/pages/notes-index";
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
      <BlogIndex />
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
    const beelden = metBeelden.blocks.filter((b) => b.type === "image") as Array<{ src: string; alt: string; caption?: string; width: number; height: number }>;
    expect(beelden.length).toBeGreaterThanOrEqual(2);
    for (const b of beelden) {
      expect(html).toContain(b.src);
      expect(html).toContain(b.alt);
      if (b.caption) expect(html).toContain(b.caption);
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
    // The post is a blog, so its way back leads to the blog and not to the notes.
    expect(renderPost("en")).toContain('href="/en/blog"');
    expect(renderPost("nl")).toContain('href="/blog"');
  });
});

describe("BlogIndex", () => {
  it("features the pinned blog and shows no mission", () => {
    const html = renderIndex("en");
    expect(html).toContain(post.title);
    expect(html).toContain("/en/notes/check-pay-prove");
    expect(html).not.toContain(MISSION.headline);
    expect(html).toContain("Pinned");
  });

  it("does not list the notes", () => {
    const html = renderIndex("en");
    expect(html).not.toContain("733,203 attestations were taken back");
    expect(html).not.toContain("The hierarchy of agent trust");
    expect(html).not.toContain("Official sources and payment addresses");
  });

  it("lists the second blog below the pinned one", () => {
    const html = renderIndex("en");
    expect(html).toContain("We measured our scan");
    expect(html.indexOf("Check. Pay. Prove.")).toBeLessThan(html.indexOf("We measured our scan"));
  });

  it("is called Blog in both languages", () => {
    expect(renderIndex("en")).toContain(">Blog<");
    expect(renderIndex("nl")).toContain(">Blog<");
  });
});

describe("BlogPostPage matrix", () => {
  const withMatrix = BLOG_POSTS.find((p) => p.slug === "the-ruler-and-the-misses")!;
  const html = renderToStaticMarkup(
    <LocaleProvider locale="en">
      <BlogPostPage post={withMatrix} />
    </LocaleProvider>,
  );
  const matrix = withMatrix.blocks.find((b) => b.type === "matrix") as Extract<(typeof withMatrix.blocks)[number], { type: "matrix" }>;

  it("renders one table with a header cell per column and a row header per vendor", () => {
    expect(html.match(/<table/g)?.length).toBe(1);
    for (const column of matrix.columns) expect(html).toContain(column);
    for (const row of matrix.rows) expect(html).toContain(row.label);
    expect((html.match(/scope="row"/g) ?? []).length).toBe(matrix.rows.length);
  });

  it("says each cell's tone in words for readers who do not see colour", () => {
    expect(html).toContain("yes: ");
    expect(html).toContain("partly: ");
    expect(html).toContain("no: ");
  });

  it("links every vendor row to a page a stranger can open", () => {
    for (const row of matrix.rows) expect(html).toContain(row.href);
  });
});
