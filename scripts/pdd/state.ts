// PDD 2.0 — audit state reader.
// Zero-dependency parser for a project's `.audit/` directory.
// Every comment and identifier here is in English so the framework stays shareable.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

/** Confidence tiers describe the quality of the evidence backing a finding. */
export type ConfidenceTier = "tier-0" | "tier-1" | "tier-2" | "tier-3";

/** Status a finding can hold in its README frontmatter. */
export type FindingStatus = string; // open | investigating | resolved | ... (kept open for forward-compat)

/** A single finding parsed from `.audit/findings|resolved/NNN-<slug>/README.md`. */
export interface Finding {
  id: string;
  title: string;
  slug: string;
  area: string;
  severity: string;
  status: FindingStatus;
  confidence: ConfidenceTier | string;
  worktree: string; // absolute path OR the literal "none"
  hasInvestigation: boolean; // investigation.md present
  hasResolution: boolean; // resolution.md present
  dir: string; // absolute directory of the finding
  sourceKind?: "root" | "worktree"; // where this finding was read from
  sourcePath?: string; // the .audit dir (root) or worktree path it came from
  sourceBranch?: string; // branch name when sourceKind === "worktree"
}

/** A git worktree discovered alongside the main checkout. */
export interface Worktree {
  path: string; // absolute worktree path
  branch: string; // branch name, or "detached"
  auditDir: string | null; // its `.audit` dir, if present
  findings: Finding[]; // findings read from its `.audit`
}

/**
 * A live-activity record: written by an `/audit-*` skill when it STARTS work and
 * removed when it finishes. Lets the dashboard show what is running right now,
 * across parallel agents and worktrees.
 */
export interface Activity {
  command: string; // e.g. "audit-new", "audit-investigate"
  finding: string; // finding id, or "" when not yet known (e.g. a fresh audit-new)
  worktree: string; // worktree path, or "none"/"root"
  startedAt: string; // ISO timestamp
  agent: string; // free-form label (session/human/agent)
  pid: number; // process id that wrote it (best-effort liveness hint)
  file: string; // absolute path of the activity record
  ageMs: number; // now - startedAt, computed at read time
  stale: boolean; // true when older than the staleness threshold
}

/** One row of the parity coverage map (`.audit/coverage.md`). */
export interface CoverageRow {
  behavior: string; // "Behavior / Area" column
  referenceCase: string; // "Reference case" column
  status: "not-started" | "finding-open" | "verified" | string;
  tier: string;
  finding: string;
}

/** A section of `.audit/board.md`, keyed by its markdown heading. */
export interface BoardSection {
  heading: string; // heading text without the leading '#'
  level: number; // heading depth (1 = '#', 2 = '##', ...)
  lines: string[]; // raw content lines below the heading (until the next heading)
}

/** Aggregate state of a project's `.audit/` directory. */
export interface AuditState {
  findings: Finding[];
  coverage: CoverageRow[];
  board: BoardSection[];
  coveragePct: number; // verified / total * 100 (0 when there are no rows)
  worktrees?: Worktree[]; // additional worktrees (excludes the main checkout)
  activity?: Activity[]; // live executions in flight (deduped across worktrees)
}

/**
 * Parse a very small subset of YAML frontmatter: the leading `---` fenced block
 * with flat `key: value` pairs. Values are trimmed and surrounding quotes stripped.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return out;
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Strip a single pair of surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Read one finding directory (must contain a README.md). Returns null if absent. */
function readFinding(findingDir: string): Finding | null {
  const readmePath = join(findingDir, "README.md");
  if (!existsSync(readmePath)) return null;
  const fm = parseFrontmatter(readFileSync(readmePath, "utf8"));
  return {
    id: fm.id ?? "",
    title: fm.title ?? "",
    slug: fm.slug ?? "",
    area: fm.area ?? "",
    severity: fm.severity ?? "",
    status: fm.status ?? "",
    confidence: fm.confidence ?? "",
    worktree: fm.worktree ?? "none",
    hasInvestigation: existsSync(join(findingDir, "investigation.md")),
    hasResolution: existsSync(join(findingDir, "resolution.md")),
    dir: findingDir,
  };
}

/** Collect every finding under a parent folder (findings/ or resolved/). */
function readFindingsFrom(parent: string): Finding[] {
  if (!existsSync(parent)) return [];
  const findings: Finding[] = [];
  for (const entry of readdirSync(parent)) {
    const sub = join(parent, entry);
    let isDir = false;
    try {
      isDir = statSync(sub).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    const finding = readFinding(sub);
    if (finding) findings.push(finding);
  }
  return findings;
}

/** Split a markdown table row into trimmed cells (drops leading/trailing pipes). */
function splitRow(row: string): string[] {
  let line = row.trim();
  if (line.startsWith("|")) line = line.slice(1);
  if (line.endsWith("|")) line = line.slice(0, -1);
  return line.split("|").map((c) => c.trim());
}

/** True when a table row is the `|---|---|` separator between header and body. */
function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

/**
 * Parse `.audit/coverage.md` into rows. The table is expected to have the
 * columns: Behavior / Area | Reference case | Status | Tier | Finding.
 */
export function parseCoverage(content: string): CoverageRow[] {
  const rows: CoverageRow[] = [];
  const tableLines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  if (tableLines.length === 0) return rows;

  let seenSeparator = false;
  for (const line of tableLines) {
    const cells = splitRow(line);
    if (isSeparatorRow(cells)) {
      seenSeparator = true;
      continue;
    }
    // Skip the header row (the one before the separator).
    if (!seenSeparator) {
      const lowered = cells.map((c) => c.toLowerCase());
      if (lowered.some((c) => c.includes("behavior") || c.includes("status"))) {
        continue;
      }
    }
    rows.push({
      behavior: cells[0] ?? "",
      referenceCase: cells[1] ?? "",
      status: cells[2] ?? "",
      tier: cells[3] ?? "",
      finding: cells[4] ?? "",
    });
  }
  return rows;
}

/** Parse `.audit/board.md` into sections keyed by their markdown headings. */
export function parseBoard(content: string): BoardSection[] {
  const sections: BoardSection[] = [];
  let current: BoardSection | null = null;
  for (const line of content.split("\n")) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        lines: [],
      };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

/**
 * Read the full audit state from a `.audit/` directory.
 * `dir` is the path to the `.audit/` directory itself.
 */
export function readAuditState(dir: string): AuditState {
  const findings = [
    ...readFindingsFrom(join(dir, "findings")),
    ...readFindingsFrom(join(dir, "resolved")),
  ];

  const coveragePath = join(dir, "coverage.md");
  const coverage = existsSync(coveragePath)
    ? parseCoverage(readFileSync(coveragePath, "utf8"))
    : [];

  const boardPath = join(dir, "board.md");
  const board = existsSync(boardPath)
    ? parseBoard(readFileSync(boardPath, "utf8"))
    : [];

  const total = coverage.length;
  const verified = coverage.filter((r) => r.status === "verified").length;
  const coveragePct = total === 0 ? 0 : (verified / total) * 100;

  return { findings, coverage, board, coveragePct };
}

// --- Worktrees --------------------------------------------------------------

/** Progress rank used to break ties when the same finding appears twice. */
export function progressRank(f: Finding): number {
  if (f.hasResolution || f.status === "resolved") return 3;
  if (f.hasInvestigation || f.status === "investigated") return 2;
  return 1;
}

/** Parse `git worktree list --porcelain` output into path/branch pairs. */
export function parseWorktreePorcelain(
  output: string,
): { path: string; branch: string }[] {
  const out: { path: string; branch: string }[] = [];
  let path = "";
  let branch = "";
  const flush = () => {
    if (path) out.push({ path, branch: branch || "detached" });
    path = "";
    branch = "";
  };
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("worktree ")) {
      flush();
      path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      branch = "detached";
    } else if (line === "") {
      flush();
    }
  }
  flush();
  return out;
}

/**
 * Merge findings from the root `.audit` with findings read from worktrees,
 * deduplicating by finding id. A worktree copy ALWAYS wins over the root copy
 * (that is where active work happens); among worktrees, the one with the most
 * progress wins. Returns findings sorted by id.
 */
export function mergeFindings(
  rootFindings: Finding[],
  worktrees: Worktree[],
): Finding[] {
  const chosen = new Map<string, { f: Finding; fromWorktree: boolean; rank: number }>();
  const key = (f: Finding) => f.id || f.slug || f.dir;

  for (const f of rootFindings) {
    chosen.set(key(f), { f, fromWorktree: false, rank: progressRank(f) });
  }
  for (const wt of worktrees) {
    for (const f of wt.findings) {
      const k = key(f);
      const cur = chosen.get(k);
      const rank = progressRank(f);
      if (
        !cur ||
        (cur.fromWorktree === false) || // worktree beats root
        (cur.fromWorktree && rank >= cur.rank) // higher-progress worktree wins
      ) {
        chosen.set(k, { f, fromWorktree: true, rank });
      }
    }
  }
  return [...chosen.values()]
    .map((c) => c.f)
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""));
}

/** List git worktrees for a repo root (empty when not a git repo). */
function listWorktrees(repoRoot: string): { path: string; branch: string }[] {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return parseWorktreePorcelain(out);
  } catch {
    return [];
  }
}

// --- Live activity ----------------------------------------------------------

/** How old an activity record may be before it is flagged as stale. */
export const ACTIVITY_STALE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Parse the JSON activity records under an `.audit/activity/` directory.
 * `now` is injectable for testing. Records that fail to parse are skipped.
 */
export function readActivityFrom(activityDir: string, now: number): Activity[] {
  if (!existsSync(activityDir)) return [];
  const out: Activity[] = [];
  for (const entry of readdirSync(activityDir)) {
    if (!entry.endsWith(".json")) continue;
    const file = join(activityDir, entry);
    try {
      const rec = JSON.parse(readFileSync(file, "utf8")) as Partial<Activity>;
      const startedAt = String(rec.startedAt ?? "");
      const started = Date.parse(startedAt);
      const ageMs = Number.isNaN(started) ? Number.POSITIVE_INFINITY : now - started;
      out.push({
        command: String(rec.command ?? "unknown"),
        finding: String(rec.finding ?? ""),
        worktree: String(rec.worktree ?? "none"),
        startedAt,
        agent: String(rec.agent ?? ""),
        pid: Number(rec.pid ?? 0),
        file,
        ageMs,
        stale: ageMs > ACTIVITY_STALE_MS,
      });
    } catch {
      // Skip malformed records rather than failing the whole dashboard.
    }
  }
  return out;
}

/** Dedupe activity records by (command, finding, worktree, startedAt). */
export function dedupeActivity(records: Activity[]): Activity[] {
  const seen = new Map<string, Activity>();
  for (const a of records) {
    const k = `${a.command}|${a.finding}|${a.worktree}|${a.startedAt}`;
    const cur = seen.get(k);
    // Keep the freshest (smallest ageMs) instance of a duplicate.
    if (!cur || a.ageMs < cur.ageMs) seen.set(k, a);
  }
  return [...seen.values()].sort((a, b) => a.ageMs - b.ageMs);
}

/**
 * Read the full audit state INCLUDING worktrees and live activity, merged and
 * deduplicated. `auditDir` is the root `.audit` directory. `now` is injectable
 * for tests (defaults to wall-clock time).
 */
export function readMergedAuditState(
  auditDir: string,
  now: number = Date.now(),
): AuditState {
  const base = readAuditState(auditDir);
  const repoRoot = dirname(auditDir);
  const rootResolved = resolve(repoRoot);

  const worktrees: Worktree[] = [];
  const activity: Activity[] = readActivityFrom(join(auditDir, "activity"), now);

  for (const wt of listWorktrees(repoRoot)) {
    if (resolve(wt.path) === rootResolved) continue; // skip the main checkout
    const wtAudit = join(wt.path, ".audit");
    const hasAudit = existsSync(wtAudit);
    const findings = hasAudit
      ? [
          ...readFindingsFrom(join(wtAudit, "findings")),
          ...readFindingsFrom(join(wtAudit, "resolved")),
        ].map((f) => ({
          ...f,
          sourceKind: "worktree" as const,
          sourcePath: wt.path,
          sourceBranch: wt.branch,
        }))
      : [];
    if (hasAudit) {
      activity.push(...readActivityFrom(join(wtAudit, "activity"), now));
    }
    worktrees.push({
      path: wt.path,
      branch: wt.branch,
      auditDir: hasAudit ? wtAudit : null,
      findings,
    });
  }

  const rootTagged: Finding[] = base.findings.map((f) => ({
    ...f,
    sourceKind: "root" as const,
    sourcePath: auditDir,
  }));

  return {
    ...base,
    findings: mergeFindings(rootTagged, worktrees),
    worktrees,
    activity: dedupeActivity(activity),
  };
}
