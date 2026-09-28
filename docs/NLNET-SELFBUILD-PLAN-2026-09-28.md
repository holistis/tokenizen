# Self-build plan: NLnet work packages 1, 2 and 4

Status: WP1 FULLY DONE (PR #15, #16, #17, #18, all squash-merged to main), matching every Verifier-bar item this plan set for it. WP2 (second chain adapter): steps 1-4 of 5 DONE, Optimism proven live on real mainnet with a real, independently-verified attestation. Step 5 (Ethereum mainnet, real gas, materially higher cost than Optimism) is PAUSED pending a separate, explicit king go-ahead and a funded Ethereum-mainnet key. WP4 (documentation/second worked example) not started. Work package 3 (independent external security audit) is deliberately excluded from this plan: it must be done by someone who is not us, by definition, so it stays dependent on the NLnet grant (or another funding source), not something we self-build.

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

**2026-09-28, PR #16 merged.** Before merging, found and fixed an unrelated pre-existing problem: `gh pr checks` showed the "Workers Builds: tokenizen" and "Workers Builds: tokenizen-website" checks failing on this PR, and (checked, honest finding) on the two prior PRs (#14, #15) already merged this same session too, without anyone having noticed since only `npm test` was checked at the time. Root cause was in Cloudflare's own dashboard configuration, not in any of this session's code: both Workers projects had "Root directory" set to `/` (repo root) instead of `packages/website`, and "Build command" left empty, so the site's `dist/` output never existed for wrangler to upload. Fixed both settings on both projects via the Cloudflare dashboard, triggered fresh retry builds on both, and confirmed via the real build logs (not just a green checkmark) that both now run `tsc -b && vite build && ...`, upload the built assets, and finish with "Success! Build completed." `gh pr checks 16` then showed all 4 checks green (2 Workers Builds + 2 GitHub Actions build-and-test runs). Squash-merged to main.

**2026-09-28, WP1 executor steps 4 and 6 (the second, non-EAS production source, and the runnable example):** built `src/http-source.ts` (`httpClaimSource`, a `ClaimSource` over a plain HTTP endpoint: `GET <url>?seller=<address>` -> JSON array, one concrete shape of the "another installation's public endpoint" substrate already named in `discovery.ts`'s own header comment), `src/http-source.test.ts` (15 tests), `src/http-source.bench.ts` (2 benchmark suites), and `examples/reputation-lookup.mjs` (a runnable CLI combining the local ledger, EAS, and this new HTTP source into one real lookup).

Verified genuinely end to end, not just with mocked `fetchImpl` in the unit tests: recorded a real signed claim into a real local ledger, served a second real signed claim from a real Node HTTP server running as a SEPARATE OS process, and ran `reputation-lookup.mjs` in a third, independent process against both, plus a real, live Base mainnet RPC call (`https://mainnet.base.org`) for the EAS side. All three sources correctly contributed and aggregated in ~1.2 seconds. (An earlier attempt at this same proof used `child_process.spawnSync` to launch the lookup script from the same process running the HTTP server; that self-deadlocked, since `spawnSync` blocks the parent's own event loop, freezing the very server the child was trying to reach. That was a flaw in the verification harness, not in the shipped code, confirmed by then testing the identical scenario across two genuinely independent processes, which worked immediately. Recorded here because chasing that harness bug down before recognizing it as a harness bug is itself part of an honest account of how this was verified.)

**Then ran a 5-dimension adversarial review (security/network, correctness, test-quality, claims-vs-code, api-consistency) via 5 parallel review agents, each finding independently adversarially re-verified by a second agent against the real code before being trusted** (Majlis al-Muraqaba-style, per the project's own constitution for network-facing Klasse A changes). 13 findings, all 13 confirmed as real (not overstated) by the verification pass; every one fixed before this PR, not deferred:

- `readBounded()`'s body-read phase could reject with a raw `DOMException`/`TimeoutError` on a mid-stream stall instead of the documented `HttpSourceError`, since only the initial `fetch()` call was wrapped, not the subsequent body read. Fixed: wrapped the read too, added a regression test that reproduces the exact stall (a `ReadableStream` wired to the same `AbortSignal`, matching what real `fetch`/undici does).
- The byte-cap test only asserted the resulting error TEXT, not that the cap was enforced WHILE STREAMING rather than after fully buffering the response first (mutation-tested by the reviewer: swapping `readBounded` for a naive full-buffer-then-check implementation left all 9 original tests green). Fixed: added a test using a `ReadableStream` that would hang forever if drained, asserting both a wall-clock bound and that `reader.cancel()` was actually called.
- Four smaller test-coverage gaps (the exact `total === maxBytes` boundary, a null response body, `opts.name` propagation to `SourceReport`, and a generic non-timeout network failure) each had zero test coverage. Fixed: one test added per gap, 9 -> 15 tests in `http-source.test.ts`.
- The "`readBounded` vs naive `response.text()`" benchmark bundled a full `JSON.parse` of 1,000 claims into only ONE of the two compared arms, making the streaming safety mechanism look like it cost 1.5-1.7x when the real, apples-to-apples number (both arms doing identical `JSON.parse` work, only the read strategy differing) is **1.00x, i.e. no measurable cost**. This is the single most valuable finding from this review: the original number was real but measuring the wrong thing, and would have gone into this very log as a true-sounding but misleading claim if not caught. Fixed the benchmark and re-ran it for the honest number above.
- `examples/reputation-lookup.mjs` defaulted `EAS_FROM_BLOCK` to `0`. Since `rpcAttestationReader.uidsForSeller` scans block-by-block in SEQUENTIAL windows, a from-genesis scan against real Base mainnet data (~50M blocks) would need roughly 25,000 sequential RPC calls: it would never complete within `discoverDeliveryHistory`'s own 30s per-source timeout, so the EAS source would always silently time out under the script's own documented default, directly contradicting this very plan's WP1 done-bar ("runs successfully against real data"). Worse, since a timed-out source's promise is abandoned rather than cancelled, the script's process could linger in the background after printing its result. Fixed: default now computes a recent window (`latest - 5000` blocks, matching the precedent already set by `examples/eas-live-demo.ts`, configurable via a new `EAS_BLOCK_WINDOW` env var, with `EAS_FROM_BLOCK` settable explicitly to opt into a wider or full scan), and `main()` now calls `process.exit(0)` explicitly on success so the script's own visible run always terminates promptly. Re-verified live against real Base mainnet (`RPC_URL=https://mainnet.base.org`): completes in ~1.2s instead of hanging.
- The address-shape check in `http-source.ts` and the example script used a separately invented, looser regex (`0x` + 1-64 hex chars) instead of the package's one existing canonical format (`ETH_ADDRESS_RE` in `schema.ts`, exactly 40 hex chars, already enforced by `DeliveryClaimSchema`). Fixed by exporting `ETH_ADDRESS_RE` from `schema.ts` and reusing it in both places, so a malformed address now fails fast with one consistent, clear message instead of surfacing later as a confusing low-level `ethers` exception.
- README.md never mentioned the new source or example, unlike every sibling production source/example. Fixed: added a paragraph under "Finding claims from other installations (D-005)".
- Two low-severity, purely cosmetic notes accepted as-is, not fixed: `httpClaimSource`'s name breaks the sibling `<descriptor>Source` naming pattern (kept deliberately; `httpClaimSource` reads more specifically than `httpSource` would, given what it returns), and the benchmark file's header comment overstated what `eas.bench.ts` measures relative to this file (corrected in the same pass as the benchmark fix above).

567 -> 573 tests, all passing. `npm run typecheck` and `npm run build` clean. This closes WP1 executor steps 4 and 6; the only remaining, unstarted WP1 item is a stress/property-based test for `completeness.ts`'s `analyzeCompleteness()` specifically (flagged earlier as a small, separate addition, not yet built).

**2026-09-28, PR #18: the last open WP1 item, a genuine stress/property-based test for `analyzeCompleteness()`.** Read `completeness.ts` in full first: it is a pure, offline function (no network, no ledger) that ASSUMES its input is already signature-verified (a self-referencing or cyclic `priorClaimId` is documented as "cryptographically unconstructible... not defended against here"). That is a real, deliberate scope boundary, not an oversight, so this file is NOT shaped like `discovery.fuzz.test.ts` (adversarial garbage injection against untrusted external input): it checks PROPERTIES that should hold for any well-formed claim universe, across many randomly generated chain graphs, plus a genuine volume/scaling stress check, matching the plan's own phrasing exactly.

No new dependency added (no fast-check or similar): a small, seeded PRNG (mulberry32, reproducible across runs) generates random per-buyer claim chains, following the existing `fakeClaim()` convention already used in `completeness.test.ts` (signatures are irrelevant to this pure function, so no real signing needed, unlike `http-source.ts`'s tests). New file `src/completeness.fuzz.test.ts`, 9 property/stress tests: a full untouched universe is always `chainConsistent` (many random buyer counts/chain lengths); removing one genuine middle claim always produces exactly one, correctly-attributed omission; the two DOCUMENTED blind spots (a hidden tail claim, a hidden whole buyer) genuinely stay blind spots, now pinned as regression tests instead of only asserted in prose; an injected fork is always detected as a fork and never miscategorized as an omission; results are order-independent under shuffling; case-insensitive comparison holds at random scale, not just the one hand-picked example already in `completeness.test.ts`; and two stress tests (50,000+ claims stays `chainConsistent` and completes in well under 2 seconds; scaling from ~2,750 to ~27,500 claims, a 10x increase, costs nowhere near the ~100x a quadratic implementation would cost, confirming the single-pass design really is close to linear in practice, not just by inspection).

Honest process note: on the first run, one of the nine tests (the fork-injection property) failed, not because of a bug in `analyzeCompleteness()` but because of a bug in the TEST's own random-chain selection (it picked a chain of length 1 to fork off, meaning the injected claim would be the ONLY reference to that prior, not a second one, so it could never be a genuine fork by definition). Fixed by requiring the selected chain to already have a second link before forking off it. Also ran three deliberate mutations directly against `completeness.ts` (disable omission detection, weaken the fork threshold from `>1` to `>2`, remove the `.toLowerCase()` case-folding) and confirmed each one is caught by both the existing hand-picked tests AND the new property tests, then reverted via `git checkout`, before counting this as done.

573 -> 582 tests, all passing. `npm run typecheck` clean. **This closes WP1 completely**, matching every item this plan's own Verifier section (§6) set for it. WP2 (second chain adapter) is next; its own first, required step per this plan's Researcher section is to confirm the real EAS/SchemaRegistry contract addresses for Optimism and Ethereum mainnet directly from EAS's own official deployment documentation, never assumed from memory, before any code changes to `eas.ts`.

**2026-09-28, WP2 steps 1-3: real chain addresses confirmed, `eas.ts` generalized beyond Base.** Step 1 (research): a research agent found and cross-checked the addresses against three independent sources (EAS's own `eas-contracts` GitHub deployment JSON files, the official `eas-docs-site` markdown, and each chain's block explorer with a verified, named contract). Then independently re-verified myself, directly, with a live `eth_getCode` call against each chain's real RPC (`https://mainnet.optimism.io`, `https://ethereum-rpc.publicnode.com`) rather than trusting the research alone: real bytecode confirmed present at all four addresses. Result: Optimism mainnet shares Base's exact OP-Stack predeploy addresses (EAS `0x4200...0021`, SchemaRegistry `0x4200...0020`) -- the hypothesis was CONFIRMED true, not assumed. Ethereum mainnet, as expected since it is not an OP-Stack chain, has its own distinct pair: EAS `0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587`, SchemaRegistry `0xA7b39296258348C78294F95B872b282326A97BDF`.

Step 2/3 (generalize + test): added `EAS_DEPLOYMENTS` (a chainId-keyed table of all four known deployments, with `EAS_EXPLORER` now derived FROM it instead of being a second, separately-maintained table). `ensureSchema`, `publishClaim`, `rpcAttestationReader`, and `easSourceFromRpc` all gained an optional address override, defaulting to exactly today's Base addresses so every existing caller is unaffected. `ensureSchema`/`publishClaim` also gained an injectable `contractFactory` seam (same DI pattern `erc8004.ts` and this file's own `AttestationReader` already use), so the "does it really target the address I passed, for a chain that is not Base" question is unit-tested with a live-network-free fake, not left as an unverified assumption. 11 new tests in `eas.test.ts` (pinning the four addresses and their well-formedness, `EAS_EXPLORER`'s derivation, and -- via the injected factory / a `vi.spyOn` on `ethers.JsonRpcProvider.prototype.getLogs` for the read path -- that `ensureSchema`/`publishClaim`/`rpcAttestationReader` each genuinely use a passed-in non-Base address rather than silently defaulting to it). 582 -> 593 tests, all passing, `npm run typecheck` and `npm run build` clean.

Verified the new tests have teeth the same way as the completeness ones: ran a deliberate mutation (hardcoded `rpcAttestationReader`'s `getLogs` call back to `EAS_ADDRESS`, ignoring the passed-in override) and confirmed the new test catches it, then reverted. Honest note: reverting that mutation with `git checkout -- src/eas.ts` also discarded the NOT-YET-COMMITTED real WP2 edits sitting in the same file (only the temporary mutation was meant to be undone) -- caught immediately via `npm test`'s count dropping back to 582/15, and the real edits were redone from the same design, then re-verified clean. Recorded here for the same reason the earlier `spawnSync` harness bug was recorded: an honest account of how this was built includes the missteps, not just the final result.

**Deliberately paused here, not continuing to step 4 (a real Optimism attestation) without asking first.** Step 4 costs real gas, even though Optimism gas is cheap -- this plan's own Constraint Checker (§2) says any mainnet write needs the king's explicit go-ahead, and this session's standing mandate is "never spend money without approval". The Planner section's framing ("Optimism first, cheap to test") should not be read as a silent exemption from that. Also, no funded key for Optimism is available yet. Waiting for the king before spending anything, however small.

**2026-09-28, WP2 step 4 done: a real Optimism mainnet attestation, king-approved and king-funded.** The king gave explicit go-ahead and sent 0.0001 ETH (about $0.27) to a fresh address he generated himself in his own MetaMask app, then provided its private key directly. Before spending anything: computed the real cost first, not assumed cheap-in-general. `ensureSchema`'s `register()` call alone was estimated (via a real `eth_estimateGas` + Optimism's `GasPriceOracle.getL1Fee()` precompile, no funds spent yet) at ~0.00000014 ETH total (L2 execution + L1 data-posting fee combined), about 0.14% of the available balance -- confirming the 27 cents was comfortably enough before committing to anything irreversible.

Then, using the actual shipped `ensureSchema`/`publishClaim` functions from this same PR (not a special-cased script): derived the address from the given key FIRST and confirmed it matched the address the king actually sent funds to, before signing anything (a wrong-key/wrong-account mismatch would have aborted with no transaction sent). Registered the schema on Optimism's SchemaRegistry (previously unregistered there, confirmed via `getSchema()` before starting), then published one real delivery claim as a real EAS attestation.

Result, independently checked the same way the existing Base proofs always are (a separate `eth_getTransactionReceipt` call, not just trusting the script's own printed "success"):
- Schema: https://optimism.easscan.org/schema/view/0x1dd19408345dee43b432b89ccb68760265ecff506098b6efe8ba82ad0d52b195
- Attestation: https://optimism.easscan.org/attestation/view/0x46148283cb005aa43387fb62b2e1ccd0b001ff82dc9310ea885237fd8dea8832
- Tx: `0xa91b7bbbb80570be7d1a6a379c9252b5ed116b064f63180cc9584c8cde1c71b0`, receipt status confirmed `success` via the independent re-check.
- Also read it straight back from the chain via `discoverDeliveryHistory` + `easSourceFromRpc` (the actual production read path, not a special check): found, matched by claimId.
- Real total cost: 0.00000103 ETH (~99% of the 0.0001 ETH balance left over, well within the estimate above).

This is the proof WP2's own Verifier bar (§6) asks for: "a real attestation exists on Optimism, independently verifiable via a public block explorer link". Optimism side of WP2 is done. Ethereum mainnet (step 5) is materially different (real, non-trivial gas cost, not a few cents) and stays paused for its own separate king go-ahead, not covered by this approval.

Security note on how this was handled: the private key was used only in-memory via an environment variable, never written to any file on disk (the one-off script that used it read it from `process.env`, and was deleted immediately after this run, containing no key literally in its own source). The address is now a used, semi-public test address (its key passed through this chat) -- not to be reused for anything beyond small, disposable test amounts going forward.

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
