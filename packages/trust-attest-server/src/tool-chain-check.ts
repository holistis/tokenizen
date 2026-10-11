// tool-chain-check.ts — a second attester check, for the consent-gated active
// path: given the MCP tool list an endpoint advertises, flag capability chains
// where untrusted content one tool can pull in could steer the model into a
// tool with a real-world consequence, with nothing claiming to stand in the
// way.
//
// This is purely a classification of the endpoint's OWN advertised tool
// descriptions (the same text any caller sees in a tools/list response). It
// performs no call, sends no payload, and never executes a tool. Obtaining the
// tool list over a live protocol handshake is a separate, consent-gated step;
// this function takes an already-obtained list and never touches the network.
//
// Posture matches checks.ts: a claimed confirmation gate is a CLAIM to verify,
// not proof, so it degrades the result to inconclusive rather than passed; a
// source-to-sink pair with no gate claim at all is the one case recorded as
// failed; and an empty or unclassifiable list is inconclusive, never guessed.

import type { CheckFinding, CheckResult } from "./checks.js";

export interface McpTool {
  name: string;
  description?: string;
}

export const TOOL_CHAIN_CHECK_NAME = "mcp-tool-capability-chains";

// A tool that can bring content into the model's context that the operator did
// not type: a page, a file, an email, an issue, a search result.
const SOURCE_RE =
  /\b(read|fetch|capture|navigate|browse|open a url|scan|download|search|crawl|visible text|page content|webpage|website|inbox|email|issue|pull request|comment|attachment)\b/i;

// A tool that, once called, has a real-world consequence outside the chat:
// money moves, code runs, a message goes out, data changes, a permission is
// granted.
const SINK_RE =
  /\b(pay|purchase|checkout|order|transfer|send|delete|remove|execute|run|eval|submit|post|publish|write|overwrite|modify|grant|approve|revoke|transaction|sign|deploy|merge|push)\b/i;

// A description claiming some human check exists before the consequence fires.
const CONFIRMATION_RE =
  /\b(requires? (?:the )?user'?s? (?:direct )?confirmation|cannot .*without|needs? (?:explicit )?approval|human[- ]in[- ]the[- ]loop|asks? (?:the )?user first|will not .*without)\b/i;

function firstMatch(re: RegExp, text: string): string | null {
  const m = text.match(re);
  return m ? m[0] : null;
}

interface Classified {
  name: string;
  sourceReason: string | null;
  sinkReason: string | null;
  confirmationClaim: string | null;
}

function classify(tool: McpTool): Classified {
  const text = `${tool.name} ${tool.description ?? ""}`;
  return {
    name: tool.name,
    sourceReason: firstMatch(SOURCE_RE, text),
    sinkReason: firstMatch(SINK_RE, text),
    confirmationClaim: firstMatch(CONFIRMATION_RE, tool.description ?? ""),
  };
}

/**
 * Classify the capability chains in an endpoint's advertised MCP tool list.
 * Pure: no network, no tool call. Returns a CheckResult in the same shape the
 * auth-signal check uses, so the attester records it the same way.
 *
 * Every (source, sink) pair in the same toolset is enumerated exhaustively: in
 * a normal MCP server (a handful to a few dozen tools) that is cheap and
 * complete rather than clever and partial. A tool may be both source and sink
 * (it reads a page and acts on it), which is the most dangerous single-tool
 * shape, so that case is kept rather than filtered out.
 */
export function analyzeToolChains(tools: McpTool[]): CheckResult {
  if (!Array.isArray(tools) || tools.length === 0) {
    return single({
      check: TOOL_CHAIN_CHECK_NAME,
      outcome: "inconclusive",
      detail:
        "no tool list was available to analyze: an empty or absent tools/list response cannot be judged either way",
    });
  }

  const classified = tools.map(classify);
  const sources = classified.filter((t) => t.sourceReason);
  const sinks = classified.filter((t) => t.sinkReason);

  const noGate: CheckFinding[] = [];
  const gateClaimed: CheckFinding[] = [];
  for (const source of sources) {
    for (const sink of sinks) {
      const base =
        `untrusted content via ${JSON.stringify(source.name)} (${source.sourceReason}) ` +
        `could steer the model into ${JSON.stringify(sink.name)} (${sink.sinkReason})`;
      if (sink.confirmationClaim) {
        gateClaimed.push({
          check: TOOL_CHAIN_CHECK_NAME,
          outcome: "inconclusive",
          detail: `${base}; the sink's own description claims a gate (${JSON.stringify(
            sink.confirmationClaim,
          )}), which is a claim to verify, not proof it covers this action`,
        });
      } else {
        noGate.push({
          check: TOOL_CHAIN_CHECK_NAME,
          outcome: "failed",
          detail: `${base}, and nothing in the sink's description claims any confirmation gate`,
        });
      }
    }
  }

  if (noGate.length > 0) {
    return {
      checksPerformed: [TOOL_CHAIN_CHECK_NAME],
      outcome: "failed",
      findings: [...noGate, ...gateClaimed],
    };
  }
  if (gateClaimed.length > 0) {
    return { checksPerformed: [TOOL_CHAIN_CHECK_NAME], outcome: "inconclusive", findings: gateClaimed };
  }
  return single({
    check: TOOL_CHAIN_CHECK_NAME,
    outcome: "passed",
    detail:
      `classified ${tools.length} advertised tool(s); no source-to-sink capability chain was found ` +
      `among their descriptions. A positive signal, read only from the declared descriptions, not a ` +
      `guarantee those descriptions are complete`,
  });
}

function single(finding: CheckFinding): CheckResult {
  return { checksPerformed: [finding.check], outcome: finding.outcome, findings: [finding] };
}
