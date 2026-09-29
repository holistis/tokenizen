// examples/demo.ts — end-to-end local demo, no live network touched except a
// real, self-hosted well-known-file check against a server this script
// itself starts and stops.
//
// Walks the whole flow: an operator wants an attestation for their own MCP
// endpoint, proves control of it via the well-known-file method, an attester
// runs some checks and signs the result, and a third party (an agent
// deciding whether to trust this endpoint) verifies it independently.
//
// Run with: npx tsx examples/demo.ts

import { createServer } from "node:http";
import { ethers } from "ethers";
import {
  challengeToken,
  verifyOwnership,
  signAttestation,
  verifyAttestation,
  computeAttestationId,
  type AttestationContent,
} from "../src/index.js";

async function main(): Promise<void> {
  console.log("=== endpoint-attest — local demo ===\n");

  const owner = ethers.Wallet.createRandom();
  const attester = ethers.Wallet.createRandom();
  const attesterSecret = "demo-secret-" + "x".repeat(40);
  console.log("owner     :", owner.address, "(requests and controls the endpoint)");
  console.log("attester  :", attester.address, "(runs the checks, signs the result)\n");

  console.log("2) Owner starts a REAL local server this script will attest about (a stand-in for their real endpoint)...");
  // The challenge token must be derived from the SAME endpoint that will
  // later be verified: the token is host-bound (see ownership.ts), so
  // computing it against a placeholder host and then verifying against the
  // real server's host would never match, by design (that binding is
  // exactly what stops one owner's token from proving control of a
  // different host). So the server has to exist, and its real address be
  // known, BEFORE the token can be computed.
  let publishedToken = "";
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(publishedToken);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const localEndpoint = `http://127.0.0.1:${port}/sse`;

  console.log("1) Owner asks for an attestation. Attester derives the challenge token for THIS endpoint...");
  const token = challengeToken(localEndpoint, owner.address, attesterSecret);
  publishedToken = token;
  console.log("   token:", token, "\n");

  console.log(`   published it at http://127.0.0.1:${port}/.well-known/endpoint-attest.txt\n`);

  try {
    console.log("3) Attester verifies ownership by fetching it, for real, over a real socket...");
    const proof = await verifyOwnership("well-known-file", localEndpoint, owner.address, attesterSecret);
    console.log("  ", JSON.stringify(proof), "\n");
    if (!proof.ok) throw new Error("ownership verification failed, demo cannot continue");

    console.log("4) Attester runs checks (simulated here) and signs the attestation...");
    const checkedAt = new Date();
    const expiresAt = new Date(checkedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const content: AttestationContent = {
      endpoint: localEndpoint,
      ownerAddress: owner.address,
      attesterAddress: attester.address,
      ownershipProof: {
        method: proof.method,
        token,
        location: proof.location,
        verifiedAt: proof.verifiedAt,
      },
      checksPerformed: ["tls-config", "no-open-admin-route", "auth-required-on-write"],
      outcome: "passed",
      findingsHash: "a".repeat(64), // stand-in: sha256 of a real findings report in production
      checkedAt: checkedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const { attestationId, signature } = await signAttestation(attester, content);
    const attestation = { ...content, attestationId, signature };
    console.log("   attestationId:", attestationId);
    console.log("   expires      :", expiresAt.toISOString(), "\n");

    console.log("5) A third party (an agent deciding whether to trust this endpoint) verifies it independently...");
    const result = verifyAttestation(attestation);
    console.log("  ", JSON.stringify(result), "\n");

    console.log("6) The same attestation, checked again after it has expired...");
    const afterExpiry = new Date(expiresAt.getTime() + 1000);
    const expiredResult = verifyAttestation(attestation, { now: afterExpiry });
    console.log("  ", JSON.stringify(expiredResult), "\n");

    console.log("7) Recomputing the id independently, without calling verifyAttestation at all...");
    const recomputed = computeAttestationId(attestation);
    console.log("   matches:", recomputed.toLowerCase() === attestationId.toLowerCase(), "\n");

    const ok = result.ok === true && expiredResult.ok === false && expiredResult.reason === "expired";
    console.log(ok ? "PROOF: the full flow works end to end, including the mandatory expiry." : "Something did not match expectations, see output above.");
    process.exitCode = ok ? 0 : 1;
  } finally {
    // Close even when something above throws: without this, a mistake
    // earlier in the script leaves the listening socket open and the
    // process never exits on its own, which is worse than a clean failure.
    server.close();
  }
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exitCode = 1;
});
