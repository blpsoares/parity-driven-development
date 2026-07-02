// PDD 2.0 — ANSI dashboard renderer.
// Zero external dependencies. All comments and identifiers are in English.

import type { AuditState, Finding } from "./state";

// --- Minimal ANSI helpers ---------------------------------------------------

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

const color = {
  reset: RESET,
  bold: (s: string) => `${ESC}1m${s}${RESET}`,
  dim: (s: string) => `${ESC}2m${s}${RESET}`,
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
};

/** Strip ANSI escape sequences (used by tests and width math). */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// --- Progress bar -----------------------------------------------------------

const FULL_BLOCK = "█"; // █
const LIGHT_SHADE = "░"; // ░

/** Render a block-character progress bar for a 0..100 percentage. */
export function progressBar(pct: number, width = 24): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const paint =
    clamped >= 80 ? color.green : clamped >= 50 ? color.yellow : color.red;
  return paint(FULL_BLOCK.repeat(filled)) + color.dim(LIGHT_SHADE.repeat(empty));
}

// --- Confidence tier styling ------------------------------------------------

const TIER_COLOR: Record<string, (s: string) => string> = {
  "tier-0": color.red,
  "tier-1": color.yellow,
  "tier-2": color.magenta, // orange-ish (no true orange in 16-color)
  "tier-3": color.green,
};

const TIER_ORDER = ["tier-0", "tier-1", "tier-2", "tier-3"];

// --- Aggregation helpers ----------------------------------------------------

function countBy<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/**
 * The active-work signal in PDD lives in the `.audit/board.md` "In progress"
 * section (the dev marks findings [doing] there), not in a finding status —
 * findings only ever carry open/investigated/resolved/out-of-scope. Return the
 * non-empty content lines of that board section, or [] if there is none.
 */
function inProgressLines(state: AuditState): string[] {
  const section = state.board.find((s) =>
    /in[\s-]?progress|em andamento|doing/i.test(s.heading),
  );
  if (!section) return [];
  // Skip blank lines and skeleton placeholders like "<empty>" / "<vazio>" /
  // "<none>" that the bootstrap board template leaves in an empty section.
  const placeholder = /^<\s*(empty|vazio|none|nenhum)\s*>$/i;
  return section.lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !placeholder.test(l));
}

// --- Main renderer ----------------------------------------------------------

/** Render the full PDD board as an ANSI string panel. */
export function renderBoard(state: AuditState): string {
  const lines: string[] = [];
  const rule = color.dim("─".repeat(48));

  lines.push(color.bold(color.cyan("PDD Board — Parity-Driven Development")));
  lines.push(rule);

  // Coverage progress bar.
  const pct = Math.round(state.coveragePct * 10) / 10;
  const verified = state.coverage.filter((r) => r.status === "verified").length;
  const total = state.coverage.length;
  lines.push(
    `${color.bold("Coverage")}  ${progressBar(pct)}  ${color.bold(`${pct}%`)} ` +
      color.dim(`(${verified}/${total} verified)`),
  );
  lines.push("");

  // Counts per finding status.
  lines.push(color.bold("Findings by status"));
  const byStatus = countBy(state.findings, (f) => f.status || "unknown");
  if (byStatus.size === 0) {
    lines.push(color.dim("  (none)"));
  } else {
    for (const [status, count] of [...byStatus.entries()].sort()) {
      lines.push(`  ${status.padEnd(14)} ${color.bold(String(count))}`);
    }
  }
  lines.push("");

  // Confidence distribution per tier.
  lines.push(color.bold("Confidence distribution"));
  const byTier = countBy(state.findings, (f) => f.confidence || "unknown");
  const tiers = [
    ...TIER_ORDER,
    ...[...byTier.keys()].filter((k) => !TIER_ORDER.includes(k)),
  ];
  let anyTier = false;
  for (const tier of tiers) {
    const count = byTier.get(tier) ?? 0;
    if (count === 0 && TIER_ORDER.includes(tier) === false) continue;
    anyTier = true;
    const paint = TIER_COLOR[tier] ?? color.dim;
    const chip = paint(FULL_BLOCK.repeat(Math.max(count, 0)) || LIGHT_SHADE);
    lines.push(`  ${paint(tier.padEnd(8))} ${chip} ${color.dim(String(count))}`);
  }
  if (!anyTier) lines.push(color.dim("  (none)"));
  lines.push("");

  // In-progress tasks.
  lines.push(color.bold("In progress"));
  const doing = inProgressLines(state);
  if (doing.length === 0) {
    lines.push(color.dim("  (nothing in progress)"));
  } else {
    for (const item of doing) {
      const text = item.replace(/^[-*]\s*\[[ x]\]\s*/i, "").replace(/^[-*]\s*/, "");
      lines.push(`  ${color.yellow("▶")} ${text}`);
    }
  }

  lines.push(rule);
  return lines.join("\n");
}
