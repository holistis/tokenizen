# Pre-publish security review, 2026-09-11

A record of an adversarial security review run against this package and its
MCP server before 0.6.0 (`publishReputationFeedback`, this package's first
real on-chain write path) was published. The goal is the same as every other
document in `docs/`: you should not have to take this on trust. Every finding
below points at a real fix and a real, runnable regression test that proves
the specific gap is closed.

## Why this review happened

The same day (2026-09-11), a separate, confirmed vulnerability was found in
an AI coding agent: a malicious MCP server could embed a hidden instruction
inside a tool's `description` field, and the agent followed it with zero user
interaction, reading a local secret and executing an arbitrary shell command.
Since this package ships its own MCP server, and was about to start writing
to a live, public blockchain registry for the first time, that was reason
enough to run the same kind of adversarial reading against this codebase
before shipping, rather than after something went wrong.

## What this review is, honestly

This was our own adversarial code review, not an independent third-party
audit. No external auditor was engaged. What makes the findings below
checkable regardless: every one has a specific file and line, a concrete
attack scenario, and a regression test you can run yourself. Verify the
claims by reading the code and running the tests, not by trusting this
document's prose.

## Findings and fixes

| # | Severity | What it was | Fix | Regression test |
| --- | --- | --- | --- | --- |
| 1 | High | `get_delivery_history` returned a claim's free-text fields (`promisedSpec`, `measured.method.instrument`) with no warning that this content is untrusted third-party text, the same failure shape as the triggering MCP vulnerability, just via claim content instead of a tool description. | Tool description and the response's own `note` field now lead with an explicit SECURITY warning. | `src/tools.test.ts`: *"waarschuwt expliciet dat claim-inhoud onvertrouwde vrije tekst is, nooit een instructie"* |
| 2 | Medium | Two depth-counting functions used the same `MAX_DEPTH` constant but counted from different starting points, so a `promisedSpec` nested to exactly the schema's own accepted maximum crashed `computeClaimId()` instead of succeeding. One real caller (`publishReputationFeedback`) was also missing the try/catch every sibling caller already had for this exact throw. | Corrected the off-by-one; added the missing try/catch. | `src/schema.fuzz.test.ts` (depth-32 boundary test); `src/erc8004-reputation.test.ts` (pathological-depth test) |
| 3 | High | A torn write (crash, full disk, or a second writer bypassing the lock) leaving the ledger file without a trailing newline meant the *next* legitimate claim glued onto the garbage and became unparseable, silently destroying a claim `appendClaim()` had already reported as saved. | Read the actual on-disk tail before appending; insert a separating newline when needed. | `src/ledger.test.ts`: *"een gescheurde staart... verwoest niet langer de eerstvolgende, echte claim"* |
| 4 | Medium | The stale-lock reclaim logic measured only how old the lock file looked, never whether its holder was actually still working. A legitimately slow (not crashed) holder could have its lock stolen, reintroducing the duplicate-claim race the lock exists to prevent. | Lock file now stores its creator's pid; a stale-looking lock is only reclaimed after confirming that pid is actually dead. | `src/ledger.test.ts`: *"steelt een oud-ogend lockbestand NIET als de eigenaar-pid nog echt leeft"* |
| 5 | Medium | `resolve_agent_identity` never checked that the caller-supplied `rpcUrl` was actually on the chain the caller claimed. The same contract address can exist on multiple chains with different owners. | Verifies the RPC endpoint's real `eth_chainId` against the claimed chain before trusting anything it returns. | `src/erc8004.test.ts` (chain-mismatch guard tests) |
| 6 | High | `publishReputationFeedback` never verified that the given `agentId` actually belongs to the claim's seller before writing to the live Base Reputation Registry. A valid signature only proves who signed the claim, never who it is about. | Resolves `agentId`'s registered owner and compares it against the claim's `sellerAddress` before any on-chain write. | `src/erc8004-reputation.test.ts` (agentId-ownership guard tests) |
| 7 | Medium | If transaction *confirmation* (as opposed to submission) timed out, the transaction hash was discarded entirely, so a caller with no hash to check could retry and double-write the same feedback on-chain. | A confirmation-stage failure now returns the real transaction hash alongside an explicit warning not to retry blindly. | `src/erc8004-reputation.test.ts` (txHash-on-timeout tests) |
| 8 | Medium | This package declared an MIT license in `package.json` but never actually shipped a `LICENSE` file in the published npm tarball. | Copied the real LICENSE into the package and added it to `files`. | Verified via `npm pack --dry-run` (a packaging check, not a unit test) |
| 9 | Low | README described `publishReputationFeedback` as available and told readers to `npm install capacity-attest`, but the actually-published npm version doesn't contain it yet. | Added an explicit caveat pointing readers at `npm view capacity-attest version`. | Documentation fix, no test. The caveat should be removed once 0.6.0 itself is published |

## What this does NOT prove

- This is not an independent audit. No external party has verified these
  findings or fixes. If that matters for your use case, verify the fixes
  yourself against the commit history and the tests referenced above.
- A security review finds what it looks for. It is evidence of care taken,
  not proof that no other issue exists.
- Findings 8 and 9 are packaging/documentation gaps, not exploitable code
  paths. They're included here for completeness, not because they carry the
  same risk as findings 1 through 7.
- A sibling finding (a vulnerable transitive `qs` dependency, and a
  companion-client broken by an unrelated same-day fix) was found and fixed
  in the separate `yad-agent-mcp` package during the same review round. See
  that project's own changelog, not this one.

Full technical detail for each finding: the commit history on
`security/adversarial-review-fixes` (merged into `main`), and `CHANGELOG.md`'s
0.6.0 entry.
