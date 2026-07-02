// PDD 2.0 — tests for the audit state reader.
// All comments and assertions are in English.

import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readAuditState,
  parseWorktreePorcelain,
  mergeFindings,
  readActivityFrom,
  dedupeActivity,
  progressRank,
  type Finding,
  type Worktree,
} from "./state";

/** Build a throwaway `.audit/` fixture and return its path plus a cleanup fn. */
function buildFixture(): { auditDir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pdd-state-"));
  const auditDir = join(root, ".audit");
  const findingsDir = join(auditDir, "findings");
  const resolvedDir = join(auditDir, "resolved");
  mkdirSync(findingsDir, { recursive: true });
  mkdirSync(resolvedDir, { recursive: true });

  // Finding 1 — open, tier-1, only a README (no investigation/resolution).
  const f1 = join(findingsDir, "001-broken-total");
  mkdirSync(f1, { recursive: true });
  writeFileSync(
    join(f1, "README.md"),
    [
      "---",
      'id: "001"',
      'title: "Order total is wrong"',
      "slug: broken-total",
      "area: orders",
      "severity: critical",
      "status: open",
      "discovered-at: 2026-07-01",
      "discovered-by: dev",
      "confidence: tier-1",
      "worktree: none",
      "---",
      "",
      "# Order total is wrong",
    ].join("\n"),
  );

  // Finding 2 — resolved, tier-3, with investigation + resolution files.
  const f2 = join(resolvedDir, "002-missing-tax");
  mkdirSync(f2, { recursive: true });
  writeFileSync(
    join(f2, "README.md"),
    [
      "---",
      'id: "002"',
      'title: "Tax line missing"',
      "slug: missing-tax",
      "area: checkout",
      "severity: high",
      "status: resolved",
      "discovered-at: 2026-06-20",
      "discovered-by: dev",
      "confidence: tier-3",
      "worktree: /home/dev/repo-audit-002",
      "---",
      "",
      "# Tax line missing",
    ].join("\n"),
  );
  writeFileSync(join(f2, "investigation.md"), "# Investigation\n");
  writeFileSync(join(f2, "resolution.md"), "# Resolution\n");

  // Coverage map — two rows, one verified => 50%.
  writeFileSync(
    join(auditDir, "coverage.md"),
    [
      "# Coverage",
      "",
      "| Behavior / Area | Reference case | Status | Tier | Finding |",
      "| --- | --- | --- | --- | --- |",
      "| Order total | golden-order-1 | verified | tier-3 | 002 |",
      "| Tax line | golden-order-2 | finding-open | tier-1 | 001 |",
      "",
    ].join("\n"),
  );

  // Board.
  writeFileSync(
    join(auditDir, "board.md"),
    [
      "# PDD Board",
      "",
      "## In progress",
      "- 001 broken-total",
      "",
      "## Available",
      "<empty>",
      "",
      "## Resolved (last 7 days)",
      "- 002 missing-tax",
      "",
    ].join("\n"),
  );

  return { auditDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("readAuditState parses findings from findings/ and resolved/", () => {
  const { auditDir, cleanup } = buildFixture();
  try {
    const state = readAuditState(auditDir);
    expect(state.findings.length).toBe(2);

    const open = state.findings.find((f) => f.id === "001")!;
    expect(open.status).toBe("open");
    expect(open.confidence).toBe("tier-1");
    expect(open.slug).toBe("broken-total");
    expect(open.hasInvestigation).toBe(false);
    expect(open.hasResolution).toBe(false);
    expect(open.worktree).toBe("none");

    const resolved = state.findings.find((f) => f.id === "002")!;
    expect(resolved.status).toBe("resolved");
    expect(resolved.confidence).toBe("tier-3");
    expect(resolved.hasInvestigation).toBe(true);
    expect(resolved.hasResolution).toBe(true);
    expect(resolved.worktree).toBe("/home/dev/repo-audit-002");
  } finally {
    cleanup();
  }
});

test("readAuditState computes coveragePct == 50 for one verified of two rows", () => {
  const { auditDir, cleanup } = buildFixture();
  try {
    const state = readAuditState(auditDir);
    expect(state.coverage.length).toBe(2);
    expect(state.coveragePct).toBe(50);
  } finally {
    cleanup();
  }
});

test("readAuditState parses board sections by heading", () => {
  const { auditDir, cleanup } = buildFixture();
  try {
    const state = readAuditState(auditDir);
    const headings = state.board.map((s) => s.heading);
    expect(headings).toContain("In progress");
    expect(headings).toContain("Available");
    expect(headings).toContain("Resolved (last 7 days)");
  } finally {
    cleanup();
  }
});

test("readAuditState returns empty state for a missing .audit dir", () => {
  const state = readAuditState(join(tmpdir(), "pdd-does-not-exist-xyz", ".audit"));
  expect(state.findings.length).toBe(0);
  expect(state.coverage.length).toBe(0);
  expect(state.board.length).toBe(0);
  expect(state.coveragePct).toBe(0);
});

// --- Worktrees & activity ---------------------------------------------------

/** Minimal finding factory for the pure-function tests. */
function fakeFinding(over: Partial<Finding>): Finding {
  return {
    id: "000",
    title: "",
    slug: "",
    area: "",
    severity: "",
    status: "open",
    confidence: "tier-0",
    worktree: "none",
    hasInvestigation: false,
    hasResolution: false,
    dir: "/tmp/x",
    ...over,
  };
}

test("parseWorktreePorcelain extracts path + branch and handles detached", () => {
  const out = parseWorktreePorcelain(
    [
      "worktree /home/dev/repo",
      "HEAD abc123",
      "branch refs/heads/dev",
      "",
      "worktree /home/dev/repo-audit-001",
      "HEAD def456",
      "branch refs/heads/audit/001-x",
      "",
      "worktree /home/dev/repo-detached",
      "HEAD 999",
      "detached",
      "",
    ].join("\n"),
  );
  expect(out).toHaveLength(3);
  expect(out[1]).toEqual({ path: "/home/dev/repo-audit-001", branch: "audit/001-x" });
  expect(out[2].branch).toBe("detached");
});

test("mergeFindings prefers the worktree copy over the root copy", () => {
  const root = [fakeFinding({ id: "001", status: "open" })];
  const worktrees: Worktree[] = [
    {
      path: "/wt/repo-audit-001",
      branch: "audit/001-x",
      auditDir: "/wt/repo-audit-001/.audit",
      findings: [fakeFinding({ id: "001", status: "resolved", hasResolution: true })],
    },
  ];
  const merged = mergeFindings(root, worktrees);
  expect(merged).toHaveLength(1);
  expect(merged[0].status).toBe("resolved");
});

test("progressRank orders resolved > investigated > open", () => {
  expect(progressRank(fakeFinding({ hasResolution: true }))).toBe(3);
  expect(progressRank(fakeFinding({ hasInvestigation: true }))).toBe(2);
  expect(progressRank(fakeFinding({}))).toBe(1);
});

test("readActivityFrom flags stale records and computes age", () => {
  const root = mkdtempSync(join(tmpdir(), "pdd-act-"));
  const actDir = join(root, "activity");
  mkdirSync(actDir, { recursive: true });
  const now = Date.parse("2026-07-01T12:00:00Z");
  writeFileSync(
    join(actDir, "audit-new-1.json"),
    JSON.stringify({
      command: "audit-new",
      finding: "002",
      worktree: "none",
      startedAt: "2026-07-01T11:59:00Z", // 1 min ago → fresh
      agent: "bryan",
      pid: 111,
    }),
  );
  writeFileSync(
    join(actDir, "audit-investigate-2.json"),
    JSON.stringify({
      command: "audit-investigate",
      finding: "003",
      worktree: "/wt/repo-audit-003",
      startedAt: "2026-07-01T11:00:00Z", // 60 min ago → stale
      agent: "agent-2",
      pid: 222,
    }),
  );
  const acts = readActivityFrom(actDir, now);
  rmSync(root, { recursive: true, force: true });

  const fresh = acts.find((a) => a.command === "audit-new");
  const stale = acts.find((a) => a.command === "audit-investigate");
  expect(fresh?.stale).toBe(false);
  expect(stale?.stale).toBe(true);
  expect(fresh?.ageMs).toBe(60 * 1000);
});

test("dedupeActivity keeps the freshest duplicate", () => {
  const base = {
    command: "audit-new",
    finding: "002",
    worktree: "none",
    startedAt: "2026-07-01T11:59:00Z",
    agent: "",
    pid: 0,
    file: "",
    stale: false,
  };
  const deduped = dedupeActivity([
    { ...base, ageMs: 5000 },
    { ...base, ageMs: 1000 },
  ]);
  expect(deduped).toHaveLength(1);
  expect(deduped[0].ageMs).toBe(1000);
});

test("coveragePct counts only verified, not resolved (pending QA)", () => {
  const root = mkdtempSync(join(tmpdir(), "pdd-cov-"));
  const auditDir = join(root, ".audit");
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(
    join(auditDir, "coverage.md"),
    [
      "| Behavior / Area | Reference case | Status | Tier | Finding |",
      "| --- | --- | --- | --- | --- |",
      "| a | c1 | verified | tier-3 | 001 |",
      "| b | c2 | resolved | tier-3 | 002 |", // done locally, NOT guaranteed
      "| c | c3 | finding-open | tier-0 | 003 |",
      "| d | c4 | not-started | — | — |",
    ].join("\n"),
  );
  const state = readAuditState(auditDir);
  rmSync(root, { recursive: true, force: true });
  // Only 1 of 4 is verified → 25%. The 'resolved' row must NOT count.
  expect(state.coveragePct).toBe(25);
});
