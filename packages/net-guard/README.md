# net-guard

The one place a public-facing tokenizen server is allowed to open an outbound connection.

It exists because the trust layer accepts a URL from whoever asks (an MCP agent, or an anonymous visitor on the web check). Any such URL is attacker-controlled, so a raw `fetch` or DNS lookup against it is a classic SSRF primitive: point it at `http://169.254.169.254/` (cloud metadata), `http://127.0.0.1:…`, or an internal-only host and the server becomes a blind network probe. net-guard makes that structurally hard, in two ways.

## What it guarantees

1. Every outbound connection is validated and pinned. A hostname is resolved once, every returned address is checked against the private, loopback, link-local (including the cloud metadata address), carrier-grade NAT, unique-local and reserved ranges, and only the validated addresses are dialed. There is no second resolution for a DNS-rebinding server to swing to a private address between the check and the connect. The check runs on the undici connector, so it fires for every connection: the initial request, every redirect hop, and plain IP-literal targets (which skip DNS and would otherwise slip past a lookup-only guard).

2. The build fails if anyone adds a raw outbound path. `src/no-raw-egress.test.ts` scans the guarded packages and fails while any production file uses a global `fetch` fallback, a raw ethers `JsonRpcProvider`, a raw MCP transport, or a direct `node:dns` call outside net-guard. Closing the SSRF class means the guard cannot be forgotten, not just that today's paths are covered.

## Using it

Inject `guardedFetch` wherever a library exposes a fetch seam, instead of letting it default to the global fetch:

```ts
import { guardedFetch, resolveTxtGuarded } from "net-guard";

await verifyOwnership(method, endpoint, owner, secret, {
  fetchImpl: guardedFetch,
  resolveTxtRecords: (name) => resolveTxtGuarded(name),
});
```

For an MCP client transport, pass it as the transport's `fetch`:

```ts
new StreamableHTTPClientTransport(url, { fetch: guardedFetch });
```

`makeGuardedFetch({ dnsLookupAll, connectTimeoutMs, headersTimeoutMs, bodyTimeoutMs })` builds a variant with an injectable resolver (used by the tests so no real DNS happens) and custom timeouts.

## Also exported

- `resolveTxtGuarded(name)`: the single place a DNS TXT lookup is made. A TXT query opens no connection to the named host, so this is not an SSRF primitive; it is centralised only so there is one DNS choke-point.
- `assertPubliclyRoutableHost(hostname, { dnsLookupAll })`: an optional early check a server can run to reject an obviously-internal host before any fetch, for a friendlier error. The real, pinning enforcement is `guardedFetch`; this is a pre-filter, never the only defence.
- `isBlockedAddress`, `assertHostnameLiteralSafe`, `UnsafeHostError`.

## Honest limits

It decides by the resolved IP range. It is the right defence for a server that fetches an untrusted, attacker-named URL. It is not a general firewall, and it deliberately does not change the behaviour of libraries used on a trusted network with an operator-chosen URL. Callers still bound their own response sizes; net-guard sets connect, headers and body timeouts but does not cap body bytes for them.

MIT licensed. Part of the tokenizen monorepo.
