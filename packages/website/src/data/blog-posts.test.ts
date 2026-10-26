import { describe, expect, it } from "vitest";

import llms from "../../public/llms.txt?raw";
import sitemap from "../../public/sitemap.xml?raw";
import { BLOG_POSTS, MISSION, findPostByPath, postPath, type BlogPost, type PostBlock } from "./blog-posts";

// Every piece of text a post can carry, so the house rules are checked on all of it.
function allText(post: BlogPost): string[] {
  const out: string[] = [post.title, post.dek, post.description, ...post.tags];
  for (const block of post.blocks as PostBlock[]) {
    if (block.type === "md") out.push(block.text);
    if (block.type === "video") out.push(block.caption, ...block.transcript);
    if (block.type === "image") out.push(block.alt, block.caption);
    if (block.type === "facts") {
      out.push(block.heading, block.intro);
      for (const item of block.items) out.push(item.value, item.label, item.hrefLabel);
    }
    if (block.type === "matrix") {
      out.push(block.heading, block.intro, block.note, ...block.columns);
      for (const row of block.rows) out.push(row.label, ...row.cells.map((c) => c.text));
    }
    if (block.type === "cta") out.push(block.heading, block.text, ...block.links.map((l) => l.label));
  }
  out.push(MISSION.headline, MISSION.text, ...MISSION.promises.flatMap((p) => [p.name, p.text]));
  return out;
}

function allHrefs(post: BlogPost): string[] {
  const hrefs: string[] = [];
  for (const block of post.blocks) {
    if (block.type === "md") {
      for (const m of block.text.matchAll(/\]\(([^)\s]+)\)/g)) hrefs.push(m[1]!);
    }
    if (block.type === "facts") hrefs.push(...block.items.map((i) => i.href));
    if (block.type === "matrix") hrefs.push(...block.rows.map((r) => r.href));
    if (block.type === "cta") hrefs.push(...block.links.map((l) => l.href));
  }
  return hrefs;
}

describe("BLOG_POSTS", () => {
  it("has at least one post and unique, url-safe slugs", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a real ISO date, a short description and a read time on every post", () => {
    for (const post of BLOG_POSTS) {
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(post.date))).toBe(false);
      expect(post.description.length).toBeLessThanOrEqual(160);
      expect(post.readMinutes).toBeGreaterThan(0);
    }
  });

  // The posts are written for people who copy commands. A long dash or a markdown
  // star in a quoted command, or in text a person reads, is a defect we have
  // chosen not to ship. MarkdownLite renders no emphasis, so stars would show.
  it("contains no long dashes and no markdown emphasis stars", () => {
    for (const post of BLOG_POSTS) {
      for (const text of allText(post)) {
        expect(text).not.toMatch(/[–—]/);
        expect(text).not.toContain("**");
      }
    }
  });

  // A reader must be able to open every link without logging in, and a tx link
  // that silently went http would be a mixed-content problem in the browser.
  it("only links to https pages or to /notes/ pages on this site", () => {
    for (const post of BLOG_POSTS) {
      for (const href of allHrefs(post)) {
        const ok = href.startsWith("https://") || href.startsWith("/notes/");
        expect(ok, `${post.slug}: ${href}`).toBe(true);
      }
    }
  });

  it("links internally only to posts that exist", () => {
    const known = new Set([
      ...BLOG_POSTS.map((p) => postPath(p.slug)),
      "/notes/733203-attestations-were-taken-back",
      "/notes/a-signed-receipt-that-cannot-name-its-own-payment",
      "/notes/zero-of-600-x402-services-sign-a-receipt",
      "/notes/nine-ways-to-fake-a-delivery-claim",
      "/notes/the-hierarchy-of-agent-trust",
    ]);
    for (const post of BLOG_POSTS) {
      for (const href of allHrefs(post).filter((h) => h.startsWith("/notes/"))) {
        expect(known.has(href), `${post.slug}: ${href}`).toBe(true);
      }
    }
  });

  // The two files agents and search engines read. A post that is in neither is
  // a post nobody can find, which is the failure the notes index was made to end.
  it("lists every post in the sitemap and in llms.txt", () => {
    for (const post of BLOG_POSTS) {
      const url = `https://tokenizen.nl/en${postPath(post.slug)}`;
      expect(sitemap, `sitemap: ${url}`).toContain(`<loc>${url}</loc>`);
      expect(llms, `llms.txt: ${url}`).toContain(url);
    }
  });

  // A blog is a decision of the owner, not a default. The default for new work is a note, and only a
  // blog may be pinned, so a working note can never end up at the top of the blog by accident.
  it("gives every post a kind, and lets only a blog be pinned", () => {
    for (const post of BLOG_POSTS) {
      expect(["blog", "note"], post.slug).toContain(post.kind);
      if (post.pinned) expect(post.kind, post.slug).toBe("blog");
    }
  });

  it("finds a post by its path and nothing else", () => {
    const first = BLOG_POSTS[0]!;
    expect(findPostByPath(postPath(first.slug))).toBe(first);
    expect(findPostByPath("/notes/does-not-exist")).toBeUndefined();
  });

  // Facts are the strongest claims on the page. Each needs a place to check it.
  it("gives every fact card a value, a label and a link", () => {
    for (const post of BLOG_POSTS) {
      for (const block of post.blocks) {
        if (block.type !== "facts") continue;
        for (const item of block.items) {
          expect(item.value.length).toBeGreaterThan(0);
          expect(item.label.length).toBeGreaterThan(20);
          expect(item.href.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("gives every matrix row one cell per column and a link", () => {
    for (const post of BLOG_POSTS) {
      for (const block of post.blocks) {
        if (block.type !== "matrix") continue;
        expect(block.columns.length).toBeGreaterThan(1);
        for (const row of block.rows) {
          expect(row.cells.length).toBe(block.columns.length);
          expect(row.href.length).toBeGreaterThan(0);
          for (const cell of row.cells) expect(cell.text.length).toBeGreaterThan(0);
        }
      }
    }
  });

  // The honesty section is part of the pitch, not an add-on. A post that makes
  // numbered claims without a "what we do not claim" section does not ship.
  it("keeps a limits section in every post that has fact cards", () => {
    for (const post of BLOG_POSTS) {
      const hasFacts = post.blocks.some((b) => b.type === "facts");
      if (!hasFacts) continue;
      const text = post.blocks.filter((b) => b.type === "md").map((b) => (b as { text: string }).text).join("\n");
      expect(text).toContain("## What we do not claim");
    }
  });
});
