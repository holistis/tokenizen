// cra-repo-check.ts — what is VISIBLE in a public GitHub repository of eight signals that relate to topics the EU Cyber
// Resilience Act (Regulation (EU) 2024/2847) puts on makers of software around vulnerability handling and distribution.
//
// WHAT THIS IS, AND IS NOT. These are eight selected signals, not one signal per legal requirement. Annex I part II has
// eight requirements (points 1 to 8); the signals below relate to some of them (a software bill of materials to point 1,
// automatic updates to 2, security scans to 3, a disclosure policy and a contact to 5 and 6, signed releases to 7) and add
// general supply-chain and maintenance practice (pinned dependencies, recent maintenance, a licence) that the Regulation
// does not list as such. It is an indication from public data, never a verdict that anyone "complies" or "does not
// comply": most duties (product design, documentation, the reporting process towards ENISA) cannot be seen from outside,
// and a thing done outside GitHub (a separate build server, a package registry's own provenance, a scan switched on in the
// repository settings) is not visible here. The wording therefore says "not visible", never "missing".
//
// THE RULE THAT MATTERS MOST: a point is only "not visible" when everything that could show it was read. If a call failed,
// the file tree was cut off, a file was only partly examined or some workflow files were not read, the point is "not
// measured". Two adversarial reviews of our own and one outside opinion (28 Oct 2026) each found a place where a partial
// read could still become a gap; the tests below keep those closed.
//
// Two layers, so the second can be tested without a network:
//   - fetchSignals() makes the read-only calls to api.github.com and raw.githubusercontent.com and returns plain facts
//     about what could and could not be read. The whole file tree comes from ONE call (git trees, recursive), so a
//     monorepo's nested lockfile or a nested SBOM is seen, and a tree that GitHub cut off makes the file-based points
//     "not measured".
//   - assessRepo() is a pure function from those facts to the eight signals.
//
// The only egress is the fetch that is passed in (the server passes net-guard's guardedFetch), and the only hosts it is ever
// asked for are the two fixed GitHub hosts: the repository name is validated strictly, every path segment is
// percent-encoded again when the URL is built, and files are always read at HEAD, so no text chosen by the repository owner
// (a branch name) ends up in an address. Every response is read with a size cap, because a repository owner chooses how big
// the files in their repository are.

export const RULES_VERSION = "2026-10-28.6";
export const RULES_REVIEWED_ON = "2026-10-28";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_RAW_BYTES = 200_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_TREE_BYTES = 3_000_000;
const MAX_TREE_ENTRIES = 40_000;
const MAX_WORKFLOW_FILES = 12;
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;
const MAX_SOURCES_LISTED = 40;

const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f-\u009f​-‏ -‮⁦-⁩﻿]", "g");

/** Text that came from a repository (file names, asset names) is cut and stripped of control characters before it goes anywhere. */
export function clean(value: unknown, max = 120): string {
  return String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .slice(0, max);
}

/** Takes "owner/repo" or a github.com address and returns "owner/repo", or null for anything that does not strictly look like one. */
export function parseRepo(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().slice(0, 300);
  s = s.replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = s.split("/");
  if (parts.length < 2) return null;
  const owner = parts[0] ?? "";
  const name = parts[1] ?? "";
  if (!OWNER_RE.test(owner) || !NAME_RE.test(name)) return null;
  if (name === "." || name.includes("..")) return null;
  return `${owner}/${name}`;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const LOCKFILES = [
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "npm-shrinkwrap.json", "bun.lockb", "bun.lock", "deno.lock",
  "Cargo.lock", "poetry.lock", "Pipfile.lock", "uv.lock", "go.sum", "Gemfile.lock", "composer.lock", "gradle.lockfile",
  "packages.lock.json", "Package.resolved", "pubspec.lock", "mix.lock", "flake.lock",
];
/** Manifests of ecosystems where a lockfile is the norm. */
const LOCKED_MANIFESTS = ["package.json", "Cargo.toml", "pyproject.toml", "requirements.txt", "Pipfile", "Gemfile", "composer.json"];
/** Manifests of ecosystems where versions are normally pinned in the build file itself, so a missing lockfile says little. */
const PINNED_IN_BUILD_FILE = ["pom.xml", "build.gradle", "build.gradle.kts", "go.mod"];
// docker/build-push-action attaches a provenance attestation and an SBOM to the image it pushes when asked to (provenance: mode=max, sbom: true):
// found by checking a sample of "not visible" findings by hand, one repository did exactly that and was called "not visible" for both.
const SBOM_FILE = /(^|\/)(sbom|bom)(\.[a-z0-9-]+)*\.(json|xml)$|\.(spdx|cdx)(\.json)?$|(^|\/)[^/]*cyclonedx[^/]*\.(json|xml)$/i;
const SBOM_WORKFLOW = /(anchore\/sbom-action|cyclonedx|syft\b|spdx-sbom-generator|trivy[^\n]{0,200}sbom|npm sbom|cdxgen|sbom-tool|advanced-security\/spdx|\bsbom:\s*(?:true|generator=)|--sbom(?:=true)?(?![-\w]))/i;
const PROVENANCE_FILE = /\.(sig|asc|minisig|sigstore|intoto\.jsonl|attestation)$|\.sigstore\.json$|\.cosign\.bundle$/i;
const PROVENANCE_WORKFLOW = /(attest-build-provenance|actions\/attest|slsa-framework|cosign|sigstore|--provenance|npm publish[^\n]{0,200}provenance|gpg --detach|minisign|\bprovenance:\s*(?:true|mode=(?:min|max))\b)/i;
const SCAN_WORKFLOW = /(codeql|semgrep|trivy|grype|osv-scanner|snyk|gitleaks|trufflehog|scorecard|npm audit|pip-audit|cargo audit|govulncheck|bandit|brakeman|sonarcloud|sonarqube|dependency-review)/i;
/** The three places GitHub itself looks for a security policy. */
const POLICY_FILE = /^(?:\.github\/|docs\/)?SECURITY\.(?:md|txt|rst)$/i;
const DEPENDABOT_FILE = /^\.github\/dependabot\.ya?ml$/i;
const RENOVATE_FILE = /^(?:(?:\.github|\.gitlab)\/)?renovate\.json5?$|^\.renovaterc(?:\.json5?)?$/i;
const LICENCE_FILE = /^(?:LICEN[CS]E|COPYING|UNLICENSE)(?:[.-][A-Za-z0-9._-]{0,40})?$/i;
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
/** Workflow files that usually hold release, signing and scanning steps are read first, because only some of the files are read. */
const WORKFLOW_PRIORITY = /release|publish|deploy|sign|sbom|attest|provenance|codeql|security|scan|audit/i;

/**
 * Every pattern here is bounded, and it is only ever run on one short line at a time: a repository owner chooses the text, and a
 * regex that backtracks on a 200 KB line would stop the whole server. A link only counts when it looks like a reporting channel
 * (security, advisories, report, disclosure, a bounty platform, contact): a project homepage is not a way to report a vulnerability.
 */
const CONTACT_WORDS = "security|advis|report|disclos|vulnerab|psirt|csirt|(?<![a-z])cert(?![a-z])|bounty|hackerone|bugcrowd|intigriti|yeswehack|contact";
const CONTACT = new RegExp(
  `\\b[\\w.%+-]{1,64}@[\\w-]{1,63}(?:\\.[\\w-]{1,63}){0,3}\\.[A-Za-z]{2,24}\\b|https?:\\/\\/[^\\s)>\\]]{0,150}(?:${CONTACT_WORDS})[^\\s)>\\]]{0,150}|security\\/advisories|private vulnerability reporting|report a vulnerability`,
  "i",
);
/**
 * An address written so that a spam robot does not read it: "security AT example.org", "security [at] example.org", "security (at) example.org".
 * Found by checking the benchmark against GitHub's own detection: one policy that said "please contact us by sending an email to
 * security AT cozycloud.cc" was called "no contact". Case matters on purpose: a plain lower case "at" is an ordinary word ("look at example.com"),
 * so only the capital AT and the bracketed forms count. Bounded, like the pattern above, because it is run on lines an owner wrote.
 */
const OBFUSCATED_ADDRESS = /\b[\w.%+-]{1,64}\s{0,2}(?:\[(?:at|AT)\]|\((?:at|AT)\)|\{(?:at|AT)\}|AT)\s{0,2}[\w-]{1,63}(?:\.[\w-]{1,63}){0,3}\.[A-Za-z]{2,24}\b/;
/**
 * An address in a template is not a contact: security@example.com, an address on a reserved test domain (.local, .test, .invalid, .example),
 * written plainly or hidden. Found by reading the "visible" policies by eye: one named agent@something.local. Bounded like the patterns above.
 */
const PLACEHOLDER_ADDRESS = /[\w.%+-]{1,64}(?:@|\s{0,2}(?:\[(?:at|AT)\]|\((?:at|AT)\)|\{(?:at|AT)\}|AT)\s{0,2})(?:[\w-]{1,63}\.){0,3}(?:example\.(?:com|org|net)|[\w-]{1,63}\.(?:local|localhost|test|invalid|example))\b/gi;
const MAX_POLICY_CHARS = 16_384;
const MAX_LINE_CHARS = 1_000;
/** Workflow text that is looked at per file; a longer file counts as only partly read. */
const MAX_WORKFLOW_CHARS = 65_536;

/**
 * Does the policy text name an email address or a reporting link? true: yes. false: all of the text was examined and there is none.
 * null: only part of it could be examined (cut off by the read cap, past 16 KB, or a line over 1000 characters), so "no" cannot be said.
 * Badges and images do not count as a contact.
 */
export function namesContact(text: string, readTruncated = false): boolean | null {
  let skipped = readTruncated || text.length > MAX_POLICY_CHARS;
  for (const line of text.slice(0, MAX_POLICY_CHARS).split("\n")) {
    if (line.length > MAX_LINE_CHARS) {
      skipped = true;
      continue;
    }
    if (/shields\.io|badge/i.test(line)) continue;
    // a linked image ([![alt](image)](target)) is a button, not a contact: drop the whole construct, then look at what is left
    const plain = line.replace(/\[!\[[^\]]{0,200}\]\([^)]{0,300}\)\]\([^)]{0,300}\)/g, " ").replace(/!\[[^\]]{0,200}\]\([^)]{0,300}\)/g, " ")
      .replace(PLACEHOLDER_ADDRESS, " ");
    if (CONTACT.test(plain) || OBFUSCATED_ADDRESS.test(plain)) return true;
  }
  return skipped ? null : false;
}

/**
 * Comments in a workflow are not steps, and neither is a line that deletes files: a workflow that runs rm -rf on the CodeQL cache to free
 * disk space (found by reading the "visible" scans by eye) does not scan anything.
 */
export function stripComments(yaml: string): string {
  return yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => !/(^|[\s;&|])(?:sudo\s+)?(?:rm|rmdir)\s+-/.test(line))
    .map((line) => line.replace(/\s#.*$/, ""))
    .join("\n");
}

// ── reading ──────────────────────────────────────────────────────────────────────────────────

export interface ReleaseFact {
  tag: string;
  date: number | null;
  draft: boolean;
  assets: string[];
}

export type WorkflowState = "none" | "complete" | "partial" | "unknown";
export type SourceOutcome = "read" | "partial" | "not_found" | "moved" | "failed";

/** One page we asked for and what came of it, so the list shows attempts apart from successful reads. */
export interface Source {
  url: string;
  outcome: SourceOutcome;
}

export interface RepoSignals {
  repo: string;
  now: number;
  notFound?: boolean;
  /** GitHub told us to slow down. The caller must not turn this into a report. */
  rateLimited?: boolean;
  /** The repository itself could not be read for a reason other than "not found". No report can be made. */
  failed?: boolean;
  /** GitHub answered with a redirect: the repository was renamed or moved. We do not follow it. */
  moved?: boolean;
  /** False when the owner's .github repository could not be read completely, so a policy kept there may have been missed. */
  orgPolicyKnown: boolean;
  /** Reasons a part could not be read, in words for the log. Each of these makes the points that depend on it "not measured". */
  unknown: string[];
  /** True when the whole file tree was read: not cut off by GitHub, not too big for our cap. */
  filesKnown: boolean;
  /** Every path in the repository (folders end in a slash). */
  files: string[];
  workflows: string[];
  workflowState: WorkflowState;
  workflowTexts: Record<string, string>;
  /** Where the security policy was found, and whether it names a contact address or a reporting link (null: could not be fully examined). */
  policy: { where: "repository" | "owner"; path: string; hasContact: boolean | null } | null;
  /** Renovate settings inside the root package.json: true/false, null when that file could not be read completely, undefined when there is none. */
  renovateInline?: boolean | null;
  releases: ReleaseFact[] | null;
  advisories: number | null;
  archived?: boolean;
  fork?: boolean;
  /** The last commit on the default branch; the push date is the fallback and counts a push to any branch. */
  lastCommit?: number | null;
  lastPush?: number | null;
  license?: string | null;
  defaultBranch?: string;
  /** The canonical name as GitHub spells it. */
  canonicalName?: string;
  /** The pages we asked for, with what came of each. */
  requested: Source[];
}

export interface FetchSignalsOptions {
  fetchImpl: typeof fetch;
  /** A GitHub token WITHOUT any permissions: it only raises the hourly allowance for public reads. */
  token?: string;
  /** Aborts every request when the whole check runs out of time. */
  signal?: AbortSignal;
  now?: number;
}

interface Got {
  status: number;
  json?: unknown;
  text?: string;
  /** The body was longer than we read; what we have is the start of it. */
  truncated?: boolean;
  rateLimited?: boolean;
  moved?: boolean;
  error?: string;
}

async function readCapped(res: Response, maxBytes: number, truncate: boolean): Promise<{ text: string; tooBig: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: "", tooBig: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      if (!truncate) return { text: "", tooBig: true };
      const room = maxBytes - (total - step.value.byteLength);
      chunks.push(step.value.subarray(0, Math.max(0, room)));
      return { text: Buffer.concat(chunks).toString("utf8"), tooBig: true };
    }
    chunks.push(step.value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), tooBig: false };
}

async function get(url: string, options: FetchSignalsOptions, requested: Source[], kind: { raw: boolean; maxJson?: number }): Promise<Got> {
  const headers: Record<string, string> = {
    "user-agent": "tokenizen-cra-check",
    accept: kind.raw ? "text/plain" : "application/vnd.github+json",
  };
  if (!kind.raw) {
    headers["x-github-api-version"] = "2022-11-28";
    if (options.token) headers.authorization = `Bearer ${options.token}`;
  }
  const source: Source = { url, outcome: "failed" };
  if (requested.length < MAX_SOURCES_LISTED) requested.push(source);
  const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS), options.signal].filter((x): x is AbortSignal => x instanceof AbortSignal);
  let res: Response;
  try {
    res = await options.fetchImpl(url, { headers, redirect: "manual", signal: AbortSignal.any(signals) });
  } catch {
    return { status: 0, error: "network" };
  }
  try {
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined);
      source.outcome = "moved";
      return { status: res.status, moved: true, error: `HTTP ${res.status}` };
    }
    if (res.status === 404 || res.status === 409) {
      // 409 is what GitHub answers for the file tree of an empty repository
      await res.body?.cancel().catch(() => undefined);
      source.outcome = "not_found";
      return { status: res.status };
    }
    if (res.status === 403 || res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      const out = res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after") || res.status === 429;
      return out ? { status: res.status, rateLimited: true, error: "rate limit" } : { status: res.status, error: `HTTP ${res.status}` };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { status: res.status, error: `HTTP ${res.status}` };
    }
    if (kind.raw) {
      const { text, tooBig } = await readCapped(res, MAX_RAW_BYTES, true);
      source.outcome = tooBig ? "partial" : "read";
      return { status: 200, text, truncated: tooBig };
    }
    const { text, tooBig } = await readCapped(res, kind.maxJson ?? MAX_JSON_BYTES, false);
    if (tooBig) {
      source.outcome = "partial";
      return { status: 200, error: "response too large" };
    }
    try {
      const json = JSON.parse(text);
      source.outcome = "read";
      return { status: 200, json };
    } catch {
      return { status: 200, error: "unreadable response" };
    }
  } catch {
    return { status: 0, error: "network" };
  }
}

const asRecord = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const asList = (x: unknown): unknown[] | null => (Array.isArray(x) ? x : null);

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Plain facts about the repository. Every call may fail; a failure becomes "unknown", never "not visible". */
export async function fetchSignals(repo: string, options: FetchSignalsOptions): Promise<RepoSignals> {
  const now = options.now ?? Date.now();
  const s: RepoSignals = {
    repo, now, unknown: [], filesKnown: false, orgPolicyKnown: true, files: [], workflows: [], workflowState: "unknown", workflowTexts: {},
    policy: null, releases: null, advisories: null, requested: [],
  };
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    s.notFound = true;
    return s;
  }
  const o = encodeURIComponent(owner);
  const n = encodeURIComponent(name);
  const base = `https://api.github.com/repos/${o}/${n}`;
  const rawBase = `https://raw.githubusercontent.com/${o}/${n}/HEAD`;
  const note = (got: Got) => {
    if (got.rateLimited) s.rateLimited = true;
  };

  const info = await get(base, options, s.requested, { raw: false });
  note(info);
  if (info.status === 404) {
    s.notFound = true;
    return s;
  }
  if (info.moved) {
    s.moved = true;
    return s;
  }
  const meta = asRecord(info.json);
  if (info.error || !meta) {
    s.unknown.push(`repository: ${info.error ?? "empty"}`);
    s.failed = true;
    return s;
  }
  if (meta.private === true) {
    s.notFound = true;
    return s;
  }
  s.archived = meta.archived === true;
  s.fork = meta.fork === true;
  s.defaultBranch = typeof meta.default_branch === "string" ? meta.default_branch : "main";
  s.lastPush = typeof meta.pushed_at === "string" ? Date.parse(meta.pushed_at) : null;
  if (s.lastPush !== null && Number.isNaN(s.lastPush)) s.lastPush = null;
  const licence = asRecord(meta.license);
  const spdx = licence && typeof licence.spdx_id === "string" ? licence.spdx_id : null;
  s.license = spdx && spdx !== "NOASSERTION" ? spdx : licence ? "other" : null;
  s.canonicalName = typeof meta.full_name === "string" && parseRepo(meta.full_name) ? meta.full_name : repo;

  // The whole file tree in ONE call. A tree GitHub cut off, or one bigger than our cap, leaves the file-based points "not measured".
  const tree = await get(`${base}/git/trees/HEAD?recursive=1`, options, s.requested, { raw: false, maxJson: MAX_TREE_BYTES });
  note(tree);
  const treeRecord = asRecord(tree.json);
  const entries = treeRecord ? asList(treeRecord.tree) : null;
  if (tree.status === 409) {
    s.filesKnown = true; // an empty repository: there is nothing in it
  } else if (entries && treeRecord?.truncated !== true && entries.length <= MAX_TREE_ENTRIES) {
    s.filesKnown = true;
    for (const entry of entries) {
      const e = asRecord(entry);
      if (e && typeof e.path === "string") s.files.push(e.path + (e.type === "tree" ? "/" : ""));
    }
  } else s.unknown.push("file tree");

  // The security policy: the file in this repository (the three places GitHub looks), or the one GitHub shows for every repository of
  // the owner, kept in the owner's ".github" repository.
  const policyPath = s.files.find((f) => POLICY_FILE.test(f));
  if (policyPath) {
    const text = await get(`${rawBase}/${encodePath(policyPath)}`, options, s.requested, { raw: true });
    note(text);
    s.policy = { where: "repository", path: policyPath, hasContact: text.text !== undefined ? namesContact(text.text, text.truncated === true) : null };
  } else if (s.filesKnown && name.toLowerCase() !== ".github") {
    const ownerTree = await get(`https://api.github.com/repos/${o}/.github/git/trees/HEAD?recursive=1`, options, s.requested, { raw: false });
    note(ownerTree);
    const ownerRecord = asRecord(ownerTree.json);
    const ownerEntries = ownerRecord ? asList(ownerRecord.tree) : null;
    if (ownerTree.status === 404 || ownerTree.status === 409) {
      // no such repository, not public, or empty: clean, there is no owner-level policy
    } else if (!ownerEntries || ownerRecord?.truncated === true) {
      s.orgPolicyKnown = false;
      s.unknown.push("owner policy");
    } else {
      const hit = ownerEntries.map((e) => asRecord(e)).find((e) => e && e.type === "blob" && typeof e.path === "string" && POLICY_FILE.test(e.path));
      if (hit && typeof hit.path === "string") {
        const text = await get(`https://raw.githubusercontent.com/${o}/.github/HEAD/${encodePath(hit.path)}`, options, s.requested, { raw: true });
        note(text);
        s.policy = { where: "owner", path: `${owner}/.github: ${hit.path}`, hasContact: text.text !== undefined ? namesContact(text.text, text.truncated === true) : null };
      }
    }
  }

  // Workflow files come from the tree, not from a separate listing.
  if (!s.filesKnown) {
    s.workflowState = "unknown";
  } else {
    const yamls = s.files.filter((f) => WORKFLOW_FILE.test(f)).map((f) => f.slice(".github/workflows/".length));
    if (yamls.length === 0) {
      s.workflowState = "none";
    } else {
      s.workflows = yamls;
      const ordered = [...yamls].sort((a, b) => Number(WORKFLOW_PRIORITY.test(b)) - Number(WORKFLOW_PRIORITY.test(a)) || a.localeCompare(b));
      const toRead = ordered.slice(0, MAX_WORKFLOW_FILES);
      let failed = 0;
      let tooLong = 0;
      for (const file of toRead) {
        const raw = await get(`${rawBase}/.github/workflows/${encodeURIComponent(file)}`, options, s.requested, { raw: true });
        note(raw);
        if (raw.text !== undefined) {
          if (raw.text.length > MAX_WORKFLOW_CHARS || raw.truncated) tooLong++;
          s.workflowTexts[file] = stripComments(raw.text.slice(0, MAX_WORKFLOW_CHARS));
        } else failed++;
      }
      s.workflowState = failed === 0 && tooLong === 0 && yamls.length <= MAX_WORKFLOW_FILES ? "complete" : "partial";
      if (s.workflowState === "partial") s.unknown.push(`workflow files: read ${toRead.length - failed - tooLong} of ${yamls.length}`);
    }
  }

  // Renovate can be configured inside the root package.json; only look when no configuration file shows it.
  const hasUpdateFile = s.files.some((f) => DEPENDABOT_FILE.test(f) || RENOVATE_FILE.test(f));
  if (s.filesKnown && !hasUpdateFile && s.files.includes("package.json")) {
    const pkg = await get(`${rawBase}/package.json`, options, s.requested, { raw: true });
    note(pkg);
    if (pkg.text === undefined) s.renovateInline = null;
    else if (/"renovate"\s*:/.test(pkg.text)) s.renovateInline = true;
    else s.renovateInline = pkg.truncated ? null : false;
  }

  const rel = await get(`${base}/releases?per_page=8`, options, s.requested, { raw: false });
  note(rel);
  const relList = asList(rel.json);
  if (relList) {
    s.releases = relList.map((item) => {
      const r = asRecord(item) ?? {};
      const published = typeof r.published_at === "string" ? Date.parse(r.published_at) : NaN;
      const assets = (asList(r.assets) ?? []).map((a) => String(asRecord(a)?.name ?? "")).filter(Boolean);
      return { tag: clean(r.tag_name, 80), date: Number.isNaN(published) ? null : published, draft: r.draft === true, assets };
    });
  } else s.unknown.push("releases");

  const adv = await get(`${base}/security-advisories?per_page=30&state=published`, options, s.requested, { raw: false });
  note(adv);
  const advList = asList(adv.json);
  if (advList) s.advisories = advList.length;

  const commits = await get(`${base}/commits?per_page=1`, options, s.requested, { raw: false });
  note(commits);
  const first = asRecord(asList(commits.json)?.[0]);
  const committer = asRecord(asRecord(first?.commit)?.committer);
  const when = committer && typeof committer.date === "string" ? Date.parse(committer.date) : NaN;
  s.lastCommit = Number.isNaN(when) ? null : when;
  return s;
}

// ── judging ──────────────────────────────────────────────────────────────────────────────────

export type ControlStatus = "visible" | "not_visible" | "not_measured";

export interface Control {
  id: string;
  topic: string;
  status: ControlStatus;
  /** What we saw, when something was visible. Cut and cleaned: it can contain a name chosen by the repository owner. */
  evidence?: string;
  explanation: string;
  /** What would make it visible, when it was not. */
  fix?: string;
}

export interface RepoReport {
  repo: string;
  measuredAt: string;
  rules: { version: string; reviewedOn: string; basis: string; regulation: string };
  summary: { measured: number; visible: number; notVisible: number; notMeasured: number };
  controls: Control[];
  advisories: string;
  whatThisDoesNotMeasure: string[];
  notice: string;
  /** The pages we asked for and what came of each: read, partly read, not found, moved or failed. */
  sources: Source[];
}

const RULES_BASIS =
  "These are eight selected signals visible in a public repository, not one signal for each of the eight legal requirements in Annex I part II of the Regulation. Some relate to those requirements (a bill of materials, updates, security tests, a disclosure policy with a contact, secure distribution of updates); others are general good practice the Regulation does not list as such (pinned dependencies, recent maintenance, a licence). On 2026-10-28 the topics were compared with the official text of the Regulation. The choice and the reading are our own and have not been reviewed by a lawyer.";
const REGULATION_URL = "https://eur-lex.europa.eu/eli/reg/2024/2847/oj";

const ELSEWHERE = " This only looks at the public repository and its GitHub releases; if you do this somewhere else, it is not visible here.";
const SETTINGS = " A scan switched on in the repository settings (for example CodeQL default setup) leaves no file and is not visible from outside.";

const visible = (id: string, topic: string, evidence: string, explanation: string): Control => ({ id, topic, status: "visible", evidence: clean(evidence), explanation });
const notVisible = (id: string, topic: string, explanation: string, fix: string): Control => ({ id, topic, status: "not_visible", explanation, fix });
const notMeasured = (id: string, topic: string, explanation: string): Control => ({ id, topic, status: "not_measured", explanation });

/** Pure function: facts in, signals out. A signal is "not visible" only when everything that could show it was read. */
export function assessRepo(s: RepoSignals): RepoReport {
  const workflowText = Object.values(s.workflowTexts).join("\n");
  const workflowsReadAll = s.workflowState === "none" || s.workflowState === "complete";
  const c: Control[] = [];

  // 1. policy and a way to report
  const TOPIC1 = "Reporting channel and policy for vulnerabilities";
  if (s.policy) {
    const where = s.policy.where === "owner" ? `${s.policy.path} (the policy GitHub shows for every repository of this owner)` : s.policy.path;
    if (s.policy.hasContact === null) {
      c.push(notMeasured("vulnerability-policy", TOPIC1, `A security policy file is there (${clean(where)}), but it could not be examined completely, so we cannot say whether it names a contact address or a way to report.`));
    } else if (s.policy.hasContact === false) {
      c.push(
        notVisible(
          "vulnerability-policy",
          TOPIC1,
          `A security policy file exists (${clean(where)}) and all of it was read, but it names no contact address or reporting link. A link to a general homepage does not count. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports.`,
          "Name an email address in the file, or switch on private vulnerability reporting and link to how to use it.",
        ),
      );
    } else {
      c.push(visible("vulnerability-policy", TOPIC1, where, "A security policy file is there and names a contact address or a reporting link."));
    }
  } else if (!s.filesKnown || !s.orgPolicyKnown) {
    c.push(notMeasured("vulnerability-policy", TOPIC1, "The file tree of the repository, or the owner's .github repository where a policy for all repositories can live, could not be read completely, so we cannot say whether a policy is there."));
  } else {
    c.push(
      notVisible(
        "vulnerability-policy",
        TOPIC1,
        "No SECURITY.md was found in the root, .github/ or docs/ of the repository (the places GitHub looks), nor in the owner's .github repository. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports. Private vulnerability reporting switched on in the settings is not visible from outside.",
        "Add a SECURITY.md with a contact address, what you answer and within what time, and which versions are supported.",
      ),
    );
  }

  // 2. software bill of materials
  const TOPIC2 = "Software bill of materials (SBOM)";
  const sbomFile = s.files.find((f) => SBOM_FILE.test(f)) ?? (s.releases ?? []).flatMap((r) => r.assets).find((a) => SBOM_FILE.test(a));
  if (sbomFile || SBOM_WORKFLOW.test(workflowText)) {
    c.push(visible("sbom", TOPIC2, sbomFile ?? "a workflow step generates an SBOM", "A machine-readable component list, or a step that makes one, is visible."));
  } else if (!s.filesKnown || s.releases === null || !workflowsReadAll) {
    c.push(notMeasured("sbom", TOPIC2, "The file tree, the releases or the workflow files could not be read completely, so we cannot say whether an SBOM is there."));
  } else {
    c.push(
      notVisible(
        "sbom",
        TOPIC2,
        "No SBOM file anywhere in the repository (every file was listed), none attached to the latest releases and no workflow step that produces one. The CRA asks for a machine-readable list of components, at least the top-level dependencies." + ELSEWHERE,
        "Let the build produce a CycloneDX or SPDX file and attach it to each release.",
      ),
    );
  }

  // 3. provenance of releases
  const TOPIC3 = "Provenance of releases";
  const provenanceAsset = (s.releases ?? []).flatMap((r) => r.assets).find((a) => PROVENANCE_FILE.test(a));
  if (provenanceAsset || PROVENANCE_WORKFLOW.test(workflowText)) {
    c.push(visible("release-provenance", TOPIC3, provenanceAsset ?? "a workflow signs releases or attests their provenance", "Releases carry a signature or a provenance proof."));
  } else if (s.releases === null) {
    c.push(notMeasured("release-provenance", TOPIC3, "The releases could not be read."));
  } else if (!workflowsReadAll) {
    c.push(notMeasured("release-provenance", TOPIC3, "Not all workflow files could be read, so we cannot say whether a step signs the releases."));
  } else {
    c.push(
      notVisible(
        "release-provenance",
        TOPIC3,
        "No signatures or provenance attestations are visible next to the latest releases or in the workflows. The CRA asks for secure distribution of updates; users should be able to check that an update comes from you." + ELSEWHERE,
        "Sign releases (for example with sigstore/cosign or GitHub attestations) and publish the signature with the release.",
      ),
    );
  }

  // 4. pinned dependencies
  const TOPIC4 = "Pinned dependencies";
  const lockPath = s.files.find((f) => LOCKFILES.includes(baseName(f)));
  if (lockPath) {
    c.push(visible("pinned-dependencies", TOPIC4, lockPath, "A lockfile fixes which versions of the components are used."));
  } else if (!s.filesKnown) {
    c.push(notMeasured("pinned-dependencies", TOPIC4, "The file tree of the repository could not be read completely."));
  } else if (s.files.some((f) => LOCKED_MANIFESTS.includes(baseName(f)))) {
    c.push(
      notVisible(
        "pinned-dependencies",
        TOPIC4,
        "The repository has package files but no lockfile anywhere in it (every file was listed). Without one you cannot later tell exactly which component versions are in a release.",
        "Commit your package manager's lockfile.",
      ),
    );
  } else if (s.files.some((f) => PINNED_IN_BUILD_FILE.includes(baseName(f)) || baseName(f).endsWith(".csproj"))) {
    c.push(notMeasured("pinned-dependencies", TOPIC4, "This kind of project normally pins its versions in the build file itself, so a missing lockfile says little. Not assessed."));
  } else {
    c.push(notMeasured("pinned-dependencies", TOPIC4, "No known package file in the repository, so this was not assessed."));
  }

  // 5. automatic updates
  const TOPIC5 = "Automatic updates of components";
  const updates = s.files.find((f) => DEPENDABOT_FILE.test(f) || RENOVATE_FILE.test(f));
  if (updates) c.push(visible("dependency-updates", TOPIC5, updates, "A tool proposes new versions and flags vulnerable components."));
  else if (!s.filesKnown) c.push(notMeasured("dependency-updates", TOPIC5, "The file tree of the repository could not be read completely."));
  else if (s.renovateInline === true) c.push(visible("dependency-updates", TOPIC5, "package.json (renovate settings)", "Renovate is configured inside the root package.json."));
  else if (s.renovateInline === null) c.push(notMeasured("dependency-updates", TOPIC5, "The root package.json could not be read completely, and Renovate can be configured inside it."));
  else
    c.push(
      notVisible(
        "dependency-updates",
        TOPIC5,
        "No Dependabot or Renovate configuration file was found, and the root package.json holds no Renovate settings (Renovate settings in a package.json deeper in the repository are not read). The CRA asks that vulnerabilities are addressed and fixed without delay, including by providing security updates. Dependabot security alerts switched on in the settings leave no file and are not visible from outside.",
        "Turn on Dependabot or Renovate with a small configuration file.",
      ),
    );

  // 6. security scans
  const TOPIC6 = "Automated security tests";
  const scan = SCAN_WORKFLOW.exec(workflowText);
  if (scan) c.push(visible("security-scanning", TOPIC6, scan[1] ?? "a security scan", "A security scan runs in CI."));
  else if (s.workflowState === "unknown" || s.workflowState === "partial")
    c.push(notMeasured("security-scanning", TOPIC6, "The workflow files could not all be read, so we cannot say whether a security scan runs."));
  else if (s.workflowState === "none")
    c.push(
      notVisible(
        "security-scanning",
        TOPIC6,
        "No CI workflows were found. The CRA asks for effective and regular tests and reviews of the security of the product." + SETTINGS,
        "Add a workflow with a scanner (for example CodeQL, or a vulnerability scan of the dependencies).",
      ),
    );
  else
    c.push(
      notVisible(
        "security-scanning",
        TOPIC6,
        "There are workflows and all of them were read, but none shows a security scan (CodeQL, Semgrep, Trivy, OSV, audit)." + SETTINGS,
        "Add a scan step that runs on each change or weekly.",
      ),
    );

  // 7. maintenance
  const TOPIC7 = "Maintenance and updates";
  const lastChange = s.lastCommit ?? s.lastPush ?? null;
  const what = s.lastCommit ? "last commit on the default branch" : "last push to any branch";
  const daysSince = lastChange ? Math.max(0, Math.floor((s.now - lastChange) / DAY_MS)) : null;
  const lastRelease = (s.releases ?? []).filter((r) => !r.draft && r.date).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  const daysSinceRelease = lastRelease?.date ? Math.max(0, Math.floor((s.now - lastRelease.date) / DAY_MS)) : null;
  if (s.archived) c.push(notVisible("maintenance", TOPIC7, "The repository is archived: no security updates will come from it.", "Say publicly who takes over maintenance, or that the product is no longer supported."));
  else if (daysSince === null) c.push(notMeasured("maintenance", TOPIC7, "No date of the last change was available."));
  else
    c.push(
      daysSince <= 90
        ? visible("maintenance", TOPIC7, `${what} ${daysSince} days ago${daysSinceRelease !== null ? `, last release ${daysSinceRelease} days ago` : ", no release seen"}`, "There is recent activity. That is a weak sign: recent commits do not show that vulnerabilities are handled, and a quiet repository does not show that they are not.")
        : notVisible(
            "maintenance",
            TOPIC7,
            `The ${what} was ${daysSince} days ago. The CRA expects vulnerabilities to be fixed quickly during the support period. Recent activity is only a weak sign of that, and a stable product can be quiet for good reasons.`,
            "State the support period and make sure updates come within it.",
          ),
    );

  // 8. licence
  const licenceFile = s.files.find((f) => LICENCE_FILE.test(f));
  if (s.license) c.push(visible("license", "Licence", s.license, "A licence is declared."));
  else if (licenceFile) c.push(visible("license", "Licence", licenceFile, "A licence file is there (GitHub does not recognise its text, so it shows no licence name)."));
  else if (!s.filesKnown) c.push(notMeasured("license", "Licence", "GitHub shows no licence and the file tree could not be read completely to look for a licence file."));
  else c.push(notVisible("license", "Licence", "No licence name from GitHub and no LICENSE, COPYING or UNLICENSE file in the root. For users, and for the CRA's split between open source and not, commercial and not, that is a first question.", "Add a LICENSE file."));

  const measured = c.filter((x) => x.status !== "not_measured");
  const good = measured.filter((x) => x.status === "visible").length;
  return {
    repo: clean(s.canonicalName ?? s.repo, 140),
    measuredAt: new Date(s.now).toISOString(),
    rules: { version: RULES_VERSION, reviewedOn: RULES_REVIEWED_ON, basis: RULES_BASIS, regulation: REGULATION_URL },
    summary: { measured: measured.length, visible: good, notVisible: measured.length - good, notMeasured: c.length - measured.length },
    controls: c,
    advisories:
      s.advisories === null
        ? "not measured"
        : `${s.advisories} published security advisories in this repository (a number says nothing about quality: zero does not mean safe)`,
    whatThisDoesNotMeasure: [
      "product design and default settings (Annex I, part I of the Regulation)",
      "whether fixed vulnerabilities are made public, and whether vulnerabilities are really handled without delay during the support period (Annex I, part II)",
      "your internal process for notifying actively exploited vulnerabilities and severe incidents through the EU single reporting platform within 24 hours and 72 hours, and the final report (Article 14)",
      "technical documentation, the risk assessment and the EU declaration of conformity",
      "builds, scans and signing that run in a CI system other than GitHub Actions (Jenkins, GitLab CI, CircleCI and similar): only GitHub Actions workflows are read",
      "private repositories, hosting other than GitHub, and anything that is not public",
    ],
    notice: "This is an indication from public data about eight selected signals. It is not a check against the legal requirements, not a conformity assessment and not legal advice.",
    sources: s.requested.map((r) => ({ url: clean(r.url, 300), outcome: r.outcome })),
  };
}

/** True when the facts are complete enough to be worth keeping for the full cache time. */
export function isComplete(s: RepoSignals): boolean {
  return s.unknown.length === 0;
}
