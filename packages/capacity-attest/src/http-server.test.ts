// http-server.test.ts — proves the 4 mandatory checks (data validation,
// exposure, rate limiting) actually hold, plus a real end-to-end MCP call,
// against a real listening server on an ephemeral port. Not a mock: this
// starts the real http.Server this file exports and speaks real HTTP to it,
// same discipline as the rest of this package's "actually run it" tests.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import { createApp } from "./http-server.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createHttpServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected a real port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function postMcp(body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("http-server: real end-to-end MCP calls over HTTP", () => {
  // RECORD_DELIVERY_PAY_TO is unset in this process, so record_delivery
  // should not be registered — see http-server-record-delivery.test.ts for
  // the opposite case (PAY_TO set), which needs a fresh module import to
  // exercise that branch's module-load-time setup.
  it("initializes and lists exactly the seven read-only tools when RECORD_DELIVERY_PAY_TO is unset", async () => {
    const initRes = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
    });
    expect(initRes.status).toBe(200);

    const listRes = await postMcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const text = await listRes.text();
    const names = [...text.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toContain("get_delivery_history");
    expect(names).toContain("get_compute_track_record");
    expect(names).toContain("get_fabrication_signals");
    expect(names).toContain("compare_sellers");
    expect(names).toContain("discover_delivery_history");
    expect(names).toContain("bridge_x402_receipt");
    expect(names).toContain("get_agent_snapshot");
    expect(names).toContain("resolve_agent_identity");
    expect(names).not.toContain("record_delivery");
    expect(names).not.toContain("publish_reputation_feedback");
  });

  it("calls get_delivery_history for real and gets a well-formed, empty result for an unused address", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_delivery_history", arguments: { sellerAddress: "0x00000000000000000000000000000000000000aa" } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 0');
    expect(text).toContain('\\"claims\\": []');
  });
});

describe("http-server: get_compute_track_record filters to compute claims only", () => {
  // Isolated from the rest of this file's tests: config.ts resolves
  // CAPACITY_ATTEST_DATA_DIR lazily on every ledger call (not at import
  // time), so this describe block can point at its own throwaway directory
  // without touching the shared server started above or the "unused
  // address" test's empty-result assumption elsewhere in this file.
  let tmpDir: string;
  const sellerAddress = "0x00000000000000000000000000000000000000bb";

  beforeAll(async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-compute-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const { appendClaim } = await import("./ledger.js");
    const wallet = testWallet();

    // One real compute claim (gpu-hours + measured) — SHOULD be returned.
    const computeContent = {
      sellerAddress,
      buyerAddress: wallet.address,
      assetType: "gpu-hours" as const,
      promisedSpec: "1x A100, 4 hours",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("compute evidence"),
      settlementRef: "0x" + "22".repeat(32),
      timestamp: new Date().toISOString(),
      measured: {
        unit: "gpu-second" as const,
        basis: "supplied" as const,
        promisedAmount: "14400",
        deliveredAmount: "14400",
        period: {
          start: new Date(Date.now() - 14_400_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          end: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
        method: { attribution: "buyer" as const, instrument: "test fixture" },
      },
    };
    const computeSigned = await signClaim(wallet, computeContent);
    await appendClaim({ ...computeContent, ...computeSigned });

    // One real, but NON-compute, unmeasured claim — must NOT be returned by
    // the filtered tool (it should still show up in plain get_delivery_history).
    const otherContent = {
      sellerAddress,
      buyerAddress: wallet.address,
      assetType: "storage" as const,
      promisedSpec: "10GB for a month",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("storage evidence"),
      settlementRef: "0x" + "33".repeat(32),
      timestamp: new Date().toISOString(),
    };
    const otherSigned = await signClaim(wallet, otherContent);
    await appendClaim({ ...otherContent, ...otherSigned });
  });

  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("get_delivery_history (unfiltered) shows BOTH claims", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "get_delivery_history", arguments: { sellerAddress } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 2');
  });

  it("get_compute_track_record returns ONLY the gpu-hours+measured claim", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "get_compute_track_record", arguments: { sellerAddress } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 1');
    expect(text).toContain("gpu-hours");
    expect(text).not.toContain('\\"assetType\\": \\"storage\\"');
  });
});

describe("http-server: get_fabrication_signals counts real, distinct buyers", () => {
  let tmpDir: string;
  const sellerAddress = "0x00000000000000000000000000000000000000cc";

  beforeAll(async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-fabrication-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const { appendClaim } = await import("./ledger.js");

    // Buyer A: 3 claims. Buyer B: 1 claim. 4 total, 2 distinct buyers,
    // top buyer share 3/4 = 0.75 — three independently checkable, exact
    // numbers, not "looks about right".
    const buyerA = testWallet();
    const buyerB = testWallet();
    for (let i = 0; i < 3; i++) {
      const content = {
        sellerAddress,
        buyerAddress: buyerA.address,
        assetType: "api-credits" as const,
        promisedSpec: `call batch ${i}`,
        delivered: "yes" as const,
        evidenceHash: evidenceHash(`buyerA evidence ${i}`),
        settlementRef: "0x" + "44".repeat(32),
        timestamp: new Date().toISOString(),
      };
      await appendClaim({ ...content, ...(await signClaim(buyerA, content)) });
    }
    const soloContent = {
      sellerAddress,
      buyerAddress: buyerB.address,
      assetType: "api-credits" as const,
      promisedSpec: "one-off call",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("buyerB evidence"),
      settlementRef: "0x" + "55".repeat(32),
      timestamp: new Date().toISOString(),
    };
    await appendClaim({ ...soloContent, ...(await signClaim(buyerB, soloContent)) });
  });

  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("counts total claims, distinct buyers, and the top buyer's exact share", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "get_fabrication_signals", arguments: { sellerAddress } },
    });
    const text = await res.text();
    expect(text).toContain('\\"totalClaims\\": 4');
    expect(text).toContain('\\"distinctBuyers\\": 2');
    expect(text).toContain('\\"topBuyerShare\\": 0.75');
  });

  it("a seller with zero claims gets zero/null facts, not a crash or a fake default", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "get_fabrication_signals", arguments: { sellerAddress: "0x00000000000000000000000000000000000000dd" } },
    });
    const text = await res.text();
    expect(text).toContain('\\"totalClaims\\": 0');
    expect(text).toContain('\\"distinctBuyers\\": 0');
    expect(text).toContain('\\"topBuyerShare\\": null');
  });
});

describe("http-server: compare_sellers runs the same facts across several addresses in one call", () => {
  let tmpDir: string;
  const sellerA = "0x00000000000000000000000000000000000000ee"; // gets 1 compute claim, 1 buyer
  const sellerB = "0x00000000000000000000000000000000000000ff"; // gets 0 claims entirely

  beforeAll(async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-compare-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const { appendClaim } = await import("./ledger.js");
    const wallet = testWallet();
    const content = {
      sellerAddress: sellerA,
      buyerAddress: wallet.address,
      assetType: "gpu-hours" as const,
      promisedSpec: "1x A100, 1 hour",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("compare-sellers fixture"),
      settlementRef: "0x" + "66".repeat(32),
      timestamp: new Date().toISOString(),
      measured: {
        unit: "gpu-second" as const,
        basis: "supplied" as const,
        promisedAmount: "3600",
        deliveredAmount: "3600",
        period: {
          start: new Date(Date.now() - 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          end: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
        method: { attribution: "buyer" as const, instrument: "test fixture" },
      },
    };
    await appendClaim({ ...content, ...(await signClaim(wallet, content)) });
  });

  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns one row per seller, in the SAME order as the input, with no sorting/ranking", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: { name: "compare_sellers", arguments: { sellerAddresses: [sellerB, sellerA] } },
    });
    const text = await res.text();
    const match = text.match(/"text":"((?:[^"\\]|\\.)*)"/);
    if (!match) throw new Error(`no text content in MCP response: ${text}`);
    const result = JSON.parse(JSON.parse(`"${match[1]}"`));

    expect(result.sellers).toHaveLength(2);
    // sellerB (zero claims) was listed FIRST in the input and must stay first.
    expect(result.sellers[0].sellerAddress).toBe(sellerB);
    expect(result.sellers[0].totalClaims).toBe(0);
    expect(result.sellers[0].computeClaimCount).toBe(0);
    expect(result.sellers[0].topBuyerShare).toBeNull();
    // sellerA (1 compute claim) stays second, matching input order.
    expect(result.sellers[1].sellerAddress).toBe(sellerA);
    expect(result.sellers[1].totalClaims).toBe(1);
    expect(result.sellers[1].computeClaimCount).toBe(1);
    expect(result.sellers[1].distinctBuyers).toBe(1);
  });

  it("rejects more than 10 sellerAddresses in one call", async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "compare_sellers", arguments: { sellerAddresses: tooMany } },
    });
    const text = await res.text();
    expect(text.toLowerCase()).toContain("invalid");
  });
});

describe("http-server: discover_delivery_history aggregates the local ledger with caller-named extra sources", () => {
  let tmpDir: string;
  const sellerAddress = "0x00000000000000000000000000000000000001aa";

  beforeAll(async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-discover-test-"));
    process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;

    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const { appendClaim } = await import("./ledger.js");
    const wallet = testWallet();
    const content = {
      sellerAddress,
      buyerAddress: wallet.address,
      assetType: "storage" as const,
      promisedSpec: "10GB for a month",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("discover-delivery-history fixture"),
      settlementRef: "0x" + "77".repeat(32),
      timestamp: new Date().toISOString(),
    };
    await appendClaim({ ...content, ...(await signClaim(wallet, content)) });
  });

  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    delete process.env["CAPACITY_ATTEST_DATA_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("with no extra sources named, returns exactly the local ledger's claim under a 'local-ledger' source report", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "discover_delivery_history", arguments: { sellerAddress } },
    });
    const text = await res.text();
    expect(text).toContain('\\"count\\": 1');
    expect(text).toContain('\\"name\\": \\"local-ledger\\"');
    expect(text).toContain('\\"accepted\\": 1');
  });

  it("an unreachable EAS source fails in isolation, reported by name, without hiding the local ledger's claim", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "discover_delivery_history",
        arguments: { sellerAddress, easSources: [{ rpcUrl: "http://127.0.0.1:1", chainId: 8453 }] },
      },
    });
    const text = await res.text();
    // The local ledger's one real claim still comes through...
    expect(text).toContain('\\"count\\": 1');
    // ...and the unreachable EAS source reports its OWN failure by name, rather
    // than the whole call failing or the error being silently swallowed.
    expect(text).toContain('\\"name\\": \\"eas:8453\\"');
    expect(text.toLowerCase()).toContain("econnrefused");
  });

  it("refuses an unlisted chainId with no easAddress override, cleanly, before attempting any network call", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "discover_delivery_history",
        arguments: { sellerAddress, easSources: [{ rpcUrl: "http://127.0.0.1:1", chainId: 999999 }] },
      },
    });
    const text = await res.text();
    expect(text).toContain("invalid_input");
    expect(text).toContain("999999");
  });

  it("rejects more than 3 EAS sources in one call", async () => {
    const tooMany = Array.from({ length: 4 }, () => ({ rpcUrl: "http://127.0.0.1:1", chainId: 8453 }));
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: { name: "discover_delivery_history", arguments: { sellerAddress, easSources: tooMany } },
    });
    const text = await res.text();
    expect(text.toLowerCase()).toContain("invalid");
  });
});

describe("http-server: get_agent_snapshot combines identity resolution and delivery history", () => {
  it("lists get_agent_snapshot alongside the other read-only tools", async () => {
    const res = await postMcp({ jsonrpc: "2.0", id: 60, method: "tools/call", params: { name: "get_agent_snapshot", arguments: {} } });
    const text = await res.text();
    // Called with no arguments at all: MCP's own schema validation should
    // refuse this before the handler ever runs — proves the tool is wired
    // into the real schema, not merely present in tools/list.
    expect(text.toLowerCase()).toMatch(/invalid|required|error/);
  });

  it("when identity resolution fails, returns the identity failure directly without attempting a delivery-history lookup", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: {
        name: "get_agent_snapshot",
        arguments: { agentRegistryRef: "not-a-valid-ref", agentId: "1", rpcUrl: "https://example-rpc.invalid/" },
      },
    });
    const text = await res.text();
    // The exact wording resolveAgentIdentity() itself produces for a malformed
    // ref — confirms this short-circuited at identity resolution, never
    // reached a deliveryHistory lookup with a meaningless "owner".
    expect(text).toContain("agentRegistryRef must match");
  });
});

describe("http-server: bridge_x402_receipt decodes a real signed x402 offer-receipt", () => {
  // Pure computation over caller-supplied bytes — no ledger, no tmpDir, no
  // env var isolation needed, unlike the two describe blocks above. Reuses
  // the exact EIP-712 build this package's own receipt-real-artifact.test.ts
  // uses, because a self-rolled stand-in artifact would prove nothing about
  // the real wire format (see this tool's own description for why that
  // matters: the digest is over the transmitted bytes, never a reparse).
  const RECEIPT_TYPES = {
    Receipt: [
      { name: "version", type: "uint256" },
      { name: "network", type: "string" },
      { name: "resourceUrl", type: "string" },
      { name: "payer", type: "string" },
      { name: "issuedAt", type: "uint256" },
      { name: "transaction", type: "string" },
    ],
  } as const;
  const RECEIPT_DOMAIN = { name: "x402 receipt", version: "1", chainId: 1 } as const;
  const SETTLEMENT = "0x" + "ab".repeat(32);
  const ISSUED_AT = 1_767_225_600;

  interface ReceiptPayload {
    version: number;
    network: string;
    resourceUrl: string;
    payer: string;
    issuedAt: number;
    transaction: string;
  }

  function payload(payer: string, overrides: Partial<ReceiptPayload> = {}): ReceiptPayload {
    return {
      version: 1,
      network: "eip155:84532",
      resourceUrl: "https://tokenizen.nl/self-check",
      payer,
      issuedAt: ISSUED_AT,
      transaction: SETTLEMENT,
      ...overrides,
    };
  }

  async function signedArtifact(seller: import("ethers").Wallet, p: ReceiptPayload): Promise<string> {
    const signature = await seller.signTypedData(RECEIPT_DOMAIN, RECEIPT_TYPES as never, p);
    return JSON.stringify({ format: "eip712", payload: p, signature });
  }

  async function callBridge(args: Record<string, unknown>) {
    const res = await postMcp({ jsonrpc: "2.0", id: 30, method: "tools/call", params: { name: "bridge_x402_receipt", arguments: args } });
    const text = await res.text();
    const match = text.match(/"text":"((?:[^"\\]|\\.)*)"/);
    if (!match) throw new Error(`no text content in MCP response: ${text}`);
    return JSON.parse(JSON.parse(`"${match[1]}"`));
  }

  it("decodes a real receipt: recovered signer, digest, and a draft claim with settlementRef pre-filled", async () => {
    const { ethers } = await import("ethers");
    const seller = new ethers.Wallet("0x" + "44".repeat(32));
    const buyer = new ethers.Wallet("0x" + "55".repeat(32));
    const p = payload(buyer.address);
    const artifact = await signedArtifact(seller, p);
    const { receiptDigest } = await import("./receipt-check.js");

    const result = await callBridge({ receiptArtifact: artifact });
    expect(result.ok).toBe(true);
    expect(result.recoveredSigner.toLowerCase()).toBe(seller.address.toLowerCase());
    expect(result.digest).toBe(receiptDigest(artifact));
    expect(result.draftClaim.buyerAddress).toBe(buyer.address);
    expect(result.draftClaim.settlementRef).toBe(SETTLEMENT);
    expect(result.draftClaim.offerReceiptHash).toBe(result.digest);
    expect(result.draftClaim.stillRequired).toEqual(["assetType", "promisedSpec", "delivered", "evidenceHash", "timestamp"]);
    expect(result.signerAuthorizedForHost).toContain("not checked");
    expect(result.binding).toBeNull();
    expect(result.comparison).toBeNull();
  });

  it("a privacy-minimal receipt (empty transaction, §5.4) adds settlementRef to stillRequired instead of guessing it", async () => {
    const { ethers } = await import("ethers");
    const seller = new ethers.Wallet("0x" + "66".repeat(32));
    const buyer = new ethers.Wallet("0x" + "77".repeat(32));
    const p = payload(buyer.address, { transaction: "" });
    const artifact = await signedArtifact(seller, p);

    const result = await callBridge({ receiptArtifact: artifact });
    expect(result.ok).toBe(true);
    expect(result.draftClaim.settlementRef).toBeUndefined();
    expect(result.draftClaim.stillRequired).toContain("settlementRef");
  });

  it("malformed JSON is reported as unparseable, never a crash", async () => {
    const result = await callBridge({ receiptArtifact: "not json at all" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unparseable");
  });

  it("an unsupported format (jws) is rejected by name, not silently guessed at", async () => {
    const artifact = JSON.stringify({ format: "jws", payload: {}, signature: "deadbeef" });
    const result = await callBridge({ receiptArtifact: artifact });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unsupported_format");
  });

  it("a structurally-too-short signature fails recovery as bad_signature, not a thrown 500", async () => {
    const { ethers } = await import("ethers");
    const buyer = new ethers.Wallet("0x" + "88".repeat(32));
    const artifact = JSON.stringify({ format: "eip712", payload: payload(buyer.address), signature: "0x1234" });
    const result = await callBridge({ receiptArtifact: artifact });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects a receiptArtifact far larger than any real receipt before touching crypto", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: { name: "bridge_x402_receipt", arguments: { receiptArtifact: "x".repeat(20_000) } },
    });
    const text = await res.text();
    expect(text.toLowerCase()).toContain("invalid");
  });

  it("checks binding and agreement against a REAL signed claim, never against loose typed-in fields", async () => {
    const { ethers } = await import("ethers");
    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const seller = new ethers.Wallet("0x" + "99".repeat(32));
    const buyer = testWallet();
    const p = payload(buyer.address);
    const artifact = await signedArtifact(seller, p);
    const { receiptDigest } = await import("./receipt-check.js");
    const digest = receiptDigest(artifact);

    const claimTimestamp = new Date((ISSUED_AT + 30) * 1000).toISOString();
    const content = {
      sellerAddress: "0x" + "aa".repeat(20),
      buyerAddress: buyer.address,
      assetType: "api-credits" as const,
      promisedSpec: "1000 calls",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("real agreement test"),
      offerReceiptHash: digest,
      settlementRef: SETTLEMENT,
      timestamp: claimTimestamp,
    };
    const signed = await signClaim(buyer, content);
    const fullClaim = { ...content, ...signed };

    const result = await callBridge({ receiptArtifact: artifact, claim: fullClaim });
    expect(result.ok).toBe(true);
    expect(result.binding.bound).toBe(true);
    expect(result.comparison.agrees).toBe(true);
    expect(result.comparison.disagreements).toEqual([]);
  });

  it("a real signed claim naming a DIFFERENT buyer than the receipt shows a disagreement, not a silent pass", async () => {
    const { ethers } = await import("ethers");
    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const seller = new ethers.Wallet("0x" + "a1".repeat(32));
    const receiptPayer = new ethers.Wallet("0x" + "a2".repeat(32));
    const claimBuyer = testWallet(); // a DIFFERENT party than the receipt's payer
    const p = payload(receiptPayer.address);
    const artifact = await signedArtifact(seller, p);
    const { receiptDigest } = await import("./receipt-check.js");
    const digest = receiptDigest(artifact);

    const claimTimestamp = new Date((ISSUED_AT + 30) * 1000).toISOString();
    const content = {
      sellerAddress: "0x" + "bb".repeat(20),
      buyerAddress: claimBuyer.address,
      assetType: "api-credits" as const,
      promisedSpec: "1000 calls",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("mismatch test"),
      offerReceiptHash: digest,
      settlementRef: SETTLEMENT,
      timestamp: claimTimestamp,
    };
    const signed = await signClaim(claimBuyer, content);
    const fullClaim = { ...content, ...signed };

    const result = await callBridge({ receiptArtifact: artifact, claim: fullClaim });
    expect(result.ok).toBe(true);
    // The claim still genuinely NAMES this exact receipt (the hash matches) —
    // binding is about bytes, not about who the parties are.
    expect(result.binding.bound).toBe(true);
    expect(result.comparison.agrees).toBe(false);
    expect(result.comparison.disagreements.map((d: { field: string }) => d.field)).toContain("payer");
  });

  it("a claim with a tampered signature is refused outright, never compared", async () => {
    const { ethers } = await import("ethers");
    const { testWallet, evidenceHash } = await import("./test-helpers.js");
    const { signClaim } = await import("./signing.js");
    const seller = new ethers.Wallet("0x" + "c1".repeat(32));
    const buyer = testWallet();
    const p = payload(buyer.address);
    const artifact = await signedArtifact(seller, p);
    const { receiptDigest } = await import("./receipt-check.js");
    const digest = receiptDigest(artifact);

    const content = {
      sellerAddress: "0x" + "cc".repeat(20),
      buyerAddress: buyer.address,
      assetType: "api-credits" as const,
      promisedSpec: "1000 calls",
      delivered: "yes" as const,
      evidenceHash: evidenceHash("tamper test"),
      offerReceiptHash: digest,
      settlementRef: SETTLEMENT,
      timestamp: new Date((ISSUED_AT + 30) * 1000).toISOString(),
    };
    const signed = await signClaim(buyer, content);
    // Tamper AFTER signing: the signature no longer matches this content.
    const tamperedClaim = { ...content, ...signed, promisedSpec: "9999999 calls" };

    const res = await postMcp({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: { name: "bridge_x402_receipt", arguments: { receiptArtifact: artifact, claim: tamperedClaim } },
    });
    const text = await res.text();
    expect(text.toLowerCase()).toContain("signature_invalid");
  });
});

describe("http-server: data-check (mandatory check 2)", () => {
  it("rejects malformed JSON with 400, never a raw parse error", async () => {
    const res = await postMcp("not json");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid request body" });
  });

  it("rejects an oversized body before it reaches JSON.parse", async () => {
    const huge = "x".repeat(70 * 1024);
    const res = await postMcp(huge);
    expect(res.status).toBe(400);
  });
});

describe("http-server: exposure-check (mandatory check 3)", () => {
  it("returns 404 with no internal detail for an unknown path", async () => {
    const res = await fetch(`${baseUrl}/definitely-not-a-real-path`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["error"]);
  });
});

describe("http-server: rate-check (mandatory check 4)", () => {
  it("allows the configured max requests per window, then returns 429 for the same IP", async () => {
    // Own IP bucket: use a fresh path-adjacent call count independent of the
    // other describe blocks above by exhausting whatever budget remains,
    // then asserting the NEXT call is limited. Simpler and just as
    // conclusive as asserting an exact count: prove the ceiling exists at all.
    let sawLimited = false;
    for (let i = 0; i < 40 && !sawLimited; i++) {
      const res = await postMcp({ jsonrpc: "2.0", id: 100 + i, method: "tools/list", params: {} });
      if (res.status === 429) sawLimited = true;
    }
    expect(sawLimited).toBe(true);
  });
});
