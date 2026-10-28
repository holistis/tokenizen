// cra-repo-check.ts — what is VISIBLE in a public GitHub repository of the points the EU Cyber Resilience
// Act (Regulation (EU) 2024/2847) asks of software makers around vulnerability handling and distribution.
//
// This is an indication from public data, never a verdict that anyone "complies" or "does not comply":
// most CRA duties (product design, documentation, the reporting process towards ENISA) cannot be seen
// from outside, and a thing done outside GitHub (a separate build server, a package registry's own
// provenance) is not visible here. The wording therefore says "not visible", never "missing".
//
// Two layers, so the second can be tested without a network:
//   - fetchSignals() makes the read-only calls to api.github.com and raw.githubusercontent.com and returns
//     plain facts. Any single call may fail; a failure becomes "not measured", never "not visible".
//   - assessRepo() is a pure function from those facts to the eight controls.
//
// The only egress is the fetch that is passed in (the server passes net-guard's guardedFetch), and the only
// hosts it is ever asked for are the two fixed GitHub hosts: the repository name is validated strictly, and
// every path segment is percent-encoded again when the URL is built. Every response is read with a size cap,
// because a repository owner chooses how big the files in their repository are.

export const RULES_VERSION = "2026-10-28.1";
export const RULES_REVIEWED_ON = "2026-10-28";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_RAW_BYTES = 200_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_WORKFLOW_FILES = 8;
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;
const MAX_REQUESTED_LISTED = 30;

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

const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "npm-shrinkwrap.json", "bun.lockb", "Cargo.lock", "poetry.lock", "Pipfile.lock", "uv.lock", "go.sum", "Gemfile.lock", "composer.lock", "gradle.lockfile", "packages.lock.json"];
const MANIFESTS = ["package.json", "Cargo.toml", "pyproject.toml", "requirements.txt", "Pipfile", "go.mod", "Gemfile", "composer.json", "pom.xml", "build.gradle", "build.gradle.kts", "*.csproj"];
const SBOM_FILE = /(^|\/)(sbom|bom)(\.[a-z0-9-]+)*\.(json|xml)$|\.(spdx|cdx)(\.json)?$|cyclonedx|\.spdx\.json$/i;
const SBOM_WORKFLOW = /(anchore\/sbom-action|cyclonedx|syft\b|spdx-sbom-generator|trivy[^\n]*sbom|npm sbom|cdxgen|sbom-tool|advanced-security\/spdx)/i;
const PROVENANCE_FILE = /\.(sig|asc|minisig|sigstore|sigstore\.json|intoto\.jsonl|attestation)$|\.pem$|cosign/i;
const PROVENANCE_WORKFLOW = /(attest-build-provenance|actions\/attest|slsa-framework|cosign|sigstore|--provenance|npm publish[^\n]*provenance|gpg --detach|minisign)/i;
const SCAN_WORKFLOW = /(codeql|semgrep|trivy|grype|osv-scanner|snyk|gitleaks|trufflehog|scorecard|npm audit|pip-audit|cargo audit|govulncheck|bandit|brakeman|sonarcloud|sonarqube|dependency-review)/i;

// ── reading ──────────────────────────────────────────────────────────────────────────────────

export interface ReleaseFact {
  tag: string;
  date: number | null;
  draft: boolean;
  assets: string[];
}

export interface RepoSignals {
  repo: string;
  now: number;
  notFound?: boolean;
  /** GitHub told us to slow down. The caller must not turn this into a report. */
  rateLimited?: boolean;
  /** Reasons a part could not be read, in words for the log, never shown as a gap. */
  unknown: string[];
  files: string[];
  workflows: string[];
  workflowTexts: Record<string, string>;
  releases: ReleaseFact[] | null;
  advisories: number | null;
  archived?: boolean;
  fork?: boolean;
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
    res = await options.fetchImpl(url, { headers, redirect: "error", signal: AbortSignal.any(signals) });
  } catch {
    return { status: 0, error: "network" };
  }
  try {
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

/** Plain facts about the repository. Every call may fail; a failure becomes "unknown", never "not visible". */
export async function fetchSignals(repo: string, options: FetchSignalsOptions): Promise<RepoSignals> {
  const now = options.now ?? Date.now();
  const s: RepoSignals = { repo, now, unknown: [], files: [], workflows: [], workflowTexts: {}, releases: null, advisories: null, requested: [] };
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    s.notFound = true;
    return s;
  }
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const note = (got: Got) => {
    if (got.rateLimited) s.rateLimited = true;
  };

  const info = await get(base, options, s.requested, false);
  note(info);
  if (info.status === 404) {
    s.notFound = true;
    return s;
  }
  const meta = asRecord(info.json);
  if (info.error || !meta) {
    s.unknown.push(`repository: ${info.error ?? "empty"}`);
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
  if (rootList) s.files.push(...entryNames(rootList));
  else s.unknown.push("file list");

  for (const dir of [".github", "docs"]) {
    if (!s.files.includes(`${dir}/`)) continue;
    const sub = await get(`${base}/contents/${dir}`, options, s.requested, false);
    note(sub);
    const subList = asList(sub.json);
    if (subList) s.files.push(...entryNames(subList).map((n) => `${dir}/${n}`));
  }

  if (s.files.includes(".github/workflows/")) {
    const dir = await get(`${base}/contents/.github/workflows`, options, s.requested, false);
    note(dir);
    const dirList = asList(dir.json);
    if (dirList) {
      const yamls = entryNames(dirList).filter((n) => /\.ya?ml$/i.test(n));
      s.workflows = yamls;
      const branch = encodeURIComponent(s.defaultBranch ?? "main");
      for (const file of yamls.slice(0, MAX_WORKFLOW_FILES)) {
        const raw = await get(
          `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${branch}/.github/workflows/${encodeURIComponent(file)}`,
          options,
          s.requested,
          true,
        );
        note(raw);
        if (raw.text) s.workflowTexts[file] = raw.text;
      }
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
  "The mapping from each point to the Regulation is our own reading, built from secondary sources. It has not been reviewed by a lawyer and has not been checked line by line against the legal text.";
const REGULATION_URL = "https://eur-lex.europa.eu/eli/reg/2024/2847/oj";

const ELSEWHERE = " This only looks at the public repository and its GitHub releases; if you do this somewhere else, it is not visible here.";

const visible = (id: string, topic: string, evidence: string, explanation: string): Control => ({ id, topic, status: "visible", evidence: clean(evidence), explanation });
const notVisible = (id: string, topic: string, explanation: string, fix: string): Control => ({ id, topic, status: "not_visible", explanation, fix });
const notMeasured = (id: string, topic: string, explanation: string): Control => ({ id, topic, status: "not_measured", explanation });

/** Pure function: facts in, controls out. */
export function assessRepo(s: RepoSignals): RepoReport {
  const workflowText = Object.values(s.workflowTexts).join("\n");
  const findFile = (re: RegExp) => s.files.find((f) => re.test(f));
  const c: Control[] = [];

  const policy = findFile(/(^|\/)SECURITY\.(md|txt|rst)$/i);
  c.push(
    policy
      ? visible("vulnerability-policy", "Reporting channel and policy for vulnerabilities", policy, "A security policy file is in the repository.")
      : notVisible(
          "vulnerability-policy",
          "Reporting channel and policy for vulnerabilities",
          "No SECURITY.md was found in the repository root, .github/ or docs/. The CRA asks for a coordinated vulnerability disclosure policy and a contact address for reports.",
          "Add a SECURITY.md with a contact address, what you answer and within what time, and which versions are supported.",
        ),
  );

  const sbomFile = s.files.find((f) => SBOM_FILE.test(f)) ?? (s.releases ?? []).flatMap((r) => r.assets).find((a) => SBOM_FILE.test(a));
  c.push(
    sbomFile || SBOM_WORKFLOW.test(workflowText)
      ? visible("sbom", "Software bill of materials (SBOM)", sbomFile ?? "a workflow step generates an SBOM", "A machine-readable component list, or a step that makes one, is visible.")
      : notVisible(
          "sbom",
          "Software bill of materials (SBOM)",
          "No SBOM file and no workflow step that produces one is visible. The CRA asks for a machine-readable list of components, at least the top-level dependencies." + ELSEWHERE,
          "Let the build produce a CycloneDX or SPDX file and attach it to each release.",
        ),
  );

  const provenanceAsset = (s.releases ?? []).flatMap((r) => r.assets).find((a) => PROVENANCE_FILE.test(a));
  if (s.releases === null) c.push(notMeasured("release-provenance", "Provenance of releases", "The releases could not be read."));
  else
    c.push(
      provenanceAsset || PROVENANCE_WORKFLOW.test(workflowText)
        ? visible("release-provenance", "Provenance of releases", provenanceAsset ?? "a workflow signs releases or attests their provenance", "Releases carry a signature or a provenance proof.")
        : notVisible(
            "release-provenance",
            "Provenance of releases",
            "No signatures or provenance attestations are visible next to the releases or in the workflows. The CRA asks for secure distribution of updates; users should be able to check that an update comes from you." + ELSEWHERE,
            "Sign releases (for example with sigstore/cosign or GitHub attestations) and publish the signature with the release.",
          ),
    );

  const lock = s.files.find((f) => LOCKFILES.includes(f));
  const hasManifest = s.files.some((f) => MANIFESTS.some((m) => (m.startsWith("*") ? f.endsWith(m.slice(1)) : f === m)));
  if (!hasManifest && !lock) c.push(notMeasured("pinned-dependencies", "Pinned dependencies", "No known package file in the repository root, so this was not assessed."));
  else
    c.push(
      lock
        ? visible("pinned-dependencies", "Pinned dependencies", lock, "A lockfile fixes which versions of the components are used.")
        : notVisible(
            "pinned-dependencies",
            "Pinned dependencies",
            "No lockfile in the repository root. Without one you cannot later tell exactly which component versions are in a release. Only the root is looked at; a lockfile in a subfolder is not seen.",
            "Commit your package manager's lockfile.",
          ),
    );

  const updates = findFile(/(^|\/)(dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?)$/i);
  c.push(
    updates
      ? visible("dependency-updates", "Automatic updates of components", updates, "A tool proposes new versions and flags vulnerable components.")
      : notVisible(
          "dependency-updates",
          "Automatic updates of components",
          "No Dependabot or Renovate configuration was found. The CRA asks that vulnerabilities in components are dealt with without delay. Dependabot security alerts can be switched on in the repository settings without a file; that is not visible from outside.",
          "Turn on Dependabot or Renovate (a small configuration file).",
        ),
  );

  const scan = SCAN_WORKFLOW.exec(workflowText);
  if (s.workflows.length === 0)
    c.push(
      notVisible(
        "security-scanning",
        "Automated security tests",
        "No CI workflows were found. The CRA asks for effective and regular tests and reviews of security.",
        "Add a workflow with a scanner (for example CodeQL, or a vulnerability scan of the dependencies).",
      ),
    );
  else
    c.push(
      scan
        ? visible("security-scanning", "Automated security tests", scan[1] ?? "a security scan", "A security scan runs in CI.")
        : notVisible(
            "security-scanning",
            "Automated security tests",
            "There are workflows, but none of the files read shows a security scan (CodeQL, Semgrep, Trivy, OSV, audit).",
            "Add a scan step that runs on each change or weekly.",
          ),
    );

  const daysSincePush = s.lastPush ? Math.floor((s.now - s.lastPush) / DAY_MS) : null;
  const lastRelease = (s.releases ?? []).filter((r) => !r.draft && r.date).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  const daysSinceRelease = lastRelease?.date ? Math.floor((s.now - lastRelease.date) / DAY_MS) : null;
  if (s.archived)
    c.push(notVisible("maintenance", "Maintenance and updates", "The repository is archived: no security updates will come from it.", "Say publicly who takes over maintenance, or that the product is no longer supported."));
  else if (daysSincePush === null) c.push(notMeasured("maintenance", "Maintenance and updates", "No date of the last change was available."));
  else
    c.push(
      daysSincePush <= 90
        ? visible(
            "maintenance",
            "Maintenance and updates",
            `last change ${daysSincePush} days ago${daysSinceRelease !== null ? `, last release ${daysSinceRelease} days ago` : ", no release seen"}`,
            "The repository is being maintained.",
          )
        : notVisible(
            "maintenance",
            "Maintenance and updates",
            `The last change was ${daysSincePush} days ago. The CRA expects vulnerabilities to be fixed quickly during the support period.`,
            "State the support period and make sure updates come within it.",
          ),
    );

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
      "your internal process for reporting vulnerabilities to ENISA within 24 hours, 72 hours and 14 days",
      "technical documentation, the risk assessment and the EU declaration of conformity",
      "private repositories, hosting other than GitHub, and anything that is not public",
    ],
    notice: "This is an indication from public data. It is not a conformity assessment and not legal advice.",
    sourcesRead: s.requested.map((u) => clean(u, 300)),
  };
}
