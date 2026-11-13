// fiscal-controls.test.ts — the schema validator is tested against both a
// known-good and a known-bad document (not just "does it run"), and the
// built document is proven to be DERIVED from the same env-controlled
// constants that gate real tool registration, not a hand-typed, driftable
// copy — same "trust the real source, not a second copy" reasoning
// bazaar-discovery.test.ts already applies to the bazaar declarations.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { FiscalControlSchema, validateFiscalControls } from "./fiscal-controls.js";

// The 7 field names proposed in modelcontextprotocol/registry#1300's own opening
// post, fetched and read directly (not from a paraphrase), 12 nov 2026. This test
// exists so a future field rename or removal is caught here, not discovered later
// by someone comparing our document against the actual GitHub thread by hand.
const PROPOSAL_FIELDS = ["paid_action_surface", "approval_source", "spend_cap", "charge_evidence", "audit_trail", "revocation_path", "next_safe_threshold"];
// Our own 1:1 (or split) mapping — see fiscal-controls.ts's header comment for why
// approval_source maps to human_approval_threshold and why spend_cap, as of v2
// (13 nov 2026), is a structured object rather than a bare number.
const OUR_FIELD_FOR = {
  paid_action_surface: "paid_action_surface",
  approval_source: "human_approval_threshold",
  spend_cap: "spend_cap",
  charge_evidence: "charge_evidence",
  audit_trail: "audit_trail",
  revocation_path: "revocation_path",
  next_safe_threshold: "next_safe_threshold",
};

const WELL_FORMED_SPEND_CAP = {
  unit: "paid-attempts" as const,
  max_per_window: 20,
  window_seconds: 3600,
  scope: "server-instance" as const,
  persistence: "in-memory" as const,
  reset_on_restart: true,
  reservation_before_settlement: true,
  pending_reservation_ttl_seconds: 600,
};

const WELL_FORMED_CONTROL = {
  tool: "publish_reputation_feedback",
  paid: true as const,
  paid_action_surface: "broadcasts one on-chain transaction",
  signer_isolation: true,
  signer_custody: "a private key in an in-process wallet, isolated from caller funds and influence",
  spend_cap: WELL_FORMED_SPEND_CAP,
  human_approval_threshold: null,
  charge_evidence: "the on-chain transaction itself",
  audit_trail: "the registry contract on-chain",
  next_safe_threshold: null,
  revocation_path: "rotate the key and redeploy",
};

describe("coverage against the 7 fields modelcontextprotocol/registry#1300 actually proposed", () => {
  it("every proposed field maps to a real field in our schema — a rename there must be caught here, not left to drift silently", () => {
    const ourFields = Object.keys(FiscalControlSchema.shape);
    for (const proposed of PROPOSAL_FIELDS) {
      const ours = OUR_FIELD_FOR[proposed as keyof typeof OUR_FIELD_FOR];
      expect(ours, `no mapping recorded for proposed field "${proposed}"`).toBeDefined();
      expect(ourFields, `mapped field "${ours}" for "${proposed}" does not exist in FiscalControlSchema`).toContain(ours);
    }
  });
});

describe("validateFiscalControls", () => {
  it("accepts a well-formed v2 document", () => {
    const result = validateFiscalControls({ version: "2", controls: [WELL_FORMED_CONTROL] });
    expect(result.valid, JSON.stringify((result as { errors?: string[] }).errors)).toBe(true);
  });

  it("rejects a v1 document — the spend_cap shape changed, so a stale document must fail loudly, not be silently misread", () => {
    const v1Shaped = { ...WELL_FORMED_CONTROL, spend_cap_per_hour: 20, spend_cap_scope: "global", reservation_before_settlement: true };
    const { spend_cap, ...withoutV2Cap } = v1Shaped as typeof v1Shaped & { spend_cap?: unknown };
    const result = validateFiscalControls({ version: "1", controls: [withoutV2Cap] });
    expect(result.valid).toBe(false);
    expect(result.errors?.join(" ")).toMatch(/version/);
  });

  it("rejects a document missing a required field, and says which one", () => {
    const result = validateFiscalControls({
      version: "2",
      controls: [{ tool: "x", paid: true, signer_isolation: true }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.join(" ")).toMatch(/spend_cap/);
  });

  it("rejects paid: false — this schema only describes tools that actually move money", () => {
    const result = validateFiscalControls({
      version: "2",
      controls: [
        {
          tool: "x",
          paid: false,
          signer_isolation: false,
          signer_custody: null,
          spend_cap: null,
          human_approval_threshold: null,
          charge_evidence: null,
          audit_trail: null,
          next_safe_threshold: null,
          paid_action_surface: "x",
          revocation_path: "n/a",
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a spend_cap with no unit, scope or persistence stated — these are exactly the fields a client must not be left to assume (found by YE-YI7's review, 13 nov 2026)", () => {
    const result = validateFiscalControls({
      version: "2",
      controls: [{ ...WELL_FORMED_CONTROL, spend_cap: { max_per_window: 20, window_seconds: 3600 } }],
    });
    expect(result.valid).toBe(false);
    const joined = result.errors?.join(" ") ?? "";
    expect(joined).toMatch(/spend_cap\.unit/);
    expect(joined).toMatch(/spend_cap\.scope/);
    expect(joined).toMatch(/spend_cap\.persistence/);
  });

  it("rejects signer_isolation: true with signer_custody: null — a bare true invites reading HSM/TEE-grade isolation into an unproven claim (found 13 nov 2026)", () => {
    const result = validateFiscalControls({ version: "2", controls: [{ ...WELL_FORMED_CONTROL, signer_custody: null }] });
    expect(result.valid).toBe(false);
    expect(result.errors?.join(" ")).toMatch(/signer_custody/);
  });

  it("accepts signer_isolation: null with signer_custody: null — nothing to isolate means nothing to describe", () => {
    const result = validateFiscalControls({
      version: "2",
      controls: [{ ...WELL_FORMED_CONTROL, signer_isolation: null, signer_custody: null, spend_cap: null }],
    });
    expect(result.valid, JSON.stringify((result as { errors?: string[] }).errors)).toBe(true);
  });
});

describe("buildFiscalControls: derived from the real gates, not a second hand-typed copy", () => {
  it("reports zero controls when neither paid tool is configured — never invents a claim about a tool that is not even active", async () => {
    vi.resetModules();
    delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY;
    delete process.env.PUBLISH_FEEDBACK_PAY_TO;
    delete process.env.RECORD_DELIVERY_PAY_TO;
    const { buildFiscalControls } = await import("./http-server.js");
    expect(buildFiscalControls()).toEqual({ version: "2", controls: [] });
  });

  it("reflects the real PUBLISH_FEEDBACK_MAX_PER_HOUR value live, inside the structured spend_cap, as paid-attempts not currency — not a hardcoded number that could silently drift from the real cap", async () => {
    vi.resetModules();
    process.env.REPUTATION_PUBLISHER_PRIVATE_KEY = "0x" + "7a".repeat(32);
    process.env.PUBLISH_FEEDBACK_PAY_TO = "0x2222222222222222222222222222222222222222";
    process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR = "7";
    delete process.env.RECORD_DELIVERY_PAY_TO;
    const { buildFiscalControls } = await import("./http-server.js");
    const doc = buildFiscalControls();
    const entry = doc.controls.find((c) => c.tool === "publish_reputation_feedback");
    expect(entry?.spend_cap?.unit).toBe("paid-attempts");
    expect(entry?.spend_cap?.max_per_window).toBe(7);
    expect(entry?.spend_cap?.scope).toBe("server-instance");
    expect(entry?.spend_cap?.persistence).toBe("in-memory");
    expect(entry?.spend_cap?.reset_on_restart).toBe(true);
    expect(entry?.signer_custody, "signer_isolation: true must always carry a non-null custody explanation").toBeTruthy();
    expect(validateFiscalControls(doc).valid, JSON.stringify(doc)).toBe(true);

    delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY;
    delete process.env.PUBLISH_FEEDBACK_PAY_TO;
    delete process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR;
  });

  it("record_delivery, when active, truthfully claims NO server-held signer at all (null, not false) and no spend cap — it only writes a local file", async () => {
    // null vs. false distinguishes "nothing to isolate" from "a signer exists but
    // isn't isolated" — found by muraqib-al-khasm's review, 12 nov 2026: a plain
    // false would have been unable to tell those two very different risk shapes apart.
    vi.resetModules();
    process.env.RECORD_DELIVERY_PAY_TO = "0x3333333333333333333333333333333333333333";
    delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY;
    delete process.env.PUBLISH_FEEDBACK_PAY_TO;
    const { buildFiscalControls } = await import("./http-server.js");
    const doc = buildFiscalControls();
    const entry = doc.controls.find((c) => c.tool === "record_delivery");
    expect(entry?.signer_isolation).toBeNull();
    expect(entry?.signer_custody).toBeNull();
    expect(entry?.spend_cap).toBeNull();
    expect(validateFiscalControls(doc).valid, JSON.stringify(doc)).toBe(true);

    delete process.env.RECORD_DELIVERY_PAY_TO;
  });

  it("a misconfigured PUBLISH_FEEDBACK_MAX_PER_HOUR produces a document that honestly fails its own schema, never a silently wrong number", async () => {
    // Found by muraqib's own probe, 12 nov 2026: buildFiscalControls() must not
    // paper over a broken env var with a fake-plausible value.
    for (const bad of ["", "0", "-5", "abc"]) {
      vi.resetModules();
      process.env.REPUTATION_PUBLISHER_PRIVATE_KEY = "0x" + "7a".repeat(32);
      process.env.PUBLISH_FEEDBACK_PAY_TO = "0x2222222222222222222222222222222222222222";
      process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR = bad;
      const { buildFiscalControls } = await import("./http-server.js");
      expect(validateFiscalControls(buildFiscalControls()).valid, `env=${JSON.stringify(bad)} must fail validation`).toBe(false);
    }
    delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY;
    delete process.env.PUBLISH_FEEDBACK_PAY_TO;
    delete process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR;
  });
});

describe("GET /.well-known/fiscal-controls.json — the real HTTP route, no payment, no auth", () => {
  let appServer: ReturnType<typeof createHttpServer>;
  let baseUrl: string;

  beforeAll(async () => {
    vi.resetModules();
    process.env.REPUTATION_PUBLISHER_PRIVATE_KEY = "0x" + "7a".repeat(32);
    process.env.PUBLISH_FEEDBACK_PAY_TO = "0x2222222222222222222222222222222222222222";
    process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR = "20";
    const { createApp } = await import("./http-server.js");
    appServer = createHttpServer(createApp());
    appServer.listen(0, "127.0.0.1");
    await once(appServer, "listening");
    const addr = appServer.address();
    if (!addr || typeof addr === "string") throw new Error("expected a real port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    delete process.env.REPUTATION_PUBLISHER_PRIVATE_KEY;
    delete process.env.PUBLISH_FEEDBACK_PAY_TO;
    delete process.env.PUBLISH_FEEDBACK_MAX_PER_HOUR;
  });

  it("returns 200 with a document that passes the real validator, before any payment is involved", async () => {
    const res = await fetch(`${baseUrl}/.well-known/fiscal-controls.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const result = validateFiscalControls(body);
    expect(result.valid, JSON.stringify((result as { errors?: string[] }).errors)).toBe(true);
    expect(body.controls.some((c: { tool: string }) => c.tool === "publish_reputation_feedback")).toBe(true);
  });

  it("is never rate-limited — a caller must be able to check safety controls without first spending part of a rate budget meant for real tool calls", async () => {
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`${baseUrl}/.well-known/fiscal-controls.json`);
      expect(res.status).toBe(200);
    }
  });

  it("a query string behind the URL (a proxy, a monitoring probe, cache-busting) still reaches the document, not a 404 (found by muraqib-al-mustamil, 12 nov 2026)", async () => {
    const res = await fetch(`${baseUrl}/.well-known/fiscal-controls.json?v=1&cache=bust`);
    expect(res.status).toBe(200);
    expect(validateFiscalControls(await res.json()).valid).toBe(true);
  });

  it("refuses a non-GET/HEAD method with 405, instead of silently serving the document to an unbounded POST body", async () => {
    const res = await fetch(`${baseUrl}/.well-known/fiscal-controls.json`, { method: "POST", body: "x" });
    expect(res.status).toBe(405);
  });

  it("HEAD returns no body, exactly like GET would answer without one", async () => {
    const res = await fetch(`${baseUrl}/.well-known/fiscal-controls.json`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});
