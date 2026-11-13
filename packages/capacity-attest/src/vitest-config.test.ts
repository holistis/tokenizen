// vitest-config.test.ts — proves the testTimeout raise in ../vitest.config.ts is actually in
// place, not just a comment. Found 13 nov 2026: a completeness-critic review caught `npm test`
// failing non-deterministically (one test in fiscal-controls.test.ts timing out at the vitest
// default of 5000ms, reproduced twice) because several test files' vi.resetModules() + dynamic
// `await import("./http-server.js")` pattern got measurably more expensive as http-server.ts's
// own import graph grew this round. Without a test anchored to the actual config value, a future
// edit could silently delete or shrink testTimeout and reintroduce the exact same flake with
// nothing catching it before CI does.
import { describe, it, expect } from "vitest";
import config from "../vitest.config.js";

describe("vitest.config.ts testTimeout", () => {
  it("is raised well above vitest's 5000ms default — see vitest.config.ts's own comment for why", () => {
    const testTimeout = (config as { test?: { testTimeout?: number } }).test?.testTimeout;
    expect(typeof testTimeout).toBe("number");
    expect(testTimeout!).toBeGreaterThanOrEqual(15_000);
  });
});
