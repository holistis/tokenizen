#!/usr/bin/env node
// examples/reputation-lookup.mjs — WP1's runnable reference: one real command
// that looks up a seller's delivery history across every source this
// installation knows about, combining the local ledger with the two
// production-grade, non-local ClaimSources this package ships:
//   - EAS on Base (src/eas.ts), if RPC_URL is set.
//   - a plain HTTP endpoint (src/http-source.ts), if HTTP_SOURCE_URL is set.
//
// This is a READ-ONLY lookup: it never publishes anything, so unlike
// examples/eas-live-demo.ts it needs no funded key, no PRIVATE_KEY, and
// costs nothing to run, even against a real RPC. Whatever sources are not
// configured are simply skipped, with a clear note about what that means for
// the result (fewer sources = a narrower findability guarantee, per D-005;
// this script never pretends a skipped source was checked).
//
// Usage:
//   node examples/reputation-lookup.mjs <sellerAddress>
//
// Optional environment variables:
//   RPC_URL          Base (or Base Sepolia) JSON-RPC endpoint, adds the EAS source (read-only).
//   EAS_FROM_BLOCK    starting block for the EAS log scan. If unset, defaults to
//                      (latest - EAS_BLOCK_WINDOW), NOT 0: rpcAttestationReader
//                      scans block-by-block in sequential windows (src/eas.ts), so
//                      a from-genesis scan against a real chain (tens of millions of
//                      blocks on Base mainnet) would take hours and likely exceed
//                      discoverDeliveryHistory's own 30s per-source timeout before
//                      producing a single result. Pass EAS_FROM_BLOCK=0 explicitly
//                      to opt into a full historical scan anyway.
//   EAS_BLOCK_WINDOW  how many blocks back from the chain tip to scan when
//                      EAS_FROM_BLOCK is unset (default: 5000, the same window
//                      examples/eas-live-demo.ts already uses and relies on).
//   HTTP_SOURCE_URL   a plain HTTP endpoint implementing the ClaimSource convention
//                      documented in src/http-source.ts (GET ?seller=<address> -> JSON array).
//
// Run: npm run build && node examples/reputation-lookup.mjs 0xSellerAddress...

import { ethers } from "ethers";
import { discoverDeliveryHistory, localLedgerSource } from "../dist/discovery.js";
import { easSourceFromRpc } from "../dist/eas.js";
import { httpClaimSource } from "../dist/http-source.js";
import { ETH_ADDRESS_RE } from "../dist/schema.js";

const DEFAULT_EAS_BLOCK_WINDOW = 5000;

function usageAndExit() {
  console.error("Usage: node examples/reputation-lookup.mjs <sellerAddress>");
  console.error("  (optionally set RPC_URL and/or HTTP_SOURCE_URL first, see this file's header comment)");
  process.exitCode = 1;
}

async function main() {
  const sellerAddress = process.argv[2];
  if (!sellerAddress || !ETH_ADDRESS_RE.test(sellerAddress)) {
    usageAndExit();
    return;
  }

  const sources = [localLedgerSource()];
  const skipped = [];
  const notes = [];

  const rpcUrl = process.env["RPC_URL"];
  if (rpcUrl) {
    let fromBlock;
    const rawFromBlock = process.env["EAS_FROM_BLOCK"];
    if (rawFromBlock !== undefined && rawFromBlock !== "") {
      fromBlock = Number(rawFromBlock);
      // A malformed value (e.g. a typo) must not silently degrade into an
      // empty, all-windows-skipped scan that looks identical to "this
      // seller genuinely has zero EAS history" -- fail loud instead, since
      // this script's whole point is honest completeness reporting, never
      // a skipped source dressed up as a checked, empty one.
      if (!Number.isInteger(fromBlock) || fromBlock < 0) {
        console.error(`EAS_FROM_BLOCK must be a non-negative integer, got ${JSON.stringify(rawFromBlock)}`);
        process.exitCode = 1;
        return;
      }
    } else {
      // Default to a recent window, not 0: see this file's header comment
      // for why a from-genesis scan is impractical against a real chain.
      const windowSize = Number(process.env["EAS_BLOCK_WINDOW"] ?? String(DEFAULT_EAS_BLOCK_WINDOW));
      const latest = await new ethers.JsonRpcProvider(rpcUrl).getBlockNumber();
      fromBlock = Math.max(0, latest - windowSize);
      notes.push(`EAS scan starts at block ${fromBlock} (last ${windowSize} blocks only, not full history) — set EAS_FROM_BLOCK explicitly for a wider or full scan.`);
    }
    sources.push(easSourceFromRpc(rpcUrl, { fromBlock, name: "eas" }));
  } else {
    skipped.push("EAS (set RPC_URL to include it)");
  }

  const httpUrl = process.env["HTTP_SOURCE_URL"];
  if (httpUrl) {
    sources.push(httpClaimSource(httpUrl, { name: "http" }));
  } else {
    skipped.push("HTTP (set HTTP_SOURCE_URL to include it)");
  }

  console.log("=== capacity-attest — reputation lookup ===");
  console.log(`seller  : ${sellerAddress}`);
  console.log(`sources : ${sources.map((s) => s.name).join(", ")}`);
  if (skipped.length > 0) {
    console.log(`skipped : ${skipped.join("; ")}`);
    console.log("          (a skipped source narrows what this lookup can find, per D-005: findability is bounded by which sources are actually checked)");
  }
  for (const note of notes) console.log(`note    : ${note}`);
  console.log("");

  const result = await discoverDeliveryHistory(sellerAddress, sources);

  console.log(`${result.count} verified claim(s) found:\n`);
  for (const c of result.claims) {
    console.log(`  ${c.timestamp}  delivered=${c.delivered}  buyer=${c.buyerAddress}`);
    console.log(`    claimId      : ${c.claimId}`);
    console.log(`    promisedSpec : ${JSON.stringify(c.promisedSpec)}`);
    console.log(`    evidenceHash : ${c.evidenceHash}`);
    if (c.priorClaimId) console.log(`    priorClaimId : ${c.priorClaimId}`);
    console.log("");
  }

  console.log("per-source accounting:");
  for (const s of result.sources) {
    const line = `  ${s.name}: fetched=${s.fetched} accepted=${s.accepted} rejected=${s.rejected} wrongSeller=${s.wrongSeller} duplicates=${s.duplicates}`;
    console.log(s.error ? `${line} error=${JSON.stringify(s.error)}` : line);
  }

  console.log(`\ncompleteness.chainConsistent = ${result.completeness.chainConsistent}`);
  if (result.completeness.possibleOmissions.length > 0) {
    console.log(`possible omissions detected (${result.completeness.possibleOmissions.length}):`);
    for (const o of result.completeness.possibleOmissions) {
      console.log(`  missing claim referenced as priorClaimId ${o.missingPriorClaimId} by ${o.referencedBy}`);
    }
  }

  console.log(`\n${result.note}`);

  // A source that hit discoverDeliveryHistory's own per-source timeout is
  // abandoned, not cancelled (see discovery.ts's withTimeout: "the source's
  // own promise is not cancelled"), so an in-flight RPC call can keep a
  // handle open in the background after this function returns. Exit
  // explicitly so the script's own visible run always terminates promptly
  // rather than leaving the terminal hanging on a lingering handle.
  //
  // console.log's writes to stdout can be asynchronous (e.g. when stdout is
  // piped to another process on POSIX), so exiting immediately after the
  // last console.log above risks silently truncating exactly the
  // trust-context lines (per-source accounting, completeness, the note)
  // this script exists to print. Waiting for one more write's callback
  // proves everything queued before it has already flushed, since stream
  // writes are processed in order.
  await new Promise((resolve) => process.stdout.write("", resolve));
  process.exit(0);
}

main().catch((e) => {
  console.error("reputation lookup failed:", e);
  process.exitCode = 1;
});
