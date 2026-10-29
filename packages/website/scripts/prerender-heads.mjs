// Gives every page of the sitemap its own head in the built site, so a link to it can be shared with the right title and description.
//
// Runs after `vite build`. It reads src/data/share-heads.json (written by share-heads-capture.mjs from the real app) and, for each page, writes a
// copy of dist/index.html with that page's title, description, canonical address, language links and sharing tags to dist/<path>.html.
// The host serves that file for the address (and still serves index.html for any address that is not a file). The app in the page is the
// same bundle; when it starts it writes the same head again, so a visitor sees no difference.
//
// It fails the build, rather than guess, when index.html no longer has the exact tags it replaces.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const escapeAttribute = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function replaceOnce(html, pattern, replacement, what) {
  const found = html.match(new RegExp(pattern.source, "g"));
  if (!found || found.length !== 1) {
    throw new Error(`prerender-heads: expected exactly one ${what} in index.html, found ${found ? found.length : 0}`);
  }
  return html.replace(pattern, () => replacement);
}

const metaByName = (name) => new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/>`);
const metaByProperty = (property) => new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]*"\\s*/>`);

/** The template with one page's head in it. Pure: no files. */
export function applyHead(template, entry) {
  let html = template;
  html = replaceOnce(html, /<html lang="[^"]*">/, `<html lang="${escapeAttribute(entry.lang)}">`, "<html lang>");
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeText(entry.title)}</title>`, "<title>");
  html = replaceOnce(html, metaByName("description"), `<meta name="description" content="${escapeAttribute(entry.description)}" />`, "meta description");
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeAttribute(entry.canonical)}" />`, "canonical link");
  const alternates = entry.alternates
    .map((a) => `    <link rel="alternate" hreflang="${escapeAttribute(a.hreflang)}" href="${escapeAttribute(a.href)}" />`)
    .join("\n");
  html = replaceOnce(html, /(?:[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\r?\n?){3}/, alternates ? alternates + "\n" : "", "three hreflang links");
  html = replaceOnce(html, metaByProperty("og:locale"), `<meta property="og:locale" content="${escapeAttribute(entry.ogLocale)}" />`, "og:locale");
  html = replaceOnce(html, metaByProperty("og:url"), `<meta property="og:url" content="${escapeAttribute(entry.ogUrl)}" />`, "og:url");
  html = replaceOnce(html, metaByProperty("og:title"), `<meta property="og:title" content="${escapeAttribute(entry.ogTitle)}" />`, "og:title");
  html = replaceOnce(html, metaByProperty("og:description"), `<meta property="og:description" content="${escapeAttribute(entry.ogDescription)}" />`, "og:description");
  html = replaceOnce(html, metaByName("twitter:title"), `<meta name="twitter:title" content="${escapeAttribute(entry.twitterTitle)}" />`, "twitter:title");
  html = replaceOnce(html, metaByName("twitter:description"), `<meta name="twitter:description" content="${escapeAttribute(entry.twitterDescription)}" />`, "twitter:description");
  return html;
}

function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const template = readFileSync(join(root, "dist", "index.html"), "utf8");
  const { pages } = JSON.parse(readFileSync(join(root, "src", "data", "share-heads.json"), "utf8"));
  let count = 0;
  for (const [path, entry] of Object.entries(pages)) {
    if (!/^\/[a-z0-9/-]+$/.test(path)) throw new Error(`prerender-heads: refusing the path ${JSON.stringify(path)}`);
    // dist/cra-check.html, not dist/cra-check/index.html: the host serves cra-check.html at /cra-check as it is, while a directory index
    // makes it send /cra-check on to /cra-check/ (measured with wrangler dev), and our canonical addresses have no trailing slash.
    const parts = path.split("/").filter(Boolean);
    const file = join(root, "dist", ...parts.slice(0, -1), `${parts[parts.length - 1]}.html`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, applyHead(template, entry));
    count++;
  }
  console.log(`prerender-heads: wrote the head of ${count} pages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
