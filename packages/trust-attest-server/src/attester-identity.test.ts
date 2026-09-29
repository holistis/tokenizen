import { describe, it, expect, vi, afterEach } from "vitest";
import { createAttesterIdentity } from "./attester-identity.js";

const ENV_KEYS = ["TRUST_ATTEST_PRIVATE_KEY", "TRUST_ATTEST_OWNERSHIP_SECRET"] as const;
const ORIGINAL: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) ORIGINAL[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

// A throwaway, well-known test private key (Hardhat/Anvil account #0), never
// used for anything real. Fine to hardcode in a test file.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_SECRET = "s".repeat(40);

describe("createAttesterIdentity: persistent when configured", () => {
  it("uses the env-provided key and secret, marks persistent:true", () => {
    process.env.TRUST_ATTEST_PRIVATE_KEY = TEST_KEY;
    process.env.TRUST_ATTEST_OWNERSHIP_SECRET = TEST_SECRET;
    const id = createAttesterIdentity();
    expect(id.persistent).toBe(true);
    expect(id.ownershipSecret).toBe(TEST_SECRET);
    expect(id.wallet.address.toLowerCase()).toBe("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  });

  it("produces the SAME address across two separate calls, proving restart-stability", () => {
    process.env.TRUST_ATTEST_PRIVATE_KEY = TEST_KEY;
    process.env.TRUST_ATTEST_OWNERSHIP_SECRET = TEST_SECRET;
    const first = createAttesterIdentity();
    const second = createAttesterIdentity(); // simulates a second process start with the same env
    expect(second.wallet.address).toBe(first.wallet.address);
    expect(second.ownershipSecret).toBe(first.ownershipSecret);
  });

  it("rejects a too-short ownership secret instead of silently accepting a weak one", () => {
    process.env.TRUST_ATTEST_PRIVATE_KEY = TEST_KEY;
    process.env.TRUST_ATTEST_OWNERSHIP_SECRET = "tooshort";
    expect(() => createAttesterIdentity()).toThrow(/at least 32 characters/);
  });
});

describe("createAttesterIdentity: ephemeral fallback, loudly", () => {
  it("falls back to a random identity and warns on stderr when both env vars are missing", () => {
    delete process.env.TRUST_ATTEST_PRIVATE_KEY;
    delete process.env.TRUST_ATTEST_OWNERSHIP_SECRET;
    const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const id = createAttesterIdentity();
    expect(id.persistent).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DIFFERENT attesterAddress"));
    warn.mockRestore();
  });

  it("produces a DIFFERENT address across two calls when ephemeral, proving the restart problem is real without the fix", () => {
    delete process.env.TRUST_ATTEST_PRIVATE_KEY;
    delete process.env.TRUST_ATTEST_OWNERSHIP_SECRET;
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const first = createAttesterIdentity();
    const second = createAttesterIdentity();
    expect(second.wallet.address).not.toBe(first.wallet.address);
    vi.restoreAllMocks();
  });

  it("also falls back when only one of the two env vars is set (partial config is treated as absent, not half-trusted)", () => {
    process.env.TRUST_ATTEST_PRIVATE_KEY = TEST_KEY;
    delete process.env.TRUST_ATTEST_OWNERSHIP_SECRET;
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const id = createAttesterIdentity();
    expect(id.persistent).toBe(false);
    vi.restoreAllMocks();
  });
});
