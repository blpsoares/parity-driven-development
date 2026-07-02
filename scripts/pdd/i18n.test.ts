// PDD 2.0 — tests for the i18n dictionary and language-aware tree.

import { test, expect } from "bun:test";
import { t } from "./i18n";
import { buildTree, TABS } from "./tui";
import { stripAnsi } from "./render";
import type { AuditState } from "./state";

test("t returns the right language and falls back to English / key", () => {
  expect(t("en", "tab_overview")).toBe("Overview");
  expect(t("pt", "tab_overview")).toBe("Visão geral");
  expect(t("pt", "tab_legend")).toBe("Guia");
  expect(t("en", "does_not_exist")).toBe("does_not_exist"); // fallback to key
});

const state: AuditState = {
  findings: [],
  coverage: [],
  board: [],
  coveragePct: 0,
  worktrees: [],
  activity: [],
};

test("buildTree translates the Legend title and includes the commands list", () => {
  const legendEn = buildTree(state, "en").find((n) => n.id === "sec:legend")!;
  const legendPt = buildTree(state, "pt").find((n) => n.id === "sec:legend")!;
  expect(stripAnsi(legendEn.label)).toContain("Legend");
  expect(stripAnsi(legendPt.label)).toContain("Guia");

  const cmds = legendEn.children.find((n) => n.id === "legend:commands")!;
  expect(cmds).toBeDefined();
  expect(stripAnsi(cmds.label)).toContain("execution order");
  expect(cmds.children.length).toBeGreaterThanOrEqual(8);
  // First command is the bootstrap step, in order.
  expect(stripAnsi(cmds.children[0].label)).toContain("/audit-bootstrap");
});

test("buildTree translates section titles by language", () => {
  const cov = (lang: "en" | "pt") =>
    stripAnsi(buildTree(state, lang).find((n) => n.id === "sec:coverage")!.label);
  expect(cov("en")).toContain("Coverage");
  expect(cov("pt")).toContain("Cobertura");
  expect(TABS.length).toBe(7); // Overview..Legend
});
