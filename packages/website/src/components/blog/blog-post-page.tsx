// blog-post-page.tsx — the page shell for one entry of BLOG_POSTS.
//
// Everything a post needs beyond its text lives here once: the title and share
// metadata, the byline row, the video with a transcript, the fact cards, the
// mission block and the call to action. A new post is data, not a new page.

import { useEffect } from "react";
import type { JSX, ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { MarkdownLite } from "@/components/markdown-lite";
import { MissionBlock } from "@/components/blog/mission-block";
import type { BlogPost, PostBlock } from "@/data/blog-posts";
import { useLocale } from "@/i18n/context";

const isExternal = (href: string) => /^https?:\/\//.test(href);

function SmartLink({
  href,
  prefix,
  className,
  children,
}: {
  href: string;
  prefix: string;
  className?: string;
  children: ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    );
  }
  // Internal links keep the reader in their language, like the index does.
  return (
    <a href={`${prefix}${href}`} className={className}>
      {children}
    </a>
  );
}

function VideoBlock({ block }: { block: Extract<PostBlock, { type: "video" }> }) {
  return (
    <figure className="mt-8">
      <video
        controls
        preload="metadata"
        playsInline
        poster={block.poster}
        className="aspect-video w-full rounded-lg border border-border bg-black"
      >
        <source src={block.src} type="video/mp4" />
        <p>
          Your browser cannot play this video. <a href={block.src}>Download it here.</a>
        </p>
      </video>
      <figcaption className="mt-3 text-sm text-muted-foreground">{block.caption}</figcaption>
      <details className="mt-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide">Transcript</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          {block.transcript.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </details>
    </figure>
  );
}

function ImageBlock({ block }: { block: Extract<PostBlock, { type: "image" }> }) {
  return (
    <figure className="mt-10">
      <img
        src={block.src}
        alt={block.alt}
        width={block.width}
        height={block.height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-lg border border-border bg-card"
      />
      {block.caption ? <figcaption className="mt-3 text-sm text-muted-foreground">{block.caption}</figcaption> : null}
    </figure>
  );
}

function FactsBlock({ block, prefix }: { block: Extract<PostBlock, { type: "facts" }>; prefix: string }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{block.heading}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{block.intro}</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {block.items.map((item) => (
          <li key={item.value} className="flex flex-col rounded-lg border border-border bg-card p-5">
            <p className="font-display text-3xl font-semibold tracking-tight text-primary">{item.value}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{item.label}</p>
            <SmartLink
              href={item.href}
              prefix={prefix}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-80"
            >
              {item.hrefLabel}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </SmartLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONE_WORD = { yes: "yes", partial: "partly", no: "no" } as const;
const TONE_CLASS = {
  yes: "bg-emerald-500",
  partial: "bg-amber-500",
  no: "bg-muted-foreground/50",
} as const;

function MatrixBlock({ block, prefix }: { block: Extract<PostBlock, { type: "matrix" }>; prefix: string }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{block.heading}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{block.intro}</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                Who
              </th>
              {block.columns.map((column) => (
                <th key={column} scope="col" className="px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={row.label} className={i === 0 ? "border-b border-primary/40 bg-primary/5" : "border-b border-border last:border-0"}>
                <th scope="row" className="px-4 py-4 align-top font-medium">
                  <SmartLink href={row.href} prefix={prefix} className="inline-flex items-center gap-1 text-primary transition-opacity hover:opacity-80">
                    {row.label}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </SmartLink>
                </th>
                {row.cells.map((cell, j) => (
                  <td key={j} className="px-4 py-4 align-top leading-relaxed text-muted-foreground">
                    <span className="flex items-start gap-2">
                      <span className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-full ${TONE_CLASS[cell.tone]}`} aria-hidden="true" />
                      <span>
                        <span className="sr-only">{TONE_WORD[cell.tone]}: </span>
                        {cell.text}
                      </span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{block.note}</p>
    </section>
  );
}

function CtaBlock({ block }: { block: Extract<PostBlock, { type: "cta" }> }) {
  return (
    <section className="mt-10 rounded-lg border border-primary/40 bg-card p-6 md:p-8">
      <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{block.heading}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{block.text}</p>
      <ul className="mt-5 flex flex-wrap gap-3">
        {block.links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-wide transition-colors hover:border-primary hover:text-primary"
            >
              {link.label}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function renderBlock(block: PostBlock, index: number, prefix: string): JSX.Element {
  switch (block.type) {
    case "md":
      return <MarkdownLite key={index} source={block.text} />;
    case "video":
      return <VideoBlock key={index} block={block} />;
    case "image":
      return <ImageBlock key={index} block={block} />;
    case "facts":
      return <FactsBlock key={index} block={block} prefix={prefix} />;
    case "matrix":
      return <MatrixBlock key={index} block={block} prefix={prefix} />;
    case "mission":
      return <MissionBlock key={index} />;
    case "cta":
      return <CtaBlock key={index} block={block} />;
  }
}

export function BlogPostPage({ post }: { post: BlogPost }) {
  const { locale } = useLocale();
  const prefix = locale === "en" ? "/en" : "";
  const title = `${post.title} | tokenizen`;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const tag = document.head.querySelector('meta[name="description"]');
    const previous = tag?.getAttribute("content") ?? null;
    tag?.setAttribute("content", post.description);
    return () => {
      document.title = previousTitle;
      if (previous !== null) tag?.setAttribute("content", previous);
    };
  }, [title, post.description]);

  return (
    <article className="border-t border-border py-16 md:py-24">
      <div className="container max-w-3xl">
        <a
          href={`${prefix}${post.kind === "blog" ? "/blog" : "/notes"}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {post.kind === "blog" ? "Blog" : "Notes"}
        </a>

        <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <time dateTime={post.date}>{post.date}</time>
          <span aria-hidden="true">/</span>
          <span>{post.readMinutes} min read</span>
          {post.tags.map((tag) => (
            <span key={tag} className="rounded border border-border px-1.5 py-0.5 tracking-wide">
              {tag}
            </span>
          ))}
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">{post.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.dek}</p>

        {post.blocks.map((block, index) => renderBlock(block, index, prefix))}
      </div>
    </article>
  );
}
