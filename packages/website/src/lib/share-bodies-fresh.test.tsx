import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import App from "@/App";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { readableText } from "@/test-utils/readable-text";

// share-bodies.json is written by hand-run capture (scripts/share-heads-capture.mjs) and is what readers that do not run JavaScript get.
// This test renders every page again from the code and checks that each piece of text in the capture is still on the page, so a change of
// copy without a new capture fails here instead of leaving crawlers and AI agents with an old claim.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const bodies = (JSON.parse(readFileSync(`${ROOT}src/data/share-bodies.json`, "utf8")) as { pages: Record<string, string> }).pages;

const globalWithWindow = globalThis as unknown as { window?: unknown };
const originalWindow = globalWithWindow.window;
afterAll(() => {
  globalWithWindow.window = originalWindow;
});

function renderPath(path: string): string {
  const locale: Locale = path === "/nl" || path.startsWith("/nl/") ? "nl" : "en";
  globalWithWindow.window = {
    location: { pathname: path, search: "", hash: "", href: `https://tokenizen.nl${path}`, origin: "https://tokenizen.nl" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <App />
    </LocaleProvider>,
  );
}

/** Spaces between boxes that the page lays out side by side are not in the markup, and a code block keeps its own line breaks: compare without any. */
const squash = (s: string) => s.replace(/\s+/g, "");

/** The pieces of text between the tags of a capture, long enough to mean something. */
function pieces(html: string): string[] {
  return readableText(html, { gap: "\u0000", collapse: false })
    .split("\u0000")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12);
}

describe("share-bodies.json is still what the pages say", () => {
  for (const [path, captured] of Object.entries(bodies)) {
    it(`${path}: every piece of text of the capture is on the page`, () => {
      const html = renderPath(path);
      // The capture holds the alt text of images as text; in the markup it is an attribute.
      const alts = [...html.matchAll(/\salt="([^"]*)"/g)].map((m) => `<p>${m[1]}</p>`).join("");
      const page = squash(readableText(html + alts));
      // The one thing a static render cannot hold: the hashes of the chain demo are computed in the browser after the page loads.
      const computedInBrowser = /^[0-9a-f]{24}\s/;
      const missing = pieces(captured).filter((piece) => !computedInBrowser.test(piece) && !page.includes(squash(piece)));
      expect(missing, `run: npm run build -w packages/website, then node scripts/share-heads-capture.mjs\n${missing.slice(0, 3).join("\n")}`).toEqual([]);
    });
  }
});
