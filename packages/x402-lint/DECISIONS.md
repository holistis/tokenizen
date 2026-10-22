# Decisions

## D-001: why this package exists at all (2026-10-22)

Built the same night we shipped, and found, our own serviceName bug (see
capacity-attest/DECISIONS.md D-020): a payment-required response that looked
completely fine to the person who wrote it, and silently failed every real
x402 client's own schema validation. The real fix took finding and reading
`@x402/core`'s actual client-side schema. This package runs that exact schema
against any seller's own response, so the next thirty-second check catches
what cost us an hour of "why won't it pay" debugging.

## D-002: GUARDED_PACKAGES, not the capacity-attest exception (2026-10-22)

net-guard's `no-raw-egress.test.ts` treats capacity-attest's http-server.ts
as a lighter special case (rule 2, MUST_BE_GUARDED only) because capacity-
attest is primarily a published library whose server is a secondary feature.
x402-lint has no such library-first excuse: taking a caller-supplied
resourceUrl from an anonymous MCP/CLI caller and fetching it IS the entire
product. It goes straight into GUARDED_PACKAGES (full rule 1), which is why
http-server.ts is built on Express (matching self-check-server's own
convention) instead of raw node:http — rule 1 forbids importing node:http
directly in that category at all, server-side `createServer` included.

## D-003: known, stated limit of the rate limiter (2026-10-22)

The in-memory per-IP limiter here is deliberately simpler than self-check-
server's own `rate-limit.ts` (no IPv6 /64 keying, no bounded-map eviction
guard against a key-rotation flood). Accepted for a first version because
this route is free, read-only, and mutates no state — the real cost ceiling
is net-guard's own per-call connect/header/body timeouts, not this counter.
If this package is ever run as more than one instance, or sees real abuse,
promote to a shared limiter instead of hand-rolling a second hardened copy.

## D-004: live deployment (2026-10-22)

Deployed to the same shared VPS as capacity-attest-http (116.203.155.226),
as systemd service `x402-lint-http`, port 4201 (4200 already taken by
capacity-attest-http, 8787 by tokenizen-api, 4100 by tokenizen-mcp), fronted
by Caddy at `https://x402-lint.tokenizen.nl/mcp` (DNS A record created via
the tokenizen.nl Cloudflare zone, proxied:false — same reasoning as every
other subdomain on this box: Caddy does its own tls-alpn-01 challenge, an
orange-clouded record would intercept it). Verified externally, over real
HTTPS, with a real `tools/list` call and a real `check_x402_conformance`
call against capacity-attest's own live, fixed `publish_reputation_feedback`
tool (schemaValid:true, matching the fix that's actually live).

Deployed from the `feat/x402-lint` branch directly (not main) — PR #89 is
open but not yet merged, pending review. The server's working tree on that
one package's checkout will track whatever the king decides for the PR;
nothing here blocks reverting by just stopping the systemd unit.

## CORRECTIE op D-004/D-005 (2026-10-22, zelfde avond, na koning "Is goed doe maar")

PR #89 is inmiddels gemerged naar main (niet meer "open, niet gemerged"). De npm-publicatie is
geprobeerd (`gh workflow run publish-net-guard.yml`) en faalde op `npm error code EOTP`: de
NPM_TOKEN-secret heeft geen Bypass-2FA aan, en trusted publishing kan een gloednieuwe pakketnaam
niet voor de eerste keer publiceren. Dit is een koning-only actie (eigen security key, of een
nieuwe token aanmaken), geen scriptfout. Volledig: memory `x402-lint-gebouwd-live-npm-2fa-blokkade-2026-10-22`.
Ook: PR #90 fixte een echte bug (`schemaValid` stond op `false` i.p.v. `null` als het schema nooit
draaide), gevonden door advisor-review voor publicatie overwogen werd.

## D-005: not yet published to npm (2026-10-22)

`tokenizen-net-guard`, which x402-lint depends on, is itself not yet on the
public npm registry (`publish-order.mjs --dry-run` confirms: name not on
npm at all). `npx x402-lint` will not work for an outside user until net-
guard publishes first, then x402-lint gets its own `publish-x402-lint.yml`
workflow (same pattern as `publish-net-guard.yml`) and an entry in
`publish-order.mjs`'s STEPS. Deliberately left for the king to decide when:
adding a new CI publish workflow and pulling the trigger on a brand-new
public package are both the kind of visible, external action this project's
house rules ask to flag rather than do silently.
