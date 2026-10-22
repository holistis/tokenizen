#!/usr/bin/env node
// http-server-bin.ts — the actual process entrypoint for x402-lint's MCP server.
// Deliberately does nothing but call startServer(): see capacity-attest's own
// http-server-bin.ts for why the entrypoint logic lives in its own file
// instead of a self-detection guard inside the library module itself.
import { startServer } from "./http-server.js";

startServer();
