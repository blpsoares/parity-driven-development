// PDD 2.0 — audit state reader.
// Zero-dependency parser for a project's `.audit/` directory.
// Every comment and identifier here is in English so the framework stays shareable.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
