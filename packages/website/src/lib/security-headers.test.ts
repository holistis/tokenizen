import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) => readFileSync(`${ROOT}${relative}`, "utf8").replace(/\r\n/g, "\n"); // the host serves the files from git, with LF

const headersFile = read("public/_headers");
const indexHtml = read("index.html");
const csp = /^\s+Content-Security-Policy:\s*(.+)$/m.exec(headersFile)?.[1] ?? "";
const directive = (name: string) => new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp)?.[1] ?? "";
const hash = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

describe("public/_headers", () => {
  it("applies to every page and says no framing, a referrer policy and a permissions policy", () => {
    expect(headersFile).toMatch(/^\/\*\n/);
    expect(headersFile).toMatch(/^\s+X-Frame-Options: DENY$/m);
    expect(headersFile).toMatch(/^\s+Referrer-Policy: strict-origin-when-cross-origin$/m);
    expect(headersFile).toMatch(/^\s+Permissions-Policy: camera=\(\), microphone=\(\)/m);
  });

  it("has a Content-Security-Policy that blocks plugins, framing, other base addresses and eval", () => {
    expect(csp).not.toBe("");
    expect(directive("default-src")).toBe("'self'");
    expect(directive("object-src")).toBe("'none'");
    expect(directive("frame-ancestors")).toBe("'none'");
    expect(directive("base-uri")).toBe("'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("*");
  });

  it("names the hash of every inline script of index.html, so a changed script does not silently stop running", () => {
    const inline = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(inline.length).toBeGreaterThanOrEqual(2);
    for (const script of inline) expect(directive("script-src"), `inline script: ${script.trim().slice(0, 60)}`).toContain(hash(script));
  });

  it("names the hash of every inline event handler of index.html and allows it with unsafe-hashes", () => {
    const handlers = [...indexHtml.matchAll(/\son(?:load|error|click)="([^"]*)"/g)].map((m) => m[1]!);
    expect(handlers.length).toBeGreaterThanOrEqual(1);
    expect(directive("script-src")).toContain("'unsafe-hashes'");
    for (const handler of handlers) expect(directive("script-src"), `handler: ${handler}`).toContain(hash(handler));
  });

  it("allows only the outside addresses index.html and the app really use", () => {
    expect(directive("connect-src")).toBe("'self' https://api.tokenizen.nl https://x402.tokenizen.nl");
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    // Things the page loads, not links a reader can follow.
    const outside = new Set([...indexHtml.matchAll(/<(?:link|script|img|source|video|iframe)\b[^>]*?\b(?:href|src)="(https:\/\/[^"/]+)/g)].map((m) => m[1]));
    expect(outside.size).toBeGreaterThan(0);
    for (const origin of outside) {
      if (origin === "https://tokenizen.nl") continue;
      expect(csp, `index.html loads from ${origin}`).toContain(origin);
    }
  });
});
