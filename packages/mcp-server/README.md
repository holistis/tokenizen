# mcp-server

A paid MCP tool over x402, wrapping [self-check-server](../self-check-server)'s existing `verify_ownership` check so an AI agent can find and pay for it through an MCP discovery catalog's `type=mcp` shelf, not just a plain HTTP route.

The tool does not reimplement the check. It calls self-check-server's own free endpoint over loopback and returns the same answer. The MCP layer is what is new: charging via x402 for convenient, agent-native access.

## Deployed, live, verified

Runs on `x402-mcp.tokenizen.nl`, a standalone systemd service alongside self-check-server (same hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`). Kept as its own process so a mistake here can never take the paid HTTP route down.

A real mainnet payment was made end to end on 2026-10-21: tool call, payment-required response, client signs and pays, tool executes, settlement response returned.

- Settlement: `0x044100b016ea7836b436ea38af57b24987bae01cc4268a97b9119d66f5c26e02`

## Environment

- `X402_PAY_TO`: same payTo address self-check-server already uses.
- `MCP_FACILITATOR_URL`: defaults to `https://facilitator.payai.network`, the same facilitator self-check-server settles mainnet through.
- `FREE_CHECK_URL`: defaults to `http://127.0.0.1:8787/api/verify-ownership`, self-check-server's own free route.
- `MCP_PORT`: defaults to `4100`.

## Run

```bash
npm install
X402_PAY_TO=0x... npm start
```
