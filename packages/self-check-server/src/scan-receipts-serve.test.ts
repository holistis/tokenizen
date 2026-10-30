// scan-receipts-serve.test.ts: the list of delivered scan reports is shown read only, from one directory, and nothing else leaves it.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";

let server: Server;
let baseUrl: string;
let dir: string;
let outside: string;

function start(scanReceiptsDir: string | undefined, challengeRateLimit?: { windowMs: number; max: number }): Promise<void> {
  return new Promise((resolve) => {
    const app = createApp({ identity: createAttesterIdentity(), seller: null, ...(scanReceiptsDir ? { scanReceiptsDir } : {}), ...(challengeRateLimit ? { challengeRateLimit } : {}) });
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "scan-receipts-serve-"));
  dir = join(root, "list");
  outside = join(root, "secret.txt");
  mkdirSync(dir);
  writeFileSync(outside, "do not leak");
  writeFileSync(join(dir, "scan-receipts.jsonl"), '{"n":1}\n{"n":2}\n');
  writeFileSync(join(dir, "head-20261030-0600.txt"), "head text");
  writeFileSync(join(dir, "head-20261030-0600.txt.ots"), Buffer.from([0, 1, 2, 3]));
  writeFileSync(join(dir, "notes.txt"), "not a head file");
});

afterEach(() => {
  server?.close();
});

describe("with a directory configured", () => {
  beforeEach(() => start(dir));

  it("serves the list as plain text", async () => {
    const res = await fetch(`${baseUrl}/api/scan-receipts`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('{"n":1}\n{"n":2}\n');
  });

  it("lists only head files and their stamps", async () => {
    const res = await fetch(`${baseUrl}/api/scan-receipts/heads`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ files: ["head-20261030-0600.txt", "head-20261030-0600.txt.ots"] });
  });

  it("serves a head file as text and its stamp as bytes", async () => {
    const txt = await fetch(`${baseUrl}/api/scan-receipts/heads/head-20261030-0600.txt`);
    expect(txt.status).toBe(200);
    expect(await txt.text()).toBe("head text");
    const ots = await fetch(`${baseUrl}/api/scan-receipts/heads/head-20261030-0600.txt.ots`);
    expect(ots.status).toBe(200);
    expect(ots.headers.get("content-type")).toBe("application/octet-stream");
    expect([...new Uint8Array(await ots.arrayBuffer())]).toEqual([0, 1, 2, 3]);
  });

  it("refuses any name that is not a head file, including paths that climb out", async () => {
    for (const name of ["notes.txt", "..%2Fsecret.txt", "..%2F..%2Fsecret.txt", "%2Fetc%2Fpasswd", "head-20261030-0600.txt%00.js", "head-1-2.txt", "scan-receipts.jsonl"]) {
      const res = await fetch(`${baseUrl}/api/scan-receipts/heads/${name}`);
      expect(res.status, name).toBe(404);
    }
  });
});

describe("rate limit", () => {
  it("answers 429 on every one of the three routes once the per-caller limit is used up", async () => {
    for (const path of ["/api/scan-receipts", "/api/scan-receipts/heads", "/api/scan-receipts/heads/head-20261030-0600.txt"]) {
      await start(dir, { windowMs: 60_000, max: 2 });
      expect((await fetch(`${baseUrl}${path}`)).status, path + " 1").toBe(200);
      expect((await fetch(`${baseUrl}${path}`)).status, path + " 2").toBe(200);
      expect((await fetch(`${baseUrl}${path}`)).status, path + " 3").toBe(429);
      server.close();
    }
  });
});

describe("with nothing to show", () => {
  it("answers 404 on all three routes when no directory is configured", async () => {
    await start(undefined);
    for (const path of ["/api/scan-receipts", "/api/scan-receipts/heads", "/api/scan-receipts/heads/head-20261030-0600.txt"]) {
      expect((await fetch(`${baseUrl}${path}`)).status, path).toBe(404);
    }
  });

  it("says the list has not started when the directory exists but holds no list", async () => {
    const empty = mkdtempSync(join(tmpdir(), "scan-receipts-empty-"));
    await start(empty);
    const res = await fetch(`${baseUrl}/api/scan-receipts`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/not started/);
  });
});
