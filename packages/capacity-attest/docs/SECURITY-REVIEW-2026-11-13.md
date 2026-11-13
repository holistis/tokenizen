# Security review: fiscal-controls v2 and the three pieces built on it, 2026-11-13

A record of an adversarial security review covering one continuous round of
work on this package's fiscal-safety features, all on 2026-11-13: the
fiscal-controls v2 rework (`DECISIONS.md` D-022), the three new,
independently-switchable pieces built on top of it — a durable, cross-process
spend-cap store, a soft on-chain settlement-corroboration check, and a
standalone `fiscal-check` CLI (`DECISIONS.md` D-023/D-024) — and a dedicated
adversarial pass against those three new files' own implementation. The goal
is the same as every other document in `docs/`: you should not have to take
this on trust. Every finding below points at a real fix, a specific
"not fixed, flagged" decision with its reason, or (for findings 1-11) the
original decision record it was first written up in. Where a finding was
verified by actually running the code rather than only reading it, the table
says so.

## Why this review happened

Three things landed in the same working tree at once: a brand-new persistence
mechanism for a spend cap (`spend-cap-store.ts`), a brand-new CLI that fetches
a caller-supplied URL (`fiscal-check-bin.ts`), and a brand-new parser for a
field supplied by an x402 facilitator, not this package itself
(`settlement-corroboration.ts`). Those are, respectively, the exact shapes of
a path/resource-exhaustion bug, an SSRF bug, and a computational-DoS bug. On
top of that, this whole feature area exists specifically so a caller can read
a server's own, self-reported claim about its fiscal safety — and D-022 (the
round immediately before this one) is itself the record of a real external
contributor catching this project publishing an inaccurate self-reported
claim once already (`spend_cap_per_hour` as a bare, unitless number). An area
that was already proven capable of publishing a quietly-wrong safety claim,
getting three new, not-yet-merged files in one sitting, is exactly the
situation this project's own established practice (the muraqib/al-khasm/
al-mustamil chain, and the precedent this document follows,
[`docs/SECURITY-REVIEW-2026-09-11.md`](SECURITY-REVIEW-2026-09-11.md)) says
warrants a dedicated adversarial pass before any of it is called done.

## What this review is, honestly

This is our own adversarial review, not an independent third-party audit. No
external auditor was engaged for any finding below, with one explicit
exception stated plainly rather than folded in: findings 1 and roughly half
of finding 2 trace to YE-YI7, a real, named external contributor who ran the
merged 0.11.0 package themselves (not just read it) and raised two sharp,
direct questions about it. The "second, independent reading" referenced
alongside YE-YI7 in findings 1-5 is **not** a second external party — it is
an internal reading that used an external LLM (ChatGPT, via the king's own
account) as a reasoning aid, the same way this project uses that tool
elsewhere, and is labeled that way throughout rather than as "independent" or
"third-party". Every other finding in this document — all of findings 6-30 —
is entirely our own, found by this project's own review chain
(muraqib/al-khasm/al-mustamil, a completeness-critic pass, and a dedicated
adversarial/red-team pass against the three new files specifically), on the
PR's own working tree, before any of it was merged or published. What makes
the findings below checkable regardless of who found them: each one names a
specific file (and, where applicable, a line), a concrete scenario, and
either a regression test or an explicit statement that none exists yet.
Verify by reading the code and running the tests yourself, not by trusting
this document's prose.

Severities for findings 1-11 are this document's own retrospective judgment
— the original decision record (`DECISIONS.md` D-022) that first wrote these
up did not assign a formal severity to each point, so these labels were added
now, while writing this review, for consistency with findings 12-30 (which
came with severities already assigned by the review that found them). Treat
rows 1-11's severity as an opinion to check, not a measurement.

## Findings and fixes

| # | Severity | What it was | Fix | Regression test |
| --- | --- | --- | --- | --- |
| 1 | Medium | `spend_cap_per_hour` in the published fiscal-controls v1 document was a bare, unitless number. YE-YI7, running the real 0.11.0 package: *"A client should not read this as a monetary ceiling on its own purchases."* It was a count of charged attempts, not proven on-chain outcomes, scoped to one server process, and reset on every restart — none of that was stated. | `spend_cap` is now a structured, nullable object: `unit`, `max_per_window`, `window_seconds`, `scope`, `persistence`, `reset_on_restart`, `reservation_before_settlement`, `pending_reservation_ttl_seconds` — each fact its own required field. | `fiscal-controls.test.ts` (25+ new/rewritten tests: schema good/bad, all four paid/unpaid tool combinations, the real HTTP route) |
| 2 | Medium | The incoming x402 payment was never read or linked to the action it paid for. `@x402/mcp`'s real `onAfterSettlement` hook receives the facilitator's actual `SettleResponse` (`transaction`/`network`/`payer`), but neither paid tool's hook read it. | Both hooks now log `settlement.transaction`/`network`/`payer` before the action runs, and `charge_evidence` names the incoming fee and the resulting action as two separate facts, never one. | `http-server-record-delivery.test.ts`, `http-server-publish-feedback.test.ts` |
| 3 | Medium | `signer_isolation: true` with no further explanation invites reading it as hardware/TEE-level key isolation, when the real situation is an env-var key in an in-process signer: isolated from a caller's funds and influence, not from this process's own memory. Found by the internal second reading, not YE-YI7. | New required field `signer_custody` states the real custody model; a zod `superRefine` forces it to be non-null whenever `signer_isolation` is non-null. | `fiscal-controls.test.ts` |
| 4 | Low | A reservation that outlives `FEEDBACK_RESERVATION_MS` (10 minutes) could be confirmed after it had already expired and been pruned from the live list, with nothing recording that it happened. On closer inspection this is mostly harmless (reservations are fungible counters; which specific one gets released on a late confirm doesn't change the total), but the confirm-after-expiry case itself was genuinely invisible. Found independently by both this project's own review chain and the second internal reading. | Reservations now carry their own id (for log correlation); a late confirm logs explicitly as `publish_feedback_confirmed_after_reservation_expired` instead of happening silently. | `http-server-publish-feedback.test.ts` |
| 5 | Low | An action that failed *after* its payment had already settled surfaced only the bare internal failure reason, giving a caller no way to tell "never charged" apart from "charged, then this specific step failed". | The thrown message now always starts with `payment_settled_action_failed:` and states explicitly that a retry should not expect to resolve a second, unwarranted charge. | `http-server-record-delivery.test.ts`, `http-server-publish-feedback.test.ts` |
| 6 | Medium | A real, publicly-visible attribution error: an earlier draft of a code comment quoted a Dutch sentence under YE-YI7's name. YE-YI7 writes only English and never said it; the sentence was actually the internal second reading's own wording. Found by checking the real, fetched GitHub thread, not assumed. | Corrected in `fiscal-controls.ts` and `fiscal-controls.test.ts`, with the correction itself left visible rather than quietly disappearing. | `fiscal-controls.test.ts` |
| 7 | Medium | `signer_custody: ""` (an empty string) produced the same false "basis stated" impression as a real explanation would. The `superRefine` only checked for `null`, not for blank/whitespace-only text — exactly the gap this field exists to close. | `.trim().length === 0` now also counts as "no basis given". | `fiscal-controls.test.ts` |
| 8 | Low | `validateFiscalControls()` itself could throw on a hostile object with a throwing getter (reachable via a hand-built JS object, not via real JSON-over-HTTP) — a crash inside the one function whose entire job is to never trust unvalidated input, including its shape. | A `try/catch` around the real validation. | Fix applied; no dedicated regression test for this specific case is named in the source record, so treat this one fix as unverified-by-test until someone adds it. |
| 9 | Low | `settlement.transaction`/`network`/`payer` are logged as unvalidated strings straight from the facilitator, with no length bound. | `logEvent()` now truncates every text field to 500 characters, generically, for every future caller, not just these two. | No dedicated regression test named in the source record. |
| 10 | Low | `record_delivery`'s `payment_settled_action_failed` error omitted the transaction reference that `publish_reputation_feedback`'s own version included. | Made consistent between the two tools. | No dedicated regression test named in the source record. |
| 11 | Low | A breaking schema change (fiscal-controls document version "1" → "2") shipped with no compatibility note anywhere. | Added to `CHANGELOG.md`: pre-1.0, no stability guarantee, 0.11.0 was live only a few hours with no known consumer. | Documentation fix, no test — same category as finding 9 in [the 2026-09-11 review](SECURITY-REVIEW-2026-09-11.md). |
| 12 | Critical | `npm test` failed non-deterministically: one test in `fiscal-controls.test.ts` hit vitest's default 5000ms per-test timeout, reproduced twice independently. Not a logic bug — this round's two new, heavier import chains made every `vi.resetModules()`-driven re-import of `http-server.js` measurably more expensive under full-suite worker contention. Left alone, the documented, presumably CI-run `npm test` command was red regardless of how correct the new code was. | New `vitest.config.ts` (`testTimeout: 20_000`, 4x the measured single-import cost), itself guarded so a future accidental removal fails loudly. | `src/vitest-config.test.ts` |
| 13 | Critical | `buildFiscalControls()` reported a hardcoded `"in-memory"`/`"server-instance"` triple even while `CAPACITY_ATTEST_SPEND_CAP_DURABLE=1` had a real, cross-process `DurableSpendCapStore` active underneath it — verified by building `dist/` and calling the function for real with the flag set, not just by reading the code. This is precisely the class of inaccurate self-reported fiscal-safety claim this whole feature exists to prevent, and the same failure shape as finding 1. | New `SpendCapStore.describePersistence()` (synchronous, no I/O); `buildFiscalControls()` now reads from whichever store `createSpendCapStore()` actually built, never a second, hand-typed copy. Independently re-verified today by starting the real HTTP server with `CAPACITY_ATTEST_SPEND_CAP_DURABLE=1` and curling `/.well-known/fiscal-controls.json` live: it correctly reports `"scope":"all-instances","persistence":"durable","reset_on_restart":false`. | `fiscal-controls.test.ts` |
| 14 | High | Zero release documentation for any of the three new files: no `CHANGELOG.md` entry, no `DECISIONS.md` entry, no version bump, despite every prior feature in this package's history getting both. | `DECISIONS.md` D-023 and a `CHANGELOG.md` 0.13.0 entry added; `package.json`/`server.json` bumped 0.12.0 → 0.13.0. This document and the 0.14.0 entry below are the equivalent record for findings 20-30. | Documentation fix, no test. |
| 15 | High | `README.md` documented none of the three new pieces; its existing fiscal-controls paragraph still flatly said persistence was `"in-memory"` with no mention a durable alternative now exists. | Updated: the `spend_cap` paragraph now describes durable values honestly, plus two new subsections (CLI usage; `CAPACITY_ATTEST_SPEND_CAP_DURABLE`; `CAPACITY_ATTEST_RPC_URL`/`CAPACITY_ATTEST_SETTLEMENT_ASSET`). Re-checked today against the real, running server and CLI; one additional accurate caveat added (see finding 22's note on `localhost`). | Documentation fix, no test. |
| 16 | Medium | Both `onAfterSettlement` hooks' wiring of `corroborateSettlement(...)` had zero test coverage of any kind — not even this codebase's own established source-text pattern (asserting a call exists, in order, relative to other calls) that already covers every other piece of hook behavior here. A regression that silently deleted the call, or `await`ed it before the real action (defeating the entire non-blocking design), would have passed every existing test. | One test added to `http-server-record-delivery.test.ts` and one to `http-server-publish-feedback.test.ts`, each proving the call exists, is `void`-fired (never `await`ed), runs before the real action, and receives `corroborationConfig`. Verified by deliberately mutating `void corroborateSettlement` to `await corroborateSettlement` on each hook in turn: both new tests went red, then green again after reverting. | `http-server-record-delivery.test.ts`, `http-server-publish-feedback.test.ts` |
| 17 | Medium | Durable spend-cap mode was proven correct only in isolation (`spend-cap-store.ts`'s own unit tests and a standalone bench), never exercised through `http-server.ts`'s own exported reserve/confirm/peek functions the way a real deployment would actually use it. | Two new tests in `http-server-publish-feedback.test.ts`: one drives `reserveFeedbackPublishSlot`/`consumeFeedbackPublishSlot`/`canPublishFeedbackNow` with `CAPACITY_ATTEST_SPEND_CAP_DURABLE=1` and reads the resulting `.jsonl` back off disk independently; one proves `buildFiscalControls()` reports durable values for this same real wiring. Verified by temporarily forcing `createSpendCapStore()` to always return `InMemorySpendCapStore`: both new tests failed, then passed again after reverting. | `http-server-publish-feedback.test.ts` |
| 18 | Low — not fixed (flagged) | `README.nl.md` has no section on `http-server.ts` at all (no `record_delivery`-over-HTTP, no `publish_reputation_feedback`-over-HTTP, no `.well-known` route) — confirmed today by searching the file directly for every relevant term and finding zero matches. This predates this round; it is not something this round broke. | Deliberately not fixed here — translating the entire missing HTTP-server documentation layer is a separate, larger task than this round's scope. Noted here, in `DECISIONS.md` D-023, and again in D-024 so it is not silently forgotten a third time. | n/a — not fixed. |
| 19 | Low — not fixed (flagged) | A settlement-corroboration outcome (`matched`/`mismatched`) is only ever logged server-side; it is never exposed in `buildFiscalControls()`'s `charge_evidence`, nor on any endpoint — so it never reaches the kind of external reviewer (YE-YI7, or this CLI's own target user) this feature exists to reassure. | Not a bug (`settlement-corroboration.ts`'s own header already lists several deliberate non-goals in this style); this gap just wasn't one of them yet. Stated explicitly in that header now, rather than built into a new exposure mechanism. | n/a — not fixed, by design choice. |
| 20 | Medium | `spendCapFile()`'s only guard on a spend-cap key, `SPEND_CAP_KEY_PATTERN = /^[A-Za-z0-9_-]+$/`, had no upper bound on length. A key of a few hundred to a few thousand characters passes the regex cleanly, then fails deep inside `openSync()`/`statSync()` once `"spend-cap-" + key + ".jsonl"` exceeds this filesystem's own filename-length limit — reproduced on this Windows host as `ENOENT` around 255-260 characters and `ENAMETOOLONG` beyond that (tested up to 2,000,000 characters). That raw error carried none of this module's own `invalid_spend_cap_key` prefix (breaking the one error shape its own tests rely on) and embedded the full resolved path, leaking `CAPACITY_ATTEST_DATA_DIR`'s absolute location — the exact class of leak this module's own lock-timeout error was deliberately written to avoid. Today's only real call site passes a hardcoded literal, so this is a gap against the interface's own stated "every future caller" design intent, not a reachable bug today. | `SPEND_CAP_KEY_MAX_LENGTH = 128` added to `spendCapFile()`'s check; an oversized key is also truncated to an 80-character preview in the thrown message, so it cannot flood logs with itself. | `src/spend-cap-store.test.ts`: planted a failing 10,000-character-key test against the pre-fix code (confirmed red with the raw, path-leaking error), then green after the fix. Full file suite: 31/31. Package-wide `tsc --noEmit`: clean. |
| 21 | High | `settlement-corroboration.ts` ran `BigInt(chainMatch[1])` on whatever digit string its own regex captured from `settlement.network` — unbounded, and **synchronous**, before the function's first `await`. Measured directly: a plain all-`"9"` digit string costs `BigInt()` ~140ms at 1,000,000 digits, ~930ms at 5,000,000, ~1.7s at 10,000,000 (the regex itself costs under 10ms even at 10M digits — it is `BigInt`'s own decimal-to-binary conversion that is expensive). `settlement.network` is the x402 facilitator's own field, already treated as untrusted everywhere else in this function — a compromised or merely buggy facilitator controls it directly. Because this parse runs before `corroborateSettlement()` even returns a promise, `http-server.ts`'s `void corroborateSettlement(...)` fire-and-forget wiring does **not** protect against it: the cost lands inside the same synchronous turn as the hook's own prefix, freezing Node's entire single-threaded event loop — every concurrently-served request, not just the triggering one — for the full duration. Directly contradicts this module's own documented "zero added latency" contract. | `MAX_CHAIN_ID_DIGITS = 32` (no real eip155 chain id is anywhere near this long; even a theoretical uint256 chain id tops out at 78 digits), checked before `BigInt()` is ever called. | `settlement-corroboration.test.ts`: a new test ("an oversized settlement.network chain-id digit string must not block the event loop") measured 1334ms against the unpatched code at 10,000,000 digits, then passed with the fix. File suite: 49/49. Full package suite today: 906/906 (see the note after this table). |
| 22 | Critical | `fiscal-check-bin.ts`'s URL branch called `fetchJsonBounded(input, {fetchImpl: deps.fetchImpl})` — `deps.fetchImpl` is `undefined` in every real invocation, since `main()` never sets it — so it fell back to the raw global `fetch`, which applies no SSRF guard at all. Confirmed today by running the real, unpatched-shaped default path against `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:9/rpc`, `http://localhost:8080/admin` and `http://10.0.0.1/internal`: real outbound connection attempts went out in every case (`10.0.0.1` hung until timeout — a genuine TCP SYN left the machine). A stranger running `npx capacity-attest-fiscal-check <attacker-chosen-url>` — this tool's own documented use case — would have their own machine make that request. | Defaults `fetchImpl` to `tokenizen-net-guard`'s `guardedFetch` (`deps.fetchImpl ?? guardedFetch`), still overridable for tests; also tightened the response-size cap passed to `fetchJsonBounded` to a new, exported `MAX_DOCUMENT_BYTES` (2 MiB) instead of the shared 16 MiB default. | `src/fiscal-check-bin.test.ts`: 5 new tests (4 blocked-address cases, 1 "does not over-block ordinary traffic" case). Independently re-verified today, live, against the real built CLI: `169.254.169.254`, `10.0.0.1` and `127.0.0.1` are each refused instantly with a named reason ("link-local (incl. cloud metadata) address", "private (RFC1918) address", "loopback address" respectively, all "not publicly routable") and no hang, while a real public host (`https://example.com/...`) still produces a genuine network round trip (a real 404, not a guard refusal). One practical consequence worth stating plainly, found during this re-verification, not in the original finding: pointing this CLI at your **own** locally-running `capacity-attest-http` (`http://localhost:...`) is refused by this same guard, by design — the fiscal-controls endpoint itself still needs `curl` for local testing (see `README.md`). |
| 23 | High | The local-file branch called `readFileSync(input, "utf-8")` with no size check at all, unlike the URL path's 16 MiB-bounded `fetchJsonBounded`. An arbitrarily large local file would be buffered entirely into memory before anything could refuse it. | A `statSync` size check (against the same new `MAX_DOCUMENT_BYTES` = 2 MiB) before `readFileSync` runs, with a message naming the actual size and the limit. | `src/fiscal-check-bin.test.ts`: a boundary test (exactly at the cap is accepted, one byte over is refused) plus an oversized-file test. |
| 24 | Medium | A 16 MiB payload of pure `"[[[...]]]"` nesting does not crash `JSON.parse` (V8 handles 10M+ levels without a stack overflow) but measured RSS of ~635 MB / heap of ~468 MB during the parse call alone — for input that could never be a valid fiscal-controls document (no real document nests past `document→controls[]→control{}→spend_cap{}`, depth 4). The cost is paid entirely inside `JSON.parse`, upstream of any schema validation. | Fixed for the **local-file path only** (this task's exclusive ownership boundary): a cheap O(n) bracket-depth scan over the raw text (ignoring brackets inside JSON strings), refusing anything past `MAX_JSON_NESTING_DEPTH = 64`, before `JSON.parse` ever runs. | `src/fiscal-check-bin.test.ts`. **Not fixed for the URL path**, which inherits this exposure from `http-source.ts`'s own internal `JSON.parse` — mitigated only indirectly there by the new, 8x-tighter 2 MiB response cap, not eliminated. Flagged for whoever owns `http-source.ts`, not fixed here. |
| 25 | Medium | `readFileSync(input, "utf-8")` silently replaces any invalid byte sequence with `U+FFFD` and keeps going — a file with invalid UTF-8 bytes inside a JSON string value still parsed and would have been reported "valid", with mangled content and no warning, from a tool whose entire purpose is an honest report on someone else's document. | A strict `TextDecoder("utf-8", {fatal: true})` decode that throws a specific, named error instead. Verified the fix does not reject legitimate multi-byte UTF-8 (Arabic, Chinese, emoji) with a dedicated test. | `src/fiscal-check-bin.test.ts`. Independently re-verified today: a file with two raw `0xFF 0xFE` bytes is refused with exactly `"...contains bytes that are not valid UTF-8 — refusing to guess at the intended text"`, exit code 1, not a silent "valid" result. |
| 26 | Low (verdict PLAUSIBLE, not independently reproduced) | `main()` called `process.exit(code)` immediately after a loop of `console.log` calls. Per Node's own documentation, writing to a pipe is asynchronous on every platform (always asynchronous on Windows for both stdout/stderr) — exactly how a shell script piping this CLI's output would consume it — so `process.exit()` can in principle terminate the process before queued writes finish draining: a shell script could see a correct exit code paired with truncated output, which looks like a clean success rather than a failure. A direct repro (36 MB / ~300,000-line output through an artificially slow consumer) did **not** visibly truncate on this exact Node/Windows build within the time budget tried — so the underlying class is real per Node's documented semantics, but not independently confirmed via a live repro. Marked PLAUSIBLE, not CONFIRMED, on purpose. | Applied anyway, since it is strictly safer and free: `process.exitCode = code` and let the process exit naturally (which waits for pending I/O to drain) instead of forcing it. | No new automated test — this file's own test strategy deliberately avoids invoking `main()`/the entry-point guard directly, since that would call `process.exit`/set `exitCode` on the real test-runner process. |
| 27 | Low — not fixed (flagged) | `net-guard`'s own build-time guard against exactly this class of bug (`no-raw-egress.test.ts`) only scans a fixed `GUARDED_PACKAGES` list and `capacity-attest`'s `http-server*.ts` files. It does not scan `fiscal-check-bin.ts`, even though that file's own header states the exact threat model this guard exists for ("an anonymous visitor supplies the URL"). | Not fixed here — this task's scope was `fiscal-check-bin.ts` and its own test file exclusively; `no-raw-egress.test.ts` is shared, cross-package infrastructure this task did not own. Flagged so the gap is tracked rather than silently closed at only one call site with no automated backstop against it regressing. | n/a — not fixed. |
| 28 | High | `server.json`'s `_meta["io.modelcontextprotocol.registry/publisher-provided"].fiscalControls.about` described fiscal-safety metadata (spend caps, signer isolation/custody) as being for "this server's paid tools" in general. But `server.json`'s only declared package (the `npx capacity-attest` stdio binary) registers a `record_delivery` tool that is **always unpaid and holds no signer at all**. The spend-cap/signer data in `fiscal-controls.ts` actually describes a *separate* binary, `capacity-attest-http` (never referenced by any `remotes` entry in `server.json`), and even there only activates once an operator additionally sets `RECORD_DELIVERY_PAY_TO`. A registry consumer reading `server.json` alone could reasonably believe the package it is about to `npx`-install already has these controls, when it has none of them. | Rewrote the `about` field to name the correct binary, state the `RECORD_DELIVERY_PAY_TO` precondition, and note that `server.json` declares no `remotes`/origin at all. | Re-validated today, live: the edited `server.json` still validates field-by-field against the real, fetched `$schema` URL (ajv, zero structural errors), and `node scripts/verify-registry-meta-persisted.mjs` still runs cleanly against it. |
| 29 | Medium | `wellKnownPath` (`/.well-known/fiscal-controls.json`) is a relative path, but `server.json` declares no `remotes` entry and no `websiteUrl` — there is no origin in the document to combine it with. Checked today, live: `tokenizen.nl/.well-known/fiscal-controls.json` returns a real `HTTP 200`, but it is the site's SPA catch-all page (`Content-Type: text/html`, page title "tokenizen - We find the leaks..."), not the JSON document — a false positive, not a real deployment. | Same root cause, and same fix, as finding 28: the corrected `about` text already states this honestly ("this server.json does not declare one... so none is canonical"). No separate `server.json` change needed. | n/a — covered by finding 28's fix; the `tokenizen.nl` false-positive was independently re-confirmed live today via `curl`. |
| 30 | Low — not fixed (flagged) | `verify-registry-meta-persisted.mjs` self-checks its own `deepEqual` helper on every run, but has no test file exercising its 404/network-error/mismatch/registry-missing-field branches against a mocked `fetch` — those paths were verified by hand (live and simulated runs; also independently re-run live today, which reproduced the documented `404 "Server not found"` for the still-unpublished 0.13.0, handled cleanly with no crash), not by a permanent, CI-run regression test. | Not fixed here — adding a mocked-fetch unit-test harness is new test infrastructure beyond this round's three stated focus points. | n/a — not fixed, flagged for a future session or this project's own "test de tester" gate to pick up. |

Full suite today, independently re-run start to finish rather than only read about: `npm run typecheck` clean, `npm test` → **35 test files, 906 tests, all passing**. `npm run build` clean. The real `capacity-attest-http` server was started (with and without `CAPACITY_ATTEST_SPEND_CAP_DURABLE=1`) and the real, built `capacity-attest-fiscal-check` CLI was run against it and against local fixtures, live — not simulated — to verify findings 13 and 20-26 above.

## Also checked, and found correct

The same adversarial pass checked eleven more specific scenarios and found
each one already behaving correctly. They are not padded into the table
above — none of them needed a fix — but they are listed here rather than
left unsaid, because a review that only reports what was broken says nothing
about how hard it tried to break the rest. Full detail: `DECISIONS.md` D-024.

- `spend-cap-store.ts`: torn/non-newline-terminated-tail protection is already
  present (same logic `ledger.ts` already proved); a reservation confirmed
  exactly at its TTL boundary falls back to the documented late-confirm path
  consistently in both store implementations; 20 rounds of 10 concurrent
  `reserve()` calls against a cap of 3 never over-admitted in either
  implementation; a fresh-instance restart simulation confirms
  `InMemorySpendCapStore`'s count resets to zero (matching its documented
  behavior) while `DurableSpendCapStore` correctly refuses a new reservation
  on a key with a prior, still-live, unconfirmed reservation that survives
  the restart by being replayed from disk (matching the cross-process
  durability this class exists to add); `CAPACITY_ATTEST_SPEND_CAP_DURABLE`
  set to `"TRUE"`, `"1 "`, `"yes"`, `""` and similar near-misses all correctly
  fall back to the safe, in-memory default — only the exact strings
  `"true"`/`"1"` select the durable store.
- `settlement-corroboration.ts`: a never-resolving RPC call does not delay a
  concurrently-awaited real action — now proven by a dedicated new test
  (see finding 16's own regression test for the real hook wiring; this is the
  module-level version of the same guarantee), not just argued; address
  comparison is case-insensitive on both sides with no collision risk (only
  hex letters A-F/a-f are case-sensitive, and no two distinct addresses fold
  to the same lowercase form); a half-configured deployment (only one of the
  two env vars set) returns `'skipped'` with zero network calls; a
  `mismatched` outcome always gets its own distinct, grep-able log line,
  never folded into the generic result; malformed `settlement` objects and
  the "network claims a chain the RPC doesn't actually match" sub-case are
  both already rejected (the latter one layer down, in
  `eip3009-authorizer-from-tx.ts`).
- `server.json`: the edited document still validates field-by-field against
  the real, fetched JSON schema (ajv, zero structural errors), and every
  absolute URL inside its `_meta` block (`$schema`, `specSource`,
  `repository.url`) resolves with a real `HTTP 200`, fetched live, not
  assumed. `scripts/verify-registry-meta-persisted.mjs`'s own failure paths
  (a 404 from the real registry, a simulated unreachable registry host) were
  each run for real — independently re-run again today, which reproduced the
  documented `404 "Server not found"` for the still-unpublished version and
  handled it cleanly, no crash, no silent success.

## What this does NOT prove

- This is not an independent audit. No external party verified findings 2-30
  below, or the fixes for any of them. Finding 1 (and part of finding 2) is
  the one place a real external contributor's own words appear, cited and
  attributed as such, not folded into "independently confirmed". If an
  independent audit matters for your use case, verify these claims yourself
  against the commit history and the tests named above.
- A security review finds what it looks for. The adversarial pass behind
  findings 20-30 was explicitly scoped to the three new files built this
  round (`spend-cap-store.ts`, `settlement-corroboration.ts`,
  `fiscal-check-bin.ts`) and `server.json`'s registry metadata — it is
  evidence of care taken within that scope, not proof that no other issue
  exists anywhere else in this package.
- Findings 6, 9, 10, 11, 14, 18, 27 and 30 are documentation, process, or
  test-coverage gaps, not exploitable code paths. They are included for the
  same reason findings 8 and 9 were included in the 2026-09-11 review: for
  completeness, not because they carry the same risk as the others.
- Finding 26 is explicitly marked PLAUSIBLE rather than CONFIRMED: the
  underlying class of bug is real per Node's own documented semantics, but a
  direct reproduction attempt did not visibly trigger it on this exact
  platform within the time spent trying. The fix was applied anyway because
  it is free and strictly safer, not because the bug was proven to occur.
- Findings 18, 19, 24 (URL-path half), 27 and 30 are known, currently open
  gaps, stated here rather than hidden. None of them is claimed fixed.
- `settlement-corroboration.ts`'s own check is, by its own design, a soft,
  non-blocking signal, never a gate — a `mismatched` outcome does not stop,
  delay, or flag the action it accompanies for anyone outside this server's
  own logs (finding 19). Do not read "settlement corroboration exists" as
  "a mismatch is enforced".
- `fiscal-check-bin.ts`'s outbound guard treats your own `localhost` or any
  private-network deployment exactly like it treats a hostile target: both
  are refused. That is the guard working as designed (finding 22's own note),
  not a separate bug, but it means this CLI cannot be used to self-check a
  local deployment — use `curl` against the endpoint directly for that.

Full technical detail behind findings 1-19: `DECISIONS.md` D-022 and D-023,
and `CHANGELOG.md`'s 0.12.0 and 0.13.0 entries. Behind findings 20-30:
`DECISIONS.md` D-024 and `CHANGELOG.md`'s 0.14.0 entry, and the header
comments of `spend-cap-store.ts`, `settlement-corroboration.ts` and
`fiscal-check-bin.ts` themselves, each of which carries its own finding
inline, dated, at the exact line it applies to.
