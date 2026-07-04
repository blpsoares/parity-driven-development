#!/usr/bin/env node

// scripts/pdd/index.ts
import { watch as watch2, existsSync as existsSync4 } from "node:fs";
import { join as join4, resolve as resolve3, isAbsolute, dirname as dirname3 } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/pdd/state.ts
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
function parseFrontmatter(content) {
  const out = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return out;
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
function readFinding(findingDir) {
  const readmePath = join(findingDir, "README.md");
  if (!existsSync(readmePath)) return null;
  const fm = parseFrontmatter(readFileSync(readmePath, "utf8"));
  const resolutionPath = join(findingDir, "resolution.md");
  const hasResolution = existsSync(resolutionPath);
  const qaEnvs = {};
  for (const [key, value] of Object.entries(fm)) {
    const m = key.match(/^qa-([a-z0-9]+)$/);
    if (m && m[1] !== "status") qaEnvs[m[1]] = value;
  }
  let prUrl = "";
  if (hasResolution) {
    const m = readFileSync(resolutionPath, "utf8").match(/pr_url:\s*(\S+)/);
    const raw = m ? m[1].replace(/^["']|["']$/g, "") : "";
    if (raw && !raw.startsWith("<")) prUrl = raw;
  }
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
    hasResolution,
    qaEnvs,
    prUrl,
    dir: findingDir
  };
}
function readFindingsFrom(parent) {
  if (!existsSync(parent)) return [];
  const findings = [];
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
function splitRow(row) {
  let line = row.trim();
  if (line.startsWith("|")) line = line.slice(1);
  if (line.endsWith("|")) line = line.slice(0, -1);
  return line.split("|").map((c3) => c3.trim());
}
function isSeparatorRow(cells) {
  return cells.every((c3) => /^:?-{2,}:?$/.test(c3.replace(/\s/g, "")));
}
function parseCoverage(content) {
  const rows = [];
  const tableLines = content.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (tableLines.length === 0) return rows;
  let seenSeparator = false;
  for (const line of tableLines) {
    const cells = splitRow(line);
    if (isSeparatorRow(cells)) {
      seenSeparator = true;
      continue;
    }
    if (!seenSeparator) {
      const lowered = cells.map((c3) => c3.toLowerCase());
      if (lowered.some((c3) => c3.includes("behavior") || c3.includes("status"))) {
        continue;
      }
    }
    rows.push({
      behavior: cells[0] ?? "",
      referenceCase: cells[1] ?? "",
      status: cells[2] ?? "",
      tier: cells[3] ?? "",
      finding: cells[4] ?? ""
    });
  }
  return rows;
}
function parseBoard(content) {
  const sections = [];
  let current = null;
  for (const line of content.split("\n")) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        lines: []
      };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}
function readAuditState(dir) {
  const findings = [
    ...readFindingsFrom(join(dir, "findings")),
    ...readFindingsFrom(join(dir, "resolved"))
  ];
  const coveragePath = join(dir, "coverage.md");
  const coverage = existsSync(coveragePath) ? parseCoverage(readFileSync(coveragePath, "utf8")) : [];
  const boardPath = join(dir, "board.md");
  const board = existsSync(boardPath) ? parseBoard(readFileSync(boardPath, "utf8")) : [];
  const total = coverage.length;
  const verified = coverage.filter((r) => r.status === "verified").length;
  const coveragePct = total === 0 ? 0 : verified / total * 100;
  return { findings, coverage, board, coveragePct };
}
function progressRank(f) {
  if (f.hasResolution || f.status === "resolved") return 3;
  if (f.hasInvestigation || f.status === "investigated") return 2;
  return 1;
}
function parseWorktreePorcelain(output) {
  const out = [];
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
function mergeFindings(rootFindings, worktrees) {
  const chosen = /* @__PURE__ */ new Map();
  const key = (f) => f.id || f.slug || f.dir;
  for (const f of rootFindings) {
    chosen.set(key(f), { f, fromWorktree: false, rank: progressRank(f) });
  }
  for (const wt of worktrees) {
    for (const f of wt.findings) {
      const k = key(f);
      const cur = chosen.get(k);
      const rank = progressRank(f);
      if (!cur || cur.fromWorktree === false || // worktree beats root
      cur.fromWorktree && rank >= cur.rank) {
        chosen.set(k, { f, fromWorktree: true, rank });
      }
    }
  }
  return [...chosen.values()].map((c3) => c3.f).sort((a, b) => (a.id || "").localeCompare(b.id || ""));
}
function activityDirs(auditDir) {
  const dirs = [join(auditDir, "activity")];
  const repoRoot = dirname(auditDir);
  const rootResolved = resolve(repoRoot);
  for (const wt of listWorktrees(repoRoot)) {
    if (resolve(wt.path) === rootResolved) continue;
    dirs.push(join(wt.path, ".audit", "activity"));
  }
  return dirs;
}
function pruneStaleActivity(auditDir, now = Date.now()) {
  const removed = [];
  for (const dir of activityDirs(auditDir)) {
    for (const a of readActivityFrom(dir, now)) {
      if (!a.stale) continue;
      try {
        unlinkSync(a.file);
        removed.push(a.file);
      } catch {
      }
    }
  }
  return removed;
}
function listWorktrees(repoRoot) {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return parseWorktreePorcelain(out);
  } catch {
    return [];
  }
}
var ACTIVITY_STALE_MS = 30 * 60 * 1e3;
function readActivityFrom(activityDir, now) {
  if (!existsSync(activityDir)) return [];
  const out = [];
  for (const entry of readdirSync(activityDir)) {
    if (!entry.endsWith(".json")) continue;
    const file = join(activityDir, entry);
    try {
      const rec = JSON.parse(readFileSync(file, "utf8"));
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
        stale: ageMs > ACTIVITY_STALE_MS
      });
    } catch {
    }
  }
  return out;
}
function dedupeActivity(records) {
  const seen = /* @__PURE__ */ new Map();
  for (const a of records) {
    const k = `${a.command}|${a.finding}|${a.worktree}|${a.startedAt}`;
    const cur = seen.get(k);
    if (!cur || a.ageMs < cur.ageMs) seen.set(k, a);
  }
  return [...seen.values()].sort((a, b) => a.ageMs - b.ageMs);
}
function readMergedAuditState(auditDir, now = Date.now()) {
  const base = readAuditState(auditDir);
  const repoRoot = dirname(auditDir);
  const rootResolved = resolve(repoRoot);
  const worktrees = [];
  const activity = readActivityFrom(join(auditDir, "activity"), now);
  for (const wt of listWorktrees(repoRoot)) {
    if (resolve(wt.path) === rootResolved) continue;
    const wtAudit = join(wt.path, ".audit");
    const hasAudit = existsSync(wtAudit);
    const findings = hasAudit ? [
      ...readFindingsFrom(join(wtAudit, "findings")),
      ...readFindingsFrom(join(wtAudit, "resolved"))
    ].map((f) => ({
      ...f,
      sourceKind: "worktree",
      sourcePath: wt.path,
      sourceBranch: wt.branch
    })) : [];
    if (hasAudit) {
      activity.push(...readActivityFrom(join(wtAudit, "activity"), now));
    }
    worktrees.push({
      path: wt.path,
      branch: wt.branch,
      auditDir: hasAudit ? wtAudit : null,
      findings
    });
  }
  const rootTagged = base.findings.map((f) => ({
    ...f,
    sourceKind: "root",
    sourcePath: auditDir
  }));
  return {
    ...base,
    findings: mergeFindings(rootTagged, worktrees),
    worktrees,
    activity: dedupeActivity(activity)
  };
}

// scripts/pdd/render.ts
var ESC = "\x1B[";
var RESET = `${ESC}0m`;
var color = {
  reset: RESET,
  bold: (s) => `${ESC}1m${s}${RESET}`,
  dim: (s) => `${ESC}2m${s}${RESET}`,
  red: (s) => `${ESC}31m${s}${RESET}`,
  green: (s) => `${ESC}32m${s}${RESET}`,
  yellow: (s) => `${ESC}33m${s}${RESET}`,
  blue: (s) => `${ESC}34m${s}${RESET}`,
  magenta: (s) => `${ESC}35m${s}${RESET}`,
  cyan: (s) => `${ESC}36m${s}${RESET}`
};
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
var FULL_BLOCK = "\u2588";
var LIGHT_SHADE = "\u2591";
function progressBar(pct, width = 24) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round(clamped / 100 * width);
  const empty = width - filled;
  const paint = clamped >= 80 ? color.green : clamped >= 50 ? color.yellow : color.red;
  return paint(FULL_BLOCK.repeat(filled)) + color.dim(LIGHT_SHADE.repeat(empty));
}
var TIER_COLOR = {
  "tier-0": color.red,
  "tier-1": color.yellow,
  "tier-2": color.magenta,
  // orange-ish (no true orange in 16-color)
  "tier-3": color.green
};
var TIER_ORDER = ["tier-0", "tier-1", "tier-2", "tier-3"];
function countBy(items, key) {
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
function inProgressLines(state) {
  const section = state.board.find(
    (s) => /in[\s-]?progress|em andamento|doing/i.test(s.heading)
  );
  if (!section) return [];
  const placeholder = /^<\s*(empty|vazio|none|nenhum)\s*>$/i;
  return section.lines.map((l) => l.trim()).filter((l) => l.length > 0 && !placeholder.test(l));
}
function findingState(f) {
  if (f.hasResolution || f.status === "resolved") return "resolved";
  if (f.hasInvestigation || f.status === "investigated") return "in-progress";
  return "open";
}
function shortPath(p) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}
function humanAge(ms) {
  if (!Number.isFinite(ms)) return "?";
  const s = Math.floor(ms / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
function renderBoard(state) {
  const lines = [];
  const rule = color.dim("\u2500".repeat(48));
  lines.push(color.bold(color.cyan("PDD Board \u2014 Parity-Driven Development")));
  lines.push(rule);
  const pct = Math.round(state.coveragePct * 10) / 10;
  const verified = state.coverage.filter((r) => r.status === "verified").length;
  const pending = state.coverage.filter((r) => r.status === "resolved").length;
  const total = state.coverage.length;
  lines.push(
    `${color.bold("Coverage")}  ${progressBar(pct)}  ${color.bold(`${pct}%`)} ` + color.dim(`(${verified}/${total} verified`) + (pending > 0 ? color.yellow(` \xB7 +${pending} pending QA`) : "") + color.dim(")")
  );
  lines.push("");
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
  lines.push(color.bold("Confidence distribution"));
  const byTier = countBy(state.findings, (f) => f.confidence || "unknown");
  const tiers = [
    ...TIER_ORDER,
    ...[...byTier.keys()].filter((k) => !TIER_ORDER.includes(k))
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
  const activity = state.activity ?? [];
  lines.push(color.bold("Active now"));
  if (activity.length === 0) {
    lines.push(color.dim("  (no executions running)"));
  } else {
    const byCmd = /* @__PURE__ */ new Map();
    for (const a of activity) {
      const label = (a.finding ? a.finding : "\u2014") + (a.stale ? "?" : "");
      const arr = byCmd.get(a.command) ?? [];
      arr.push(label);
      byCmd.set(a.command, arr);
    }
    for (const [cmd, ids] of [...byCmd.entries()].sort()) {
      lines.push(
        `  ${color.green("\u25CF")} ${color.bold(String(ids.length))}\xD7 ${cmd} ` + color.dim(`(${ids.join(", ")})`)
      );
    }
    for (const a of activity) {
      const where = a.worktree && a.worktree !== "none" && a.worktree !== "root" ? shortPath(a.worktree) : "root";
      const who = a.agent ? ` ${color.dim("@" + a.agent)}` : "";
      const staleTag = a.stale ? color.red(" stale") : "";
      lines.push(
        color.dim(
          `    \u21B3 ${a.command} ${a.finding || "\u2014"} [${where}] ${humanAge(a.ageMs)}`
        ) + who + staleTag
      );
    }
  }
  lines.push("");
  const worktrees = state.worktrees ?? [];
  lines.push(color.bold("Worktrees"));
  if (worktrees.length === 0) {
    lines.push(color.dim("  (none active)"));
  } else {
    lines.push(`  ${color.bold(String(worktrees.length))} active`);
    for (const wt of worktrees) {
      const head = `  ${color.cyan("\u25B8")} ${wt.branch} ${color.dim(`[${shortPath(wt.path)}]`)}`;
      if (wt.findings.length === 0) {
        lines.push(`${head} ${color.dim("(no .audit)")}`);
        continue;
      }
      for (const f of wt.findings) {
        const paint = TIER_COLOR[f.confidence] ?? color.dim;
        lines.push(
          `${head}  ${color.bold(f.id || "\u2014")} ${paint(String(f.confidence || "tier-?"))} ` + color.dim(`\xB7 ${findingState(f)}`)
        );
      }
    }
  }
  lines.push("");
  lines.push(color.bold("In progress"));
  const doing = inProgressLines(state);
  if (doing.length === 0) {
    lines.push(color.dim("  (nothing in progress)"));
  } else {
    for (const item of doing) {
      const text = item.replace(/^[-*]\s*\[[ x]\]\s*/i, "").replace(/^[-*]\s*/, "");
      lines.push(`  ${color.yellow("\u25B6")} ${text}`);
    }
  }
  lines.push(rule);
  return lines.join("\n");
}

// scripts/pdd/tui.ts
import { watch } from "node:fs";

// scripts/pdd/i18n.ts
var EN = {
  // Tabs
  tab_overview: "Overview",
  tab_flow: "Flow",
  tab_worktrees: "Worktrees",
  tab_findings: "Findings",
  tab_active: "Active",
  tab_coverage: "Coverage",
  tab_legend: "Legend",
  // Hint line
  hint_move: "move",
  hint_expand: "expand",
  hint_collapse: "collapse",
  hint_switch: "Tab switch",
  hint_quit: "q quit",
  hint_lang: "L: PT-BR",
  live: "live",
  mouse_click: "click on \xB7 m to select/copy",
  mouse_select: "select/copy on \xB7 m for click",
  // Section titles / words
  coverage: "Coverage",
  confidence: "Confidence",
  findings: "Findings",
  worktrees: "Worktrees",
  active_now: "Active now",
  flow_sub: "pipeline per finding",
  legend_sub: "what these mean",
  n_active: "active",
  verified: "verified",
  pending_qa: "pending QA",
  worktrees_lc: "worktrees",
  active_lc: "active",
  in_progress_title: "In progress",
  // Lifecycle
  open: "open",
  in_progress: "in-progress",
  resolved: "resolved",
  // Empty states
  none: "(none)",
  empty: "(empty)",
  no_exec: "(no executions running)",
  none_active: "(none active)",
  nothing_in_progress: "(nothing in progress)",
  no_audit_wt: "(no .audit in worktree)",
  // Flow detail
  pr_label: "PR:",
  qa_label: "QA:",
  coverage_label: "coverage:",
  pr_not_opened: "\u2014 not opened (run /audit-pr)",
  qa_not_yet: "\u2014 not in QA yet",
  guaranteed: "\u2713 guaranteed",
  not_guaranteed: "(not guaranteed yet)",
  // Pipeline stages
  st_new: "new",
  st_investigated: "investigated",
  st_resolved: "resolved",
  st_qa_local: "QA local",
  st_pr: "PR",
  st_qa_env: "QA env",
  st_verified: "verified",
  // Legend — coverage
  lg_coverage_title: "Coverage % = share of behaviors/areas proven identical to the reference",
  lg_cov_1: "Counts only VERIFIED rows (QA-approved AND merged).",
  lg_cov_2: "It is NOT code/line coverage \u2014 it is behavioral parity.",
  lg_cov_3: "Locally-resolved rows show as 'pending QA' and do NOT count.",
  // Legend — tiers
  lg_tiers_title: "Tiers = strength of the evidence behind a finding",
  lg_t0: "text description only (weakest)",
  lg_t1: "paired screenshots (reference vs new)",
  lg_t2: "automated data-to-data diff (/audit-compare)",
  lg_t3: "tier-2 + a passing characterization test (strongest)",
  // Legend — pipeline
  lg_flow_title: "Pipeline = the life of a finding",
  lg_f1: "new \u2192 captured \xB7 investigated \u2192 root cause understood",
  lg_f2: "resolved \u2192 fix done locally (NOT guaranteed yet)",
  lg_f3: "QA local \u2192 validated on localhost BEFORE the PR (blocks /audit-pr)",
  lg_f4: "PR \u2192 dossier opened \xB7 deploy to dev/staging/prod",
  lg_f5: "QA env \u2192 validated on the target environment AFTER deploy",
  lg_f6: "verified \u2192 target-env QA approved + merged (guaranteed)",
  // Legend — commands (execution order)
  lg_cmd_title: "Commands (execution order) \u2014 what each does in practice",
  lg_cmd_1: "1. /audit-bootstrap \u2014 setup once: interview \u2192 BOOTSTRAP + coverage + QA envs",
  lg_cmd_2: "2. /audit-new <desc> \u2014 capture a divergence as a finding (forces observable facts)",
  lg_cmd_3: "3. /audit-investigate NNN \u2014 find the root cause (read-only, no fix)",
  lg_cmd_4: "4. /audit-resolve NNN \u2014 implement the fix + characterization test (never commits)",
  lg_cmd_5: "5. /audit-compare NNN \u2014 run both systems, generate the objective parity diff",
  lg_cmd_6: "6. /audit-qa NNN local \u2014 validate on localhost, BEFORE the PR (unblocks /audit-pr)",
  lg_cmd_7: "7. /audit-pr NNN \u2014 open the PR evidence dossier (needs qa-local approved)",
  lg_cmd_8: "8. /audit-qa NNN staging|prod \u2014 validate on the deployed env \u2192 coverage 'verified'",
  lg_cmd_9: "\xB7 /audit-status \u2014 dashboard at any time (or the 'pdd' CLI)"
};
var PT = {
  tab_overview: "Vis\xE3o geral",
  tab_flow: "Fluxo",
  tab_worktrees: "Worktrees",
  tab_findings: "Findings",
  tab_active: "Ativos",
  tab_coverage: "Cobertura",
  tab_legend: "Guia",
  hint_move: "mover",
  hint_expand: "expandir",
  hint_collapse: "recolher",
  hint_switch: "Tab troca",
  hint_quit: "q sai",
  hint_lang: "L: EN",
  live: "ao vivo",
  mouse_click: "clica on \xB7 m p/ selecionar/copiar",
  mouse_select: "sele\xE7\xE3o on \xB7 m p/ clicar",
  coverage: "Cobertura",
  confidence: "Confian\xE7a",
  findings: "Findings",
  worktrees: "Worktrees",
  active_now: "Ativos agora",
  flow_sub: "pipeline por finding",
  legend_sub: "o que significam",
  n_active: "ativas",
  verified: "verificados",
  pending_qa: "pendente QA",
  worktrees_lc: "worktrees",
  active_lc: "ativos",
  in_progress_title: "Em andamento",
  open: "aberto",
  in_progress: "em-andamento",
  resolved: "resolvido",
  none: "(nenhum)",
  empty: "(vazio)",
  no_exec: "(nada executando)",
  none_active: "(nenhuma ativa)",
  nothing_in_progress: "(nada em andamento)",
  no_audit_wt: "(sem .audit na worktree)",
  pr_label: "PR:",
  qa_label: "QA:",
  coverage_label: "cobertura:",
  pr_not_opened: "\u2014 n\xE3o aberto (rode /audit-pr)",
  qa_not_yet: "\u2014 ainda sem QA",
  guaranteed: "\u2713 garantido",
  not_guaranteed: "(ainda n\xE3o garantido)",
  st_new: "novo",
  st_investigated: "investigado",
  st_resolved: "resolvido",
  st_qa_local: "QA local",
  st_pr: "PR",
  st_qa_env: "QA amb",
  st_verified: "verificado",
  lg_coverage_title: "Cobertura % = quanto dos comportamentos/\xE1reas foi provado id\xEAntico \xE0 refer\xEAncia",
  lg_cov_1: "Conta s\xF3 linhas VERIFICADAS (QA aprovado E mergeado).",
  lg_cov_2: "N\xC3O \xE9 cobertura de c\xF3digo/linha \u2014 \xE9 paridade de comportamento.",
  lg_cov_3: "Linhas resolvidas localmente aparecem como 'pendente QA' e N\xC3O contam.",
  lg_tiers_title: "Tiers = for\xE7a da evid\xEAncia por tr\xE1s de um finding",
  lg_t0: "s\xF3 descri\xE7\xE3o em texto (mais fraca)",
  lg_t1: "screenshots pareados (refer\xEAncia vs novo)",
  lg_t2: "diff autom\xE1tico dado-a-dado (/audit-compare)",
  lg_t3: "tier-2 + um teste de caracteriza\xE7\xE3o passando (mais forte)",
  lg_flow_title: "Pipeline = a vida de um finding",
  lg_f1: "novo \u2192 capturado \xB7 investigado \u2192 causa raiz entendida",
  lg_f2: "resolvido \u2192 fix feito localmente (AINDA n\xE3o garantido)",
  lg_f3: "QA local \u2192 validado no localhost ANTES do PR (trava o /audit-pr)",
  lg_f4: "PR \u2192 dossi\xEA aberto \xB7 deploy pra dev/staging/prod",
  lg_f5: "QA amb \u2192 validado no ambiente-alvo DEPOIS do deploy",
  lg_f6: "verificado \u2192 QA do ambiente-alvo aprovado + mergeado (garantido)",
  lg_cmd_title: "Comandos (ordem de execu\xE7\xE3o) \u2014 o que cada um faz na pr\xE1tica",
  lg_cmd_1: "1. /audit-bootstrap \u2014 setup 1x: entrevista \u2192 BOOTSTRAP + cobertura + ambientes de QA",
  lg_cmd_2: "2. /audit-new <desc> \u2014 captura uma diverg\xEAncia como finding (exige fato observ\xE1vel)",
  lg_cmd_3: "3. /audit-investigate NNN \u2014 acha a causa raiz (s\xF3 leitura, n\xE3o corrige)",
  lg_cmd_4: "4. /audit-resolve NNN \u2014 implementa o fix + teste de caracteriza\xE7\xE3o (nunca commita)",
  lg_cmd_5: "5. /audit-compare NNN \u2014 roda os 2 sistemas, gera o diff objetivo de paridade",
  lg_cmd_6: "6. /audit-qa NNN local \u2014 valida no localhost, ANTES do PR (destrava o /audit-pr)",
  lg_cmd_7: "7. /audit-pr NNN \u2014 abre o PR-dossi\xEA de evid\xEAncias (precisa do qa-local aprovado)",
  lg_cmd_8: "8. /audit-qa NNN staging|prod \u2014 valida no ambiente \u2192 cobertura vira 'verificado'",
  lg_cmd_9: "\xB7 /audit-status \u2014 painel a qualquer momento (ou a CLI 'pdd')"
};
var DICTS = { en: EN, pt: PT };
function t(lang, key) {
  return DICTS[lang]?.[key] ?? EN[key] ?? key;
}

// scripts/pdd/tui.ts
var ESC2 = "\x1B[";
var R = `${ESC2}0m`;
var c = {
  bold: (s) => `${ESC2}1m${s}${R}`,
  dim: (s) => `${ESC2}2m${s}${R}`,
  red: (s) => `${ESC2}31m${s}${R}`,
  green: (s) => `${ESC2}32m${s}${R}`,
  yellow: (s) => `${ESC2}33m${s}${R}`,
  magenta: (s) => `${ESC2}35m${s}${R}`,
  cyan: (s) => `${ESC2}36m${s}${R}`,
  reverse: (s) => `${ESC2}7m${s}${R}`
};
var TIER_COLOR2 = {
  "tier-0": c.red,
  "tier-1": c.yellow,
  "tier-2": c.magenta,
  "tier-3": c.green
};
var TABS = [
  "Overview",
  "Flow",
  "Worktrees",
  "Findings",
  "Active",
  "Coverage",
  "Legend"
];
var TAB_I18N = [
  "tab_overview",
  "tab_flow",
  "tab_worktrees",
  "tab_findings",
  "tab_active",
  "tab_coverage",
  "tab_legend"
];
function tabLabel(i, lang) {
  return t(lang, TAB_I18N[i]);
}
var DEFAULT_EXPANDED = [
  "sec:flow",
  "sec:worktrees",
  "sec:findings",
  "sec:active",
  "sec:legend",
  "findings:open",
  "findings:in-progress",
  "findings:resolved"
];
var TAB_ROW = 2;
var CONTENT_START = 5;
function node(id, label, children = []) {
  return { id, label, children };
}
function findingLifecycle(f) {
  if (f.hasResolution || f.status === "resolved") return "resolved";
  if (f.hasInvestigation || f.status === "investigated") return "in-progress";
  return "open";
}
function pipelineStages(f, coverageStatus) {
  const resolved = f.hasResolution || f.status === "resolved";
  const qa = f.qaEnvs ?? {};
  const localApproved = qa.local === "approved";
  const envApproved = Object.entries(qa).some(([e, s]) => e !== "local" && s === "approved");
  const stages = [
    { key: "new", label: "new", done: true },
    { key: "investigated", label: "investigated", done: f.hasInvestigation || resolved },
    { key: "resolved", label: "resolved", done: resolved },
    { key: "qa-local", label: "QA local", done: localApproved },
    { key: "pr", label: "PR", done: Boolean(f.prUrl) },
    { key: "qa-env", label: "QA env", done: envApproved },
    { key: "verified", label: "verified", done: coverageStatus === "verified" }
  ];
  for (let i = stages.length - 2; i >= 0; i--) {
    if (stages[i + 1].done) stages[i].done = true;
  }
  return stages;
}
function currentStageIndex(stages) {
  const i = stages.findIndex((s) => !s.done);
  return i === -1 ? stages.length - 1 : i;
}
var STAGE_I18N = {
  new: "st_new",
  investigated: "st_investigated",
  resolved: "st_resolved",
  "qa-local": "st_qa_local",
  pr: "st_pr",
  "qa-env": "st_qa_env",
  verified: "st_verified"
};
function stageLabel(stage, lang) {
  return t(lang, STAGE_I18N[stage.key] ?? stage.key);
}
function renderPipeline(stages, lang = "en") {
  const cur = currentStageIndex(stages);
  return stages.map((s, i) => {
    const label = stageLabel(s, lang);
    const dot = s.done ? c.green("\u25CF") : i === cur ? c.yellow("\u25C9") : c.dim("\u25CB");
    const name = s.done ? c.green(label) : i === cur ? c.yellow(label) : c.dim(label);
    return `${dot} ${name}`;
  }).join(c.dim(" \u2500 "));
}
function pipelineDots(stages) {
  const cur = currentStageIndex(stages);
  return stages.map((s, i) => s.done ? c.green("\u25CF") : i === cur ? c.yellow("\u25C9") : c.dim("\u25CB")).join("");
}
function last(p) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}
function age(ms) {
  if (!Number.isFinite(ms)) return "?";
  const s = Math.floor(ms / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}
function buildTree(state, lang = "en") {
  const sections = [];
  const tr = (k) => t(lang, k);
  const lifeKey = (k) => k === "in-progress" ? "in_progress" : k;
  const pct = Math.round((state.coveragePct ?? 0) * 10) / 10;
  const verified = state.coverage.filter((r) => r.status === "verified").length;
  sections.push(
    node(
      "sec:coverage",
      `${c.bold(tr("coverage"))} ${pct}% ${c.dim(`(${verified}/${state.coverage.length} ${tr("verified")})`)}`,
      state.coverage.map(
        (r, i) => node(
          `cov:${i}`,
          `${r.behavior} ${c.dim(`\u2014 ${r.status}${r.tier ? " " + r.tier : ""}${r.finding ? " #" + r.finding : ""}`)}`
        )
      )
    )
  );
  const wts = state.worktrees ?? [];
  sections.push(
    node(
      "sec:worktrees",
      `${c.bold(tr("worktrees"))} ${c.dim(`(${wts.length} ${tr("n_active")})`)}`,
      wts.map((wt) => {
        const detail = [
          node(`wt:${wt.path}:branch`, `${c.dim("branch:")} ${wt.branch}`),
          node(`wt:${wt.path}:path`, `${c.dim("path:")} ${wt.path}`),
          node(
            `wt:${wt.path}:audit`,
            `${c.dim("audit:")} ${wt.auditDir ? wt.auditDir : tr("no_audit_wt")}`
          )
        ];
        for (const f of wt.findings) {
          const paint = TIER_COLOR2[f.confidence] ?? c.dim;
          detail.push(
            node(
              `wt:${wt.path}:f:${f.id}`,
              `${c.dim("finding")} ${c.bold(f.id)} ${paint(String(f.confidence))} ${c.dim("\xB7 " + tr(lifeKey(findingLifecycle(f))))}`
            )
          );
        }
        return node(
          `wt:${wt.path}`,
          `${c.cyan(wt.branch)} ${c.dim(`[${last(wt.path)}]`)}`,
          detail
        );
      })
    )
  );
  const fs = state.findings ?? [];
  const findingNode = (f) => {
    const paint = TIER_COLOR2[f.confidence] ?? c.dim;
    const src = f.sourceKind === "worktree" && f.sourceBranch ? ` ${c.dim("@" + f.sourceBranch)}` : "";
    return node(
      `finding:${f.id}`,
      `${c.bold(f.id)} ${f.title} ${paint(String(f.confidence))}${src}`,
      [
        node(`finding:${f.id}:area`, `${c.dim("area:")} ${f.area || "\u2014"}`),
        node(`finding:${f.id}:sev`, `${c.dim("severity:")} ${f.severity || "\u2014"}`),
        node(`finding:${f.id}:conf`, `${c.dim("confidence:")} ${f.confidence || "\u2014"}`),
        node(`finding:${f.id}:wt`, `${c.dim("worktree:")} ${f.worktree || "none"}`),
        node(
          `finding:${f.id}:files`,
          `${c.dim("files:")} README${f.hasInvestigation ? " \xB7 investigation" : ""}${f.hasResolution ? " \xB7 resolution" : ""}`
        ),
        node(`finding:${f.id}:dir`, `${c.dim("dir:")} ${f.dir}`)
      ]
    );
  };
  const order = [
    { key: "open", paint: c.red },
    { key: "in-progress", paint: c.yellow },
    { key: "resolved", paint: c.green }
  ];
  const groups = [];
  for (const g of order) {
    const inGroup = fs.filter((f) => findingLifecycle(f) === g.key);
    if (inGroup.length === 0) continue;
    const ids = inGroup.map((f) => f.id).join(", ");
    groups.push(
      node(
        `findings:${g.key}`,
        `${g.paint(tr(lifeKey(g.key)))} ${c.dim(`(${inGroup.length}) \u2014 ${ids}`)}`,
        inGroup.map(findingNode)
      )
    );
  }
  sections.push(
    node("sec:findings", `${c.bold(tr("findings"))} ${c.dim(`(${fs.length})`)}`, groups)
  );
  const acts = state.activity ?? [];
  sections.push(
    node(
      "sec:active",
      `${c.bold(tr("active_now"))} ${c.dim(`(${acts.length})`)}`,
      acts.map((a, i) => {
        const where = a.worktree && a.worktree !== "none" && a.worktree !== "root" ? last(a.worktree) : "root";
        const staleTag = a.stale ? c.red(" stale") : "";
        const who = a.agent ? c.dim(" @" + a.agent) : "";
        return node(
          `act:${i}`,
          `${c.green("\u25CF")} ${a.command} ${c.bold(a.finding || "\u2014")} ${c.dim(`[${where}] ${age(a.ageMs)}`)}${who}${staleTag}`
        );
      })
    )
  );
  const covStatusOf = (fid) => state.coverage.find((r) => r.finding === fid)?.status ?? "not-started";
  sections.push(
    node(
      "sec:flow",
      `${c.bold(tr("tab_flow"))} ${c.dim(`(${tr("flow_sub")})`)}`,
      fs.map((f) => {
        const stages = pipelineStages(f, covStatusOf(f.id));
        const cur = stages[currentStageIndex(stages)];
        return node(
          `flow:${f.id}`,
          `${c.bold(f.id)} ${f.title}  ${pipelineDots(stages)} ${c.dim("\u2192 " + stageLabel(cur, lang))}`,
          [
            node(`flow:${f.id}:line`, renderPipeline(stages, lang)),
            node(`flow:${f.id}:pr`, `${c.dim(tr("pr_label"))} ${f.prUrl || c.dim(tr("pr_not_opened"))}`),
            node(
              `flow:${f.id}:qa`,
              `${c.dim(tr("qa_label"))} ${Object.keys(f.qaEnvs ?? {}).length ? Object.entries(f.qaEnvs).map(([e, s]) => `${e}=${s === "approved" ? c.green(s) : s === "rejected" ? c.red(s) : c.yellow(s)}`).join(" \xB7 ") : c.dim(tr("qa_not_yet"))}`
            ),
            node(
              `flow:${f.id}:cov`,
              `${c.dim(tr("coverage_label"))} ${covStatusOf(f.id)}${covStatusOf(f.id) === "verified" ? c.green(" " + tr("guaranteed")) : c.yellow(" " + tr("not_guaranteed"))}`
            )
          ]
        );
      })
    )
  );
  sections.push(
    node("sec:legend", `${c.bold(tr("tab_legend"))} ${c.dim(`(${tr("legend_sub")})`)}`, [
      node("legend:coverage", `${c.bold(tr("lg_coverage_title"))}`, [
        node("legend:cov:1", c.dim(tr("lg_cov_1"))),
        node("legend:cov:2", c.dim(tr("lg_cov_2"))),
        node("legend:cov:3", c.dim(tr("lg_cov_3")))
      ]),
      node("legend:tiers", `${c.bold(tr("lg_tiers_title"))}`, [
        node("legend:t0", `${c.red("tier-0")} ${c.dim(tr("lg_t0"))}`),
        node("legend:t1", `${c.yellow("tier-1")} ${c.dim(tr("lg_t1"))}`),
        node("legend:t2", `${c.magenta("tier-2")} ${c.dim(tr("lg_t2"))}`),
        node("legend:t3", `${c.green("tier-3")} ${c.dim(tr("lg_t3"))}`)
      ]),
      node("legend:flow", `${c.bold(tr("lg_flow_title"))}`, [
        node("legend:f1", c.dim(tr("lg_f1"))),
        node("legend:f2", c.dim(tr("lg_f2"))),
        node("legend:f3", c.dim(tr("lg_f3"))),
        node("legend:f4", c.dim(tr("lg_f4"))),
        node("legend:f5", c.dim(tr("lg_f5"))),
        node("legend:f6", c.dim(tr("lg_f6")))
      ]),
      node("legend:commands", `${c.bold(tr("lg_cmd_title"))}`, [
        node("legend:c1", c.dim(tr("lg_cmd_1"))),
        node("legend:c2", c.dim(tr("lg_cmd_2"))),
        node("legend:c3", c.dim(tr("lg_cmd_3"))),
        node("legend:c4", c.dim(tr("lg_cmd_4"))),
        node("legend:c5", c.dim(tr("lg_cmd_5"))),
        node("legend:c6", c.dim(tr("lg_cmd_6"))),
        node("legend:c7", c.dim(tr("lg_cmd_7"))),
        node("legend:c8", c.dim(tr("lg_cmd_8"))),
        node("legend:c9", c.dim(tr("lg_cmd_9")))
      ])
    ])
  );
  return sections;
}
function sectionsForTab(tree, tabIndex) {
  const only = (id) => tree.filter((n) => n.id === id);
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
      return tree.filter((n) => n.id !== "sec:flow" && n.id !== "sec:legend");
  }
}
function flatten(nodes, expanded) {
  const rows = [];
  const walk = (list, depth, parentIndex) => {
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
        parentIndex
      });
      if (isExpanded && n.children.length > 0) walk(n.children, depth + 1, idx);
    }
  };
  walk(nodes, 0, -1);
  return rows;
}
function parseKey(data) {
  switch (data) {
    case "\x1B[A":
    case "k":
      return "up";
    case "\x1B[B":
    case "j":
      return "down";
    case "\x1B[C":
    case "l":
      return "right";
    case "\x1B[D":
    case "h":
      return "left";
    case "\r":
    case "\n":
      return "enter";
    case "	":
      return "tab";
    case "\x1B[Z":
      return "shifttab";
    case "\x1B":
      return "esc";
    case "q":
    case "":
      return "quit";
    default:
      return "";
  }
}
function parseMouse(data) {
  const m = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!m) return null;
  const button = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (button === 64) return { kind: "wheel-up", x, y };
  if (button === 65) return { kind: "wheel-down", x, y };
  return { kind: m[4] === "M" ? "press" : "release", x, y };
}
function tabSpans(lang = "en") {
  const spans = [];
  let col = 1;
  TABS.forEach((_key, i) => {
    const cell = ` ${tabLabel(i, lang)} `;
    const start = col;
    col += cell.length;
    spans.push({ index: i, start, end: col - 1 });
    if (i < TABS.length - 1) col += 1;
  });
  return spans;
}
function hitTest(rows, x, y, contentStart = CONTENT_START, lang = "en") {
  if (y === TAB_ROW) {
    for (const s of tabSpans(lang)) {
      if (x >= s.start && x <= s.end) return { kind: "tab", index: s.index };
    }
    return null;
  }
  const rowIndex = y - contentStart;
  if (rowIndex >= 0 && rowIndex < rows.length) return { kind: "row", index: rowIndex };
  return null;
}
function bannerHeight(banner) {
  return banner.length > 0 ? banner.length + 1 : 0;
}
function summaryBanner(state, lang = "en") {
  const tr = (k) => t(lang, k);
  const pct = Math.round((state.coveragePct ?? 0) * 10) / 10;
  const verified = state.coverage.filter((r) => r.status === "verified").length;
  const pending = state.coverage.filter((r) => r.status === "resolved").length;
  const total = state.coverage.length;
  const fs = state.findings ?? [];
  const lc = (k) => fs.filter((f) => findingLifecycle(f) === k).length;
  const tierCount = (tv) => fs.filter((f) => f.confidence === tv).length;
  const pendingTag = pending > 0 ? c.yellow(` +${pending} ${tr("pending_qa")}`) : "";
  return [
    `${c.bold(tr("coverage"))}  ${progressBar(pct)} ${c.bold(`${pct}%`)} ${c.dim(`(${verified}/${total} ${tr("verified")})`)}${pendingTag}`,
    `${c.bold(tr("confidence"))}  ${c.red("t0:" + tierCount("tier-0"))}  ${c.yellow("t1:" + tierCount("tier-1"))}  ${c.magenta("t2:" + tierCount("tier-2"))}  ${c.green("t3:" + tierCount("tier-3"))}`,
    `${c.bold(tr("findings"))}  ${c.red(tr("open") + ":" + lc("open"))}  ${c.yellow(tr("in_progress") + ":" + lc("in-progress"))}  ${c.green(tr("resolved") + ":" + lc("resolved"))}   ${c.cyan(tr("worktrees_lc") + ":" + (state.worktrees?.length ?? 0))}   ${c.green(tr("active_lc") + ":" + (state.activity?.length ?? 0))}`
  ];
}
function reduce(ui, key, rows) {
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
function toggleAt(ui, rowIndex, rows) {
  const expanded = new Set(ui.expanded);
  const row = rows[rowIndex];
  if (row && row.expandable) {
    if (row.expanded) expanded.delete(row.id);
    else expanded.add(row.id);
  }
  return { ...ui, cursor: rowIndex, expanded };
}
function gotoTab(ui, index) {
  return { ...ui, tab: index, cursor: 0 };
}
function tabBar(active, lang) {
  return TABS.map((_key, i) => {
    const cell = ` ${tabLabel(i, lang)} `;
    return i === active ? c.reverse(c.bold(cell)) : c.dim(cell);
  }).join(c.dim("\u2502"));
}
function renderFrame(tab, rows, cursor, live = true, banner = [], mouseOn = true, note = "", lang = "en") {
  const out = [];
  out.push(c.bold(c.cyan("PDD Board \u2014 Parity-Driven Development")));
  out.push(tabBar(tab, lang));
  const mouseHint = mouseOn ? t(lang, "mouse_click") : c.green(t(lang, "mouse_select"));
  out.push(
    c.dim(
      `\u2191/\u2193 ${t(lang, "hint_move")} \xB7 \u2192/enter ${t(lang, "hint_expand")} \xB7 ${t(lang, "hint_switch")} \xB7 ${mouseHint} \xB7 ${t(lang, "hint_lang")} \xB7 ${t(lang, "hint_quit")}`
    ) + (live ? "   " + c.green("\u25CF " + t(lang, "live")) : "")
  );
  out.push(c.dim("\u2500".repeat(60)));
  if (banner.length > 0) {
    for (const b of banner) out.push(b);
    out.push(c.dim("\u2500".repeat(60)));
  }
  if (rows.length === 0) out.push(c.dim(t(lang, "empty")));
  rows.forEach((r, i) => {
    const indent = "  ".repeat(r.depth);
    const marker = r.expandable ? r.expanded ? "\u25BE" : "\u25B8" : " ";
    if (i === cursor) out.push(c.reverse(`${indent}${marker} ${r.plain}`));
    else out.push(`${indent}${marker} ${r.label}`);
  });
  out.push(c.dim("\u2500".repeat(60)));
  if (note) out.push(c.yellow(note));
  return out.join("\n");
}
var ALT_ON = "\x1B[?1049h\x1B[?25l";
var ALT_OFF = "\x1B[?25h\x1B[?1049l";
var MOUSE_ON = "\x1B[?1000h\x1B[?1006h";
var MOUSE_OFF = "\x1B[?1000l\x1B[?1006l";
var CLEAR = "\x1B[2J\x1B[H";
function runTui(auditDir, note = "", lang = "en") {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const state2 = readMergedAuditState(auditDir);
    const rows = flatten(sectionsForTab(buildTree(state2, lang), 0), new Set(DEFAULT_EXPANDED));
    process.stdout.write(
      renderFrame(0, rows, -1, false, summaryBanner(state2, lang), true, note, lang) + "\n"
    );
    return;
  }
  let ui = { tab: 0, cursor: 0, expanded: new Set(DEFAULT_EXPANDED) };
  let state = readMergedAuditState(auditDir);
  let curLang = lang;
  let tree = buildTree(state, curLang);
  let mouseOn = true;
  const visibleRows = () => flatten(sectionsForTab(tree, ui.tab), ui.expanded);
  const currentBanner = () => ui.tab === 0 ? summaryBanner(state, curLang) : [];
  const currentContentStart = () => CONTENT_START + bannerHeight(currentBanner());
  const draw = () => {
    const rows = visibleRows();
    if (ui.cursor > rows.length - 1) ui.cursor = Math.max(rows.length - 1, 0);
    process.stdout.write(
      CLEAR + renderFrame(ui.tab, rows, ui.cursor, true, currentBanner(), mouseOn, note, curLang)
    );
  };
  const cleanup = () => {
    try {
      stdin.setRawMode(false);
    } catch {
    }
    stdin.pause();
    process.stdout.write(MOUSE_OFF + ALT_OFF);
    process.exit(0);
  };
  process.stdout.write(ALT_ON + MOUSE_ON);
  draw();
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", (d) => {
    if (d === "m") {
      mouseOn = !mouseOn;
      process.stdout.write(mouseOn ? MOUSE_ON : MOUSE_OFF);
      draw();
      return;
    }
    if (d === "L") {
      curLang = curLang === "en" ? "pt" : "en";
      tree = buildTree(state, curLang);
      draw();
      return;
    }
    const mouse = mouseOn ? parseMouse(d) : null;
    if (mouse) {
      const rows = visibleRows();
      if (mouse.kind === "wheel-up") ui = reduce(ui, "up", rows);
      else if (mouse.kind === "wheel-down") ui = reduce(ui, "down", rows);
      else if (mouse.kind === "press") {
        const hit = hitTest(rows, mouse.x, mouse.y, currentContentStart(), curLang);
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
  let timer = null;
  try {
    watch(auditDir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        state = readMergedAuditState(auditDir);
        tree = buildTree(state, curLang);
        draw();
      }, 120);
    });
  } catch {
  }
  process.stdout.on("resize", draw);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// scripts/pdd/adapt.ts
import { readFileSync as readFileSync2, readdirSync as readdirSync2, existsSync as existsSync2, mkdirSync, writeFileSync } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";
import { homedir } from "node:os";
function parseSkill(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const front = m ? m[1] : "";
  const body = (m ? m[2] : md).trim();
  const name = (front.match(/name:\s*["']?([^"'\n]+?)["']?\s*$/m)?.[1] ?? "").trim();
  const description = (front.match(/description:\s*["']?([\s\S]*?)["']?\s*\n[a-z-]+:/)?.[1] ?? "").replace(/\s+/g, " ").trim();
  return { name, description, body };
}
var PROJECT_SKILL_DIR = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  cursor: ".cursor/skills",
  copilot: ".github/skills",
  gemini: ".gemini/skills"
};
var GLOBAL_SKILL_DIR = {
  ...PROJECT_SKILL_DIR,
  copilot: ".copilot/skills"
};
var NATURAL_ARGS = "the arguments the user typed after the command";
function withArgs(body) {
  return body.split("$ARGUMENTS").join(NATURAL_ARGS);
}
function deClaude(s) {
  return s.replace(/\bClaude Code\b/g, "the agent").replace(/\bClaude\b/g, "the agent");
}
function renderSkillFor(harness, skill, global) {
  const body = harness === "claude" ? skill.body : deClaude(withArgs(skill.body));
  const description = harness === "claude" ? skill.description : deClaude(skill.description);
  const dir = global ? GLOBAL_SKILL_DIR[harness] : PROJECT_SKILL_DIR[harness];
  return {
    relPath: `${dir}/${skill.name}/SKILL.md`,
    content: `---
name: ${skill.name}
description: ${description}
---

${body}
`
  };
}
function baseDirFor(projectRoot, global) {
  return global ? homedir() : projectRoot;
}
function readSkills(skillsDir) {
  if (!existsSync2(skillsDir)) return [];
  const out = [];
  for (const entry of readdirSync2(skillsDir)) {
    const file = join2(skillsDir, entry, "SKILL.md");
    if (existsSync2(file)) out.push(parseSkill(readFileSync2(file, "utf8")));
  }
  return out.filter((s) => s.name);
}
function rulesBody() {
  return [
    "This project uses PDD (Parity-Driven Development) \u2014 a framework for tracking behavioral parity during refactors, rewrites and ports.",
    "",
    "**Update awareness:** when you begin PDD work here, run `pdd check` in the terminal. If it reports a `\u{1F514} update available` notice, tell the user in one short line, offer to summarize what changed (the CHANGELOG), and offer to run `pdd update`. Do not bring it up again if they decline.",
    "",
    "Commands: `/audit-bootstrap`, `/audit-new`, `/audit-investigate`, `/audit-resolve`, `/audit-compare`, `/audit-qa <env>`, `/audit-pr`, `/audit-status`. Full method and reference: `AGENTS.md`."
  ].join("\n");
}
function rulesTargetFor(harness) {
  switch (harness) {
    case "cursor":
      return { relPath: ".cursor/rules/pdd.mdc", mode: "overwrite" };
    case "copilot":
      return { relPath: ".github/instructions/pdd.instructions.md", mode: "overwrite" };
    case "codex":
      return { relPath: "AGENTS.md", mode: "block" };
    case "gemini":
      return { relPath: "GEMINI.md", mode: "block" };
    case "claude":
      return null;
  }
}
function rulesFileContent(harness) {
  const body = rulesBody();
  if (harness === "cursor")
    return `---
description: PDD update-awareness and command reference
alwaysApply: true
---

${body}
`;
  if (harness === "copilot") return `---
applyTo: "**"
---

${body}
`;
  return body;
}
var PDD_BEGIN = "<!-- PDD:BEGIN (managed by pdd) -->";
var PDD_END = "<!-- PDD:END -->";
function upsertBlock(existing, body) {
  const block = `${PDD_BEGIN}
${body}
${PDD_END}`;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc(PDD_BEGIN) + "[\\s\\S]*?" + esc(PDD_END));
  if (re.test(existing)) return existing.replace(re, block);
  return (existing.trim() ? existing.trimEnd() + "\n\n" : "") + block + "\n";
}
function writeRules(harness, projectRoot) {
  const target = rulesTargetFor(harness);
  if (!target) return null;
  const { relPath, mode } = target;
  const targetPath = join2(projectRoot, relPath);
  mkdirSync(join2(targetPath, ".."), { recursive: true });
  if (mode === "overwrite") {
    writeFileSync(targetPath, rulesFileContent(harness));
  } else {
    const existing = existsSync2(targetPath) ? readFileSync2(targetPath, "utf8") : "";
    writeFileSync(targetPath, upsertBlock(existing, rulesBody()));
  }
  return targetPath;
}
function assertSafeProjectRoot(projectRoot, global) {
  if (global) return;
  if (resolve2(projectRoot) === homedir()) {
    throw new Error(
      `refusing to install into your home directory (${homedir()}) without --global.
cd into your project first, or pass --global if you really want a global install.`
    );
  }
}
function adaptAll(harness, opts) {
  assertSafeProjectRoot(opts.projectRoot, opts.global);
  const base = baseDirFor(opts.projectRoot, opts.global);
  const written = [];
  for (const skill of readSkills(opts.skillsDir)) {
    const { relPath, content } = renderSkillFor(harness, skill, opts.global);
    const target = join2(base, relPath);
    mkdirSync(join2(target, ".."), { recursive: true });
    writeFileSync(target, content);
    written.push(target);
  }
  if (opts.rules !== false) {
    const rulePath = writeRules(harness, opts.projectRoot);
    if (rulePath) written.push(rulePath);
  }
  return written;
}

// scripts/pdd/prompt.ts
var ESC3 = "\x1B[";
var R2 = `${ESC3}0m`;
var c2 = {
  bold: (s) => `${ESC3}1m${s}${R2}`,
  dim: (s) => `${ESC3}2m${s}${R2}`,
  cyan: (s) => `${ESC3}36m${s}${R2}`,
  green: (s) => `${ESC3}32m${s}${R2}`
};
function parseMenuKey(data) {
  switch (data) {
    case "\x1B[A":
    case "k":
      return "up";
    case "\x1B[B":
    case "j":
      return "down";
    case " ":
      return "space";
    case "a":
      return "all";
    case "\r":
    case "\n":
      return "enter";
    case "\x1B":
    case "q":
    case "":
      return "cancel";
    default:
      return "";
  }
}
function reduceMenu(s, key, count, multi) {
  if (count === 0) return s;
  const checked = new Set(s.checked);
  let cursor = s.cursor;
  switch (key) {
    case "up":
      cursor = (cursor - 1 + count) % count;
      break;
    case "down":
      cursor = (cursor + 1) % count;
      break;
    case "space":
      if (multi) checked.has(cursor) ? checked.delete(cursor) : checked.add(cursor);
      break;
    case "all":
      if (multi) {
        if (checked.size === count) checked.clear();
        else for (let i = 0; i < count; i++) checked.add(i);
      }
      break;
    default:
      break;
  }
  return { cursor, checked };
}
function frameTitle(title) {
  const width = Math.max(40, title.length + 4);
  const pad = width - title.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return [
    "\u250F" + "\u2501".repeat(width) + "\u2513",
    "\u2503" + " ".repeat(left) + title + " ".repeat(right) + "\u2503",
    "\u2517" + "\u2501".repeat(width) + "\u251B"
  ].join("\n");
}
function renderMenu(title, items, s, multi) {
  const lines = [c2.bold(frameTitle(title)), ""];
  items.forEach((it, i) => {
    const pointer = i === s.cursor ? c2.cyan("\u276F") : " ";
    const box = multi ? s.checked.has(i) ? c2.green("\u25C9") : "\u25EF" : i === s.cursor ? c2.green("\u25C9") : "\u25EF";
    const label = i === s.cursor ? c2.bold(it.label) : it.label;
    lines.push(`  ${pointer} ${box} ${label}${it.hint ? c2.dim("  " + it.hint) : ""}`);
  });
  lines.push("");
  lines.push(
    c2.dim(
      multi ? "  \u2191/\u2193 move \xB7 space toggle \xB7 a all \xB7 enter confirm \xB7 esc cancel" : "  \u2191/\u2193 move \xB7 enter select \xB7 esc cancel"
    )
  );
  return lines.join("\n");
}
function runMenu(title, items, opts) {
  return new Promise((resolve4) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      resolve4(null);
      return;
    }
    let s = {
      cursor: opts.cursor ?? 0,
      checked: new Set(opts.preChecked ?? [])
    };
    const draw = () => process.stdout.write("\x1B[2J\x1B[H" + renderMenu(title, items, s, opts.multi) + "\n");
    const cleanup = () => {
      try {
        stdin.setRawMode(false);
      } catch {
      }
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    const onData = (d) => {
      const key = parseMenuKey(d);
      if (key === "cancel") {
        cleanup();
        resolve4(null);
        return;
      }
      if (key === "enter") {
        const result = opts.multi ? [...s.checked].sort((a, b) => a - b) : [s.cursor];
        cleanup();
        resolve4(result);
        return;
      }
      if (key === "") return;
      s = reduceMenu(s, key, items.length, opts.multi);
      draw();
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    draw();
  });
}

// scripts/pdd/update.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join3, dirname as dirname2 } from "node:path";
import { homedir as homedir2 } from "node:os";
var PLUGIN_JSON_URL = "https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/.claude-plugin/plugin.json";
var CACHE_FILE = join3(homedir2(), ".pdd", "update-check.json");
var DAY_MS = 24 * 60 * 60 * 1e3;
function parseVersion(v) {
  return (v || "").split(".").map((n) => parseInt(n, 10) || 0);
}
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
function isNewer(latest, installed) {
  return compareVersions(latest, installed) > 0;
}
function readInstalledVersion(pluginRoot) {
  try {
    const j = JSON.parse(
      readFileSync3(join3(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")
    );
    return j.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function formatNotice(installed, latest) {
  if (!isNewer(latest, installed)) return null;
  return `\u{1F514} PDD ${latest} available (you have ${installed}) \u2014 run 'pdd update'`;
}
function cacheIsStale(cache, now) {
  if (!cache) return true;
  const t2 = Date.parse(cache.checkedAt);
  return Number.isNaN(t2) || now - t2 > DAY_MS;
}
function readCache() {
  try {
    return JSON.parse(readFileSync3(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeCache(latest, now) {
  try {
    mkdirSync2(dirname2(CACHE_FILE), { recursive: true });
    writeFileSync2(
      CACHE_FILE,
      JSON.stringify({ checkedAt: new Date(now).toISOString(), latest })
    );
  } catch {
  }
}
async function fetchLatest(timeoutMs = 2500) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(PLUGIN_JSON_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    return j.version ?? null;
  } catch {
    return null;
  }
}
function cachedNotice(pluginRoot) {
  if (process.env.PDD_NO_UPDATE_CHECK === "1") return null;
  const cache = readCache();
  if (!cache) return null;
  return formatNotice(readInstalledVersion(pluginRoot), cache.latest);
}
function refreshCacheIfStale(now) {
  if (process.env.PDD_NO_UPDATE_CHECK === "1") return;
  if (!cacheIsStale(readCache(), now)) return;
  void fetchLatest().then((v) => {
    if (v) writeCache(v, now);
  });
}
async function checkNow(pluginRoot, now) {
  const installed = readInstalledVersion(pluginRoot);
  const latest = await fetchLatest(5e3);
  if (!latest) return `Could not reach the update server. You have PDD ${installed}.`;
  writeCache(latest, now);
  return isNewer(latest, installed) ? formatNotice(installed, latest) : `PDD is up to date (${installed}).`;
}

// scripts/pdd/index.ts
import { spawnSync } from "node:child_process";
var HERE = dirname3(fileURLToPath(import.meta.url));
function findUpDir(start, marker) {
  let dir = start;
  for (; ; ) {
    if (existsSync4(join4(dir, marker))) return dir;
    const parent = dirname3(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}
var PLUGIN_ROOT = findUpDir(HERE, "skills");
var SKILLS_DIR = join4(PLUGIN_ROOT, "skills");
var IS_GIT_CLONE = existsSync4(join4(PLUGIN_ROOT, ".git"));
var PLUGIN_INSTALL_TIP = "\u{1F4A1} Running from a git clone. For native skills + auto-update in Claude Code:\n   claude plugin marketplace add blpsoares/parity-driven-development\n   claude plugin install pdd@parity-driven-development\n";
function whichBin(bin) {
  const sep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return (process.env.PATH ?? "").split(sep).some((p) => p && exts.some((ext) => existsSync4(join4(p, bin + ext))));
}
function findAuditUpwards(start) {
  let dir = start;
  for (; ; ) {
    if (existsSync4(join4(dir, ".audit"))) return join4(dir, ".audit");
    const parent = dirname3(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function resolveAuditDir(pathArg) {
  if (pathArg) {
    const base = isAbsolute(pathArg) ? pathArg : resolve3(process.cwd(), pathArg);
    return base.endsWith(".audit") ? base : join4(base, ".audit");
  }
  return findAuditUpwards(process.cwd()) ?? join4(process.cwd(), ".audit");
}
function clearScreen() {
  process.stdout.write("\x1B[2J\x1B[H");
}
function renderOnce(auditDir) {
  if (!existsSync4(auditDir)) {
    process.stdout.write(
      `No .audit directory found at ${auditDir}
Run /audit-bootstrap first to initialize PDD.
`
    );
    return;
  }
  const state = readMergedAuditState(auditDir);
  process.stdout.write(renderBoard(state) + "\n");
}
function watchBoard(auditDir) {
  const render = () => {
    clearScreen();
    renderOnce(auditDir);
    process.stdout.write(
      `
\x1B[2mwatching ${auditDir} \u2014 press Ctrl+C to exit\x1B[0m
`
    );
  };
  render();
  if (!existsSync4(auditDir)) return;
  let timer = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 120);
  };
  try {
    watch2(auditDir, { recursive: true }, debounced);
  } catch {
    watch2(auditDir, debounced);
  }
}
function detectHarnesses(all, projectRoot) {
  const home = process.env.HOME ?? "";
  const has = (bin, dir) => Boolean(whichBin(bin)) || dir !== "" && existsSync4(dir);
  const map = {
    claude: has("claude", join4(home, ".claude")),
    codex: has("codex", join4(home, ".codex")),
    cursor: has("cursor", join4(home, ".cursor")),
    gemini: has("gemini", join4(home, ".gemini")),
    // Copilot is a VS Code/JetBrains feature — infer from a project .github dir.
    copilot: existsSync4(join4(projectRoot, ".github"))
  };
  return all.filter((h) => map[h]);
}
async function runUpdate() {
  if (!IS_GIT_CLONE) {
    process.stdout.write(
      "This PDD is installed as a Claude Code plugin. Update it with:\n  claude plugin update pdd@parity-driven-development\nThen run 'pdd init' to refresh any Codex/Cursor/Copilot/Gemini/Claude command files.\n"
    );
    return;
  }
  process.stdout.write("Updating PDD\u2026\n");
  const pull = spawnSync("git", ["-C", PLUGIN_ROOT, "pull", "--ff-only"], {
    encoding: "utf8"
  });
  process.stdout.write((pull.stdout || "") + (pull.stderr || ""));
  if (pull.status !== 0) {
    process.stdout.write("git pull failed \u2014 resolve it and retry.\n");
    return;
  }
  const all = ["claude", "codex", "cursor", "copilot", "gemini"];
  const skillsDir = join4(PLUGIN_ROOT, "skills");
  const detected = detectHarnesses(all, process.cwd());
  for (const harness of detected) {
    const written = adaptAll(harness, { skillsDir, projectRoot: process.cwd(), global: false });
    process.stdout.write(`\u21BB ${harness}: ${written.length} command(s) refreshed
`);
  }
  process.stdout.write(`\u2705 Updated to ${readInstalledVersion(PLUGIN_ROOT)}.
`);
}
async function runInit(args) {
  const all = ["claude", "codex", "cursor", "copilot", "gemini"];
  const projectRoot = process.cwd();
  const skillsDir = SKILLS_DIR;
  const explicit = args.slice(1).filter((a) => all.includes(a));
  const detected = detectHarnesses(all, projectRoot);
  if (IS_GIT_CLONE) process.stdout.write(PLUGIN_INSTALL_TIP + "\n");
  let targets;
  let global = args.includes("--global");
  if (explicit.length > 0 || !process.stdin.isTTY || args.includes("--global")) {
    targets = explicit.length > 0 ? explicit : detected;
    if (targets.length === 0) {
      process.stdout.write(
        "No agent detected. Try: pdd init claude | codex | cursor | copilot | gemini\n"
      );
      return;
    }
  } else {
    const items = all.map((h) => ({ label: h }));
    const picked = await runMenu("Install PDD commands for which agents?", items, {
      multi: true
    });
    if (!picked || picked.length === 0) {
      process.stdout.write("Cancelled \u2014 nothing installed.\n");
      return;
    }
    targets = picked.map((i) => all[i]);
    const scope = await runMenu(
      "Install scope?",
      [{ label: "project", hint: projectRoot }, { label: "global", hint: "your home config" }],
      { multi: false }
    );
    if (scope === null) {
      process.stdout.write("Cancelled \u2014 nothing installed.\n");
      return;
    }
    global = scope[0] === 1;
  }
  process.stdout.write("\n");
  for (const harness of targets) {
    const written = adaptAll(harness, { skillsDir, projectRoot, global, rules: !args.includes("--no-rules") });
    const where = global ? "home config" : "project";
    process.stdout.write(`\u2705 ${harness} \u2192 ${written.length} command(s) in ${where}
`);
  }
  process.stdout.write("\nInvoke /audit-bootstrap in your agent to begin.\n");
}
async function main(argv) {
  const args = argv.slice(2);
  const command = args[0] ?? "tui";
  if (command === "version" || command === "--version" || command === "-v") {
    process.stdout.write(`pdd ${readInstalledVersion(PLUGIN_ROOT)}
`);
    return;
  }
  if (command === "check") {
    process.stdout.write(await checkNow(PLUGIN_ROOT, Date.now()) + "\n");
    return;
  }
  if (command === "update") {
    await runUpdate();
    return;
  }
  if (command === "init" || command === "install") {
    await runInit(args);
    return;
  }
  if (command === "adapt") {
    const harnesses = ["claude", "codex", "cursor", "copilot", "gemini"];
    const harness = args[1];
    if (!harnesses.includes(harness)) {
      process.stdout.write(
        `Usage: pdd adapt <${harnesses.join("|")}> [--global] [project-dir]
Generates PDD slash-command / prompt files for that agent from the canonical skills.
`
      );
      process.exitCode = 1;
      return;
    }
    const global = args.includes("--global");
    const projectRoot = args.slice(2).find((a) => !a.startsWith("-")) ?? process.cwd();
    const skillsDir = SKILLS_DIR;
    const written = adaptAll(harness, { skillsDir, projectRoot, global, rules: !args.includes("--no-rules") });
    if (written.length === 0) {
      process.stdout.write("No skills found to adapt.\n");
    } else {
      process.stdout.write(`Wrote ${written.length} ${harness} command file(s):
`);
      for (const f of written) process.stdout.write(`  ${f}
`);
    }
    return;
  }
  if (command !== "board" && command !== "tui" && command !== "prune") {
    process.stdout.write(
      "pdd \u2014 Parity-Driven Development dashboard\n\nUsage:\n  pdd                       Interactive, navigable dashboard (default)\n  pdd tui [path]            Interactive dashboard (\u2191/\u2193 navigate, \u2192/enter expand, q quit)\n  pdd board [path]          Print a static snapshot once\n  pdd board --watch [path]  Static auto-refresh on .audit changes\n  pdd prune [path]          Remove stale/orphaned activity records\n  pdd init [harness...]     Install PDD commands into detected agents (or the ones given)\n  pdd install [harness...]  Alias for `pdd init`\n  pdd adapt <harness>       Generate command files for one of Claude/Codex/Cursor/Copilot/Gemini\n  pdd check                 Check whether a newer PDD version is available\n  pdd update                Update PDD (git clone) or show how (Claude plugin)\n  pdd version               Print the installed version\n\nWith no [path], pdd walks up from the current directory to find .audit.\n"
    );
    process.exitCode = 1;
    return;
  }
  const rest = args.slice(1);
  const watchMode = rest.includes("--watch");
  const pathArg = rest.find((a) => !a.startsWith("--"));
  const auditDir = resolveAuditDir(pathArg);
  if (command === "prune") {
    const removed = pruneStaleActivity(auditDir);
    if (removed.length === 0) {
      process.stdout.write("No stale activity records found.\n");
    } else {
      process.stdout.write(`Removed ${removed.length} stale activity record(s):
`);
      for (const f of removed) process.stdout.write(`  ${f}
`);
    }
  } else if (command === "tui") {
    refreshCacheIfStale(Date.now());
    const lang = args.includes("--pt") || process.env.PDD_LANG === "pt" ? "pt" : "en";
    runTui(auditDir, cachedNotice(PLUGIN_ROOT) ?? void 0, lang);
  } else if (watchMode) {
    watchBoard(auditDir);
  } else {
    renderOnce(auditDir);
    const notice = cachedNotice(PLUGIN_ROOT);
    if (notice) process.stdout.write("\n" + notice + "\n");
  }
}
main(process.argv).catch((err) => {
  process.stderr.write(`pdd: ${err?.message ?? err}
`);
  process.exit(1);
});
