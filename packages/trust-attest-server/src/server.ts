#!/usr/bin/env node
// server.ts — MCP server wiring for trust-attest-server, plus the two
// tools' actual business logic (getOwnershipChallenge, requestTrustAttestation).
// Same overall pattern as capacity-attest/src/index.ts (McpServer +
// StdioServerTransport, registerTool with a zod inputSchema shape, results
// formatted as MCP text content blocks). Every honesty constraint that
// matters (ownership required before any attestation, checksPerformed
// non-empty, mandatory expiry, attester != owner) is enforced by
// endpoint-attest's own schema/signing code — see
// endpoint-attest/src/schema.ts's header for why those constraints live in
// the schema itself rather than being trusted to every caller.
//
// TWO TOOLS, ONE FREE ONE PAID: get_ownership_challenge is free (no checks
// run, no attestation issued — it only derives the token to publish) so that
// mcp-paywall (a separate repo, not touched by this package) can price it at
// 0 and price request_trust_attestation above 0. This package itself knows
// nothing about payment; that boundary is deliberately left to mcp-paywall.
//
// RATE-LIMITING, DELIBERATELY NOT HERE: get_ownership_challenge is cheap
// (pure local HMAC, no network) but this package has no rate-limit of its
// own on it. That is an intentional gap, not an oversight — mcp-paywall
// already rate-limits at the gateway layer (see its src/rate-limit.mjs),
// and duplicating that here would just be two limits to keep in sync. Flagged
// explicitly (2026-09-28 review, wazir-al-ghanima-a6) so this stays a stated
// assumption rather than a silent one: whoever wires this behind a gateway
// other than mcp-paywall needs to add rate-limiting there.
//
// WHY THE LOGIC IS SEPARATE FUNCTIONS, NOT INLINE IN registerTool CALLBACKS:
// getOwnershipChallenge() and requestTrustAttestation() below return plain,
// structured results (not MCP content blocks), and take `deps` for
// dependency injection — same DI seam as ownership.ts/checks.ts — so
// server.test.ts can test the actual decision logic (ownership required
// before any attestation, attester != owner, etc.) directly, with a mocked
// network, without going through a real MCP client/stdio transport.

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ETH_ADDRESS_RE,
  OWNERSHIP_METHODS,
  challengeToken,
  proofLocation,
  verifyOwnership,
  signAttestation,
  type OwnershipMethod,
  type OwnershipCheckDeps,
  type AttestationContent,
  type EndpointAttestation,
} from "endpoint-attest";
import { runChecks, type CheckDeps, type CheckFinding } from "./checks.js";
import { createAttesterIdentity, type AttesterIdentity } from "./attester-identity.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tool logic (testable independently of MCP wiring)
// ---------------------------------------------------------------------------

export interface GetOwnershipChallengeInput {
  endpoint: string;
  ownerAddress: string;
}

export type GetOwnershipChallengeResult =
  | {
      ok: true;
      dnsTxt: { location: string; token: string };
      wellKnownFile: { location: string; token: string };
      instructions: string;
    }
  | { ok: false; error: string };

/** FREE: derives the challenge token an owner must publish. Never touches the network, never issues an attestation. */
export function getOwnershipChallenge(input: GetOwnershipChallengeInput, identity: AttesterIdentity): GetOwnershipChallengeResult {
  try {
    const { endpoint, ownerAddress } = input;
    const token = challengeToken(endpoint, ownerAddress, identity.ownershipSecret);
    const dnsLocation = proofLocation("dns-txt", endpoint);
    const fileLocation = proofLocation("well-known-file", endpoint);
    return {
      ok: true,
      dnsTxt: { location: dnsLocation, token },
      wellKnownFile: { location: fileLocation, token },
      instructions:
        `Publish EXACTLY ONE of these two, then call request_trust_attestation with the same endpoint, ` +
        `ownerAddress and the method you chose. ` +
        `dns-txt: create a TXT record at "${dnsLocation}" with the exact value "${token}". ` +
        `well-known-file: serve the exact bytes "${token}" (no surrounding content) at "${fileLocation}".`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface RequestTrustAttestationInput {
  endpoint: string;
  ownerAddress: string;
  method: OwnershipMethod;
}

export interface RequestTrustAttestationDeps {
  /** Injected into verifyOwnership — lets tests supply a fake DNS/fetch instead of touching the network. */
  ownershipDeps?: OwnershipCheckDeps;
  /** Injected into runChecks — lets tests supply a fake fetch for the auth-signal check. */
  checkDeps?: CheckDeps;
  /** "Now", injectable so expiry math is deterministic in tests. */
  now?: () => Date;
}

export type RequestTrustAttestationResult =
  | { ok: true; attestation: EndpointAttestation; findings: CheckFinding[] }
  | { ok: false; error: string };

/**
 * PAID: verifies ownership first; only on success does it run checks and
 * sign an attestation. Mirrors endpoint-attest's own design: an attestation
 * can never be constructed without proven ownership (see
 * endpoint-attest/src/schema.ts's header, constraint 3).
 */
export async function requestTrustAttestation(
  input: RequestTrustAttestationInput,
  identity: AttesterIdentity,
  deps: RequestTrustAttestationDeps = {},
): Promise<RequestTrustAttestationResult> {
  const { endpoint, ownerAddress, method } = input;
  const now = deps.now ?? (() => new Date());
  try {
    // Defense in depth, checked BEFORE any network call: verifyAttestation
    // (endpoint-attest/src/signing.ts) rejects attester===owner as
    // "attester_is_owner" regardless, but refusing here means this server
    // never even attempts to sign a self-declaration it already knows would
    // be worthless, rather than doing the work and then handing back a
    // signed artifact that fails its own reader's check.
    if (ownerAddress.toLowerCase() === identity.wallet.address.toLowerCase()) {
      return { ok: false, error: "ownerAddress must not equal this attester's own address — an attestation where the attester is also the owner is a self-declaration, not an attestation" };
    }

    const proof = await verifyOwnership(method, endpoint, ownerAddress, identity.ownershipSecret, deps.ownershipDeps);
    if (!proof.ok) {
      return {
        ok: false,
        error:
          `ownership not verified (method=${method}, location=${proof.location}): ${proof.reason}. ` +
          `No checks were run and no attestation was issued.`,
      };
    }

    const token = challengeToken(endpoint, ownerAddress, identity.ownershipSecret);
    const checkResult = await runChecks(endpoint, deps.checkDeps);
    const findingsHash = createHash("sha256").update(JSON.stringify(checkResult.findings), "utf-8").digest("hex");
    const checkedAt = now();
    const expiresAt = new Date(checkedAt.getTime() + THIRTY_DAYS_MS);

    const content: AttestationContent = {
      endpoint,
      ownerAddress,
      attesterAddress: identity.wallet.address,
      ownershipProof: {
        method: proof.method,
        token,
        location: proof.location,
        verifiedAt: proof.verifiedAt,
      },
      checksPerformed: checkResult.checksPerformed,
      outcome: checkResult.outcome,
      findingsHash,
      checkedAt: checkedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const { attestationId, signature } = await signAttestation(identity.wallet, content);
    const attestation: EndpointAttestation = { ...content, attestationId, signature };
    return { ok: true, attestation, findings: checkResult.findings };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// MCP wiring
// ---------------------------------------------------------------------------

const EndpointField = z.string().min(1).max(2048).describe("The endpoint this attestation is about, e.g. an MCP server's URL.");
const OwnerAddressField = z
  .string()
  .regex(ETH_ADDRESS_RE, "ownerAddress must be a 0x-prefixed 20-byte address")
  .describe("The 0x-prefixed address of the party requesting the attestation, who must control the endpoint.");

function textResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

// Created once per process, held for the server's lifetime. Persistent
// across restarts when TRUST_ATTEST_PRIVATE_KEY and TRUST_ATTEST_OWNERSHIP_SECRET
// are set; falls back to an ephemeral identity with a loud stderr warning
// otherwise. See attester-identity.ts.
const identity = createAttesterIdentity();

const server = new McpServer({
  name: "trust-attest-server",
  version: "0.1.0",
});

server.registerTool(
  "get_ownership_challenge",
  {
    title: "Get the ownership challenge to publish before requesting a trust attestation",
    description:
      "FREE, no payment required. Given an endpoint and the owner's address requesting the attestation, returns " +
      "the exact challenge token to publish, for BOTH supported methods (a DNS TXT record and a well-known file), " +
      "plus instructions. Call this FIRST, publish one of the two proofs, then call request_trust_attestation (the " +
      "paid tool) with the SAME endpoint, ownerAddress and the method you published. This tool never runs any " +
      "checks and never issues an attestation by itself — it only derives the token an owner needs to publish to " +
      "prove control, per endpoint-attest's ACME-style ownership proof.",
    inputSchema: {
      endpoint: EndpointField,
      ownerAddress: OwnerAddressField,
    },
  },
  async (input) => {
    const result = getOwnershipChallenge(input, identity);
    if (!result.ok) return errorResult(result.error);
    const { dnsTxt, wellKnownFile, instructions } = result;
    return textResult({ dnsTxt, wellKnownFile, instructions });
  },
);

server.registerTool(
  "request_trust_attestation",
  {
    title: "Request a paid trust attestation for an endpoint (ownership must already be proven)",
    description:
      "PAID tool. Verifies that ownerAddress actually controls endpoint, via the method you published (see " +
      "get_ownership_challenge). ONLY IF that verification succeeds does this run the attester's checks and return " +
      "a signed, content-addressed, expiring EndpointAttestation. If ownership cannot be verified, this returns an " +
      "error and performs NO checks and issues NO attestation — endpoint-attest's own design does not allow an " +
      "attestation to exist without proven ownership, since that would stop being a voluntary certificate and " +
      "become an unsolicited report about a bystander who never asked. Call get_ownership_challenge first if you " +
      "have not already published a proof.",
    inputSchema: {
      endpoint: EndpointField,
      ownerAddress: OwnerAddressField,
      method: z.enum(OWNERSHIP_METHODS).describe("Which ownership-proof method you published: dns-txt or well-known-file."),
    },
  },
  async (input) => {
    const result = await requestTrustAttestation(input, identity);
    if (!result.ok) return errorResult(result.error);
    return textResult({ attestation: result.attestation, findings: result.findings });
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when this file is actually run as the MCP server process.
// Importing it from a test or from examples/demo.ts must never have the side
// effect of opening a stdio transport. Same guard pattern (pathToFileURL,
// not a raw string compare) as wazir-al-ghanima's dangling-domain-scan.mjs,
// chosen specifically because a raw `file://${process.argv[1]}` comparison
// mis-handles Windows backslash paths.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("trust-attest-server failed to start:", e);
    process.exit(1);
  });
}

export { server, identity };
