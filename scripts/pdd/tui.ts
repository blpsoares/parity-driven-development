// PDD 2.0 — interactive, navigable dashboard (TUI) with tabs, keyboard AND mouse.
// Zero external dependencies. The tree model, tab selection, flatten, key/mouse
// parsing, hit-testing, reducers and frame rendering are PURE (unit-tested);
// only runTui() touches stdin / the screen / mouse tracking.

import { watch } from "node:fs";
import { stripAnsi, progressBar } from "./render";
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
  tab: number;
  cursor: number;
  expanded: Set<string>;
}

/** The tab bar, in order. */
export const TABS = [
  "Overview",
  "Flow",
  "Worktrees",
  "Findings",
  "Active",
  "Coverage",
  "Legend",
];

/** Sections that start expanded. */
export const DEFAULT_EXPANDED = [
  "sec:flow",
  "sec:worktrees",
  "sec:findings",
  "sec:active",
  "sec:legend",
  "findings:open",
  "findings:in-progress",
  "findings:resolved",
];

// Fixed frame layout (1-based terminal rows), used by both renderer and hitTest.
const TAB_ROW = 2; // the tab bar line
const CONTENT_START = 5; // first content row (after title, tabs, hint, rule)

function node(id: string, label: string, children: TreeNode[] = []): TreeNode {
  return { id, label, children };
}

function findingLifecycle(f: Finding): string {
  // "resolved" = dev finished locally (NOT guaranteed — that is coverage's `verified`).
  if (f.hasResolution || f.status === "resolved") return "resolved";
  if (f.hasInvestigation || f.status === "investigated") return "in-progress";
  return "open";
}

/** The finding pipeline, in order. */
export interface Stage {
  key: string;
  label: string;
  done: boolean;
}

/** Compute the full-flow pipeline of a finding (needs its coverage row status). */
export function pipelineStages(f: Finding, coverageStatus: string): Stage[] {
  const resolved = f.hasResolution || f.status === "resolved";
  const qa = f.qaEnvs ?? {};
  const localApproved = qa.local === "approved";
  // Any deployment environment (not "local") approved → environment QA passed.
  const envApproved = Object.entries(qa).some(([e, s]) => e !== "local" && s === "approved");
  return [
    { key: "new", label: "new", done: true },
    { key: "investigated", label: "investigated", done: f.hasInvestigation || resolved },
    { key: "resolved", label: "resolved", done: resolved },
    { key: "qa-local", label: "QA local", done: localApproved },
    { key: "pr", label: "PR", done: Boolean(f.prUrl) },
    { key: "qa-env", label: "QA env", done: envApproved },
    { key: "verified", label: "verified", done: coverageStatus === "verified" },
  ];
}

/** The 0-based index of the current stage (first not-done, or last when all done). */
export function currentStageIndex(stages: Stage[]): number {
  const i = stages.findIndex((s) => !s.done);
  return i === -1 ? stages.length - 1 : i;
}

/** Render the pipeline as a compact colored line: done ●, current ◉, future ○. */
export function renderPipeline(stages: Stage[]): string {
  const cur = currentStageIndex(stages);
  return stages
    .map((s, i) => {
      const dot = s.done ? c.green("●") : i === cur ? c.yellow("◉") : c.dim("○");
      const name = s.done ? c.green(s.label) : i === cur ? c.yellow(s.label) : c.dim(s.label);
      return `${dot} ${name}`;
    })
    .join(c.dim(" ─ "));
}

/** Just the colored dots of a pipeline (compact glyph for a finding row). */
function pipelineDots(stages: Stage[]): string {
  const cur = currentStageIndex(stages);
  return stages
    .map((s, i) => (s.done ? c.green("●") : i === cur ? c.yellow("◉") : c.dim("○")))
    .join("");
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

  // Coverage.
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

  // Findings — grouped by lifecycle so you can see WHICH ids are in each state.
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
  const order = [
    { key: "open", paint: c.red },
    { key: "in-progress", paint: c.yellow },
    { key: "resolved", paint: c.green },
  ];
  const groups: TreeNode[] = [];
  for (const g of order) {
    const inGroup = fs.filter((f) => findingLifecycle(f) === g.key);
    if (inGroup.length === 0) continue;
    const ids = inGroup.map((f) => f.id).join(", ");
    groups.push(
      node(
        `findings:${g.key}`,
        `${g.paint(g.key)} ${c.dim(`(${inGroup.length}) — ${ids}`)}`,
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

  // Flow — the FULL pipeline per finding (new → investigated → resolved → PR → QA → verified).
  const covStatusOf = (fid: string) =>
    state.coverage.find((r) => r.finding === fid)?.status ?? "not-started";
  sections.push(
    node(
      "sec:flow",
      `${c.bold("Flow")} ${c.dim("(pipeline per finding)")}`,
      fs.map((f) => {
        const stages = pipelineStages(f, covStatusOf(f.id));
        const cur = stages[currentStageIndex(stages)];
        return node(
          `flow:${f.id}`,
          `${c.bold(f.id)} ${f.title}  ${pipelineDots(stages)} ${c.dim("→ " + cur.label)}`,
          [
            node(`flow:${f.id}:line`, renderPipeline(stages)),
            node(`flow:${f.id}:pr`, `${c.dim("PR:")} ${f.prUrl || c.dim("— not opened (run /audit-pr)")}`),
            node(
              `flow:${f.id}:qa`,
              `${c.dim("QA:")} ${
                Object.keys(f.qaEnvs ?? {}).length
                  ? Object.entries(f.qaEnvs)
                      .map(([e, s]) => `${e}=${s === "approved" ? c.green(s) : s === "rejected" ? c.red(s) : c.yellow(s)}`)
                      .join(" · ")
                  : c.dim("— not in QA yet")
              }`,
            ),
            node(
              `flow:${f.id}:cov`,
              `${c.dim("coverage:")} ${covStatusOf(f.id)}${covStatusOf(f.id) === "verified" ? c.green(" ✓ guaranteed") : c.yellow(" (not guaranteed yet)")}`,
            ),
          ],
        );
      }),
    ),
  );

  // Legend — plain-language explanations of coverage, tiers and the pipeline.
  sections.push(
    node("sec:legend", `${c.bold("Legend")} ${c.dim("(what these mean)")}`, [
      node(
        "legend:coverage",
        `${c.bold("Coverage %")} = share of behaviors/areas proven identical to the reference`,
        [
          node("legend:cov:1", c.dim("Counts only VERIFIED rows (QA-approved AND merged).")),
          node("legend:cov:2", c.dim("It is NOT code/line coverage — it is behavioral parity.")),
          node("legend:cov:3", c.dim("Locally-resolved rows show as 'pending QA' and do NOT count.")),
        ],
      ),
      node("legend:tiers", `${c.bold("Tiers")} = strength of the evidence behind a finding`, [
        node("legend:t0", `${c.red("tier-0")} ${c.dim("text description only (weakest)")}`),
        node("legend:t1", `${c.yellow("tier-1")} ${c.dim("paired screenshots (reference vs new)")}`),
        node("legend:t2", `${c.magenta("tier-2")} ${c.dim("automated data-to-data diff (/audit-compare)")}`),
        node("legend:t3", `${c.green("tier-3")} ${c.dim("tier-2 + a passing characterization test (strongest)")}`),
      ]),
      node("legend:flow", `${c.bold("Pipeline")} = the life of a finding`, [
        node("legend:f1", c.dim("new → captured · investigated → root cause understood")),
        node("legend:f2", c.dim("resolved → fix done locally (NOT guaranteed yet)")),
        node("legend:f3", c.dim("QA local → validated on localhost BEFORE the PR (blocks /audit-pr)")),
        node("legend:f4", c.dim("PR → dossier opened · deploy to dev/staging/prod")),
        node("legend:f5", c.dim("QA env → validated on the target environment AFTER deploy")),
        node("legend:f6", `${c.dim("verified → target-env QA approved + merged ")}${c.green("(guaranteed)")}`),
      ]),
    ]),
  );

  return sections;
}

/** Pick the sections shown by a tab. Overview shows the operational sections. */
export function sectionsForTab(tree: TreeNode[], tabIndex: number): TreeNode[] {
  const only = (id: string) => tree.filter((n) => n.id === id);
  switch (TABS[tabIndex]) {
    case "Flow":
      return only("sec:flow");
    case "Worktrees":
      return only("sec:worktrees");
    case "Findings":
      return only("sec:findings");
    case "Active":
      return only("sec:active");
    case "Coverage":
      return only("sec:coverage");
    case "Legend":
      return only("sec:legend");
    default:
      // Overview: everything except the Flow and Legend detail views.
      return tree.filter((n) => n.id !== "sec:flow" && n.id !== "sec:legend");
  }
}

// --- Flatten (pure) ---------------------------------------------------------

/** Flatten a section list into visible rows given the expanded node ids. */
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

// --- Input parsing (pure) ---------------------------------------------------

export type Key =
  | "up" | "down" | "left" | "right"
  | "enter" | "esc" | "tab" | "shifttab" | "quit" | "";

/** Map a raw stdin chunk to a canonical key name (ignores mouse sequences). */
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
    case "\t":
      return "tab";
    case "\x1b[Z":
      return "shifttab";
    case "\x1b":
      return "esc";
    case "q":
    case "\x03":
      return "quit";
    default:
      return "";
  }
}

export interface MouseEvent {
  kind: "press" | "release" | "wheel-up" | "wheel-down";
  x: number; // 1-based column
  y: number; // 1-based row
}

/** Parse an SGR mouse sequence (\x1b[<b;x;yM|m). Returns null if not a mouse event. */
export function parseMouse(data: string): MouseEvent | null {
  const m = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!m) return null;
  const button = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (button === 64) return { kind: "wheel-up", x, y };
  if (button === 65) return { kind: "wheel-down", x, y };
  return { kind: m[4] === "M" ? "press" : "release", x, y };
}

/** Column spans (1-based, inclusive) of each tab label in the rendered tab bar. */
export function tabSpans(): { index: number; start: number; end: number }[] {
  const spans: { index: number; start: number; end: number }[] = [];
  let col = 1;
  TABS.forEach((t, i) => {
    const cell = ` ${t} `;
    const start = col;
    col += cell.length;
    spans.push({ index: i, start, end: col - 1 });
    if (i < TABS.length - 1) col += 1; // the "│" separator
  });
  return spans;
}

/**
 * Map a click at (x,y) to a tab, a content row, or nothing. `contentStart` is
 * the 1-based terminal row of the first content line (varies when the Overview
 * banner is shown), defaulting to the no-banner layout.
 */
export function hitTest(
  rows: Row[],
  x: number,
  y: number,
  contentStart: number = CONTENT_START,
): { kind: "tab"; index: number } | { kind: "row"; index: number } | null {
  if (y === TAB_ROW) {
    for (const s of tabSpans()) {
      if (x >= s.start && x <= s.end) return { kind: "tab", index: s.index };
    }
    return null;
  }
  const rowIndex = y - contentStart;
  if (rowIndex >= 0 && rowIndex < rows.length) return { kind: "row", index: rowIndex };
  return null;
}

/** The number of content-shifting lines a banner occupies (banner + a rule). */
export function bannerHeight(banner: string[]): number {
  return banner.length > 0 ? banner.length + 1 : 0;
}

/** Colored at-a-glance summary shown at the top of the Overview tab. */
export function summaryBanner(state: AuditState): string[] {
  const pct = Math.round((state.coveragePct ?? 0) * 10) / 10;
  const verified = state.coverage.filter((r) => r.status === "verified").length;
  const pending = state.coverage.filter((r) => r.status === "resolved").length;
  const total = state.coverage.length;

  const fs = state.findings ?? [];
  const lc = (k: string) => fs.filter((f) => findingLifecycle(f) === k).length;
  const tier = (t: string) => fs.filter((f) => f.confidence === t).length;

  const pendingTag = pending > 0 ? c.yellow(` +${pending} pending QA`) : "";
  return [
    `${c.bold("Coverage")}  ${progressBar(pct)} ${c.bold(`${pct}%`)} ${c.dim(`(${verified}/${total} verified)`)}${pendingTag}`,
    `${c.bold("Confidence")}  ${c.red("t0:" + tier("tier-0"))}  ${c.yellow("t1:" + tier("tier-1"))}  ${c.magenta("t2:" + tier("tier-2"))}  ${c.green("t3:" + tier("tier-3"))}`,
    `${c.bold("Findings")}  ${c.red("open:" + lc("open"))}  ${c.yellow("in-progress:" + lc("in-progress"))}  ${c.green("done:" + lc("done"))}   ${c.cyan("worktrees:" + (state.worktrees?.length ?? 0))}   ${c.green("active:" + (state.activity?.length ?? 0))}`,
  ];
}

// --- Reducers (pure) --------------------------------------------------------

/** Apply a keyboard key to the UI state. `rows` is the current flattening. */
export function reduce(ui: UiState, key: Key, rows: Row[]): UiState {
  const expanded = new Set(ui.expanded);
  let { cursor, tab } = ui;
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
      if (row && row.expandable && row.expanded) expanded.delete(row.id);
      else if (row && row.parentIndex >= 0) cursor = row.parentIndex;
      break;
    case "tab":
      tab = (tab + 1) % TABS.length;
      cursor = 0;
      break;
    case "shifttab":
      tab = (tab - 1 + TABS.length) % TABS.length;
      cursor = 0;
      break;
    default:
      break;
  }
  return { tab, cursor, expanded };
}

/** Toggle a node's expansion (used by mouse clicks on a row). */
export function toggleAt(ui: UiState, rowIndex: number, rows: Row[]): UiState {
  const expanded = new Set(ui.expanded);
  const row = rows[rowIndex];
  if (row && row.expandable) {
    if (row.expanded) expanded.delete(row.id);
    else expanded.add(row.id);
  }
  return { ...ui, cursor: rowIndex, expanded };
}

/** Jump to a specific tab (used by mouse clicks on the tab bar). */
export function gotoTab(ui: UiState, index: number): UiState {
  return { ...ui, tab: index, cursor: 0 };
}

// --- Frame renderer (pure) --------------------------------------------------

function tabBar(active: number): string {
  return TABS.map((t, i) => {
    const cell = ` ${t} `;
    return i === active ? c.reverse(c.bold(cell)) : c.dim(cell);
  }).join(c.dim("│"));
}

/** Render a full frame (title, tab bar, hint, optional banner, rows) as a string. */
export function renderFrame(
  tab: number,
  rows: Row[],
  cursor: number,
  live = true,
  banner: string[] = [],
  mouseOn = true,
  note = "",
): string {
  const out: string[] = [];
  out.push(c.bold(c.cyan("PDD Board — Parity-Driven Development")));
  out.push(tabBar(tab)); // line index 1 → terminal row TAB_ROW
  const mouseHint = mouseOn
    ? "click on · m to select/copy"
    : c.green("select/copy on · m for click");
  out.push(
    c.dim(`↑/↓ move · →/enter expand · Tab switch · ${mouseHint} · q quit`) +
      (live ? "   " + c.green("● live") : ""),
  );
  out.push(c.dim("─".repeat(60)));
  if (banner.length > 0) {
    for (const b of banner) out.push(b);
    out.push(c.dim("─".repeat(60)));
  }
  if (rows.length === 0) out.push(c.dim("  (empty)"));
  rows.forEach((r, i) => {
    const indent = "  ".repeat(r.depth);
    const marker = r.expandable ? (r.expanded ? "▾" : "▸") : " ";
    if (i === cursor) out.push(c.reverse(`${indent}${marker} ${r.plain}`));
    else out.push(`${indent}${marker} ${r.label}`);
  });
  out.push(c.dim("─".repeat(60)));
  if (note) out.push(c.yellow(note));
  return out.join("\n");
}

// --- Imperative shell -------------------------------------------------------

// Alt screen + hide cursor. Mouse (SGR: 1000 = clicks, 1006 = coords) is toggled
// separately so the user can switch to native text selection/copy with `m`.
const ALT_ON = "\x1b[?1049h\x1b[?25l";
const ALT_OFF = "\x1b[?25h\x1b[?1049l";
const MOUSE_ON = "\x1b[?1000h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1000l\x1b[?1006l";
const CLEAR = "\x1b[2J\x1b[H";

/** Launch the interactive TUI against an `.audit` directory. */
export function runTui(auditDir: string, note = ""): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const state = readMergedAuditState(auditDir);
    const rows = flatten(sectionsForTab(buildTree(state), 0), new Set(DEFAULT_EXPANDED));
    process.stdout.write(renderFrame(0, rows, -1, false, summaryBanner(state), true, note) + "\n");
    return;
  }

  let ui: UiState = { tab: 0, cursor: 0, expanded: new Set(DEFAULT_EXPANDED) };
  let state = readMergedAuditState(auditDir);
  let tree = buildTree(state);
  let mouseOn = true; // clicks captured; press `m` to switch to select/copy mode

  const visibleRows = () => flatten(sectionsForTab(tree, ui.tab), ui.expanded);
  // The colored summary banner is shown only on the Overview tab.
  const currentBanner = () => (ui.tab === 0 ? summaryBanner(state) : []);
  const currentContentStart = () => CONTENT_START + bannerHeight(currentBanner());

  const draw = () => {
    const rows = visibleRows();
    if (ui.cursor > rows.length - 1) ui.cursor = Math.max(rows.length - 1, 0);
    process.stdout.write(
      CLEAR + renderFrame(ui.tab, rows, ui.cursor, true, currentBanner(), mouseOn, note),
    );
  };

  const cleanup = () => {
    try {
      stdin.setRawMode(false);
    } catch {}
    stdin.pause();
    process.stdout.write(MOUSE_OFF + ALT_OFF);
    process.exit(0);
  };

  process.stdout.write(ALT_ON + MOUSE_ON);
  draw();

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", (d: string) => {
    // `m` toggles mouse capture so text selection / copy works natively.
    if (d === "m") {
      mouseOn = !mouseOn;
      process.stdout.write(mouseOn ? MOUSE_ON : MOUSE_OFF);
      draw();
      return;
    }
    const mouse = mouseOn ? parseMouse(d) : null;
    if (mouse) {
      const rows = visibleRows();
      if (mouse.kind === "wheel-up") ui = reduce(ui, "up", rows);
      else if (mouse.kind === "wheel-down") ui = reduce(ui, "down", rows);
      else if (mouse.kind === "press") {
        const hit = hitTest(rows, mouse.x, mouse.y, currentContentStart());
        if (hit?.kind === "tab") ui = gotoTab(ui, hit.index);
        else if (hit?.kind === "row") ui = toggleAt(ui, hit.index, rows);
      }
      draw();
      return;
    }
    const key = parseKey(d);
    if (key === "quit") return cleanup();
    if (key === "") return;
    ui = reduce(ui, key, visibleRows());
    draw();
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    watch(auditDir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        state = readMergedAuditState(auditDir);
        tree = buildTree(state);
        draw();
      }, 120);
    });
  } catch {
    // Recursive watch unsupported — nav still works, just no live refresh.
  }

  // Redraw on terminal resize so the layout never looks stale.
  process.stdout.on("resize", draw);

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
