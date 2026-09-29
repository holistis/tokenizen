#!/usr/bin/env node
// server.ts — process entrypoint. All actual route/DI wiring lives in
// app.ts so tests can create an app without opening a real socket.

import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

async function main(): Promise<void> {
  const port = parsePort(process.env.PORT, 8787);
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
  const app = createApp(allowedOrigins ? { allowedOrigins } : {});
  app.listen(port, () => {
    console.log(`self-check-server listening on http://localhost:${port}`);
  });
}

// Same guard pattern as trust-attest-server/src/server.ts — importing this
// module (e.g. from a test) must never have the side effect of opening a
// port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("self-check-server failed to start:", e);
    process.exit(1);
  });
}
