// examples/full-chain-proof.ts — runs the FULL trust-attest-server flow
// twice, end to end, with two independent test endpoints: once expected to
// come back "passed" and once expected to come back "failed". Extends
// demo.ts (which only ever shows the "failed" case) by also showing the
// "passed" case, and by printing an explicit expected-vs-actual match at
// every step instead of only at the very end.
//
// HONEST SCOPE NOTE ON "BASE SEPOLIA TESTNET": this package's attestations
// are off-chain EIP-191 signatures over a content hash (see
// endpoint-attest/src/signing.ts) — there is no chain ID, no RPC call and no
// on-chain transaction anywhere in signAttestation()/verifyAttestation(), and
// endpoint-attest's own README says so explicitly ("no built-in EAS/on-chain
// publishing path here yet"). So there is nothing testnet-specific this
// script could exercise; the identities below are ordinary ethers.Wallets,
// which are exactly as valid on Base Sepolia as anywhere else (same address
// format, EVM-compatible), but no RPC endpoint is touched and no gas is
// spent, because nothing in this flow ever asks a chain anything. What IS
// real here: a real HTTP server on a real socket, real GET/fetch calls
// against it (not mocked), a real HMAC ownership challenge, and a real
// ECDSA signature + independent verification.
//
// Run with: npx tsx examples/full-chain-proof.ts

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ethers } from "ethers";
import { verifyAttestation } from "endpoint-attest";
import { createAttesterIdentity } from "../src/attester-identity.js";
import { getOwnershipChallenge, requestTrustAttestation } from "../src/server.js";

interface ScenarioSpec {
  name: string;
  expectedOutcome: "passed" | "failed";
  /** How the test endpoint answers a plain GET to "/" (never the well-known path, that is handled generically). */
  respondToPlainGet: (res: ServerResponse) => void;
}

interface ScenarioReport {
  name: string;
  expectedOutcome: "passed" | "failed";
  ownershipGateHeld: boolean; // the pre-publish call was correctly refused
  actualOutcome: string | undefined;
  outcomeMatched: boolean;
  independentVerifyOk: boolean;
  attesterNotOwner: boolean;
  overallMatch: boolean;
}

const SCENARIOS: ScenarioSpec[] = [
  {
    name: "endpoint that enforces auth (expected: passed)",
    expectedOutcome: "passed",
    respondToPlainGet: (res) => {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("Authentication required. Provide a valid API key.");
    },
  },
  {
    name: "endpoint that openly admits no auth (expected: failed)",
    expectedOutcome: "failed",
    respondToPlainGet: (res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("Welcome! No authentication required to use this endpoint.");
    },
  },
];

async function runScenario(spec: ScenarioSpec): Promise<ScenarioReport> {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`SCENARIO: ${spec.name}`);
  console.log("=".repeat(78));

  const identity = createAttesterIdentity();
  const owner = ethers.Wallet.createRandom();
  console.log("attester  :", identity.wallet.address, "(runs the check, signs the result)");
  console.log("owner     :", owner.address, "(requests the attestation, must prove control)");

  let publishedToken = "";
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/.well-known/endpoint-attest.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(publishedToken);
      return;
    }
    spec.respondToPlainGet(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const endpoint = `http://127.0.0.1:${port}/`;
  console.log("endpoint  :", endpoint, "(real local HTTP server, real socket, this script started it)");

  const report: Partial<ScenarioReport> = { name: spec.name, expectedOutcome: spec.expectedOutcome };

  try {
    console.log("\n1) FREE tool: get_ownership_challenge...");
    const challenge = getOwnershipChallenge({ endpoint, ownerAddress: owner.address }, identity);
    if (!challenge.ok) throw new Error(`get_ownership_challenge failed: ${challenge.error}`);
    console.log("   token to publish:", challenge.wellKnownFile.token);
    console.log("   publish at      :", challenge.wellKnownFile.location);

    console.log("\n2) BEFORE publishing, request_trust_attestation must be refused (ownership gate)...");
    const tooEarly = await requestTrustAttestation({ endpoint, ownerAddress: owner.address, method: "well-known-file" }, identity);
    console.log("   ok:", tooEarly.ok, tooEarly.ok ? "" : `(refused: ${tooEarly.error})`);
    report.ownershipGateHeld = tooEarly.ok === false;

    console.log("\n3) Owner publishes the well-known-file proof (served for real, over the real socket above)...");
    publishedToken = challenge.wellKnownFile.token;
    console.log("   now serving the exact token at", challenge.wellKnownFile.location);

    console.log("\n4) PAID tool: request_trust_attestation, now that ownership is provably published...");
    const result = await requestTrustAttestation({ endpoint, ownerAddress: owner.address, method: "well-known-file" }, identity);
    if (!result.ok) throw new Error(`request_trust_attestation failed even after publishing: ${result.error}`);
    console.log("   attestationId  :", result.attestation.attestationId);
    console.log("   ownershipProof :", JSON.stringify(result.attestation.ownershipProof));
    console.log("   checksPerformed:", result.attestation.checksPerformed);
    console.log("   outcome        :", result.attestation.outcome, `(expected: ${spec.expectedOutcome})`);
    console.log("   findings       :", JSON.stringify(result.findings));
    console.log("   expiresAt      :", result.attestation.expiresAt);

    report.actualOutcome = result.attestation.outcome;
    report.outcomeMatched = result.attestation.outcome === spec.expectedOutcome;
    report.attesterNotOwner = result.attestation.attesterAddress !== result.attestation.ownerAddress;

    console.log("\n5) A third party verifies the signed attestation independently (endpoint-attest's own verifier, no shared state)...");
    const verification = verifyAttestation(result.attestation);
    console.log("  ", JSON.stringify(verification));
    report.independentVerifyOk = verification.ok === true;

    report.overallMatch =
      report.ownershipGateHeld === true &&
      report.outcomeMatched === true &&
      report.independentVerifyOk === true &&
      report.attesterNotOwner === true;

    console.log(
      `\nSCENARIO RESULT: ${report.overallMatch ? "MATCHES EXPECTATION" : "DOES NOT MATCH EXPECTATION"} ` +
        `(gate held=${report.ownershipGateHeld}, outcome matched=${report.outcomeMatched}, ` +
        `independent verify ok=${report.independentVerifyOk}, attester!=owner=${report.attesterNotOwner})`,
    );

    return report as ScenarioReport;
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  console.log("=== trust-attest-server — full-chain proof (2 scenarios: passed + failed) ===");
  console.log(
    "Off-chain scope note: signing/verification here is EIP-191 over a content hash, chain-agnostic by design " +
      "(see endpoint-attest/README.md). No RPC endpoint is called and no testnet transaction occurs anywhere in " +
      "this script — see the file header for why that is an honest limit of the current design, not an omission " +
      "in this proof.",
  );

  const reports: ScenarioReport[] = [];
  for (const spec of SCENARIOS) {
    reports.push(await runScenario(spec));
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log("SUMMARY");
  console.log("=".repeat(78));
  for (const r of reports) {
    console.log(
      `- ${r.name}: expected=${r.expectedOutcome} actual=${r.actualOutcome} ` +
        `-> ${r.overallMatch ? "MATCH" : "MISMATCH"}`,
    );
  }

  const allMatch = reports.every((r) => r.overallMatch);
  console.log(
    allMatch
      ? "\nPROOF: the full ownership -> check -> signing -> independent-verification chain works end to end, " +
          "for both a 'passed' and a 'failed' real check outcome, gated correctly by ownership in both cases."
      : "\nSomething did not match expectations, see scenario output above.",
  );
  process.exitCode = allMatch ? 0 : 1;
}

main().catch((e) => {
  console.error("full-chain-proof failed:", e);
  process.exitCode = 1;
});
