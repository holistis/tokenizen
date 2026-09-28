# Security policy

This repository is maintained by one person (Abdellah Ouadoudi, github.com/holistis), with AI assistance disclosed openly in commits and contributions. Read that as context for everything below, not as an excuse: reports are still taken seriously and answered directly.

## Supported versions

Only the latest published version of each package is supported. There is no long-term-support branch. If you find an issue against an older version, check first whether it still reproduces on the current release.

## How to report a vulnerability

Preferred: GitHub's private vulnerability reporting, already enabled on this repository. Open it from the Security tab at https://github.com/holistis/tokenizen/security/advisories/new, or go directly to "Report a vulnerability" on the repo page. This reaches only the maintainer, not the public issue tracker.

If that does not work for you, email info@holistischadviseur.nl with a clear subject line and, if possible, a minimal way to reproduce the issue.

Please do not open a public GitHub issue for a security report before it has been triaged privately first.

## What to expect

An initial response within 7 days, usually within 3 working days. There is no paid bug bounty program and no cash reward. What you get instead: a direct answer, credit in the fix if you want it, and an honest account of what was found and how it was fixed.

## Already known, please do not report as new

Two things are publicly documented as open, unsolved problems rather than left implicit:

- Signing a false delivery claim currently costs the buyer nothing in `capacity-attest`. Nine separate mitigations were designed, tested, and killed for structural reasons; the negative result is published at https://tokenizen.nl/en/notes/nine-ways-to-fake-a-delivery-claim, and in more technical detail as decisions D-014 and D-018 in `packages/capacity-attest/DECISIONS.md` (in Dutch; the nine-ways page above is the English write-up, but it is rendered client-side in a single-page app, so a plain HTTP fetch without running JavaScript will not see the article content, only the page shell).
- No independent, external security review of any package in this repository has ever been done. What exists are internal, AI-assisted adversarial reviews carried out by the maintainer, published in full where they happened (for example `packages/capacity-attest/docs/SECURITY-REVIEW-2026-09-11.md`), and they say so themselves. If you are the first outside party to actually review this code, that is exactly the kind of report this policy exists for.

## Prior security work

`capacity-attest`, the package with the most security-relevant surface in this repository (EIP-191 signing and verification, sha256 content addressing, Zod validation of untrusted input, writes to live Ethereum Attestation Service contracts on multiple mainnets), has had two internal adversarial review passes: one on 2026-09-11 before its first on-chain write path, and one on 2026-09-28 before its 0.7.0 release. Both are the maintainer's own work, with AI assistance, and neither is presented as an independent or third-party audit. See `packages/capacity-attest/docs/SECURITY-REVIEW-2026-09-11.md` for the first, full writeup.

## Scope

This applies to every package in this monorepo under `packages/`, and to the tokenizen.nl website. It does not cover third-party dependencies; report those upstream.
