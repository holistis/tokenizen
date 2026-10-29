import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SERVER_ERRORS_NL, normaliseRepoInput, serverErrorText } from "@/components/pages/cra-check-page";

// The error sentences are only as good as their tie to the server files that write them: these tests read those files.
const serverFile = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../self-check-server/src/${name}`, import.meta.url)), "utf8");
const craCheck = serverFile("cra-check.ts");
const rateLimit = serverFile("rate-limit.ts");

const LONG_DASHES = /[–—]/;

describe("normaliseRepoInput", () => {
  const good: Array<[string, string]> = [
    ["expressjs/express", "expressjs/express"],
    ["  expressjs/express  ", "expressjs/express"],
    ["https://github.com/expressjs/express", "expressjs/express"],
    ["https://github.com/expressjs/express.git", "expressjs/express"],
    ["http://www.github.com/expressjs/express/", "expressjs/express"],
    ["github.com/expressjs/express", "expressjs/express"],
    ["https://github.com/expressjs/express/tree/main/lib", "expressjs/express"],
    ["a/b", "a/b"],
  ];
  for (const [input, expected] of good) {
    it(`reads ${JSON.stringify(input)} as ${expected}`, () => expect(normaliseRepoInput(input)).toBe(expected));
  }

  const bad = ["", "   ", "dit is geen repo", "expressjs", "<script>alert(1)</script>", "../../etc/passwd", "a/..", "a/.", "-bad/name", "own er/name", "a/b c", "https://example.com/a/b"];
  for (const input of bad) {
    it(`refuses ${JSON.stringify(input)}`, () => expect(normaliseRepoInput(input)).toBeNull());
  }

  it("never accepts what the server's own parser would refuse for an owner that is too long", () => {
    expect(normaliseRepoInput(`${"a".repeat(40)}/name`)).toBeNull();
    expect(normaliseRepoInput(`${"a".repeat(39)}/name`)).toBe(`${"a".repeat(39)}/name`);
  });
});

describe("serverErrorText", () => {
  it("has a Dutch sentence for every fixed error sentence, and every key is verbatim in the server source", () => {
    for (const english of Object.keys(SERVER_ERRORS_NL)) {
      expect(craCheck, `not found in cra-check.ts: ${english}`).toContain(english);
    }
    // The other way round: every fixed error sentence the CRA route can send has a Dutch entry.
    const sent = [...craCheck.matchAll(/error: "([^"]+)"/g)].map((m) => m[1]);
    const sentSingle = [...craCheck.matchAll(/error: '([^']+)'/g)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(5);
    for (const sentence of sent) expect(SERVER_ERRORS_NL, `no Dutch entry for: ${sentence}`).toHaveProperty([sentence]);
    // The one with a JSON example in it is only shown to someone who calls the API by hand; the page never sends that body.
    expect(sentSingle).toEqual(['send a JSON body like {"repo":"owner/name"}']);
  });

  it("keeps the Dutch free of long dashes and asterisks", () => {
    for (const dutch of Object.values(SERVER_ERRORS_NL)) {
      expect(dutch).not.toMatch(LONG_DASHES);
      expect(dutch).not.toContain("*");
    }
  });

  it("turns the rate limit sentence into plain words, using the real sentence from rate-limit.ts", () => {
    expect(rateLimit).toContain("rate limit exceeded: max ${max} requests per ${Math.round(windowMs / 1000)}s");
    const message = "rate limit exceeded: max 6 requests per 600s";
    expect(serverErrorText("en", message)).toBe("Too many checks from your connection: at most 6 per 10 minutes. Wait a few minutes and try again.");
    expect(serverErrorText("nl", message)).toBe("Te veel checks vanaf jouw verbinding: maximaal 6 per 10 minuten. Wacht een paar minuten en probeer het opnieuw.");
    expect(serverErrorText("nl", "rate limit exceeded: max 1 requests per 30s")).toBe("Te veel checks vanaf jouw verbinding: maximaal 1 per 1 minuut. Wacht een paar minuten en probeer het opnieuw.");
  });

  it("leaves English alone and maps Dutch, with the generic Dutch sentence for an unknown message", () => {
    expect(serverErrorText("en", "that repository was not found, or it is not public")).toBe("that repository was not found, or it is not public");
    expect(serverErrorText("nl", "that repository was not found, or it is not public")).toBe("Die repository is niet gevonden, of hij is niet openbaar.");
    expect(serverErrorText("nl", "something the server never said")).toBe("Er ging iets mis. Probeer het opnieuw.");
    expect(serverErrorText("en", "something the server never said")).toBe("something the server never said");
  });
});
