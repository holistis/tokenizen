// bazaar-discovery.ts — MCP-shaped bazaar discovery declarations for
// http-server.ts's two paid tools (record_delivery, publish_reputation_feedback).
//
// WHY A SEPARATE FILE: these declarations are deployment metadata (what a
// catalogue entry says this tool is), not request-handling logic, and keeping
// them apart from http-server.ts keeps that file's diff about behavior, not
// about a service-listing description.
//
// WHY MCP, NOT THE HTTP/REST SHAPE self-check-server's x402-seller.ts uses:
// @x402/extensions/bazaar ships TWO distinct declaration shapes
// (DeclareBodyDiscoveryExtensionConfig for a REST route, DeclareMcpDiscoveryExtensionConfig
// for an MCP tool). self-check-server is a REST/Express server; this package
// is MCP. Measured directly in node_modules: bazaarResourceServerExtension's
// own enrichDeclaration explicitly no-ops when transportContext is not an
// HTTP request context, AND again when declaration.info.input.type === "mcp"
// — the library's own HTTP-auto-fill (method, route pattern) is written to
// skip itself for exactly this case, not something this file works around.
//
// WHY z.toJSONSchema(...) AND NOT A HAND-WRITTEN inputSchema: the exact
// failure mode self-check-server's own declareBazaarDiscovery warns about
// ("a promise in a catalogue that the route does not keep is worse than no
// promise") is a hand-typed schema drifting from the real one. Deriving it
// from the SAME zod schema the tool itself validates against means a field
// added or removed there is reflected here automatically, never by someone
// remembering a second place to edit.
import { z } from "zod/v4";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { DeliveryClaimObject } from "./schema.js";
import { PublishReputationFeedbackInputSchema } from "./erc8004-reputation.js";

// A real, previously-used test fixture (http-server-record-delivery.test.ts),
// not invented for this file — same claim shape already proven to pass this
// tool's own real signature/schema checks end to end.
const RECORD_DELIVERY_EXAMPLE = {
  sellerAddress: "0x0000000000000000000000000000000000000000",
  buyerAddress: "0x0000000000000000000000000000000000000000",
  assetType: "api-credits",
  promisedSpec: "100 GPU-hours, H100, delivered by 2026-11-01",
  delivered: "yes",
  evidenceHash: "0".repeat(64),
  settlementRef: "invoice-0001",
  timestamp: "2026-10-22T00:00:00.000Z",
  claimId: `0x${"0".repeat(64)}`,
  signature: `0x${"0".repeat(130)}`,
};

export function declareRecordDeliveryBazaarDiscovery(): Record<string, unknown> {
  return declareDiscoveryExtension({
    toolName: "record_delivery",
    description:
      "Record a signed delivery claim into this installation's shared, append-only ledger. A flat fee, " +
      "identical for every caller, is charged on settlement; the write happens only after the fee clears.",
    // io: "input" — DeliveryClaimObject's sellerAddress/buyerAddress carry a
    // .transform(toLowerCase) (schema.ts), which zod's default "output" mode
    // cannot represent in JSON Schema at all (it describes the POST-
    // transform value, which has no schema of its own) and throws building
    // it. "input" describes what a caller SENDS, before that normalization —
    // the right question for a catalogue entry anyway.
    inputSchema: z.toJSONSchema(DeliveryClaimObject, { io: "input" }),
    example: RECORD_DELIVERY_EXAMPLE,
    output: {
      // The real success shape from http-server.ts's own textResult() call,
      // not a guess — see that file's record_delivery handler.
      example: { ok: true, claimId: RECORD_DELIVERY_EXAMPLE.claimId, note: "recorded once payment settles" },
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          claimId: { type: "string" },
          note: { type: "string" },
        },
        required: ["ok", "claimId", "note"],
      },
    },
  } as never) as Record<string, unknown>;
}

// Same provenance discipline: a claim shape already proven valid, plus the
// real registry/RPC reference fields publish_reputation_feedback's own
// PublishReputationFeedbackInputSchema requires.
const PUBLISH_REPUTATION_FEEDBACK_EXAMPLE = {
  reputationRegistryRef: "eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  agentRegistryRef: "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  agentId: "1",
  rpcUrl: "https://mainnet.base.org",
  claim: RECORD_DELIVERY_EXAMPLE,
};

export function declarePublishReputationFeedbackBazaarDiscovery(): Record<string, unknown> {
  return declareDiscoveryExtension({
    toolName: "publish_reputation_feedback",
    description:
      "Publish a claim's delivered fact to an ERC-8004 Reputation Registry, using this server's own signer and " +
      "gas. A flat fee applies per call, plus a global hourly cap shared across all callers.",
    // Same io: "input" reason as record_delivery above — claim nests
    // DeliveryClaimSchema, which carries the same transform.
    inputSchema: z.toJSONSchema(PublishReputationFeedbackInputSchema, { io: "input" }),
    example: PUBLISH_REPUTATION_FEEDBACK_EXAMPLE,
    output: {
      // The real success shape from http-server.ts's own handler — the
      // on-chain write itself happens later, in hooks.onAfterSettlement, so
      // this is honestly "accepted", not "published", at the moment this
      // response is returned.
      example: { ok: true, note: "feedback will be published on-chain once payment settles" },
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["ok", "note"],
      },
    },
  } as never) as Record<string, unknown>;
}
