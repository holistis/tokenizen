# x402-lint

Checks whether an x402 seller's payment-required response will actually be accepted by a real buyer, before a real buyer finds out the hard way.

It exists because of a bug we shipped ourselves. On 2026-10-22 our own `capacity-attest` server answered every payment-required request with a perfectly normal-looking JSON object — and every real x402 client silently refused to pay, with no error surfaced anywhere. The cause: `@x402/core`'s own client-side schema caps `resource.serviceName` at 32 characters, and two of our tools declared a 53- and a 71-character name. The response passed every manual look at it. It failed the one check that actually mattered: the real buyer library's own `parsePaymentRequired()`.

x402-lint runs that exact, real schema — imported directly from `@x402/core`, never reimplemented by hand — against a seller's own response, so that thirty-second check catches what an hour of "why isn't the payment going through" debugging otherwise finds.

## Use it from the terminal

```
npx @alghanima/x402-lint https://your-service.example/some-route
npx @alghanima/x402-lint https://your-service.example/mcp --tool your_paid_tool_name
```

(installs a `check-x402` command — `npm install -g @alghanima/x402-lint` then run `check-x402 <url>` directly)

```
OK  https://capacity-attest.tokenizen.nl/mcp  (mcp transport, HTTP 200)
schema: valid against @x402/core's PaymentRequiredSchema
  no issues found
```

Add `--json` for the full machine-readable report, `--args '{"...":"..."}'` to send specific arguments with the MCP probe. Exit code is 0 for ok, 1 for a failed check, 2 for a usage error — safe to drop straight into CI.

## Use it as an MCP tool

A free, public, read-only `check_x402_conformance` tool is hosted at `https://x402-lint.tokenizen.nl/mcp` (`StreamableHTTPClientTransport`). No payment, no API key. Point any MCP client at it directly, or run the same server yourself:

```
npm install
npm run build
npm run start:http
```

## Two transports, because our own bug lived in the second one

**Plain x402** (one URL, one priced action): send a bare request, the 402 status itself is the payment-required signal, and the response body is the `PaymentRequired` object directly. Just pass the URL.

**MCP** (one URL serves several named paid tools, e.g. anything built with `@x402/mcp`'s `createPaymentWrapper` — this is exactly where both of our own serviceName bugs lived): the HTTP layer answers 200 either way, and the payment-required object is nested inside a JSON-RPC tool result's `content[0].text`, only visible when `isError:true`. An MCP endpoint cannot answer "what does this cost" without being told which tool you mean, so `--tool`/`mcpToolName` is required to get any signal from one at all.

## What it checks

- **Schema validity** — the real, unmodified `parsePaymentRequired()` from `@x402/core`. If this fails, no spec-compliant client will ever pay, regardless of how reasonable the response looks.
- **Address shape** (warning, not a schema violation) — `accepts[].asset` and `accepts[].payTo` should look like a real `0x`-prefixed 20-byte address.
- **Resource URL match** (warning) — a v2 response's `resource.url` should match the URL actually tested, or a careful client may refuse it as resource-mismatched.

## Honest limits

This only sees the HTTP/MCP-level response. It cannot see whether the seller's own signer can actually broadcast once a real payment settles — that was the *other* bug we found the same night: a signer built with no provider attached, which only throws once a real payment has already been taken. No anonymous, read-only check can see that from the outside without spending real money against someone else's live endpoint, which this tool deliberately never does.

Every outbound request this tool makes goes through [`tokenizen-net-guard`](https://www.npmjs.com/package/tokenizen-net-guard)'s `guardedFetch`, because `resourceUrl` is, by design, whatever the caller gives it — the same SSRF threat model net-guard was already built for.

MIT licensed. Part of the tokenizen monorepo.
