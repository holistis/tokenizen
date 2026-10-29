// Writes src/data/share-heads.json (the head of every page in public/sitemap.xml, as the real app sets it in a browser) and
// src/data/share-bodies.json (the text of every page, homepage included, as plain semantic HTML: headings, paragraphs, lists, links, tables).
// scripts/prerender-heads.mjs puts the text in the page so a crawler or an AI agent that does not run JavaScript reads the page itself.
//
// WHY. This is a single-page app: every address is served the homepage's index.html and the page's own title, description and sharing
// tags are written by JavaScript afterwards. A crawler that does not run JavaScript (LinkedIn, Slack, Reddit, X, most search bots) therefore
// shows the homepage's title and description for every link. scripts/prerender-heads.mjs reads the file this script writes and puts each
// page's own head into a copy of index.html at build time. This script is the part that needs a browser, so it is run by hand
// (not in the build) whenever a page's title, description or address changes: the test share-heads.test.ts fails when a page of the sitemap
// has no entry, and checks the pages whose copy it can import against their entry.
//
// USE:  npm run build && node scripts/share-heads-capture.mjs
// NEEDS: Playwright with a Chromium. It is NOT a dependency of this package. Point PLAYWRIGHT_MODULE at it if it is not installed here, e.g.
//        PLAYWRIGHT_MODULE=file:///C:/path/to/node_modules/playwright/index.mjs node scripts/share-heads-capture.mjs

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "src", "data", "share-heads.json");
const OUT_BODIES = join(ROOT, "src", "data", "share-bodies.json");
const ORIGIN = "https://tokenizen.nl";

if (!existsSync(join(DIST, "index.html"))) throw new Error("share-heads-capture: run `npm run build` first (dist/index.html is missing)");

const sitemap = readFileSync(join(ROOT, "public", "sitemap.xml"), "utf8");
const paths = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname.replace(/\/+$/, "") || "/")
  .filter((p) => p !== "/");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2" };

// The built site, with the same fallback the host has: a path that is not a file shows index.html. Always the ORIGINAL index.html,
// never a copy that prerender-heads.mjs already wrote, so the capture sees what a browser gets from the app itself.
const original = readFileSync(join(DIST, "index.html"));
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = resolve(DIST, "." + normalize(pathname));
  const inside = file.startsWith(resolve(DIST));
  if (inside && pathname !== "/" && existsSync(file) && statSync(file).isFile() && !file.endsWith("index.html")) {
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(200, { "content-type": TYPES[".html"] });
  res.end(original);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const homeTitle = (await page.goto(base + "/", { waitUntil: "networkidle" }), await page.title());

const fix = (value) => (typeof value === "string" ? value.split(base).join(ORIGIN) : value);
const pages = {};
const bodies = {};

// The page as plain semantic HTML. Runs in the browser. Keeps structure and links, drops classes, styles, scripts, icons, buttons and forms.
const pageText = () => {
  const SKIP = new Set(["SCRIPT", "STYLE", "SVG", "NOSCRIPT", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "CANVAS", "VIDEO", "AUDIO", "IFRAME", "TEMPLATE", "OPTION"]);
  const KEEP = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "CODE", "PRE", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "NAV", "ASIDE", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "TIME", "SMALL"]);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const walk = (node, inPre) => {
    if (node.nodeType === 3) return esc(inPre ? node.nodeValue : node.nodeValue.replace(/\s+/g, " "));
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toUpperCase();
    if (SKIP.has(tag) || node.hidden || node.getAttribute("aria-hidden") === "true") return "";
    const display = getComputedStyle(node).display;
    if (display === "none") return "";
    // Boxes the page lays out side by side or one under the other (flex items, blocks) are separate words even when the code has no space between them.
    const gap = display === "inline" ? "" : " ";
    if (tag === "IMG") return node.getAttribute("alt") ? esc(node.getAttribute("alt")) : "";
    if (tag === "BR") return "<br>";
    const inner = [...node.childNodes].map((c) => walk(c, inPre || tag === "PRE")).join("");
    if (tag === "A") {
      const href = node.href;
      if (!/^(https?:|mailto:)/.test(href)) return inner;
      const label = inner.trim() || esc(node.getAttribute("aria-label") || "");
      return label ? gap + '<a href="' + href.replace(/"/g, "&quot;") + '">' + label + "</a>" + gap : "";
    }
    if (!KEEP.has(tag)) return gap + inner + gap;
    if (!inner.trim()) return "";
    const lower = tag.toLowerCase();
    return "<" + lower + ">" + inner + "</" + lower + ">\n";
  };
  let html = walk(document.getElementById("root"), false);
  // empty wrappers can remain after skipped children
  for (let i = 0; i < 4; i++) html = html.replace(/<(section|article|main|header|footer|nav|aside|ul|ol|li|p)>\s*<\/\1>\n?/g, "");
  return html.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();
};

{
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  bodies["/"] = fix(await page.evaluate(pageText));
  console.log("/ => body", bodies["/"].length, "characters");
}
for (const path of paths) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  // The page writes its own title in an effect; wait until it is no longer the homepage's.
  await page.waitForFunction((home) => document.title !== home, homeTitle, { timeout: 15000 });
  const head = await page.evaluate(() => {
    const get = (selector, attribute) => document.head.querySelector(selector)?.getAttribute(attribute) ?? null;
    return {
      lang: document.documentElement.lang,
      title: document.title,
      description: get('meta[name="description"]', "content"),
      canonical: get('link[rel="canonical"]', "href"),
      ogLocale: get('meta[property="og:locale"]', "content"),
      ogUrl: get('meta[property="og:url"]', "content"),
      ogTitle: get('meta[property="og:title"]', "content"),
      ogDescription: get('meta[property="og:description"]', "content"),
      twitterTitle: get('meta[name="twitter:title"]', "content"),
      twitterDescription: get('meta[name="twitter:description"]', "content"),
      alternates: [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((a) => ({ hreflang: a.getAttribute("hreflang"), href: a.getAttribute("href") })),
    };
  });
  pages[path] = JSON.parse(JSON.stringify(head, (_k, v) => fix(v)));
  await page.waitForSelector("h1", { timeout: 15000 });
  bodies[path] = fix(await page.evaluate(pageText));
  console.log(path, "=>", pages[path].title, "|", bodies[path].length, "characters");
}
await browser.close();
server.close();

const sorted = Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({ pages: sorted }, null, 2) + "\n");
const sortedBodies = Object.fromEntries(Object.entries(bodies).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT_BODIES, JSON.stringify({ pages: sortedBodies }, null, 2) + "\n");
console.log(`wrote ${Object.keys(sorted).length} pages to src/data/share-heads.json`);
