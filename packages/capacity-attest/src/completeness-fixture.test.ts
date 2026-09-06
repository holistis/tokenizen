import { describe, it, expect } from "vitest";
import { buildFixture, runControls } from "./completeness-fixture.js";

// CI equivalent of goun7's "controls verify on every push": the public
// completeness fixture must hold every time, or the guarantee it advertises is
// no longer true. This test runs the exact same controls the runnable example
// (examples/completeness-fixture.ts) prints, so the doc and the code cannot
// silently drift apart.

describe("public completeness fixture", () => {
  it("is deterministic: two builds produce identical claimIds", async () => {
    const a = await buildFixture();
    const b = await buildFixture();
    expect([a.c1.claimId, a.c2.claimId, a.c3.claimId]).toEqual([b.c1.claimId, b.c2.claimId, b.c3.claimId]);
  });

  it("the chain is wired as documented (c2->c1, c3->c2, c1 genesis)", async () => {
    const { c1, c2, c3 } = await buildFixture();
    expect(c1.priorClaimId).toBeUndefined();
    expect(c2.priorClaimId).toBe(c1.claimId);
    expect(c3.priorClaimId).toBe(c2.claimId);
    expect(c2.delivered).toBe("no"); // the claim a dishonest host wants to hide
  });

  it("every control passes (GREEN properties hold, RED tamper negatives are rejected)", async () => {
    const controls = await runControls();
    const failed = controls.filter((c) => !c.pass);
    // Surface exactly which control regressed, not just a count.
    expect(failed.map((c) => `${c.id}: expected ${c.expected}, got ${c.actual}`)).toEqual([]);
    expect(controls.length).toBeGreaterThanOrEqual(9);
  });

  it("has both GREEN and RED controls (it proves detection AND rejects tampering)", async () => {
    const controls = await runControls();
    expect(controls.some((c) => c.kind === "GREEN")).toBe(true);
    expect(controls.some((c) => c.kind === "RED")).toBe(true);
  });
});
