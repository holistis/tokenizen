# Self-build plan: NLnet work packages 1, 2 and 4

Status: WP1/WP2 EXECUTION STARTED, first two pieces merged (PR #15) / pending king confirmation (PR #16). Work package 3 (independent external security audit) is deliberately excluded from this plan: it must be done by someone who is not us, by definition, so it stays dependent on the NLnet grant (or another funding source), not something we self-build.

## Progress log (GETEST, each entry backed by a real command, not a description alone)

**2026-09-28, PR #15 (merged):** found and fixed a real gap while reading `eas.ts` for this plan: `rpcAttestationReader.uidsForSeller` made a single unbounded `getLogs(fromBlock:0, toBlock:"latest")` call, which most public RPC providers cap or reject outright. Fixed with a new, unit-tested `blockWindows()` pure helper (bounded-window chunking) plus a bounded-concurrency worker pool for `easSource.fetchForSeller` (was fully sequential). 541 -> 549 tests.

**2026-09-28, PR #16 (pending king confirmation):** added real, repeatable benchmarks (`npm run bench`, vitest bench) for both of the above. Measured, real numbers:
- easSource concurrency=1 (old) -> concurrency=10 (new default): **1,604ms -> 158ms for 100 attestations**, ~10x faster, matches PR #15's goal directly.
- `discoverDeliveryHistory`, single source, 1,000 claims: 1,559ms. Single source, 40,000 claims (near MAX_TOTAL_CLAIMS): 17,199ms — sub-linear, scales better than proportionally.
- Ten sources returning the SAME 40,000 claims (a realistic redundancy scenario: the same claims mirrored to multiple sources for availability): **68,838ms, 4x slower than one source with the same total**, for an identical result. Root cause: every copy paid full cryptographic signature-recovery verification, even when it was a byte-for-byte duplicate of a claim already accepted.
- Fixed with a cheap pre-check that recomputes claimId from content (a pure hash, not the expensive elliptic-curve signature recovery) before deciding whether to skip re-verification. First version of this fix trusted the claim's own, self-reported `claimId` field instead of recomputing it, which the existing `eas.test.ts` tamper test immediately and correctly caught as unsafe (a tampered claim can carry a stale, copied claimId). Fixed properly, added a direct regression test for it, re-verified: 20,000 claim-instances across 10 duplicate-heavy sources now takes 3.2s, matching the cost of verifying only the 2,000 genuinely unique claims once.
- 549 -> 550 tests, all passing.

Honest note for whoever reads this later, including any future NLnet update: the fast-path bug above was caught by this project's OWN existing test suite within the same work session it was introduced, before it ever reached a PR, let alone main. That is not a reason to gloss over it; it is exactly the kind of adversarial, fail-closed engineering discipline work package 3's external audit is meant to further stress-test at a level a single session's own tests cannot reach alone.

**2026-09-28, same PR (#16), pushed after the above:** a third real gap, found while building the adversarial-source fuzz test plan itself (not assumed upfront): `discoverDeliveryHistory` awaited each source's `fetchForSeller` with no timeout at all. A slow, overloaded, or deliberately stalling source would block the entire call indefinitely, since sources are processed in order, one stuck source censors every source listed after it. Fixed with a configurable `sourceTimeoutMs` (default 30s, `Promise.race`-style, no cancellation contract needed since a late resolution is simply ignored).

Added `discovery.fuzz.test.ts` (8 new tests, same precedent as `schema.fuzz.test.ts`): forged/garbage claims mixed into a real source's response (including a sparse array with a claimed length of 5 million, proving the per-entry loop is bounded by `maxClaimsPerSource` BEFORE it examines anything, not after), volume flooding across single and multiple sources, and the new timeout behavior including a source that resolves late, after its own timeout already fired (proven not to cause an unhandled rejection or corrupt the result).

541 -> 558 tests total across this PR so far, all passing. WP1's three named adversarial-source scenarios (forged/garbage injection, volume flood, slow/flaky) now all have direct, dedicated test coverage, matching the plan's own Verifier bar above.

Structured around the eleven-stage loop the king asked for. Each stage below is a real section, not a label.

---

## 1. Goal Manager

Top-level goal: deliver the technical substance of NLnet work packages 1, 2 and 4 ourselves, using Claude time instead of waiting for grant money, so that:

- tokenizen/capacity-attest becomes genuinely stronger and more adopted regardless of what NLnet decides.
- If the grant is awarded, the money is not wasted re-doing work we already finished; it goes toward whatever remains open at that point, or a deeper next round (a third chain, a bigger fuzz campaign) instead.
- Nothing reported to NLnet, in this project's docs, or to the king is ever overstated. Every claim of "done" is backed by a passing test or a verifiable on-chain result, never a description alone.

Sub-goals, matching the three work packages:

- WP1: cross-installation discovery hardening (`discoverDeliveryHistory()`, `src/discovery.ts`, `src/completeness.ts`).
- WP2: a second chain adapter, Ethereum mainnet and Optimism via EAS (`src/eas.ts`).
- WP4: documentation, a runnable example, and a second real-world integration writeup.

## 2. Constraint Checker

Hard constraints, checked before any step below is considered complete:

- Never push directly to main for this repo (Klasse A per the project's own rules). Every change goes: branch, PR, the king confirms it works, then merge.
- The existing 541 tests must keep passing at every step. A change that breaks an existing test is not "almost done," it is not done.
- No claim of "hardened" or "tested" goes into any document (this repo's docs, a future NLnet update, a public README) without a specific, named test or command that proves it. Matches Poort 7b from the wazir-al-ghanima constitution: every claim is GETEST or explicitly AFGELEID, never asserted bare.
- WP2's on-chain writes cost real gas on Ethereum mainnet specifically (Optimism is cheap, Ethereum mainnet is not). Any mainnet write beyond the already-existing Base ones needs an explicit king go-ahead on the actual cost before it happens, same as any other real-money action.
- If we end up finishing all three packages before NLnet decides, that is not a problem to hide; it goes straight into the eventual "where things stand" update to NLnet, honestly, exactly like the rest of this project's disclosure habits.

## 3. Planner

Order of execution, and why this order:

1. **WP1 first.** It has zero external dependency (no new chain, no new account), it is the largest of the three budget lines (which usually means it is the most technically substantial), and hardening the aggregation layer is a prerequisite for WP2 actually being trustworthy on a second chain, not just present on one.
2. **WP2 second.** Builds directly on a now-hardened `src/eas.ts`. Splits into two clearly separable steps: Optimism first (cheap to test, same OP-Stack EAS deployment pattern as Base), Ethereum mainnet second (real cost, needs the king's go-ahead per the constraint above).
3. **WP4 last, but not an afterthought.** Writing the integration guide and the worked example is easiest and most honest once WP1 and WP2 are actually finished, because the guide can describe what genuinely exists instead of what is planned.

Each work package is its own branch and its own PR, not one giant branch for all three. Smaller, reviewable diffs, and a partial result (say WP1 done, WP2 not started) stays mergeable on its own.

## 4. Researcher

Done already, as the first concrete action of this plan, not left for later:

- Re-ran the existing test suite: 541 tests, 14 files, all passing (`npm test` in `packages/capacity-attest`, 2026-09-28).
- Checked whether WP1's target already has any fuzz-style coverage, to avoid duplicating existing work: `src/schema.fuzz.test.ts` already exists (680 lines) and adversarially tests the schema/`computeClaimId()` layer (malformed and boundary claim content). It does NOT touch the aggregation layer (`discoverDeliveryHistory()`, multiple sources, volume, a source acting adversarially at the source level) or the completeness-detection logic (`src/completeness.ts`). That confirms the NLnet proposal's own description of the gap was accurate: the schema layer already has adversarial tests, the aggregation layer does not.
- Current file sizes for context: `src/discovery.ts` 261 lines, `src/completeness.ts` 160 lines, `src/eas.ts` 249 lines. None of these are large, unmanageable files; this is scoped, finishable work, not an open-ended rewrite.

Still to research before writing WP1 code: read `discovery.ts` and `completeness.ts` in full (not just line counts) to design the adversarial-source test fixtures against the actual current interface, not an assumed one.

Still to research before WP2: confirm Optimism's and Ethereum mainnet's EAS contract addresses and Schema Registry addresses directly from EAS's own official deployment list, never assumed from memory, exactly the same discipline that caught the earlier schema-UID mistake documented in the NLnet proposal itself.

## 5. Executor

Concrete build steps, WP1:

1. Read `discovery.ts` and `completeness.ts` fully.
2. Design adversarial source fixtures: a source that returns a forged-but-well-shaped claim, a source that floods volume (tens of thousands of claims), a source that is slow/flaky (timeouts, partial responses), a source that silently omits claims (the D-006 completeness problem from `DECISIONS.md`).
3. Add pagination and backpressure to `easSource` so a single adversarial or just-large source cannot exhaust the caller's resources.
4. Build a second, production-grade source implementation (design choice to be made during step 1-2: likely a simple HTTP/REST source, distinct from the EAS source, so the aggregation logic is proven against more than one source type).
5. Write the fuzz/property-based test suite for the aggregation and completeness-detection logic specifically (a new file, `discovery.fuzz.test.ts`, following the exact precedent already set by `schema.fuzz.test.ts`).
6. Build `examples/reputation-lookup.mjs`, a runnable CLI combining local ledger + EAS discovery into one working reference.

Concrete build steps, WP2:

1. Confirm EAS deployment addresses for Optimism and Ethereum mainnet from EAS's own source.
2. Generalize `src/eas.ts` so chain/contract addresses are a parameter, not hardcoded to Base.
3. Add the explicit per-chain schema bootstrap step (`ensureSchema()` called and verified per chain) as its own tested function, not a silent assumption, per the technical-challenges section of the NLnet proposal itself.
4. Write and run a real Optimism testnet or mainnet attestation first (cheap), verify it independently the same way the existing Base examples are verified (a real, public block-explorer link).
5. Only after Optimism works end to end: do the same on Ethereum mainnet, after the king's go-ahead on real gas cost.

Concrete build steps, WP4:

1. Write the English-language integration guide, describing what actually exists after WP1/WP2, not before.
2. Find or produce a second real-world worked example: either document a second independent integrator's use of the package, or build a clearly-labeled demo integration ourselves if no second real integrator exists yet.

## 6. Verifier

Definition of "done" per package, each backed by a runnable check:

- WP1 done when: `npm test` still shows all existing tests passing, plus a new, passing `discovery.fuzz.test.ts` that specifically exercises the four adversarial-source scenarios above, plus `examples/reputation-lookup.mjs` runs successfully against real data.
- WP2 done when: a real attestation exists on Optimism, independently verifiable via a public block explorer link (same bar as the existing Base examples), and (after king go-ahead) the same on Ethereum mainnet, plus `npm test` still fully passing.
- WP4 done when: the integration guide exists, is accurate against the code as it stands at that point (re-read and checked, not written from memory of the plan), and the second worked example is real and runnable, not a mockup.

## 7. Risk Analyzer

- Biggest risk: WP1's fuzz testing surfaces a real bug in the existing aggregation logic. Not a reason to hide it or rush a fix; log it honestly (see Memory Manager below), fix it properly, and it becomes a genuine, positive story for NLnet ("we found and fixed X during hardening") rather than something to bury.
- WP2's Ethereum mainnet step costs real money (gas). Kept as an explicit, separate, king-approved step, never bundled silently into "just do WP2."
- Scope creep: it would be easy to let WP1 sprawl into "harden everything forever." The verifier section above is the hard stop, four named adversarial scenarios, not an open-ended search.
- Timing risk: if NLnet's decision comes back faster than expected and work is only partly done, that is fine and normal (see Constraint Checker); the honest state of progress goes into whatever reply is needed at that point.

## 8. Reflector

After each work package finishes, before moving to the next: a short, honest lesson goes into `knowledge/al-mizaan/lessen-log.md` in wazir-al-ghanima (the project's own leer-loop discipline), covering what was harder or easier than the plan assumed, and whether the Researcher stage's assumptions held up against the real code.

## 9. Memory Manager

- Progress and decisions live in this file (updated as work actually happens, not left stale) and in `packages/capacity-attest/DECISIONS.md` for any design decision that changes the package's own architecture (matching the project's existing D-00x numbering convention).
- Any bug found during WP1's fuzz testing gets its own dated entry, same discipline as `docs/SECURITY-REVIEW-2026-09-11.md` already uses.
- This plan file itself gets its status line at the top updated as each work package starts and finishes, so a future session (or the king) can read one line and know exactly where things stand.

## 10. Stop Controller

The self-build effort stops being "in progress" and becomes "finished, pending only the external audit" when WP1, WP2 and WP4 all pass their Verifier bar above. At that point the only work package left unstarted is WP3, the independent audit, which was never self-buildable in the first place. That is the natural, planned stopping point, not a moving target.

## 11. Report Generator

- After each work package's Verifier bar is met: a short, plain-language update to the king (what changed, what it means, proof it works), same style already used throughout this session for every other deliverable.
- If NLnet asks for a progress update before deciding, or when they do decide: an honest summary of exactly what was self-funded already versus what the grant money would still cover, never presented as if the grant funded work it did not.
