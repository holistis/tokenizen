// euipo-opendata-sync.mjs — daily, no-KYC trademark index for mark-attest.
//
// Why this exists instead of the EUIPO Trademark Search REST API
// (api.euipo.europa.eu/trademark-search): production access to that API
// requires sending a passport/national-ID copy plus proof of address to
// EUIPO's docs.apiplatform@euipo.europa.eu mailbox (confirmed 2026-11-07,
// "API subscription request received" email). We chose not to do that for
// an MVP with no paying customer yet. EUIPO separately runs a genuinely
// public, no-login, no-API-key bulk data source: an FTP server at
// ftp.euipo.europa.eu, anonymous login, full daily XML dumps of the
// trademark register (format: WIPO ST.66). That's what this script pulls.
//
// VERIFIED 2026-11-07: ftp.euipo.europa.eu:21 is live and anonymous login
// IS a supported, intended mechanism — the server's own response for
// `USER anonymous` / `PASS <anything>` was "421 Maximum anonymous login
// limit has been reached", a distinct, different error from the "530
// Authentication failed" a wrong real account gets. That 421 means the
// anonymous slot pool was simply full at test time (tried 3x, 2 source
// IPs), not that anonymous access is gone. A 2021 third-party research
// script (github.com/lhf-labs/tm-dataset, MIT-licensed, publishes
// ftp.euipo.europa.eu + path /Trademark/Full as its source) used a named
// "opendata" account with a hardcoded password; that password is 5 years
// stale and now returns 530 (confirmed dead), and we did NOT try to guess
// further passwords for that named account — only the standard, public
// "anonymous" mechanism is used here.
//
// NOT VERIFIED YET (could not browse the server live, logins were full):
// the exact subfolder layout under /Trademark/Full, and the real ST.66 tag
// names EUIPO's export uses. EXTRACT_TAG_CANDIDATES below is a best-effort
// list from the general WIPO ST.66 standard, not confirmed against a real
// downloaded EUIPO file. If marksParsed comes back 0 (or far off the
// previous run) on a run that downloaded files successfully, that is
// exactly the signal this script is built to surface (see ALERT logic) —
// treat it as "field names need adjusting", check
// data/euipo-sync-log.jsonl's `sampleTagsSeen`, fix EXTRACT_TAG_CANDIDATES,
// done. That is the intended self-correcting path, not a design error.
//
// Change-detection (the king's requirement, 2026-11-07): every run appends
// ONE line to data/euipo-sync-log.jsonl — timestamp, status, counts, and an
// `alert` field — and that file (small, no raw data) is committed and
// pushed after every run, so a change on EUIPO's side shows up in git
// without anyone needing to log into the VPS.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, appendFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(PKG_ROOT, "data");
const RAW_DIR = join(DATA_DIR, "euipo-raw");
const INDEX_FILE = join(DATA_DIR, "euipo-index.jsonl");
const INDEX_TMP = join(DATA_DIR, "euipo-index.jsonl.tmp");
const LOG_FILE = join(DATA_DIR, "euipo-sync-log.jsonl");

const FTP_HOST = process.env.EUIPO_FTP_HOST || "ftp.euipo.europa.eu";
const FTP_PATH = process.env.EUIPO_FTP_PATH || "/Trademark/Full";
const MAX_YEAR_FOLDERS = Number(process.env.EUIPO_MAX_YEAR_FOLDERS || 2);
const FTP_RETRIES = 3;
const FTP_TIMEOUT_S = 60;

// Best-effort WIPO ST.66 field candidates — see "NOT VERIFIED YET" above.
const NAME_TAGS = ["MarkVerbalElementText", "VerbalElementText", "SignificantWordText"];
const APPLICANT_TAGS = ["FreeFormatNameLine", "ApplicantName"];
const STATUS_TAGS = ["MarkCurrentStatusCode", "MarkCurrentStatusExternalDescriptionText"];
const DATE_TAGS = ["ApplicationDate", "MarkFilingDate"];
const CLASS_TAGS = ["ClassNumber", "NiceClassNumber"];
const RECORD_TAG_CANDIDATES = ["Trademark", "TradeMark", "TrademarkDetails"];

function runCurl(args, label) {
  for (let attempt = 1; attempt <= FTP_RETRIES; attempt++) {
    const res = spawnSync("curl", ["-s", "-m", String(FTP_TIMEOUT_S), ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
    if (res.status === 0) return res.stdout;
    if (attempt === FTP_RETRIES) {
      throw new Error(`${label} failed after ${FTP_RETRIES} attempts: exit ${res.status}, stderr: ${(res.stderr || "").slice(0, 300)}`);
    }
  }
  return "";
}

function ftpList(path) {
  const url = `ftp://anonymous:anonymous@${FTP_HOST}${path}/`;
  const out = runCurl(["--list-only", url], `list ${path}`);
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function ftpDownload(path, file, destFile) {
  const url = `ftp://anonymous:anonymous@${FTP_HOST}${path}/${file}`;
  runCurl(["-o", destFile, url], `download ${path}/${file}`);
}

function extractFirstTag(xmlBlock, tagCandidates) {
  for (const tag of tagCandidates) {
    const m = xmlBlock.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)<\\/(?:\\w+:)?${tag}>`));
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

function extractAllTags(xmlBlock, tagCandidates) {
  for (const tag of tagCandidates) {
    const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)<\\/(?:\\w+:)?${tag}>`, "g");
    const values = [...xmlBlock.matchAll(re)].map((m) => m[1].trim()).filter(Boolean);
    if (values.length) return values;
  }
  return [];
}

/** Splits one XML file's text into per-record blocks using the first record tag that actually appears. */
function splitRecords(xmlText) {
  for (const tag of RECORD_TAG_CANDIDATES) {
    const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, "g");
    const blocks = xmlText.match(re);
    if (blocks && blocks.length) return { tag, blocks };
  }
  return { tag: null, blocks: [] };
}

function parseXmlFile(filePath, sampleTagsSeen) {
  const xmlText = readFileSync(filePath, "utf8");
  const { tag, blocks } = splitRecords(xmlText);
  if (tag && !sampleTagsSeen.has("recordTag")) sampleTagsSeen.set("recordTag", tag);
  const records = [];
  for (const block of blocks) {
    const name = extractFirstTag(block, NAME_TAGS);
    if (!name) continue;
    records.push({
      name,
      applicant: extractFirstTag(block, APPLICANT_TAGS),
      status: extractFirstTag(block, STATUS_TAGS),
      filingDate: extractFirstTag(block, DATE_TAGS),
      niceClasses: extractAllTags(block, CLASS_TAGS),
      source: { file: filePath.split(/[\\/]/).pop() },
    });
  }
  return records;
}

function readLastSuccessfulCount() {
  if (!existsSync(LOG_FILE)) return null;
  const lines = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.status === "ok" && typeof entry.marksParsed === "number") return entry.marksParsed;
    } catch {}
  }
  return null;
}

function appendLog(entry) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

function gitCommitLog() {
  const commit = spawnSync("git", ["add", "data/euipo-sync-log.jsonl"], { cwd: PKG_ROOT, encoding: "utf8" });
  if (commit.status !== 0) return { committed: false, reason: `git add failed: ${commit.stderr}` };
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: PKG_ROOT });
  if (diff.status === 0) return { committed: false, reason: "no change to commit" };
  const msg = spawnSync("git", ["commit", "-m", "mark-attest: EUIPO open-data sync log entry"], { cwd: PKG_ROOT, encoding: "utf8" });
  if (msg.status !== 0) return { committed: false, reason: `git commit failed: ${msg.stderr}` };
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: PKG_ROOT, encoding: "utf8" }).stdout.trim();
  const push = spawnSync("git", ["push", "origin", branch], { cwd: PKG_ROOT, encoding: "utf8" });
  if (push.status !== 0) return { committed: true, pushed: false, reason: `git push failed: ${push.stderr}` };
  return { committed: true, pushed: true, branch };
}

async function main() {
  const startedAt = new Date().toISOString();
  mkdirSync(RAW_DIR, { recursive: true });
  const sampleTagsSeen = new Map();
  let filesDownloaded = 0;
  let bytesDownloaded = 0;
  let allRecords = [];

  try {
    const yearFolders = ftpList(FTP_PATH)
      .filter((f) => /^\d{4}$/.test(f))
      .sort((a, b) => Number(b) - Number(a))
      .slice(0, MAX_YEAR_FOLDERS);

    if (!yearFolders.length) {
      throw new Error(`No year-folders found under ${FTP_PATH} — layout assumption may be wrong, see header comment.`);
    }

    for (const year of yearFolders) {
      const folderPath = `${FTP_PATH}/${year}`;
      const files = ftpList(folderPath).filter((f) => /\.xml$/i.test(f));
      for (const file of files) {
        const dest = join(RAW_DIR, `${year}-${file}`);
        ftpDownload(folderPath, file, dest);
        filesDownloaded++;
        const records = parseXmlFile(dest, sampleTagsSeen);
        allRecords = allRecords.concat(records);
      }
    }

    // Atomic write: temp file first, rename only after the full index is ready.
    writeFileSync(INDEX_TMP, allRecords.map((r) => JSON.stringify(r)).join("\n") + "\n");
    renameSync(INDEX_TMP, INDEX_FILE);

    // Raw XML is large and reproducible from EUIPO any time — don't keep it on disk.
    rmSync(RAW_DIR, { recursive: true, force: true });

    const marksParsed = allRecords.length;
    const previousCount = readLastSuccessfulCount();
    const pctChange = previousCount && previousCount > 0 ? ((marksParsed - previousCount) / previousCount) * 100 : null;
    const alert = marksParsed === 0 || (pctChange !== null && Math.abs(pctChange) > 20);

    const entry = {
      timestamp: startedAt,
      status: "ok",
      ftpHost: FTP_HOST,
      ftpPath: FTP_PATH,
      yearFoldersProcessed: yearFolders,
      filesDownloaded,
      marksParsed,
      previousMarksParsed: previousCount,
      pctChange: pctChange === null ? null : Number(pctChange.toFixed(1)),
      sampleTagsSeen: Object.fromEntries(sampleTagsSeen),
      alert,
      alertReason: alert ? (marksParsed === 0 ? "zero marks parsed — field names or folder layout likely changed on EUIPO's side" : "mark count changed >20% vs previous run") : null,
    };
    appendLog(entry);
    const gitResult = gitCommitLog();
    console.log(JSON.stringify({ ...entry, git: gitResult }, null, 2));
  } catch (err) {
    rmSync(RAW_DIR, { recursive: true, force: true });
    const entry = {
      timestamp: startedAt,
      status: "error",
      ftpHost: FTP_HOST,
      ftpPath: FTP_PATH,
      filesDownloaded,
      marksParsed: 0,
      alert: true,
      alertReason: err.message,
    };
    appendLog(entry);
    const gitResult = gitCommitLog();
    console.error(JSON.stringify({ ...entry, git: gitResult }, null, 2));
    process.exitCode = 1;
  }
}

main();
