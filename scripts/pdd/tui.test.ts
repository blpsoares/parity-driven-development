// PDD 2.0 — tests for the interactive TUI core (pure functions only).

import { test, expect } from "bun:test";
import {
  buildTree,
  sectionsForTab,
  flatten,
  parseKey,
  parseMouse,
  tabSpans,
  hitTest,
  reduce,
  toggleAt,
  gotoTab,
  pipelineStages,
  currentStageIndex,
  renderPipeline,
  renderFrame,
  DEFAULT_EXPANDED,
  TABS,
  type UiState,
} from "./tui";
import { stripAnsi } from "./render";
import type { AuditState } from "./state";

const fixture: AuditState = {
  findings: [
    {
      id: "001", title: "Bun test missing", slug: "a", area: "runtime-infra",
      severity: "critical", status: "open", confidence: "tier-0", worktree: "none",
      hasInvestigation: false, hasResolution: false, qaStatus: "", prUrl: "", dir: "/p/.audit/findings/001-a",
    },
    {
      id: "004", title: "Scripts", slug: "b", area: "runtime-infra",
      severity: "high", status: "open", confidence: "tier-1", worktree: "none",
      hasInvestigation: false, hasResolution: false, qaStatus: "", prUrl: "", dir: "/p/.audit/findings/004-b",
    },
    {
      id: "003", title: "Done one", slug: "c", area: "auth",
      severity: "high", status: "resolved", confidence: "tier-3", worktree: "none",
      hasInvestigation: true, hasResolution: true, qaStatus: "", prUrl: "", dir: "/p/.audit/resolved/003-c",
    },
  ],
  coverage: [{ behavior: "x", referenceCase: "-", status: "verified", tier: "tier-3", finding: "003" }],
  board: [],
  coveragePct: 100,
  worktrees: [
    { path: "/home/dev/repo-audit-001", branch: "audit/001-bun-test", auditDir: null, findings: [] },
  ],
  activity: [
    { command: "audit-new", finding: "004", worktree: "root", startedAt: "", agent: "bryan", pid: 1, file: "", ageMs: 3000, stale: false },
  ],
};

test("buildTree groups findings by lifecycle and lists their ids", () => {
  const findingsSec = buildTree(fixture).find((n) => n.id === "sec:findings")!;
  const open = findingsSec.children.find((g) => g.id === "findings:open")!;
  const plain = stripAnsi(open.label);
  expect(plain).toContain("(2)");
  expect(plain).toContain("001");
  expect(plain).toContain("004");
  expect(findingsSec.children.some((g) => g.id === "findings:in-progress")).toBe(false);
});

test("buildTree exposes worktree branch + full path in its children", () => {
  const wt = buildTree(fixture).find((n) => n.id === "sec:worktrees")!.children[0];
  const detail = wt.children.map((d) => stripAnsi(d.label));
  expect(detail.some((l) => l.includes("path:") && l.includes("/home/dev/repo-audit-001"))).toBe(true);
  expect(detail.some((l) => l.startsWith("branch:"))).toBe(true);
});

test("sectionsForTab narrows to a single section (and Overview shows all)", () => {
  const tree = buildTree(fixture);
  expect(sectionsForTab(tree, TABS.indexOf("Findings")).map((n) => n.id)).toEqual(["sec:findings"]);
  expect(sectionsForTab(tree, TABS.indexOf("Overview")).length).toBeGreaterThan(1);
});

test("parseKey maps arrows, tab, vim keys and controls", () => {
  expect(parseKey("\x1b[A")).toBe("up");
  expect(parseKey("\x1b[B")).toBe("down");
  expect(parseKey("\t")).toBe("tab");
  expect(parseKey("\x1b[Z")).toBe("shifttab");
  expect(parseKey("\r")).toBe("enter");
  expect(parseKey("\x1b")).toBe("esc");
  expect(parseKey("q")).toBe("quit");
  expect(parseKey("z")).toBe("");
});

test("parseMouse decodes SGR clicks and wheel", () => {
  expect(parseMouse("\x1b[<0;12;5M")).toEqual({ kind: "press", x: 12, y: 5 });
  expect(parseMouse("\x1b[<0;12;5m")).toEqual({ kind: "release", x: 12, y: 5 });
  expect(parseMouse("\x1b[<64;1;1M")?.kind).toBe("wheel-up");
  expect(parseMouse("\x1b[<65;1;1M")?.kind).toBe("wheel-down");
  expect(parseMouse("\x1b[A")).toBeNull();
});

test("hitTest maps a click on the tab row to a tab, and content to a row", () => {
  const tree = buildTree(fixture);
  const rows = flatten(sectionsForTab(tree, 0), new Set(DEFAULT_EXPANDED));
  // Click inside the second tab's span, on the tab row (y=2).
  const secondTab = tabSpans()[1];
  const hit = hitTest(rows, secondTab.start, 2);
  expect(hit).toEqual({ kind: "tab", index: 1 });
  // Click on the first content row (y=5) → row index 0.
  expect(hitTest(rows, 3, 5)).toEqual({ kind: "row", index: 0 });
  // Click below the content → nothing.
  expect(hitTest(rows, 3, 9999)).toBeNull();
});

test("reduce moves cursor, expands/collapses, and cycles tabs", () => {
  const tree = buildTree(fixture);
  let ui: UiState = { tab: 0, cursor: 0, expanded: new Set() };
  ui = reduce(ui, "down", flatten(sectionsForTab(tree, ui.tab), ui.expanded));
  expect(ui.cursor).toBe(1);

  ui = reduce(ui, "tab", flatten(sectionsForTab(tree, ui.tab), ui.expanded));
  expect(ui.tab).toBe(1);
  expect(ui.cursor).toBe(0);

  // Expand the findings section on its tab.
  ui = { tab: TABS.indexOf("Findings"), cursor: 0, expanded: new Set() };
  ui = reduce(ui, "right", flatten(sectionsForTab(tree, ui.tab), ui.expanded));
  expect(ui.expanded.has("sec:findings")).toBe(true);
});

test("toggleAt and gotoTab work as mouse handlers", () => {
  const tree = buildTree(fixture);
  const rows = flatten(sectionsForTab(tree, 0), new Set());
  const secIdx = rows.findIndex((r) => r.id === "sec:findings");
  const ui = toggleAt({ tab: 0, cursor: 0, expanded: new Set() }, secIdx, rows);
  expect(ui.expanded.has("sec:findings")).toBe(true);
  expect(ui.cursor).toBe(secIdx);
  expect(gotoTab(ui, 3).tab).toBe(3);
});

test("renderFrame draws the tab bar, live badge and highlights the cursor", () => {
  const rows = flatten(sectionsForTab(buildTree(fixture), 0), new Set(DEFAULT_EXPANDED));
  const frame = renderFrame(0, rows, 0, true);
  const plain = stripAnsi(frame);
  expect(plain).toContain("Overview");
  expect(plain).toContain("Findings");
  expect(plain).toContain("● live");
  expect(frame).toContain("\x1b[7m"); // reverse video on cursor row / active tab
});

test("pipelineStages reflects PR/QA/coverage and currentStageIndex points to the next", () => {
  const base = {
    id: "007", title: "t", slug: "s", area: "a", severity: "high",
    status: "resolved", confidence: "tier-2", worktree: "none",
    hasInvestigation: true, hasResolution: true, qaStatus: "", prUrl: "",
    dir: "/x",
  };
  // Resolved locally, no PR yet → current stage is "PR" (index 3).
  const s1 = pipelineStages(base, "resolved");
  expect(s1.find((s) => s.key === "resolved")!.done).toBe(true);
  expect(s1.find((s) => s.key === "pr")!.done).toBe(false);
  expect(s1[currentStageIndex(s1)].key).toBe("pr");

  // With a PR + QA approved + coverage verified → all done.
  const s2 = pipelineStages(
    { ...base, prUrl: "https://x/pr/1", qaStatus: "approved" },
    "verified",
  );
  expect(s2.every((s) => s.done)).toBe(true);
  expect(stripAnsi(renderPipeline(s2))).toContain("verified");
});

test("Flow and Legend tabs exist and render their sections", () => {
  expect(TABS).toContain("Flow");
  expect(TABS).toContain("Legend");
  const tree = buildTree(fixture);
  expect(sectionsForTab(tree, TABS.indexOf("Flow")).map((n) => n.id)).toEqual(["sec:flow"]);
  const legend = sectionsForTab(tree, TABS.indexOf("Legend"))[0];
  const plain = legend.children.map((n) => stripAnsi(n.label)).join(" ");
  expect(plain.toLowerCase()).toContain("coverage");
  expect(plain.toLowerCase()).toContain("tiers");
  // Overview excludes Flow/Legend detail sections.
  const overviewIds = sectionsForTab(tree, 0).map((n) => n.id);
  expect(overviewIds).not.toContain("sec:flow");
  expect(overviewIds).not.toContain("sec:legend");
});
