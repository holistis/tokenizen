# mark-attest

Checks whether a candidate name looks like an existing registered trademark or a known AI/crypto project name — a cheap, early signal before you launch, not a legal verdict. Part of the tokenizen `-attest` family, sibling to [capacity-attest](../capacity-attest).

> Status: early build, not yet published.

## Trademark data source

Production access to EUIPO's Trademark Search REST API requires sending a passport/national-ID copy plus proof of address to EUIPO (confirmed 2026-11-07). We're not doing that for an MVP with no paying customer yet.

Instead, `scripts/euipo-opendata-sync.mjs` pulls from EUIPO's own public Open Data Platform: an anonymous-login FTP server (`ftp.euipo.europa.eu`) with daily XML dumps (WIPO ST.66 format) of the EU trademark register — free, no API key, no identity check. It runs on a schedule on our own server (not a laptop), builds a local name index in `data/euipo-index.jsonl` (gitignored, regenerated daily), and appends one line per run to `data/euipo-sync-log.jsonl` (tracked in git) so a schema or volume change on EUIPO's side is visible in the repo without anyone needing to log into the server. See the script's header comment for exactly what's verified versus best-effort.
