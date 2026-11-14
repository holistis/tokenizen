# Entrypoint-symlink benchmark, 14 nov 2026

Our own, never "independent". Prompted by YE-YI7 finding that
`capacity-attest-fiscal-check` silently did nothing (exit 0, no output, for both
a valid and an invalid document) when invoked through the real npm bin symlink
`npm install` creates on macOS and Linux. Root cause and fix: PR 261 (YE-YI7,
plus our own fix to a Windows-only bug in that PR's own test file). Fixed in 0.14.1.

## What we checked, proactively, after the fix

Rather than wait for the next report, we reproduced the exact real-world
installation path — `npm install capacity-attest@0.14.0` in a clean directory
on a real Linux machine, the same kind of real symlink macOS uses — and ran
all three published bins through their real `node_modules/.bin` symlinks, not
a shortcut.

| Bin | Via real symlink, before 0.14.1 | Via real symlink, after 0.14.1 |
|---|---|---|
| `capacity-attest-fiscal-check` | Confirmed broken ourselves: exit 0, no output, for both a valid and an invalid document | Pending re-check after publish |
| `capacity-attest` (MCP stdio server) | Responded correctly to a real `initialize` call (a real, specific schema-validation error on a deliberately incomplete test request — the server itself works) | n/a, not affected |
| `capacity-attest-http` | Started, printed its real startup banner, answered a real `GET /.well-known/fiscal-controls.json` with `200` | n/a, not affected |

## Why only the fiscal-check bin had this

`index.ts` and `http-server-bin.ts` call their `main()`/`startServer()`
unconditionally on module load — no "am I the real entrypoint" comparison, so
no symlink-resolution bug is possible there. `fiscal-check-bin.ts` is the only
one of the three designed to also be safely importable as a library without
triggering a real CLI run, which is why it alone needed (and got wrong, then
fixed) that comparison.

## Open

Re-run this same real-symlink check against the published 0.14.1 tarball once
it propagates, before telling anyone the fix is confirmed live.
