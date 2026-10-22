#!/usr/bin/env node
// cli.ts — standalone command-line entrypoint, for the person who wants a
// one-line terminal check instead of an MCP tool call. Same underlying
// checkX402Conformance() as http-server.ts; this file only parses argv and
// formats the result. No network behavior lives here.

import { parseArgs } from "node:util";
import { checkX402Conformance } from "./check.js";

function usageAndExit(code: number): never {
  process.stderr.write(
    [
      "Usage: check-x402 <resourceUrl> [options]",
      "",
      "Checks resourceUrl's own payment-required response against the REAL",
      "client-side schema from @x402/core — the same schema a real buyer's",
      "own x402 client enforces before it will ever attempt to pay.",
      "",
      "Options:",
      "  --tool <name>       MCP tool name to probe (required for an MCP endpoint",
      "                       serving several named tools behind one URL)",
      "  --args <json>       JSON object of arguments sent with the MCP probe, default {}",
      "  --json               print the full machine-readable report instead of a summary",
      "  -h, --help           show this help",
      "",
      "Exit code: 0 if ok, 1 if the response failed the check, 2 on a usage error.",
      "",
      "Example:",
      "  check-x402 https://capacity-attest.tokenizen.nl/mcp --tool publish_reputation_feedback",
    ].join("\n") + "\n",
  );
  process.exit(code);
}

function printHuman(report: Awaited<ReturnType<typeof checkX402Conformance>>): void {
  const out = process.stdout;
  out.write(`${report.ok ? "OK" : "FAIL"}  ${report.testedUrl}  (${report.transport} transport, HTTP ${report.httpStatus ?? "n/a"})\n`);
  const schemaLabel = report.schemaValid === null ? "not evaluated (see error below)" : report.schemaValid ? "valid" : "INVALID";
  out.write(`schema: ${schemaLabel} against @x402/core's PaymentRequiredSchema\n`);
  for (const err of report.schemaErrors) out.write(`  error: ${err}\n`);
  for (const issue of report.issues) out.write(`  ${issue.severity}: [${issue.field}] ${issue.message}\n`);
  if (report.schemaErrors.length === 0 && report.issues.length === 0) {
    out.write("  no issues found\n");
  }
}

function parseCliArgs(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      tool: { type: "string" },
      args: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    } as const,
  });
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`check-x402: ${(e as Error).message}\n`);
    usageAndExit(2);
  }

  if (parsed.values.help || parsed.positionals.length !== 1) usageAndExit(parsed.values.help ? 0 : 2);

  let mcpToolArguments: Record<string, unknown> | undefined;
  if (parsed.values.args !== undefined) {
    try {
      mcpToolArguments = JSON.parse(parsed.values.args) as Record<string, unknown>;
    } catch {
      process.stderr.write("check-x402: --args must be valid JSON\n");
      usageAndExit(2);
    }
  }

  const report = await checkX402Conformance(parsed.positionals[0]!, {
    mcpToolName: parsed.values.tool,
    mcpToolArguments,
  });

  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }
  process.exit(report.ok ? 0 : 1);
}

main().catch((e: unknown) => {
  process.stderr.write(`check-x402: unexpected error: ${(e as Error).message}\n`);
  process.exit(2);
});
