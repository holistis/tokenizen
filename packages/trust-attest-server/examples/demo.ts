// examples/demo.ts — end-to-end local demo, no live network touched except a
// real, self-hosted check against a server this script itself starts and
// stops.
//
// Walks the whole flow through this MCP server's own tool logic (not a raw
// MCP client — the same functions server.ts wires into registerTool):
// 1) the FREE tool derives the ownership challenge, 2) the owner publishes
// it via the well-known-file method, 3) the PAID tool verifies ownership and
// ONLY THEN runs the auth-signal check and signs the result, 4) a third
// party verifies the signed attestation independently.
//
// Deliberately shows a "failed" outcome, not a "passed" one: the demo
// endpoint's plain GET response admits, in its own words, that no
// authentication is required — exactly the case checks.ts exists to catch.
// This proves the attestation format can carry an honest bad result, not
// just a flattering one (see endpoint-attest/src/schema.ts: outcome is
// never a blanket safety claim in either direction).
//
// Run with: npx tsx examples/demo.ts

import { createServer } from "node:http";
import { ethers } from "ethers";
import { verifyAttestation } from "endpoint-attest";
import { createAttesterIdentity } from "../src/attester-identity.js";
import { getOwnershipChallenge, requestTrustAttestation } from "../src/server.js";

async function main(): Promise<void> {
  console.log("=== trust-attest-server — local demo ===\n");

  const identity = createAttesterIdentity();
  const owner = ethers.Wallet.createRandom();
  console.log("attester  :", identity.wallet.address, "(this MCP server's own identity — runs the check, signs the result)");
  console.log("owner     :", owner.address, "(requests the attestation, must prove control of the endpoint)\n");

  console.log(
    "0) A REAL local server this script will attest about goes up (a stand-in for a real MCP endpoint). " +
      "It will serve the well-known ownership proof once published, and — on a plain GET to the endpoint itself — " +
      "an honest admission that authentication is not required, so this demo also proves the 'failed' path works, " +
      "not only the flattering one.\n",
  );
  let publishedToken = "";
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/endpoint-attest.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(publishedToken);
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Welcome! No authentication required to use this endpoint.");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const endpoint = `http://127.0.0.1:${port}/`;

  try {
    console.log("1) Caller asks the FREE tool, get_ownership_challenge, for the token to publish...");
    const challenge = getOwnershipChallenge({ endpoint, ownerAddress: owner.address }, identity);
    if (!challenge.ok) throw new Error(`get_ownership_challenge failed: ${challenge.error}`);
    console.log("  ", challenge.instructions, "\n");

    console.log("2) Owner publishes the well-known-file proof (this demo server now serves it, for real, over a real socket)...");
    publishedToken = challenge.wellKnownFile.token;
    console.log("   published at:", challenge.wellKnownFile.location, "\n");

    console.log("3) BEFORE publishing, this call would have failed — proving ownership really does gate the paid tool:");
    const tooEarly = await requestTrustAttestation({ endpoint, ownerAddress: owner.address, method: "well-known-file" }, identity, {
      // Re-run against a server that has NOT published yet, by pointing at an endpoint whose well-known path 404s.
      ownershipDeps: { fetchImpl: async () => new Response("not found", { status: 404 }) },
    });
    console.log("   ok:", tooEarly.ok, tooEarly.ok ? "" : `(${tooEarly.error})`, "\n");

    console.log("4) Caller now asks the PAID tool, request_trust_attestation, for the real thing...");
    const result = await requestTrustAttestation({ endpoint, ownerAddress: owner.address, method: "well-known-file" }, identity);
    if (!result.ok) throw new Error(`request_trust_attestation failed: ${result.error}`);
    console.log("   attestationId :", result.attestation.attestationId);
    console.log("   checksPerformed:", result.attestation.checksPerformed);
    console.log("   outcome       :", result.attestation.outcome, "(honest: the endpoint really did admit no auth is required)");
    console.log("   expires       :", result.attestation.expiresAt);
    console.log("   findings      :", JSON.stringify(result.findings), "\n");

    console.log("5) A third party (an agent deciding whether to trust this endpoint) verifies it independently, using endpoint-attest's own verifier...");
    const verification = verifyAttestation(result.attestation);
    console.log("  ", JSON.stringify(verification), "\n");

    const ok =
      tooEarly.ok === false &&
      verification.ok === true &&
      result.attestation.outcome === "failed" &&
      result.attestation.attesterAddress !== result.attestation.ownerAddress;
    console.log(
      ok
        ? "PROOF: the full trust-attest-server flow works end to end — ownership-gated, and honestly reporting a failed check rather than hiding it."
        : "Something did not match expectations, see output above.",
    );
    process.exitCode = ok ? 0 : 1;
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exitCode = 1;
});
