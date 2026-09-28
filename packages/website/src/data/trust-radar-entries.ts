/**
 * Trust Radar data model and demo dataset.
 *
 * Each entry reflects a single, passive HTTP GET against an MCP server's own
 * public discovery endpoint: no login attempt, no JSON-RPC `initialize`, no
 * tool call. The status is only ever what the server itself volunteered in
 * that one response, nothing inferred or actively probed.
 *
 * IMPORTANT (why this ships with placeholder data, not the real prospect
 * scan): naming specific third-party companies with a security-adjacent
 * status, based on an unsolicited scan they never opted into, is a real
 * publication decision with legal and reputational stakes, not just an
 * engineering one. That decision belongs to the koning, made with the real
 * list in front of him, not baked silently into a public git history by a
 * feature branch. This file demonstrates the exact schema and all three
 * states with clearly fictional example.* domains so the component and the
 * badge generator are fully working and reviewable; swapping in the real,
 * reviewed list is a one-file change once that decision is made.
 */

export type TrustRadarStatus = "confirmed-safe" | "open-unclear" | "self-declared-unsafe";

export interface TrustRadarEntry {
  /** Display name of the MCP server / product. */
  name: string;
  /** Primary domain the server is hosted on. */
  domain: string;
  /** The MCP endpoint URL that was checked. */
  endpoint: string;
  status: TrustRadarStatus;
  /** ISO 8601 date the passive check was last performed. */
  checkedAt: string;
  /** One-line, factual basis for the status: what the server itself returned. */
  note: string;
}

export const TRUST_RADAR_ENTRIES: TrustRadarEntry[] = [
  {
    name: "Example Docs MCP",
    domain: "docs.example.com",
    endpoint: "https://docs.example.com/mcp",
    status: "confirmed-safe",
    checkedAt: "2026-09-28",
    note: "Server rejects the discovery request with HTTP 401 until valid credentials are presented.",
  },
  {
    name: "Example Ledger MCP",
    domain: "ledger.example.dev",
    endpoint: "https://ledger.example.dev/mcp",
    status: "confirmed-safe",
    checkedAt: "2026-09-28",
    note: "CORS headers confirm a live MCP session handshake, and the request is rejected until credentials are supplied.",
  },
  {
    name: "Example Analytics MCP",
    domain: "analytics.example.dev",
    endpoint: "https://analytics.example.dev/mcp",
    status: "open-unclear",
    checkedAt: "2026-09-28",
    note: "Server answers the discovery request with HTTP 200 and shows no authentication field in its own response.",
  },
  {
    name: "Example Briefing MCP",
    domain: "briefing.example.ai",
    endpoint: "https://briefing.example.ai/mcp",
    status: "self-declared-unsafe",
    checkedAt: "2026-09-28",
    note: 'Server\'s own discovery response states: "No authentication required."',
  },
];
