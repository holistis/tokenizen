// ledger.ts — append-only JSONL storage for delivery claims.
//
// Same pattern as mcp-paywall/src/ledger.mjs: one append-only file, nothing
// ever rewritten or deleted. There is intentionally no update/delete
// function anywhere in this module — a claim, once written, is permanent
// history. A second claim with the same content-addressed claimId (i.e. an
// attempt to re-record the exact same claim) is rejected rather than
// silently duplicated.

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, ensureDataDir } from "./config.js";
import { DeliveryClaimSchema, type DeliveryClaim } from "./schema.js";

function claimsFile(): string {
  return join(dataDir(), "claims.jsonl");
}

function readClaims(): DeliveryClaim[] {
  const file = claimsFile();
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [DeliveryClaimSchema.parse(JSON.parse(line))];
      } catch {
        // A corrupt/partial line (e.g. a truncated write) must not take down
        // reads of the rest of the ledger.
        return [];
      }
    });
}

/**
 * Append one already-verified claim to the ledger. Throws if a claim with
 * the same claimId was already recorded.
 */
export function appendClaim(claim: DeliveryClaim): DeliveryClaim {
  const existing = readClaims();
  if (existing.some((c) => c.claimId.toLowerCase() === claim.claimId.toLowerCase())) {
    throw new Error(`claim_already_recorded: ${claim.claimId}`);
  }
  ensureDataDir();
  appendFileSync(claimsFile(), JSON.stringify(claim) + "\n");
  return claim;
}

/** All claims recorded against one seller, oldest first. */
export function claimsForSeller(sellerAddress: string): DeliveryClaim[] {
  return readClaims()
    .filter((c) => c.sellerAddress.toLowerCase() === sellerAddress.toLowerCase())
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Every claim in the ledger, oldest first. Mainly useful for tests/inspection. */
export function allClaims(): DeliveryClaim[] {
  return readClaims().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
