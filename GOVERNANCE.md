# Governance

This repository is currently maintained by one person, Abdellah Ouadoudi (github.com/holistis). This document exists so that is stated plainly rather than left for a reader to guess.

## Decisions

As sole maintainer, I make final decisions on scope, design, releases and security response for every package in this repository. Pull requests are welcome and reviewed on their merits (does the change match the honesty and testing standards already documented in each package, does it stay within the package's stated scope).

## Becoming a maintainer

There is no formal process yet, because there has never been a second maintainer to onboard. A contributor who repeatedly submits well-scoped, well-tested changes, and who engages with the design discussion in issues and pull requests rather than only submitting code, is the kind of track record that would lead to write access being offered. That offer is a judgment call by the current maintainer, not an automatic threshold.

## Releases and breaking changes

Each package in `packages/` versions independently (semver). A breaking change to a published package's public API gets a major version bump and a changelog entry explaining what changed and why. There is no fixed release cadence: a version ships when a change is ready and tested, not on a calendar.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability and what has already been reviewed. Security decisions (what counts as a vulnerability, how urgently to fix it, whether to request a CVE) are made by the maintainer, informed by whoever reported the issue.

## What this document is not

This is not a claim that the project has outgrown a single maintainer, and it is not a promise of a specific response time beyond what SECURITY.md already states. It is a plain statement of who decides what, written down because an outside reviewer should not have to infer it.
