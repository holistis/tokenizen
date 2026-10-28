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

/**
 * Parse TRUST_PROXY into the value Express's "trust proxy" wants. Without this
 * the per-IP rate limiter keys every request on the reverse proxy's address
 * behind a CDN (one global bucket any single client can exhaust), which is the
 * whole defect the IPv6-/64 + trust-proxy hardening exists to avoid. A bare
 * "true" is deliberately refused: it trusts a client-supplied X-Forwarded-For
 * end to end, letting a caller spoof a fresh rate-limit bucket per request.
 * Accepts a non-negative integer hop count (the normal case, e.g. 1) or an
 * Express named preset (e.g. "loopback"); anything else falls back to the safe
 * default (false).
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw.trim() === "") return false;
  const v = raw.trim();
  const n = Number(v);
  if (Number.isInteger(n) && n >= 0) return n;
  if (v.toLowerCase() === "true") {
    console.warn('self-check-server: TRUST_PROXY="true" is refused (spoofable); set the exact proxy hop count instead. Falling back to false.');
    return false;
  }
  return v; // a named preset like "loopback" / "loopback, uniquelocal"
}

async function main(): Promise<void> {
  const port = parsePort(process.env.PORT, 8787);
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  // A GitHub token WITHOUT any permissions, only to raise the hourly allowance for public reads (60 -> 5000).
  // Never a personal token: this server is public and unauthenticated.
  const githubToken = process.env.CRA_CHECK_GITHUB_TOKEN?.trim();
  // Without a token the whole server may read GitHub only about six times an hour, and one visitor could use that up for
  // everybody, so the route stays OFF unless a token is set or anonymous use is switched on on purpose (CRA_CHECK_ALLOW_ANONYMOUS=1).
  const craEnabled = Boolean(githubToken) || process.env.CRA_CHECK_ALLOW_ANONYMOUS === "1";
  if (!craEnabled) console.warn("self-check-server: /api/cra/check is switched off (set CRA_CHECK_GITHUB_TOKEN to a token with no permissions to switch it on).");
  const app = createApp({
    trustProxy,
    ...(allowedOrigins ? { allowedOrigins } : {}),
    craCheck: { enabled: craEnabled, ...(githubToken ? { githubToken } : {}) },
  });
  // HOST narrows the interface it listens on. Unset keeps the old behaviour (all interfaces). Behind a
  // proxy that sets X-Forwarded-For, set HOST=127.0.0.1 so nobody can reach the port directly and send
  // that header themselves: the per-IP rate limit keys on it when TRUST_PROXY is set.
  const host = process.env.HOST?.trim() || undefined;
  const onListening = () => {
    console.log(`self-check-server listening on ${host ?? "all interfaces"}:${port} (trust proxy: ${JSON.stringify(trustProxy)})`);
  };
  if (host) app.listen(port, host, onListening);
  else app.listen(port, onListening);
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
