// paid-route-get.test.ts — a browser visitor must not meet a stack-page.
//
// Why this test exists, measured rather than imagined. A GET on the paid path fell
// through to Express's default handler, which answers with an HTML page reading
// "Cannot GET /api/paid/verify-ownership". That URL is the one we hand to readers
// when we point at a live x402 route, so the first thing a person saw after
// clicking it was an error page. A message gate caught it before it went out again.
//
// Two things are asserted and the second one is the point. The status is 405 with an
// Allow header, not 402: a 402 would promise that paying returns this resource by
// GET, and it does not. Answering with the more x402-shaped status to look better
// would be exactly the small untruth this project exists to avoid.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { createApp } from "./app.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";

const SELLER = {
  kid: "did:web:example.com#key-1",
  signerAddress: "0x" + "11".repeat(20),
  payTo: "0x" + "22".repeat(20),
  price: "$0.001",
  resourceBase: "https://api.example.com",
  // A throwaway key: this suite never signs anything, it only needs the paid route
  // to be MOUNTED so the GET handler next to it exists.
  privateKey: "0x" + "33".repeat(32),
  receiptV2: false,
};

let server: Server;
let baseUrl: string;

beforeEach(
  () =>
    new Promise<void>((resolve) => {
      const app = createApp({ identity: createAttesterIdentity(), seller: SELLER });
      server = createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    }),
);

afterEach(() => {
  server?.close();
});

describe("a GET on the paid route", () => {
  it("answers 405 with an Allow header instead of an HTML error page", async () => {
    const res = await fetch(`${baseUrl}/api/paid/verify-ownership`);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("is not an HTML page and does not say Cannot GET", async () => {
    const text = await (await fetch(`${baseUrl}/api/paid/verify-ownership`)).text();
    expect(text).not.toContain("Cannot GET");
    expect(text).not.toContain("<html");
  });

  it("tells the caller what to do and where the terms are", async () => {
    const body = await (await fetch(`${baseUrl}/api/paid/verify-ownership`)).json();
    expect(body.ok).toBe(false);
    expect(body.use.method).toBe("POST");
    expect(body.terms).toBe("/api/x402/conformance");
  });

  it("does not answer 402, because paying does not make this resource a GET", async () => {
    const res = await fetch(`${baseUrl}/api/paid/verify-ownership`);
    expect(res.status).not.toBe(402);
  });
});
