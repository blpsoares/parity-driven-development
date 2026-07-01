// PDD 2.0 — tests for the audit state reader.
// All comments and assertions are in English.

import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAuditState } from "./state";

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
