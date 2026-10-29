import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";
import { INTERNAL_AGENT, usageLine } from "./usage-log.js";

describe("usageLine", () => {
  it("has exactly four keys and nothing that could identify a visitor", () => {
    const line = usageLine("cra", 200, "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0");
    expect(JSON.parse(line)).toEqual({ event: "free_check", route: "cra", status: 200, internal: false });
    // The visitor's user agent is read only to decide the flag; its text never reaches the line.
    expect(line).not.toContain("Mozilla");
    expect(line).not.toContain("Firefox");
  });

  it("flags our own test client, and only by the start of its user agent", () => {
    expect(JSON.parse(usageLine("cra", 200, `${INTERNAL_AGENT}/1`)).internal).toBe(true);
    expect(JSON.parse(usageLine("cra", 200, `Mozilla ${INTERNAL_AGENT}`)).internal).toBe(false);
    expect(JSON.parse(usageLine("cra", 200, undefined)).internal).toBe(false);
  });
});

describe("the count on the free-check routes", () => {
  let server: Server;
  let baseUrl: string;

  async function start(usageWriter?: (line: string) => void, craLimit = 100) {
    const app = createApp({
      identity: createAttesterIdentity(),
      seller: null,
      craCheck: { rateLimit: { windowMs: 60_000, max: craLimit } },
      ...(usageWriter ? { usageWriter } : {}),
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
  }
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  afterEach(() => {
    server?.close();
  });

  it("writes one line per answer, with the status, for both free checks, and counts the answers the rate limiter turns away", async () => {
    const lines: string[] = [];
    await start((line) => lines.push(line), 2);
    expect((await post("/api/cra/check", { repo: "not a repo" })).status).toBe(400);
    expect((await post("/api/cra/check", {})).status).toBe(400);
    expect((await post("/api/cra/check", { repo: "owner/repo" })).status).toBe(429);
    expect((await post("/api/x402/check", {})).status).toBe(400);
    // The writer is called after the answer is sent, so give the event loop a turn.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed).toEqual([
      { event: "free_check", route: "cra", status: 400, internal: false },
      { event: "free_check", route: "cra", status: 400, internal: false },
      { event: "free_check", route: "cra", status: 429, internal: false },
      { event: "free_check", route: "x402", status: 400, internal: false },
    ]);
  });

  it("never writes a repository name, an address or what the visitor sent", async () => {
    const lines: string[] = [];
    await start((line) => lines.push(line));
    await post("/api/cra/check", { repo: "secret-owner/secret-repo" });
    await post("/api/x402/check", { url: "https://seller.example/secret-path" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const all = lines.join("\n");
    expect(lines).toHaveLength(2);
    for (const forbidden of ["secret-owner", "secret-repo", "seller.example", "secret-path", "127.0.0.1", "::1"]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("marks a request from our own test client as internal", async () => {
    const lines: string[] = [];
    await start((line) => lines.push(line));
    await post("/api/cra/check", {}, { "user-agent": `${INTERNAL_AGENT}/1` });
    await post("/api/cra/check", {}, { "user-agent": "curl/8.0" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lines.map((l) => JSON.parse(l).internal)).toEqual([true, false]);
  });

  it("writes nothing and still answers when no writer is given", async () => {
    await start(undefined);
    expect((await post("/api/cra/check", {})).status).toBe(400);
  });

  it("keeps answering when the writer throws", async () => {
    await start(() => {
      throw new Error("disk full");
    });
    expect((await post("/api/cra/check", {})).status).toBe(400);
    expect((await post("/api/cra/check", {})).status).toBe(400);
  });
});
