import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAttesterIdentity } from "trust-attest-server/dist/attester-identity.js";
import { createApp } from "./app.js";
import { bodyCallsATool, CRA_MCP_TOOL } from "./cra-mcp.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");

type Route = [string, () => Response | Promise<Response>];
function fakeGithub(routes: Route[]) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [part, make] of routes) if (url.toLowerCase().includes(part)) return make();
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const json = (value: unknown, status = 200) => () => new Response(JSON.stringify(value), { status });
const meta = () => ({ full_name: "Owner/Repo", default_branch: "main", pushed_at: new Date(NOW - 86_400_000).toISOString(), license: { spdx_id: "MIT" }, private: false });
const commit = json([{ commit: { committer: { date: new Date(NOW - 86_400_000).toISOString() } } }]);
const okRoutes = (): Route[] => [
  ["raw.githubusercontent.com", () => new Response("report to security@example.org")],
  ["/git/trees/", json({ truncated: false, tree: [{ path: "SECURITY.md", type: "blob" }, { path: "package.json", type: "blob" }] })],
  ["/commits", commit],
  ["/security-advisories", json([])],
  ["/releases", json([])],
  ["/repos/owner/ghost", json({}, 404)],
  ["/repos/owner/", json(meta())],
];

describe("the CRA check as an MCP tool", () => {
  let server: Server;
  let baseUrl: string;
  let githubCalls: string[] = [];
  const clients: Client[] = [];

  async function start(opts: { max?: number; usage?: (line: string) => void } = {}) {
    const net = fakeGithub(okRoutes());
    githubCalls = net.calls;
    const app = createApp({
      identity: createAttesterIdentity(),
      seller: null,
      craCheck: { fetchImpl: net.fetchImpl, now: () => NOW, rateLimit: { windowMs: 60_000, max: opts.max ?? 100 } },
      ...(opts.usage ? { usageWriter: opts.usage } : {}),
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
  }
  async function connect(): Promise<Client> {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    clients.push(client);
    return client;
  }
  const textOf = (result: unknown) => ((result as { content: Array<{ text: string }> }).content[0] as { text: string }).text;

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close().catch(() => undefined)));
    server?.close();
  });

  it("lists one read-only tool and says up front that it is not a compliance check", async () => {
    await start();
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name)).toEqual([CRA_MCP_TOOL]);
    const tool = tools[0]!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
    expect(tool.description).toContain("not a compliance check");
    expect(tool.description).not.toMatch(/[—–]/);
  });

  it("returns the same dated report as the HTTP route", async () => {
    await start();
    const result = await (await connect()).callTool({ name: CRA_MCP_TOOL, arguments: { repo: "owner/repo" } });
    expect(result.isError).toBeUndefined();
    const report = JSON.parse(textOf(result));
    expect(report).toMatchObject({ ok: true, cached: false, repo: "Owner/Repo", summary: { measured: 8 } });
    expect(Object.keys(report).sort()).toEqual(["advisories", "cached", "controls", "measuredAt", "notice", "ok", "repo", "rules", "sources", "summary", "whatThisDoesNotMeasure"]);
  });

  it("turns a bad name, an unknown repository and a bad argument into plain errors", async () => {
    await start();
    const client = await connect();
    const bad = await client.callTool({ name: CRA_MCP_TOOL, arguments: { repo: "not a repo" } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("owner/repo");
    const ghost = await client.callTool({ name: CRA_MCP_TOOL, arguments: { repo: "owner/ghost" } });
    expect(ghost.isError).toBe(true);
    expect(textOf(ghost)).toContain("not found");
    // The tool's own schema refuses an empty or non-string repo before the checker is asked.
    await expect(client.callTool({ name: CRA_MCP_TOOL, arguments: { repo: "" } })).resolves.toMatchObject({ isError: true });
  });

  it("answers GET and DELETE with 405 and garbage with an error, and keeps working afterwards", async () => {
    await start();
    expect((await fetch(`${baseUrl}/mcp`)).status).toBe(405);
    expect((await fetch(`${baseUrl}/mcp`, { method: "DELETE" })).status).toBe(405);
    const garbage = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ hello: "world" }) });
    expect(garbage.status).toBeGreaterThanOrEqual(400);
    expect(garbage.status).toBeLessThan(500);
    const { tools } = await (await connect()).listTools();
    expect(tools).toHaveLength(1);
  });

  it("refuses a batch, so that many tool calls cannot ride on one request", async () => {
    await start({ max: 1 });
    const call = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: CRA_MCP_TOOL, arguments: { repo: "owner/repo" + id } } });
    const batch = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify([call(1), call(2), call(3)]) });
    expect(batch.status).toBe(400);
    expect(githubCalls).toHaveLength(0);
    // The refusal costs no check: a normal call still goes through afterwards.
    const result = await (await connect()).callTool({ name: CRA_MCP_TOOL, arguments: { repo: "owner/repo" } });
    expect(result.isError).toBeUndefined();
  });

  it("charges only a tool call against the check limit, not connecting or listing", async () => {
    await start({ max: 1 });
    for (let i = 0; i < 4; i++) await (await connect()).listTools();
    const client = await connect();
    expect((await client.callTool({ name: CRA_MCP_TOOL, arguments: { repo: "owner/repo" } })).isError).toBeUndefined();
    await expect(client.callTool({ name: CRA_MCP_TOOL, arguments: { repo: "owner/repo" } })).rejects.toThrow();
  });

  it("is counted like the other free checks and writes no repository name", async () => {
    const lines: string[] = [];
    await start({ usage: (line) => lines.push(line) });
    await (await connect()).callTool({ name: CRA_MCP_TOOL, arguments: { repo: "secret-owner/secret-repo" } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(JSON.parse(line)).toMatchObject({ event: "free_check", route: "mcp", internal: false });
    const all = lines.join("\n");
    for (const forbidden of ["secret-owner", "secret-repo", "127.0.0.1"]) expect(all).not.toContain(forbidden);
  });
});

describe("bodyCallsATool", () => {
  it("sees a tool call in a single message and in a batch, and nothing else", () => {
    expect(bodyCallsATool({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} })).toBe(true);
    expect(bodyCallsATool([{ method: "tools/list" }, { method: "tools/call" }])).toBe(true);
    for (const body of [{ method: "initialize" }, { method: "tools/list" }, [], null, undefined, "tools/call", 5]) expect(bodyCallsATool(body)).toBe(false);
  });
});
