import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several test files (fiscal-controls.test.ts, http-server-publish-feedback.test.ts,
    // http-server-record-delivery.test.ts, server-guards.test.ts) deliberately re-import
    // http-server.js fresh per test via vi.resetModules() + a dynamic `await import(...)`, to
    // observe real module-load-time behavior under different env vars rather than a cached
    // module graph. http-server.ts's own import graph is heavy (ethers, two x402 packages, the
    // MCP SDK) and keeps growing (settlement-corroboration.ts -> eip3009-authorizer-from-tx.ts ->
    // ethers again, spend-cap-store.ts, ...), so each one of those re-imports got measurably more
    // expensive this round. Run in isolation a re-import is ~300ms; under the FULL suite's
    // CPU/worker contention (34 files, 900+ tests) that same re-import can intermittently exceed
    // vitest's 5000ms default per-test timeout — reproduced twice by an independent reviewer on
    // 13 nov 2026, even though it did not reproduce on every run here. This is a timing margin
    // problem, not a logic bug in the re-imported code (see fiscal-controls.test.ts's own
    // comment on the describe block this protects), so the fix is a wider timeout, not a code
    // change. 20s is generous versus the ~300ms a single re-import actually costs in isolation,
    // while still failing fast on a genuine hang.
    testTimeout: 20_000,
  },
});
