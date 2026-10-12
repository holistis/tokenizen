// tool-chain-check.ts — a second attester check for the consent-gated active
// path. FACTS-ONLY: given the MCP tool list an endpoint advertises, it records
// OBSERVED FACTS about capability chains — which advertised tools can bring
// outside content into the model's context, which have an outside-the-chat
// effect, and whether a sink's own description contains a confirmation-gate
// phrase. It renders NO safe/unsafe verdict and NEVER drives the attestation's
// signed outcome: server.ts folds this result in informationally
// (appendInformationalResult), contributing checksPerformed and findings but
// not outcome.
//
// Why facts-only (owner decision, 2026-10-12): a signed "failed/unsafe" verdict
// derived from a keyword heuristic over text the ATTESTEE itself wrote would be
// an opinion dressed up as an attested fact — and a perverse one, since merely
// consenting to the active test would then drag an otherwise-passing
// attestation downward. Honesty is the moat: the attestation records what was
// observed, with the exact phrase it matched, and lets the reader judge, rather
// than signing a guess.
//
// This is purely a classification of the endpoint's OWN advertised tool
// descriptions (the same text any caller sees in a tools/list response). It
// performs no call, sends no payload, and never executes a tool. Obtaining the
// tool list over a live protocol handshake is a separate, consent-gated step
// (fetch-tools.ts); this function takes an already-obtained list and never
// touches the network.

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

// A tool that, once called, has an effect outside the chat: money moves, code
// runs, a message goes out, data changes, a permission is granted.
const SINK_RE =
  /\b(pay|purchase|checkout|order|transfer|send|delete|remove|execute|run|eval|submit|post|publish|write|overwrite|modify|grant|approve|revoke|transaction|sign|deploy|merge|push)\b/i;

// A description that contains a human-confirmation phrase. Recorded as a FACT
// (present/absent, with the matched phrase), never scored. The two "...without"
// arms use a BOUNDED repetition (`[^.]{0,80}?`) instead of `.*`, so an
// attacker-supplied description cannot drive pathological regex backtracking
// (defence in depth alongside the per-description length cap below); the bound
// also keeps the match sentence-local, which is what a real confirmation phrase
// looks like ("cannot transfer without confirmation").
const CONFIRMATION_RE =
  /\b(requires? (?:the )?user'?s? (?:direct )?confirmation|cannot\b[^.]{0,80}?\bwithout|needs? (?:explicit )?approval|human[- ]in[- ]the[- ]loop|asks? (?:the )?user first|will not\b[^.]{0,80}?\bwithout)\b/i;

// DoS bounds: the tool list is attacker-supplied. Classify at most MAX_TOOLS
// tools, scan at most MAX_DESC_CHARS characters per name/description before any
// regex runs, and emit at most MAX_PAIR_FINDINGS capability-pair findings
// (source×sink is quadratic in the worst case). Hitting a bound is itself
// recorded as a fact rather than silently truncated.
export const MAX_TOOLS = 500;
export const MAX_DESC_CHARS = 2_000;
const MAX_PAIR_FINDINGS = 100;

function firstMatch(re: RegExp, text: string): string | null {
  const m = text.match(re);
  return m ? m[0] : null;
}

interface Classified {
  name: string;
  sourceReason: string | null;
  sinkReason: string | null;
  confirmationPhrase: string | null;
}

function classify(tool: McpTool): Classified {
  const name = String(tool.name ?? "").slice(0, MAX_DESC_CHARS);
  const desc = (typeof tool.description === "string" ? tool.description : "").slice(0, MAX_DESC_CHARS);
  const text = `${name} ${desc}`;
  return {
    name,
    sourceReason: firstMatch(SOURCE_RE, text),
    sinkReason: firstMatch(SINK_RE, text),
    confirmationPhrase: firstMatch(CONFIRMATION_RE, desc),
  };
}

/**
 * Record the observed capability-chain FACTS in an endpoint's advertised MCP
 * tool list. Pure: no network, no tool call. Returns a CheckResult whose
 * findings are factual and whose outcome is ALWAYS "inconclusive" — this check
 * renders no verdict, so server.ts records it informationally and never lets it
 * change the attestation's signed outcome.
 *
 * Every (source, sink) pair in the same toolset is enumerated (up to the DoS
 * bound): in a normal MCP server (a handful to a few dozen tools) that is cheap
 * and complete rather than clever and partial. A tool may be both source and
 * sink (it reads a page and acts on it), which is the most consequential
 * single-tool shape, so that case is kept and stated explicitly rather than
 * filtered out.
 */
export function analyzeToolChains(tools: McpTool[]): CheckResult {
  if (!Array.isArray(tools) || tools.length === 0) {
    return informational(
      "no tool list was available to record: an empty or absent tools/list response. No capability-chain facts could be observed.",
    );
  }

  const totalTools = tools.length;
  const scanned = tools.slice(0, MAX_TOOLS);
  const classified = scanned.map(classify);
  const sources = classified.filter((t) => t.sourceReason);
  const sinks = classified.filter((t) => t.sinkReason);

  const findings: CheckFinding[] = [];
  let pairs = 0;
  let truncatedPairs = false;

  outer: for (const source of sources) {
    for (const sink of sinks) {
      if (pairs >= MAX_PAIR_FINDINGS) {
        truncatedPairs = true;
        break outer;
      }
      pairs++;
      const sameTool = source.name === sink.name;
      const subject = sameTool
        ? `a single advertised tool ${JSON.stringify(source.name)} is BOTH a content source (matched ${JSON.stringify(
            source.sourceReason,
          )}) and a consequence sink (matched ${JSON.stringify(sink.sinkReason)}) by its own description`
        : `the endpoint advertises a content source ${JSON.stringify(source.name)} (matched ${JSON.stringify(
            source.sourceReason,
          )}) and a consequence sink ${JSON.stringify(sink.name)} (matched ${JSON.stringify(sink.sinkReason)})`;
      const gateFact = sink.confirmationPhrase
        ? `the sink's description contains a confirmation-gate phrase (${JSON.stringify(sink.confirmationPhrase)})`
        : "the sink's description contains no confirmation-gate phrase";
      findings.push({
        check: TOOL_CHAIN_CHECK_NAME,
        outcome: "inconclusive",
        detail: `${subject}; ${gateFact}. Recorded as an observed fact about the advertised tool list, not a judgment of safety.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      check: TOOL_CHAIN_CHECK_NAME,
      outcome: "inconclusive",
      detail:
        `classified ${scanned.length} advertised tool(s); no pairing was observed where one advertises a content source ` +
        `and another (or the same) advertises a consequence sink. Read only from the declared descriptions, which are not ` +
        `independently verified to be complete.`,
    });
  }

  if (scanned.length < totalTools) {
    findings.push({
      check: TOOL_CHAIN_CHECK_NAME,
      outcome: "inconclusive",
      detail: `the endpoint advertised ${totalTools} tools; only the first ${MAX_TOOLS} were classified (a bound that keeps an attacker-supplied list from driving unbounded work).`,
    });
  }
  if (truncatedPairs) {
    findings.push({
      check: TOOL_CHAIN_CHECK_NAME,
      outcome: "inconclusive",
      detail: `more than ${MAX_PAIR_FINDINGS} source-to-sink tool pairings exist in the advertised list; only the first ${MAX_PAIR_FINDINGS} were recorded (a bound that keeps the findings list from growing quadratically with the tool count).`,
    });
  }

  return { checksPerformed: [TOOL_CHAIN_CHECK_NAME], outcome: "inconclusive", findings };
}

function informational(detail: string): CheckResult {
  return {
    checksPerformed: [TOOL_CHAIN_CHECK_NAME],
    outcome: "inconclusive",
    findings: [{ check: TOOL_CHAIN_CHECK_NAME, outcome: "inconclusive", detail }],
  };
}
