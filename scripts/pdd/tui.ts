// PDD 2.0 — interactive, navigable dashboard (TUI).
// Zero external dependencies. The tree model, flattening, key reducer and frame
// renderer are PURE (and unit-tested); only runTui() touches stdin / the screen.

import { watch } from "node:fs";
import { stripAnsi } from "./render";
import { readMergedAuditState, type AuditState, type Finding } from "./state";

// --- Minimal ANSI -----------------------------------------------------------

const ESC = "\x1b[";
const R = `${ESC}0m`;
const c = {
  bold: (s: string) => `${ESC}1m${s}${R}`,
  dim: (s: string) => `${ESC}2m${s}${R}`,
  red: (s: string) => `${ESC}31m${s}${R}`,
  green: (s: string) => `${ESC}32m${s}${R}`,
  yellow: (s: string) => `${ESC}33m${s}${R}`,
  magenta: (s: string) => `${ESC}35m${s}${R}`,
  cyan: (s: string) => `${ESC}36m${s}${R}`,
  reverse: (s: string) => `${ESC}7m${s}${R}`,
};

const TIER_COLOR: Record<string, (s: string) => string> = {
  "tier-0": c.red,
  "tier-1": c.yellow,
  "tier-2": c.magenta,
  "tier-3": c.green,
};

// --- Tree model -------------------------------------------------------------

export interface TreeNode {
  id: string; // stable across re-reads so expand state survives live updates
  label: string; // may contain ANSI
  children: TreeNode[];
}

export interface Row {
  id: string;
  label: string;
  plain: string;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  parentIndex: number;
}

export interface UiState {
  cursor: number;
  expanded: Set<string>;
}

/** Sections that start expanded. */
export const DEFAULT_EXPANDED = [
  "sec:worktrees",
  "sec:findings",
  "sec:active",
  "findings:open",
  "findings:in-progress",
  "findings:done",
];

function node(id: string, label: string, children: TreeNode[] = []): TreeNode {
  return { id, label, children };
}

function findingLifecycle(f: Finding): string {
  if (f.hasResolution || f.status === "resolved") return "done";
  if (f.hasInvestigation || f.status === "investigated") return "in-progress";
  return "open";
}

function last(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

function age(ms: number): string {
  if (!Number.isFinite(ms)) return "?";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/** Build the section tree from an audit state. Labels carry ANSI; ids are stable. */
export function buildTree(state: AuditState): TreeNode[] {
  const sections: TreeNode[] = [];

  // Coverage (leaf info).
  const pct = Math.round((state.coveragePct ?? 0) * 10) / 10;
  const verified = state.coverage.filter((r) => r.status === "verified").length;
  sections.push(
    node(
      "sec:coverage",
      `${c.bold("Coverage")} ${pct}% ${c.dim(`(${verified}/${state.coverage.length} verified)`)}`,
      state.coverage.map((r, i) =>
        node(
          `cov:${i}`,
          `${r.behavior} ${c.dim(`— ${r.status}${r.tier ? " " + r.tier : ""}${r.finding ? " #" + r.finding : ""}`)}`,
        ),
      ),
    ),
  );

  // Worktrees.
  const wts = state.worktrees ?? [];
  sections.push(
    node(
      "sec:worktrees",
      `${c.bold("Worktrees")} ${c.dim(`(${wts.length} active)`)}`,
      wts.map((wt) => {
        const detail: TreeNode[] = [
          node(`wt:${wt.path}:branch`, `${c.dim("branch:")} ${wt.branch}`),
          node(`wt:${wt.path}:path`, `${c.dim("path:")} ${wt.path}`),
          node(
            `wt:${wt.path}:audit`,
            `${c.dim("audit:")} ${wt.auditDir ? wt.auditDir : "(no .audit in worktree)"}`,
          ),
        ];
        for (const f of wt.findings) {
          const paint = TIER_COLOR[f.confidence] ?? c.dim;
          detail.push(
            node(
              `wt:${wt.path}:f:${f.id}`,
              `${c.dim("finding")} ${c.bold(f.id)} ${paint(String(f.confidence))} ${c.dim("· " + findingLifecycle(f))}`,
            ),
          );
        }
        return node(
          `wt:${wt.path}`,
          `${c.cyan(wt.branch)} ${c.dim(`[${last(wt.path)}]`)}`,
          detail,
        );
      }),
    ),
  );

  // Findings — grouped by lifecycle so you can see WHICH ids are open vs
  // in-progress vs done (not just a count).
  const fs = state.findings ?? [];
  const findingNode = (f: Finding): TreeNode => {
    const paint = TIER_COLOR[f.confidence] ?? c.dim;
    const src =
      f.sourceKind === "worktree" && f.sourceBranch
        ? ` ${c.dim("@" + f.sourceBranch)}`
        : "";
    return node(
      `finding:${f.id}`,
      `${c.bold(f.id)} ${f.title} ${paint(String(f.confidence))}${src}`,
      [
        node(`finding:${f.id}:area`, `${c.dim("area:")} ${f.area || "—"}`),
        node(`finding:${f.id}:sev`, `${c.dim("severity:")} ${f.severity || "—"}`),
        node(`finding:${f.id}:conf`, `${c.dim("confidence:")} ${f.confidence || "—"}`),
        node(`finding:${f.id}:wt`, `${c.dim("worktree:")} ${f.worktree || "none"}`),
        node(
          `finding:${f.id}:files`,
          `${c.dim("files:")} README${f.hasInvestigation ? " · investigation" : ""}${f.hasResolution ? " · resolution" : ""}`,
        ),
        node(`finding:${f.id}:dir`, `${c.dim("dir:")} ${f.dir}`),
      ],
    );
  };
  const order: Array<{ key: string; label: string; paint: (s: string) => string }> = [
    { key: "open", label: "open", paint: c.red },
    { key: "in-progress", label: "in-progress", paint: c.yellow },
    { key: "done", label: "done", paint: c.green },
  ];
  const groups: TreeNode[] = [];
  for (const g of order) {
    const inGroup = fs.filter((f) => findingLifecycle(f) === g.key);
    if (inGroup.length === 0) continue;
    const ids = inGroup.map((f) => f.id).join(", ");
    groups.push(
      node(
        `findings:${g.key}`,
        `${g.paint(g.label)} ${c.dim(`(${inGroup.length}) — ${ids}`)}`,
        inGroup.map(findingNode),
      ),
    );
  }
  sections.push(
    node("sec:findings", `${c.bold("Findings")} ${c.dim(`(${fs.length})`)}`, groups),
  );

  // Active now.
  const acts = state.activity ?? [];
  sections.push(
    node(
      "sec:active",
      `${c.bold("Active now")} ${c.dim(`(${acts.length})`)}`,
      acts.map((a, i) => {
        const where =
          a.worktree && a.worktree !== "none" && a.worktree !== "root"
            ? last(a.worktree)
            : "root";
        const staleTag = a.stale ? c.red(" stale") : "";
        const who = a.agent ? c.dim(" @" + a.agent) : "";
        return node(
          `act:${i}`,
          `${c.green("●")} ${a.command} ${c.bold(a.finding || "—")} ${c.dim(`[${where}] ${age(a.ageMs)}`)}${who}${staleTag}`,
        );
      }),
    ),
  );

  return sections;
}

// --- Flatten / navigate / render (pure) -------------------------------------

/** Flatten the tree into visible rows given the set of expanded node ids. */
export function flatten(nodes: TreeNode[], expanded: Set<string>): Row[] {
  const rows: Row[] = [];
  const walk = (list: TreeNode[], depth: number, parentIndex: number) => {
    for (const n of list) {
      const idx = rows.length;
      const isExpanded = expanded.has(n.id);
      rows.push({
        id: n.id,
        label: n.label,
        plain: stripAnsi(n.label),
        depth,
        expandable: n.children.length > 0,
        expanded: isExpanded,
        parentIndex,
      });
      if (isExpanded && n.children.length > 0) walk(n.children, depth + 1, idx);
    }
  };
  walk(nodes, 0, -1);
  return rows;
}

/** Canonical key names produced by parseKey. */
export type Key = "up" | "down" | "left" | "right" | "enter" | "esc" | "quit" | "";

/** Map a raw stdin chunk to a canonical key name. */
export function parseKey(data: string): Key {
  switch (data) {
    case "\x1b[A":
    case "k":
      return "up";
    case "\x1b[B":
    case "j":
      return "down";
    case "\x1b[C":
    case "l":
      return "right";
    case "\x1b[D":
    case "h":
      return "left";
    case "\r":
    case "\n":
      return "enter";
    case "\x1b":
      return "esc";
    case "q":
    case "\x03": // Ctrl-C
      return "quit";
    default:
      return "";
  }
}

/**
 * Apply a key to the UI state. `rows` is the currently-visible flattening.
 * Pure: returns a new UiState (expanded is copied).
 */
export function reduce(ui: UiState, key: Key, rows: Row[]): UiState {
  const expanded = new Set(ui.expanded);
  let cursor = ui.cursor;
  const row = rows[cursor];

  switch (key) {
    case "down":
      cursor = Math.min(cursor + 1, Math.max(rows.length - 1, 0));
      break;
    case "up":
      cursor = Math.max(cursor - 1, 0);
      break;
    case "right":
    case "enter":
      if (row && row.expandable && !row.expanded) expanded.add(row.id);
      break;
    case "left":
    case "esc":
      if (row && row.expandable && row.expanded) {
        expanded.delete(row.id);
      } else if (row && row.parentIndex >= 0) {
        cursor = row.parentIndex;
      }
      break;
    default:
      break;
  }
  return { cursor, expanded };
}

/** Render a full frame (header + rows + footer) as a string. */
export function renderFrame(rows: Row[], cursor: number): string {
  const out: string[] = [];
  out.push(c.bold(c.cyan("PDD Board — Parity-Driven Development")));
  out.push(
    c.dim("↑/↓ navigate · →/enter expand · ←/esc collapse · q quit"),
  );
  out.push(c.dim("─".repeat(56)));

  if (rows.length === 0) out.push(c.dim("  (empty)"));
  rows.forEach((r, i) => {
    const indent = "  ".repeat(r.depth);
    const marker = r.expandable ? (r.expanded ? "▾" : "▸") : " ";
    if (i === cursor) {
      out.push(c.reverse(`${indent}${marker} ${r.plain}`));
    } else {
      out.push(`${indent}${marker} ${r.label}`);
    }
  });
  out.push(c.dim("─".repeat(56)));
  return out.join("\n");
}

// --- Imperative shell -------------------------------------------------------

const ALT_ON = "\x1b[?1049h\x1b[?25l"; // alt screen + hide cursor
const ALT_OFF = "\x1b[?25h\x1b[?1049l"; // show cursor + leave alt screen
const CLEAR = "\x1b[2J\x1b[H";

/** Launch the interactive TUI against an `.audit` directory. */
export function runTui(auditDir: string): void {
  const stdin = process.stdin;
  // No TTY (piped/redirected): fall back to a single static frame.
  if (!stdin.isTTY) {
    const tree = buildTree(readMergedAuditState(auditDir));
    process.stdout.write(
      renderFrame(flatten(tree, new Set(DEFAULT_EXPANDED)), -1) + "\n",
    );
    return;
  }

  let ui: UiState = { cursor: 0, expanded: new Set(DEFAULT_EXPANDED) };
  let tree = buildTree(readMergedAuditState(auditDir));

  const draw = () => {
    const rows = flatten(tree, ui.expanded);
    if (ui.cursor > rows.length - 1) ui = { ...ui, cursor: Math.max(rows.length - 1, 0) };
    process.stdout.write(CLEAR + renderFrame(rows, ui.cursor));
  };

  const cleanup = () => {
    try {
      stdin.setRawMode(false);
    } catch {}
    stdin.pause();
    process.stdout.write(ALT_OFF);
    process.exit(0);
  };

  process.stdout.write(ALT_ON);
  draw();

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", (d: string) => {
    const key = parseKey(d);
    if (key === "quit") return cleanup();
    if (key === "") return;
    const rows = flatten(tree, ui.expanded);
    ui = reduce(ui, key, rows);
    draw();
  });

  // Live updates: re-read on any change under .audit (debounced), keeping ui.
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    watch(auditDir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        tree = buildTree(readMergedAuditState(auditDir));
        draw();
      }, 120);
    });
  } catch {
    // Recursive watch unsupported on this platform — nav still works, no live refresh.
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
