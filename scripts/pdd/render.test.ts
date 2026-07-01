// PDD 2.0 — tests for the ANSI dashboard renderer.
// Comments and assertions are in English. ANSI is stripped before substring checks.

import { test, expect } from "bun:test";
import { renderBoard, progressBar, stripAnsi } from "./render";
import type { AuditState } from "./state";

/** A hand-built fixture state (independent of the filesystem). */
const fixtureState: AuditState = {
  findings: [
    {
      id: "001",
      title: "Order total is wrong",
      slug: "broken-total",
      area: "orders",
      severity: "critical",
      status: "investigated",
      confidence: "tier-1",
      worktree: "none",
      hasInvestigation: true,
      hasResolution: false,
      dir: "/tmp/.audit/findings/001-broken-total",
    },
    {
      id: "002",
      title: "Tax line missing",
      slug: "missing-tax",
      area: "checkout",
      severity: "high",
      status: "resolved",
      confidence: "tier-3",
      worktree: "/home/dev/repo-audit-002",
      hasInvestigation: true,
      hasResolution: true,
      dir: "/tmp/.audit/resolved/002-missing-tax",
    },
  ],
  coverage: [
    { behavior: "Order total", referenceCase: "g1", status: "verified", tier: "tier-3", finding: "002" },
    { behavior: "Tax line", referenceCase: "g2", status: "finding-open", tier: "tier-1", finding: "001" },
  ],
  board: [
    { heading: "In progress", level: 2, lines: ["- [ ] 001-broken-total — chasing the rounding bug"] },
    { heading: "Available", level: 2, lines: [] },
  ],
  coveragePct: 50,
};

test("renderBoard contains the coverage percentage", () => {
  const plain = stripAnsi(renderBoard(fixtureState));
  expect(plain).toContain("50%");
  expect(plain).toContain("Coverage");
});

test("renderBoard contains a block-character bar", () => {
  const plain = stripAnsi(renderBoard(fixtureState));
  expect(plain).toContain("█");
  expect(plain).toContain("░");
});

test("renderBoard shows status counts, tiers and in-progress work", () => {
  const plain = stripAnsi(renderBoard(fixtureState));
  expect(plain).toContain("Findings by status");
  expect(plain).toContain("Confidence distribution");
  expect(plain).toContain("tier-1");
  expect(plain).toContain("tier-3");
  expect(plain).toContain("In progress");
  // In-progress work comes from the board.md "In progress" section, not from
  // a finding status. The checkbox marker is stripped in the rendered line.
  expect(plain).toContain("001-broken-total — chasing the rounding bug");
});

test("progressBar clamps and fills proportionally", () => {
  const empty = stripAnsi(progressBar(0, 10));
  const full = stripAnsi(progressBar(100, 10));
  expect(empty).toBe("░".repeat(10));
  expect(full).toBe("█".repeat(10));
});
