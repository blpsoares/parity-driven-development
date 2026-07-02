// PDD 2.0 — tests for the interactive TUI core (pure functions only).

import { test, expect } from "bun:test";
import {
  buildTree,
  flatten,
  parseKey,
  reduce,
  renderFrame,
  DEFAULT_EXPANDED,
  type UiState,
} from "./tui";
import { stripAnsi } from "./render";
import type { AuditState } from "./state";

const fixture: AuditState = {
  findings: [
    {
      id: "001", title: "Bun test missing", slug: "a", area: "runtime-infra",
      severity: "critical", status: "open", confidence: "tier-0", worktree: "none",
      hasInvestigation: false, hasResolution: false, dir: "/p/.audit/findings/001-a",
    },
    {
      id: "004", title: "Scripts", slug: "b", area: "runtime-infra",
      severity: "high", status: "open", confidence: "tier-1", worktree: "none",
      hasInvestigation: false, hasResolution: false, dir: "/p/.audit/findings/004-b",
    },
    {
      id: "003", title: "Done one", slug: "c", area: "auth",
      severity: "high", status: "resolved", confidence: "tier-3", worktree: "none",
      hasInvestigation: true, hasResolution: true, dir: "/p/.audit/resolved/003-c",
    },
  ],
  coverage: [{ behavior: "x", referenceCase: "-", status: "verified", tier: "tier-3", finding: "003" }],
  board: [],
  coveragePct: 100,
  worktrees: [
    {
      path: "/home/dev/repo-audit-001", branch: "audit/001-bun-test",
      auditDir: null, findings: [],
    },
  ],
  activity: [
    {
      command: "audit-new", finding: "004", worktree: "root", startedAt: "",
      agent: "bryan", pid: 1, file: "", ageMs: 3000, stale: false,
    },
  ],
};

test("buildTree groups findings by lifecycle and lists their ids", () => {
  const tree = buildTree(fixture);
  const findingsSec = tree.find((n) => n.id === "sec:findings")!;
  const groupIds = findingsSec.children.map((g) => g.id);
  expect(groupIds).toContain("findings:open");
  expect(groupIds).toContain("findings:done");
  expect(groupIds).not.toContain("findings:in-progress"); // none in that state

  const open = findingsSec.children.find((g) => g.id === "findings:open")!;
  const plain = stripAnsi(open.label);
  expect(plain).toContain("(2)");
  expect(plain).toContain("001");
  expect(plain).toContain("004");
});

test("buildTree exposes worktree branch + path in its children", () => {
  const tree = buildTree(fixture);
  const wtSec = tree.find((n) => n.id === "sec:worktrees")!;
  const wt = wtSec.children[0];
  expect(stripAnsi(wt.label)).toContain("audit/001-bun-test");
  const detailPlain = wt.children.map((d) => stripAnsi(d.label));
  expect(detailPlain.some((l) => l.includes("path:") && l.includes("/home/dev/repo-audit-001"))).toBe(true);
  expect(detailPlain.some((l) => l.startsWith("branch:"))).toBe(true);
});

test("flatten only shows children of expanded nodes", () => {
  const tree = buildTree(fixture);
  const collapsed = flatten(tree, new Set());
  const expanded = flatten(tree, new Set(DEFAULT_EXPANDED));
  expect(expanded.length).toBeGreaterThan(collapsed.length);
  // Top-level sections are always visible.
  expect(collapsed.some((r) => r.id === "sec:findings")).toBe(true);
});

test("parseKey maps arrows, vim keys and controls", () => {
  expect(parseKey("\x1b[A")).toBe("up");
  expect(parseKey("\x1b[B")).toBe("down");
  expect(parseKey("\x1b[C")).toBe("right");
  expect(parseKey("\x1b[D")).toBe("left");
  expect(parseKey("\r")).toBe("enter");
  expect(parseKey("\x1b")).toBe("esc");
  expect(parseKey("q")).toBe("quit");
  expect(parseKey("\x03")).toBe("quit");
  expect(parseKey("z")).toBe("");
});

test("reduce moves the cursor and expands/collapses the current node", () => {
  const tree = buildTree(fixture);
  let ui: UiState = { cursor: 0, expanded: new Set() };
  let rows = flatten(tree, ui.expanded);

  ui = reduce(ui, "down", rows);
  expect(ui.cursor).toBe(1);

  // Move to the findings section and expand it.
  ui = { cursor: rows.findIndex((r) => r.id === "sec:findings"), expanded: new Set() };
  rows = flatten(tree, ui.expanded);
  ui = reduce(ui, "right", rows);
  expect(ui.expanded.has("sec:findings")).toBe(true);

  // Collapsing it again removes it from the set.
  rows = flatten(tree, ui.expanded);
  ui = reduce(ui, "left", rows);
  expect(ui.expanded.has("sec:findings")).toBe(false);
});

test("renderFrame highlights the cursor row and shows the nav hint", () => {
  const tree = buildTree(fixture);
  const rows = flatten(tree, new Set(DEFAULT_EXPANDED));
  const frame = renderFrame(rows, 0);
  expect(frame).toContain("\x1b[7m"); // reverse video on the cursor row
  expect(stripAnsi(frame)).toContain("navigate");
});
