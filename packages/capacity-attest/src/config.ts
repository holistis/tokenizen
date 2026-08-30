// config.ts — where the append-only claims ledger lives on disk.
//
// The directory is resolved lazily (a function, not a module-load-time
// constant) specifically so tests and examples/demo.ts can point at an
// isolated, disposable directory by setting CAPACITY_ATTEST_DATA_DIR right
// before calling a ledger function — no import-order gymnastics required.

import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");

/** Directory the claims ledger (claims.jsonl) is read from / written to. */
export function dataDir(): string {
  return process.env["CAPACITY_ATTEST_DATA_DIR"] || join(ROOT, "data");
}

/** Ensure the data directory exists and return its path. */
export function ensureDataDir(): string {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
