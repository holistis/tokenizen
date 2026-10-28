// cra-repo-check.ts — what is VISIBLE in a public GitHub repository of the points the EU Cyber Resilience
// Act (Regulation (EU) 2024/2847) asks of software makers around vulnerability handling and distribution.
//
// This is an indication from public data, never a verdict that anyone "complies" or "does not comply":
// most CRA duties (product design, documentation, the reporting process towards ENISA) cannot be seen
// from outside, and a thing done outside GitHub (a separate build server, a package registry's own
// provenance, a scan switched on in the repository settings) is not visible here. The wording therefore
// says "not visible", never "missing".
//
// THE RULE THAT MATTERS MOST: a point is only "not visible" when everything that could show it was read.
// If a call failed, a file list is missing, or some workflow files were not read, the point is "not
// measured". The first adversarial review of this file (28 Oct 2026) found a version where a GitHub hiccup
// became five "not visible" points that were then cached for an hour; the tests below keep that closed.
//
// Two layers, so the second can be tested without a network:
//   - fetchSignals() makes the read-only calls to api.github.com and raw.githubusercontent.com and returns
//     plain facts about what could and could not be read.
//   - assessRepo() is a pure function from those facts to the eight controls.
//
// The only egress is the fetch that is passed in (the server passes net-guard's guardedFetch), and the only
// hosts it is ever asked for are the two fixed GitHub hosts: the repository name is validated strictly, every
// path segment is percent-encoded again when the URL is built, and files are always read at HEAD, so no text
// chosen by the repository owner (a branch name) ends up in an address. Every response is read with a size
// cap, because a repository owner chooses how big the files in their repository are.

export const RULES_VERSION = "2026-10-28.2";
export const RULES_REVIEWED_ON = "2026-10-28";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_RAW_BYTES = 200_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_WORKFLOW_FILES = 12;
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;
const MAX_REQUESTED_LISTED = 40;

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

const LOCKFILES = [
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "npm-shrinkwrap.json", "bun.lockb", "bun.lock", "deno.lock",
  "Cargo.lock", "poetry.lock", "Pipfile.lock", "uv.lock", "go.sum", "Gemfile.lock", "composer.lock", "gradle.lockfile",
  "packages.lock.json", "Package.resolved", "pubspec.lock", "mix.lock", "flake.lock",
];
/** Manifests of ecosystems where a lockfile is the norm. */
const LOCKED_MANIFESTS = ["package.json", "Cargo.toml", "pyproject.toml", "requirements.txt", "Pipfile", "Gemfile", "composer.json"];
/** Manifests of ecosystems where versions are normally pinned in the build file itself, so a missing lockfile says little. */
const PINNED_IN_BUILD_FILE = ["pom.xml", "build.gradle", "build.gradle.kts", "go.mod", "*.csproj"];
const SBOM_FILE = /(^|\/)(sbom|bom)(\.[a-z0-9-]+)*\.(json|xml)$|\.(spdx|cdx)(\.json)?$|cyclonedx|\.spdx\.json$/i;
const SBOM_WORKFLOW = /(anchore\/sbom-action|cyclonedx|syft\b|spdx-sbom-generator|trivy[^\n]{0,200}sbom|npm sbom|cdxgen|sbom-tool|advanced-security\/spdx)/i;
const PROVENANCE_FILE = /\.(sig|asc|minisig|sigstore|intoto\.jsonl|attestation)$|\.sigstore\.json$|\.cosign\.bundle$/i;
const PROVENANCE_WORKFLOW = /(attest-build-provenance|actions\/attest|slsa-framework|cosign|sigstore|--provenance|npm publish[^\n]{0,200}provenance|gpg --detach|minisign)/i;
const SCAN_WORKFLOW = /(codeql|semgrep|trivy|grype|osv-scanner|snyk|gitleaks|trufflehog|scorecard|npm audit|pip-audit|cargo audit|govulncheck|bandit|brakeman|sonarcloud|sonarqube|dependency-review)/i;
const POLICY_FILE = /(^|\/)SECURITY\.(md|txt|rst)$/i;
/** Every pattern here is bounded, and it is only ever run on one short line at a time: a repository owner chooses the text, and a regex that backtracks on a 200 KB line would stop the whole server. */
const CONTACT = /\b[\w.%+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}\b|https?:\/\/[^\s)>\]]{1,200}|security\/advisories|private vulnerability reporting|report a vulnerability/i;
const MAX_POLICY_CHARS = 16_384;
const MAX_LINE_CHARS = 1_000;
/** Workflow text that is looked at per file; a longer file counts as only partly read. */
const MAX_WORKFLOW_CHARS = 65_536;

/** Does the policy text name an email address or a reporting link? Badges and images do not count as a contact. */
export function namesContact(text: string): boolean {
  for (const line of text.slice(0, MAX_POLICY_CHARS).split("\n")) {
    if (line.length > MAX_LINE_CHARS) continue;
    if (/shields\.io|badge/i.test(line)) continue;
    // a linked image ([![alt](image)](target)) is a button, not a contact: drop the whole construct, then look at what is left
    const plain = line.replace(/\[!\[[^\]]{0,200}\]\([^)]{0,300}\)\]\([^)]{0,300}\)/g, " ").replace(/!\[[^\]]{0,200}\]\([^)]{0,300}\)/g, " ");
    if (CONTACT.test(plain)) return true;
  }
  return false;
}
/** Workflow files that usually hold release, signing and scanning steps are read first, because only some of the files are read. */
const WORKFLOW_PRIORITY = /release|publish|deploy|sign|sbom|attest|provenance|codeql|security|scan|audit/i;

/** Comments in a workflow are not steps. */
function stripComments(yaml: string): string {
  return yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
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
  /** False when the owner's .github repository could not be listed cleanly, so a policy kept there may have been missed. */
  orgPolicyKnown: boolean;
  /** Reasons a part could not be read, in words for the log. Each of these makes the points that depend on it "not measured". */
  unknown: string[];
  filesKnown: boolean;
  files: string[];
  workflows: string[];
  workflowState: WorkflowState;
  workflowTexts: Record<string, string>;
  /** Where the security policy was found, and whether it names a contact address or a reporting link (null: could not be read). */
  policy: { where: "repository" | "owner"; path: string; hasContact: boolean | null } | null;
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
  /** URLs of the read-only requests that were made, so a reader can open the same pages. */
  requested: string[];
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

async function get(url: string, options: FetchSignalsOptions, requested: string[], raw: boolean): Promise<Got> {
  const headers: Record<string, string> = {
    "user-agent": "tokenizen-cra-check",
    accept: raw ? "text/plain" : "application/vnd.github+json",
  };
  if (!raw) {
    headers["x-github-api-version"] = "2022-11-28";
    if (options.token) headers.authorization = `Bearer ${options.token}`;
  }
  if (requested.length < MAX_REQUESTED_LISTED) requested.push(url);
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
      return { status: res.status, moved: true, error: `HTTP ${res.status}` };
    }
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      return { status: 404 };
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
    if (raw) {
      const { text } = await readCapped(res, MAX_RAW_BYTES, true);
      return { status: 200, text };
    }
    const { text, tooBig } = await readCapped(res, MAX_JSON_BYTES, false);
    if (tooBig) return { status: 200, error: "response too large" };
    try {
      return { status: 200, json: JSON.parse(text) };
    } catch {
      return { status: 200, error: "unreadable response" };
    }
  } catch {
    return { status: 0, error: "network" };
  }
}

const asRecord = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const asList = (x: unknown): unknown[] | null => (Array.isArray(x) ? x : null);

function entryNames(list: unknown[]): string[] {
  const names: string[] = [];
  for (const item of list.slice(0, 1000)) {
    const rec = asRecord(item);
    if (rec && typeof rec.name === "string") names.push(rec.name + (rec.type === "dir" ? "/" : ""));
  }
  return names;
}

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

  const info = await get(base, options, s.requested, false);
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

  const root = await get(`${base}/contents`, options, s.requested, false);
  note(root);
  const rootList = asList(root.json);
  if (rootList) {
    s.filesKnown = true;
    s.files.push(...entryNames(rootList));
  } else s.unknown.push("file list");

  for (const dir of [".github", "docs"]) {
    if (!s.files.includes(`${dir}/`)) continue;
    const sub = await get(`${base}/contents/${dir}`, options, s.requested, false);
    note(sub);
    const subList = asList(sub.json);
    if (subList) s.files.push(...entryNames(subList).map((x) => `${dir}/${x}`));
    else s.unknown.push(`${dir} file list`);
  }

  // The security policy: the file in this repository, or the one GitHub shows for every repository of the owner (kept in the
  // owner's ".github" repository, in its root, in .github/ or in docs/).
  const policyPath = s.files.find((f) => POLICY_FILE.test(f));
  if (policyPath) {
    const text = await get(`${rawBase}/${encodePath(policyPath)}`, options, s.requested, true);
    note(text);
    s.policy = { where: "repository", path: policyPath, hasContact: text.text !== undefined ? namesContact(text.text) : null };
  } else if (s.filesKnown && name.toLowerCase() !== ".github") {
    const ownerBase = `https://api.github.com/repos/${o}/.github/contents`;
    const ownerRoot = await get(ownerBase, options, s.requested, false);
    note(ownerRoot);
    const ownerList = asList(ownerRoot.json);
    if (ownerRoot.status === 404) {
      // no such repository, or not public: clean, there is no owner-level policy
    } else if (!ownerList) {
      s.orgPolicyKnown = false;
      s.unknown.push("owner policy");
    } else {
      const rootNames = entryNames(ownerList);
      const direct = rootNames.find((f) => POLICY_FILE.test(f));
      let ownerPolicy: { path: string } | null = direct ? { path: direct } : null;
      for (const dir of [".github", "docs"]) {
        if (ownerPolicy || !rootNames.includes(`${dir}/`)) continue;
        const sub = await get(`${ownerBase}/${dir}`, options, s.requested, false);
        note(sub);
        const subList = asList(sub.json);
        if (!subList) {
          s.orgPolicyKnown = false;
          s.unknown.push("owner policy");
          continue;
        }
        const hit = entryNames(subList).find((f) => POLICY_FILE.test(f));
        if (hit) ownerPolicy = { path: `${dir}/${hit}` };
      }
      if (ownerPolicy) {
        const text = await get(`https://raw.githubusercontent.com/${o}/.github/HEAD/${encodePath(ownerPolicy.path)}`, options, s.requested, true);
        note(text);
        s.policy = { where: "owner", path: `${owner}/.github: ${ownerPolicy.path}`, hasContact: text.text !== undefined ? namesContact(text.text) : null };
      }
    }
  }

  if (!s.filesKnown || s.unknown.includes(".github file list")) {
    s.workflowState = "unknown";
  } else if (!s.files.includes(".github/workflows/")) {
    s.workflowState = "none";
  } else {
    const dir = await get(`${base}/contents/.github/workflows`, options, s.requested, false);
    note(dir);
    const dirList = asList(dir.json);
    if (!dirList) {
      s.unknown.push("workflow list");
      s.workflowState = "unknown";
    } else {
      const yamls = entryNames(dirList).filter((x) => /\.ya?ml$/i.test(x));
      s.workflows = yamls;
      const ordered = [...yamls].sort((a, b) => Number(WORKFLOW_PRIORITY.test(b)) - Number(WORKFLOW_PRIORITY.test(a)) || a.localeCompare(b));
      const toRead = ordered.slice(0, MAX_WORKFLOW_FILES);
      let failed = 0;
      let tooLong = 0;
      for (const file of toRead) {
        const raw = await get(`${rawBase}/.github/workflows/${encodeURIComponent(file)}`, options, s.requested, true);
        note(raw);
        if (raw.text !== undefined) {
          if (raw.text.length > MAX_WORKFLOW_CHARS) tooLong++;
          s.workflowTexts[file] = stripComments(raw.text.slice(0, MAX_WORKFLOW_CHARS));
        } else failed++;
      }
      s.workflowState = failed === 0 && tooLong === 0 && yamls.length <= MAX_WORKFLOW_FILES ? "complete" : "partial";
      if (s.workflowState === "partial") s.unknown.push(`workflow files: read ${toRead.length - failed - tooLong} of ${yamls.length}`);
    }
  }

  const rel = await get(`${base}/releases?per_page=8`, options, s.requested, false);
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

  const adv = await get(`${base}/security-advisories?per_page=30&state=published`, options, s.requested, false);
  note(adv);
  const advList = asList(adv.json);
  if (advList) s.advisories = advList.length;

  const commits = await get(`${base}/commits?per_page=1`, options, s.requested, false);
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
  sourcesRead: string[];
}

const RULES_BASIS =
  "On 2026-10-28 the points were compared with the official text of the Regulation (Annex I part II, points 1 to 8, and the application dates in Article 71). Which of them a public repository can show is our own reading. It has not been reviewed by a lawyer.";
const REGULATION_URL = "https://eur-lex.europa.eu/eli/reg/2024/2847/oj";

const ELSEWHERE = " This only looks at the public repository and its GitHub releases; if you do this somewhere else, it is not visible here.";
const SETTINGS = " A scan switched on in the repository settings (for example CodeQL default setup) leaves no file and is not visible from outside.";

const visible = (id: string, topic: string, evidence: string, explanation: string): Control => ({ id, topic, status: "visible", evidence: clean(evidence), explanation });
const notVisible = (id: string, topic: string, explanation: string, fix: string): Control => ({ id, topic, status: "not_visible", explanation, fix });
const notMeasured = (id: string, topic: string, explanation: string): Control => ({ id, topic, status: "not_measured", explanation });

/** Pure function: facts in, controls out. A point is "not visible" only when everything that could show it was read. */
export function assessRepo(s: RepoSignals): RepoReport {
  const workflowText = Object.values(s.workflowTexts).join("\n");
  const findFile = (re: RegExp) => s.files.find((f) => re.test(f));
  const workflowsReadAll = s.workflowState === "none" || s.workflowState === "complete";
  const c: Control[] = [];

  // 1. policy and a way to report
  const TOPIC1 = "Reporting channel and policy for vulnerabilities";
  if (s.policy) {
    const where = s.policy.where === "owner" ? `${s.policy.path} (the policy GitHub shows for every repository of this owner)` : s.policy.path;
    if (s.policy.hasContact === null) {
      c.push(notMeasured("vulnerability-policy", TOPIC1, `A security policy file is there (${clean(where)}), but it could not be read to check whether it names a contact address.`));
    } else if (s.policy.hasContact === false) {
      c.push(
        notVisible(
          "vulnerability-policy",
          TOPIC1,
          `A security policy file exists (${clean(where)}), but we did not see a contact address or a link for reporting in it. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports.`,
          "Name an email address in the file, or switch on private vulnerability reporting and link to how to use it.",
        ),
      );
    } else {
      c.push(visible("vulnerability-policy", TOPIC1, where, "A security policy file is there and names a contact address or a reporting link."));
    }
  } else if (!s.filesKnown || s.unknown.includes(".github file list") || s.unknown.includes("docs file list") || !s.orgPolicyKnown) {
    c.push(notMeasured("vulnerability-policy", TOPIC1, "A folder that can hold the policy, or the owner's .github repository, could not be listed, so we cannot say whether a policy is there."));
  } else {
    c.push(
      notVisible(
        "vulnerability-policy",
        TOPIC1,
        "No SECURITY.md was found in the repository root, .github/ or docs/, nor in the owner's .github repository. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports. Private vulnerability reporting switched on in the settings is not visible from outside.",
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
    c.push(notMeasured("sbom", TOPIC2, "Part of the repository, its releases or its workflow files could not be read, so we cannot say whether an SBOM is there."));
  } else {
    c.push(
      notVisible(
        "sbom",
        TOPIC2,
        "No SBOM file and no workflow step that produces one is visible. The CRA asks for a machine-readable list of components, at least the top-level dependencies." + ELSEWHERE,
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
        "No signatures or provenance attestations are visible next to the releases or in the workflows. The CRA asks for secure distribution of updates; users should be able to check that an update comes from you." + ELSEWHERE,
        "Sign releases (for example with sigstore/cosign or GitHub attestations) and publish the signature with the release.",
      ),
    );
  }

  // 4. pinned dependencies
  const TOPIC4 = "Pinned dependencies";
  const lock = s.files.find((f) => LOCKFILES.includes(f));
  const matches = (list: string[]) => s.files.some((f) => list.some((m) => (m.startsWith("*") ? f.endsWith(m.slice(1)) : f === m)));
  if (lock) {
    c.push(visible("pinned-dependencies", TOPIC4, lock, "A lockfile fixes which versions of the components are used."));
  } else if (!s.filesKnown) {
    c.push(notMeasured("pinned-dependencies", TOPIC4, "The file list of the repository could not be read."));
  } else if (matches(LOCKED_MANIFESTS)) {
    c.push(
      notVisible(
        "pinned-dependencies",
        TOPIC4,
        "No lockfile in the repository root. Without one you cannot later tell exactly which component versions are in a release. Only the root is looked at; a lockfile in a subfolder is not seen.",
        "Commit your package manager's lockfile.",
      ),
    );
  } else if (matches(PINNED_IN_BUILD_FILE)) {
    c.push(notMeasured("pinned-dependencies", TOPIC4, "This kind of project normally pins its versions in the build file itself, so a missing lockfile says little. Not assessed."));
  } else {
    c.push(notMeasured("pinned-dependencies", TOPIC4, "No known package file in the repository root, so this was not assessed."));
  }

  // 5. automatic updates
  const TOPIC5 = "Automatic updates of components";
  const updates = findFile(/(^|\/)(dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?)$/i);
  if (updates) c.push(visible("dependency-updates", TOPIC5, updates, "A tool proposes new versions and flags vulnerable components."));
  else if (!s.filesKnown || s.unknown.includes(".github file list")) c.push(notMeasured("dependency-updates", TOPIC5, "The file list of the repository, or of its .github folder where the configuration usually lives, could not be read."));
  else
    c.push(
      notVisible(
        "dependency-updates",
        TOPIC5,
        "No Dependabot or Renovate configuration file was found. The CRA asks that vulnerabilities are addressed and fixed without delay, including by providing security updates. Dependabot security alerts switched on in the settings, or Renovate settings inside package.json, leave no such file and are not visible from outside.",
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
  const daysSince = lastChange ? Math.floor((s.now - lastChange) / DAY_MS) : null;
  const lastRelease = (s.releases ?? []).filter((r) => !r.draft && r.date).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  const daysSinceRelease = lastRelease?.date ? Math.floor((s.now - lastRelease.date) / DAY_MS) : null;
  if (s.archived) c.push(notVisible("maintenance", TOPIC7, "The repository is archived: no security updates will come from it.", "Say publicly who takes over maintenance, or that the product is no longer supported."));
  else if (daysSince === null) c.push(notMeasured("maintenance", TOPIC7, "No date of the last change was available."));
  else
    c.push(
      daysSince <= 90
        ? visible("maintenance", TOPIC7, `${what} ${daysSince} days ago${daysSinceRelease !== null ? `, last release ${daysSinceRelease} days ago` : ", no release seen"}`, "The repository is being maintained.")
        : notVisible(
            "maintenance",
            TOPIC7,
            `The ${what} was ${daysSince} days ago. The CRA expects vulnerabilities to be fixed quickly during the support period.`,
            "State the support period and make sure updates come within it.",
          ),
    );

  // 8. licence
  c.push(
    s.license
      ? visible("license", "Licence", s.license, "A licence is declared.")
      : notVisible("license", "Licence", "No recognisable licence. For users, and for the CRA's split between open source and not, commercial and not, that is a first question.", "Add a LICENSE file."),
  );

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
      "your internal process for notifying actively exploited vulnerabilities and severe incidents through the EU single reporting platform within 24 hours and 72 hours, and the final report (Article 14)",
      "technical documentation, the risk assessment and the EU declaration of conformity",
      "private repositories, hosting other than GitHub, and anything that is not public",
    ],
    notice: "This is an indication from public data. It is not a conformity assessment and not legal advice.",
    sourcesRead: s.requested.map((u) => clean(u, 300)),
  };
}

/** True when the facts are complete enough to be worth keeping for the full cache time. */
export function isComplete(s: RepoSignals): boolean {
  return s.unknown.length === 0;
}
