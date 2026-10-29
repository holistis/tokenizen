import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomePage, legacyAnchorTarget } from "@/components/home/home-page";
import { chainHashes, DEMO_LINES, firstBreak } from "@/components/matrix/chain-demo";
import { gridCells, visibleShare } from "@/components/matrix/measure-grid";
import { SCAN_FOUND, SCAN_KNOWN } from "@/components/matrix/miss-strip";
import { repoFromHash } from "@/components/pages/cra-check-page";
import { AboutPage, ChecksPage, ConsultancyPage, ScanPage, SecurityPage, ToolsPage } from "@/components/pages/offer-pages";
import { BENCHMARK_REPOSITORIES, BENCHMARK_SIGNALS } from "@/data/cra-benchmark";
import { ADVISORY_URL, CINEMA, HOME, OFFERS } from "@/data/home-copy";
import { SCORE_RUNS } from "@/data/scoreboard";
import { LocaleProvider, type Locale } from "@/i18n/context";
import { cellPath, hashMarkCells } from "@/lib/hash-mark";

import blogPosts from "@/data/blog-posts.ts?raw";
import llms from "../../../public/llms.txt?raw";
import sitemap from "../../../public/sitemap.xml?raw";

// Vitest hands back an empty string for a css import, so the stylesheet is read as a plain file.
const css = readFileSync(fileURLToPath(new URL("../../index.css", import.meta.url)), "utf8");

const LONG_DASH = /[–—]/;

const page = (locale: Locale, node: JSX.Element) => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

describe("the measurement data", () => {
  it("adds up to the 109 repositories for every signal", () => {
    expect(BENCHMARK_REPOSITORIES).toBe(109);
    expect(BENCHMARK_SIGNALS).toHaveLength(8);
    for (const s of BENCHMARK_SIGNALS) expect(s.visible + s.notVisible + s.notMeasured, s.key).toBe(109);
  });

  // The picture and the published note must say the same. The note carries "17 of 106", "4 of 101" and so on for each signal.
  it("gives for every signal the same count as the published note", () => {
    for (const s of BENCHMARK_SIGNALS) {
      expect(blogPosts, s.key).toContain(`value: "${s.visible} of ${s.visible + s.notVisible}"`);
    }
  });

  it("rounds the shares the way the note does", () => {
    const shares = Object.fromEntries(BENCHMARK_SIGNALS.map((s) => [s.key, visibleShare(s)]));
    expect(shares["vulnerability-policy"]).toBe(16);
    expect(shares["sbom"]).toBe(4);
    expect(shares["release-provenance"]).toBe(5);
    expect(shares["pinned-dependencies"]).toBe(70);
    expect(shares["dependency-updates"]).toBe(34);
    expect(shares["maintenance"]).toBe(81);
    expect(shares["license"]).toBe(78);
  });

  it("draws 110 places per grid: one square per repository and the empty place for the reader", () => {
    for (const s of BENCHMARK_SIGNALS) {
      const cells = gridCells(s);
      expect(cells, s.key).toHaveLength(110);
      expect(cells.filter((c) => c === "visible")).toHaveLength(s.visible);
      expect(cells.filter((c) => c === "hidden")).toHaveLength(s.notVisible);
      expect(cells.filter((c) => c === "none")).toHaveLength(s.notMeasured);
      expect(cells[109]).toBe("you");
    }
  });

  it("uses the scan numbers of the scoreboard for the miss strip", () => {
    expect(SCORE_RUNS.some((r) => r.found === SCAN_FOUND && r.known === SCAN_KNOWN)).toBe(true);
  });
});

describe("the hash chain demonstration", () => {
  it("breaks every line from the changed one onwards and leaves the lines before it alone", async () => {
    const sealed = await chainHashes(DEMO_LINES);
    expect(sealed).toHaveLength(4);
    expect(firstBreak(sealed, await chainHashes(DEMO_LINES))).toBe(-1);

    const third = [...DEMO_LINES];
    third[2] = third[2].replace("visible", "hidden");
    const now = await chainHashes(third);
    expect(now[0]).toBe(sealed[0]);
    expect(now[1]).toBe(sealed[1]);
    expect(now[2]).not.toBe(sealed[2]);
    expect(now[3]).not.toBe(sealed[3]);
    expect(firstBreak(sealed, now)).toBe(2);

    const first = [...DEMO_LINES];
    first[0] += "x";
    const all = await chainHashes(first);
    expect(all.every((h, i) => h !== sealed[i])).toBe(true);
  });

  it("is a real SHA-256 chain: 64 hex characters per line", async () => {
    for (const h of await chainHashes(DEMO_LINES)) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the pattern made from a text", () => {
  it("gives the same pattern for the same text and another one for another text", () => {
    expect(hashMarkCells("Abdellah Ouadoudi")).toEqual(hashMarkCells("Abdellah Ouadoudi"));
    expect(hashMarkCells("Abdellah Ouadoudi")).not.toEqual(hashMarkCells("Ahmed Ouadoudi"));
  });

  it("is mirrored left to right and 6 by 6", () => {
    const cells = hashMarkCells("Security research, with receipts.");
    expect(cells).toHaveLength(6);
    const mirror = { 0: 0, 1: 2, 2: 1, 3: 4, 4: 3 } as const;
    for (const row of cells) {
      expect(row).toHaveLength(6);
      for (let c = 0; c < 3; c++) expect(row[5 - c]).toBe(mirror[row[c]]);
    }
  });

  it("makes a path only for filled cells", () => {
    expect(cellPath(0, 0, 0, 10)).toBe("");
    for (const k of [1, 2, 3, 4] as const) expect(cellPath(k, 0, 0, 10)).toMatch(/^M.*z$/);
  });
});

describe("the repository named in the address fragment", () => {
  it("takes over a plain owner/name or a github.com address and nothing else", () => {
    expect(repoFromHash("#repo=holistis/tokenizen")).toBe("holistis/tokenizen");
    expect(repoFromHash("#repo=https%3A%2F%2Fgithub.com%2Fholistis%2Ftokenizen")).toBe("https://github.com/holistis/tokenizen");
    expect(repoFromHash("")).toBe("");
    expect(repoFromHash("#repo=")).toBe("");
    expect(repoFromHash("#repo=javascript:alert(1)")).toBe("");
    expect(repoFromHash("#repo=a/b/c")).toBe("");
    expect(repoFromHash("#repo=https%3A%2F%2Fevil.example%2Fa%2Fb")).toBe("");
    expect(repoFromHash("#repo=" + "a".repeat(200) + "/b")).toBe("");
  });

  // A query would put the name into a request to our host. The homepage must send it in the fragment and the check page must not read a query.
  it("is the only way the name travels: no query anywhere", () => {
    const home = page("en", <HomePage />);
    expect(home).not.toContain('method="get"');
    expect(home).not.toContain("?repo=");
  });
});

describe("the words", () => {
  it("contain no long dashes and no markdown in either language", () => {
    const text = JSON.stringify([HOME, OFFERS, CINEMA]);
    expect(text).not.toMatch(LONG_DASH);
    expect(text).not.toContain("**");
  });

  it("give every offer its promise, its way to check it and its limit, in both languages", () => {
    for (const locale of ["en", "nl"] as const) {
      expect(OFFERS[locale]).toHaveLength(6);
      for (const o of OFFERS[locale]) {
        expect(o.gets.length, `${locale} ${o.id} gets`).toBeGreaterThan(20);
        expect(o.verify.length, `${locale} ${o.id} verify`).toBeGreaterThan(20);
        expect(o.not.length, `${locale} ${o.id} not`).toBeGreaterThan(20);
      }
    }
  });

  // The red reader of 28 October 2026 found sentences that said more than we can show. They stay out.
  it("keep out the claims that the red reader took out", () => {
    const all = (
      JSON.stringify([HOME, OFFERS, CINEMA]) +
      page("en", <SecurityPage />) +
      page("en", <ScanPage />) +
      page("en", <HomePage />) +
      page("nl", <HomePage />)
    ).toLowerCase();
    const forbidden = [
      "nobody can",
      "niemand kan",
      "four well-known",
      "vier bekende",
      "same code",
      "dezelfde code",
      "with receipts",
      "beveiligingsonderzoek, met bewijs",
      "on a sealed set, in one run",
      "any change to the past shows",
      "pinned dependencies",
    ];
    for (const phrase of forbidden) expect(all.includes(phrase), phrase).toBe(false);
  });

  it("give the scan number together with its caveats and the prices", () => {
    const en = OFFERS.en.find((o) => o.id === "scan");
    const nl = OFFERS.nl.find((o) => o.id === "scan");
    expect(en?.verify).toContain("8 of 105");
    expect(en?.verify).toContain("first 15 hypotheses");
    expect(en?.verify).toContain("no longer secret");
    expect(en?.verify).toContain("two changes at once");
    expect(nl?.verify).toContain("8 van de 105");
    expect(nl?.verify).toContain("niet meer geheim");
    expect(en?.price).toContain("1 dollar");
    expect(en?.price).toContain("5 dollars");
    for (const locale of ["en", "nl"] as const) {
      for (const id of ["security", "talk"] as const) {
        const offer = OFFERS[locale].find((o) => o.id === id);
        expect(offer?.price, `${locale} ${id}`).toMatch(/No fixed offer yet|Nog geen vast aanbod/);
      }
    }
  });

  it("name the same prices as the approved offer page", () => {
    const en = OFFERS.en.find((o) => o.id === "signal-log");
    expect(en?.price).toBe("9.95 or 29.95 euro per month, VAT included");
  });
});

describe("the homepage", () => {
  it.each(["en", "nl"] as const)("renders in %s with one h1, the six offers and the three pillars", (locale) => {
    const html = page(locale, <HomePage />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/id="aanbod-/g)).toHaveLength(6);
    expect(html).toContain(HOME[locale].hero.h1a);
    expect(html).toContain(ADVISORY_URL);
    for (const pillar of CINEMA[locale].pillars) {
      expect(html, pillar.id).toContain(pillar.title);
      for (const point of pillar.points) expect(html, point).toContain(point.replace(/'/g, "&#x27;"));
    }
    expect(html).not.toContain('action="/en/cra-check"');
    expect(html).not.toMatch(LONG_DASH);
  });

  // The visitor asked for: reliability, technique, what is unique, mission and vision, all on the homepage, each with its own picture.
  it("shows the pillars, security, mission and vision in order, between the offers and the conversation", () => {
    const html = page("en", <HomePage />);
    const at = ["top", "aanbod", "betrouwbaarheid", "techniek", "uniek", "beveiliging", "missie", "nagaan", "onbekend", "praat"].map((id) => html.indexOf(`id="${id}"`));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain(CINEMA.en.mission.mission.title);
    expect(html).toContain(CINEMA.en.mission.vision.title);
  });

  // Who we are belongs on the About page. The homepage does not name the owners and shows no portrait.
  it("does not name the two owners or show their portraits", () => {
    for (const locale of ["en", "nl"] as const) {
      const html = page(locale, <HomePage />);
      expect(html, locale).not.toContain("Ouadoudi");
      expect(html, locale).not.toContain("Abdellah");
      expect(html, locale).not.toContain("Ahmed");
      expect(html, locale).not.toContain("twee broers");
      expect(html, locale).not.toContain("two brothers");
    }
    expect(page("en", <AboutPage />)).toContain("Ouadoudi");
  });

  it("uses only the pictures that exist, with a size, an empty alt, and the first one loaded at once", () => {
    const html = page("en", <HomePage />);
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThanOrEqual(8);
    imgs.forEach((tag, i) => {
      expect(tag).toContain('alt=""');
      expect(tag).toContain('width="1376"');
      expect(tag).toContain('height="768"');
      expect(tag).toMatch(/srcSet="[^"]*-768\.webp 768w/);
      expect(tag.includes('loading="eager"')).toBe(i === 0);
      expect(tag.includes('loading="lazy"')).toBe(i !== 0);
      const file = tag.match(/src="\/media\/site\/([a-z0-9-]+\.webp)"/)?.[1];
      expect(file, tag).toBeTruthy();
      expect(existsSync(fileURLToPath(new URL(`../../../public/media/site/${file}`, import.meta.url))), `${file} exists`).toBe(true);
    });
  });

  it("says that the pictures are illustrations made with AI, in both languages", () => {
    expect(page("en", <HomePage />)).toContain("illustrations made with AI");
    expect(page("nl", <HomePage />)).toContain("illustraties, met AI gemaakt");
  });

  it("keeps the moving parts behind the reduced-motion setting", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.hero-media[\s\S]*animation: none/);
    expect(css).toMatch(/prefers-reduced-motion: no-preference\)[\s\S]*\.tilt/);
  });
});

describe("links to the sections of the old homepage", () => {
  it("lead to the same section on the tools page, in the reader's language", () => {
    expect(legacyAnchorTarget("#hoe-het-werkt", "en")).toBe("/en/tools#hoe-het-werkt");
    expect(legacyAnchorTarget("#status", "nl")).toBe("/tools#status");
    for (const id of ["probleem", "waarom-nu", "product", "controle", "ontwerpgrenzen", "open-source"]) {
      expect(legacyAnchorTarget(`#${id}`, "en"), id).toBe(`/en/tools#${id}`);
    }
  });

  it("leave the anchors of the new homepage and anything else alone", () => {
    for (const hash of ["", "#", "#top", "#aanbod", "#nagaan", "#bewijs", "#unknown", "#repo=a/b"]) expect(legacyAnchorTarget(hash, "en"), hash).toBeNull();
  });

  it("find every old id on the tools page", () => {
    const html = page("en", <ToolsPage />);
    for (const id of ["probleem", "waarom-nu", "product", "controle", "hoe-het-werkt", "ontwerpgrenzen", "open-source", "status"]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });
});

describe("the offer pages", () => {
  const pages: Array<[string, () => JSX.Element]> = [
    ["checks", ChecksPage],
    ["security", SecurityPage],
    ["scan", ScanPage],
    ["tools", ToolsPage],
    ["consultancy", ConsultancyPage],
    ["about", AboutPage],
  ];

  it.each(pages)("%s renders with one h1 and without long dashes", (_name, Page) => {
    const html = page("en", <Page />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toMatch(LONG_DASH);
    expect(html).not.toContain("**");
  });

  // The grids and the log demonstration left the homepage; they are the evidence behind the free checks.
  it("shows the eight grids and the log demonstration on the checks page", () => {
    const html = page("en", <ChecksPage />);
    expect(html.match(/<figure/g)).toHaveLength(8);
    expect(html).toContain("2026-10-28.6");
    expect(html).toContain(HOME.en.proof.body);
  });

  it("names the public advisory on the security page and the contact on the conversation page", () => {
    expect(page("en", <SecurityPage />)).toContain(ADVISORY_URL);
    expect(page("en", <ConsultancyPage />)).toContain("mailto:info@tokenizen.nl");
  });

  it("keeps the content of the old homepage reachable on the tools page", () => {
    expect(page("en", <ToolsPage />)).toContain('id="controle"');
  });

  it("lists every new page in the sitemap and in llms.txt", () => {
    for (const slug of ["checks", "security", "scan", "tools", "consultancy", "about"]) {
      expect(sitemap, slug).toContain(`<loc>https://tokenizen.nl/en/${slug}</loc>`);
      expect(llms, slug).toContain(`https://tokenizen.nl/en/${slug}`);
    }
  });
});

// WCAG AA wants 4.5 to 1 for text. The yellow of the rings and the warning text was 4.42 and was raised.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string, from = 0) => {
  const i = css.indexOf(`${name}:`, from);
  return css.slice(i + name.length + 1, css.indexOf(";", i)).trim();
};

describe("the colours", () => {
  it("keep the yellow text readable on the paper background", () => {
    expect(contrast(token("--rule-yellow"), token("--background"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keep the muted text, the green and the cyan readable on the dark panel", () => {
    const panel = css.indexOf(".panel {");
    const bg = token("--background", panel);
    expect(contrast(token("--muted-foreground", panel), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--cell-visible", panel), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(token("--cell-hidden", panel), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(token("--cell-none", panel), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(token("--primary", panel), bg)).toBeGreaterThanOrEqual(4.5);
  });
});
