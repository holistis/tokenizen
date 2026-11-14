import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const loader = require.resolve("tsx");
const entry = realpathSync(fileURLToPath(new URL("./fiscal-check-bin.ts", import.meta.url)));
let directory: string;
let linkedEntry: string;
let valid: string;
let invalid: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "capacity-fiscal-entry-"));
  linkedEntry = join(directory, "fiscal-check.ts");
  if (process.platform === "win32") {
    // Directory junctions do not require Windows file-symlink privileges.
    const linkedDirectory = join(directory, "source");
    symlinkSync(dirname(entry), linkedDirectory, "junction");
    linkedEntry = join(linkedDirectory, "fiscal-check-bin.ts");
  } else {
    symlinkSync(entry, linkedEntry, "file");
  }
  valid = join(directory, "valid.json");
  invalid = join(directory, "invalid.json");
  writeFileSync(valid, JSON.stringify({ version: "2", controls: [] }));
  writeFileSync(invalid, JSON.stringify({ version: "wrong", controls: [] }));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function run(args: string[], input?: string) {
  return spawnSync(process.execPath, ["--import", loader, ...args], {
    encoding: "utf8", input, timeout: 20_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
  });
}

describe("real fiscal-check process entrypoint", () => {
  it("prints the validation report through a symlinked entry", () => {
    const result = run([linkedEntry, valid]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Valid fiscal-controls document");
  });
  it("rejects an invalid document through a symlink, rather than silently succeeding", () => {
    const result = run([linkedEntry, invalid]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid fiscal-controls document");
  });
  it("does not run the CLI when imported from a stdin script", () => {
    const result = run(["--input-type=module", "-"], `await import(${JSON.stringify(pathToFileURL(entry).href)});`);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
