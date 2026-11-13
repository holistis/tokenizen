// verify-registry-meta-persisted.mjs -- checks whether the REAL, public MCP
// registry (registry.modelcontextprotocol.io) actually STORES and RETURNS the
// _meta["io.modelcontextprotocol.registry/publisher-provided"] block we added to
// ../server.json, instead of assuming that a schema which DEFINES an extension slot
// also PERSISTS it end to end after a real publish.
//
// Context: the registry's own OpenAPI spec (https://registry.modelcontextprotocol.io/openapi.yaml,
// which server.schema.json's own $comment says it is auto-generated from, so these are
// one source of truth, not two that could drift) types ServerJSON._meta as ServerMeta,
// with io.modelcontextprotocol.registry/publisher-provided as a normal, typed,
// round-trippable property on both the publish request body and every server response
// -- not just schema-level laxness where additionalProperties merely happens to allow it.
// That is strong, source-grounded evidence this SHOULD round-trip. It is still evidence about the
// registry's documented CONTRACT, not a direct observation of OUR OWN publish going
// through it: only an actual `mcp-publisher publish` run (gated behind this package's own
// .github/workflows/publish-mcp-registry.yml -- a manual workflow_dispatch that requires
// someone to type the literal word "publish" -- a separate human decision, never run by
// this script) can produce that direct observation. This script is the honest before/after
// check for that moment: run before a publish, it reports today's real gap, not a guess;
// run again after one, it is the actual proof, not an assumption that the schema slot
// "must" work.
//
// Checked empirically 2026-11-13 (see this run's own output below): the live registry's
// history for this server name stops at version 0.7.0 (published 2026-09-29) -- versions
// 0.8.0 through our current 0.12.0 (local server.json) have never been published at all,
// and none of the 7 versions on record has ever carried a publisher-provided _meta block.
// So today this script is EXPECTED to fail at the "exact version not found" step below,
// not at the _meta comparison step -- that is the honest current state, not a bug in the
// check.
//
// Reads this package's OWN server.json rather than hardcoding a second copy of its
// name/version/_meta (see fiscal-controls.ts's own header for why a hand-typed second
// copy of a true value drifts the moment the real value changes) and checks it against
// three real, read-only, unauthenticated GET endpoints documented in that same
// openapi.yaml:
//   GET /v0/servers/{serverName}/versions/{version}   (exact version lookup)
//   GET /v0/servers/{serverName}/versions/latest       (what the registry calls latest today)
//   GET /v0/servers?search={name}                      (cross-check: every version on record)
//
// Usage: node scripts/verify-registry-meta-persisted.mjs
// Safe to run any time: three plain GETs against a public API, no auth header, no write,
// no publish, no state changed anywhere. A network failure and a "not published yet"
// result both exit 1 with a clear, specific message; only a confirmed, deep-equal
// round-trip of our own _meta block exits 0.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REGISTRY_BASE = "https://registry.modelcontextprotocol.io";
const PUBLISHER_META_KEY = "io.modelcontextprotocol.registry/publisher-provided";
const OFFICIAL_META_KEY = "io.modelcontextprotocol.registry/official";
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "tokenizen-capacity-attest-verify-script (+https://github.com/holistis/tokenizen)";

const serverJsonPath = fileURLToPath(new URL("../server.json", import.meta.url));

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
  return aKeys.every((k) => deepEqual(a[k], b[k]));
}

// Self-check deepEqual before trusting it with a real registry comparison, every time this
// script runs, not just once in a separate test file that could go stale or stop being run.
// The planted-fault cases below are the actual proof: a comparator that always returned true
// would still pass the first assertion but must fail these.
assert.strictEqual(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true, "deepEqual self-check (equal, different key order) failed");
assert.strictEqual(deepEqual({ a: 1 }, { a: 2 }), false, "deepEqual self-check (planted fault: different value) incorrectly passed");
assert.strictEqual(deepEqual({ a: 1 }, { a: 1, b: 2 }), false, "deepEqual self-check (planted fault: extra key) incorrectly passed");
assert.strictEqual(deepEqual([1, 2, 3], [1, 2, 3]), true, "deepEqual self-check (equal arrays) failed");
assert.strictEqual(deepEqual([1, 2], [2, 1]), false, "deepEqual self-check (planted fault: reordered array) incorrectly passed");

async function getJson(path) {
  const url = `${REGISTRY_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`network error calling ${url}: ${e?.message ?? e}`);
  }
  const text = await res.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${url} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
  }
  return { status: res.status, body, url };
}

async function main() {
  const local = JSON.parse(readFileSync(serverJsonPath, "utf8"));
  const localName = local.name;
  const localVersion = local.version;
  const localPublisherMeta = local._meta?.[PUBLISHER_META_KEY] ?? null;

  console.log(`Local server.json: ${localName} @ ${localVersion}`);
  console.log(
    `Local _meta["${PUBLISHER_META_KEY}"]: ${localPublisherMeta ? JSON.stringify(localPublisherMeta) : "(absent)"}`,
  );
  console.log("");

  if (!localPublisherMeta) {
    console.error(
      `FAIL (current observed state): server.json has no _meta["${PUBLISHER_META_KEY}"] block to check yet ` +
        `-- nothing for this script to compare against the registry. Add that block first.`,
    );
    process.exit(1);
  }

  const encodedName = encodeURIComponent(localName);

  // Cross-check: every version the registry has ever recorded for this name, and whether
  // publisher-provided _meta has EVER appeared on any of them. Informational only -- the
  // pass/fail decision below rests on the exact-version lookup, not on this search.
  const list = await getJson(`/v0/servers?search=${encodeURIComponent(localName)}`);
  if (list.status === 200) {
    const servers = Array.isArray(list.body?.servers) ? list.body.servers : [];
    const versions = servers.map((e) => e.server?.version).filter(Boolean);
    const everHadPublisherMeta = servers.some((e) => Boolean(e.server?._meta?.[PUBLISHER_META_KEY]));
    const latestEntry = servers.find((e) => e._meta?.[OFFICIAL_META_KEY]?.isLatest === true);
    console.log(
      `Registry history: ${versions.length} version(s) on record${versions.length ? ` (${versions.join(", ")})` : ""}; ` +
        `registry-latest = ${latestEntry?.server?.version ?? "(none published)"}; ` +
        `publisher-provided _meta seen on any prior version: ${everHadPublisherMeta}`,
    );
  } else {
    console.log(`Registry history: lookup failed (HTTP ${list.status} from ${list.url})`);
  }

  // Informational: what does the registry call "latest" right now, independent of
  // whether that matches our local version.
  const latest = await getJson(`/v0/servers/${encodedName}/versions/latest`);
  const latestVersion = latest.status === 200 ? latest.body?.server?.version ?? "(unknown shape)" : `HTTP ${latest.status}`;
  console.log(`Registry "latest" lookup right now: ${latestVersion}`);
  console.log("");

  // Primary check: does the registry have an entry for the EXACT version in our local
  // server.json right now? This is the only lookup the pass/fail verdict is based on.
  const exact = await getJson(`/v0/servers/${encodedName}/versions/${encodeURIComponent(localVersion)}`);

  if (exact.status === 404) {
    console.error(
      `FAIL (current observed state, expected until a real publish happens): the live registry has ` +
        `never published ${localName}@${localVersion} -- GET ${exact.url} -> 404 ` +
        `"${exact.body?.detail ?? exact.body?.title ?? "not found"}". Registry-latest on record is ` +
        `${latestVersion}. The schema slot this script checks (_meta["${PUBLISHER_META_KEY}"]) cannot ` +
        `round-trip for a version that was never published. Run the "Publish to MCP Registry" GitHub ` +
        `Actions workflow (.github/workflows/publish-mcp-registry.yml at the repo root, workflow_dispatch, ` +
        `requires typing "publish") -- a separate human decision, not something this script does -- then ` +
        `re-run this script.`,
    );
    process.exit(1);
  }

  if (exact.status !== 200) {
    console.error(
      `FAIL (current observed state): unexpected HTTP ${exact.status} from GET ${exact.url}: ` +
        `${JSON.stringify(exact.body)}`,
    );
    process.exit(1);
  }

  const remotePublisherMeta = exact.body?.server?._meta?.[PUBLISHER_META_KEY] ?? null;
  console.log(
    `Remote _meta["${PUBLISHER_META_KEY}"] for ${localName}@${localVersion}: ` +
      `${remotePublisherMeta ? JSON.stringify(remotePublisherMeta) : "(absent)"}`,
  );

  if (!remotePublisherMeta) {
    console.error(
      `FAIL (current observed state): ${localName}@${localVersion} IS on the registry, but the document ` +
        `it stored has no _meta["${PUBLISHER_META_KEY}"] at all -- the field did not survive this publish. ` +
        `This is the one outcome that would actually disprove the schema-level expectation above, as ` +
        `opposed to simply reflecting that no publish has happened yet.`,
    );
    process.exit(1);
  }

  if (!deepEqual(remotePublisherMeta, localPublisherMeta)) {
    console.error(
      `FAIL (current observed state): ${localName}@${localVersion}'s remote _meta["${PUBLISHER_META_KEY}"] ` +
        `is present but does not match our local server.json.\n  local:  ${JSON.stringify(localPublisherMeta)}\n` +
        `  remote: ${JSON.stringify(remotePublisherMeta)}`,
    );
    process.exit(1);
  }

  console.log(
    `PASS: the live registry stores and returns our _meta["${PUBLISHER_META_KEY}"] block unchanged for ` +
      `${localName}@${localVersion}.`,
  );
}

main().catch((e) => {
  console.error("FAIL (script error, not a registry result):", e?.message ?? e);
  process.exit(1);
});
