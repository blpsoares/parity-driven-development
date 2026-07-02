#!/usr/bin/env bun
// PDD 2.0 — `pdd` CLI entry point.
// Zero external dependencies. All comments and identifiers are in English.
//
// Usage:
//   pdd board [path]            Print the dashboard once.
//   pdd board --watch [path]    Re-render whenever `.audit/` changes.
//
// The audit directory is resolved as <path or process.cwd()>/.audit.

import { watch, existsSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { readMergedAuditState, pruneStaleActivity } from "./state";
import { renderBoard } from "./render";
import { runTui } from "./tui";

/** Walk up from `start` looking for a directory that contains `.audit`. */
function findAuditUpwards(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".audit"))) return join(dir, ".audit");
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Resolve the `.audit` directory. An explicit path argument is honored as-is
 * (accepting either a project root or a `.audit` dir). With no argument, walk up
 * from the current directory so `pdd` works from any subfolder of the project.
 */
function resolveAuditDir(pathArg?: string): string {
  if (pathArg) {
    const base = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
    return base.endsWith(".audit") ? base : join(base, ".audit");
  }
  return findAuditUpwards(process.cwd()) ?? join(process.cwd(), ".audit");
}

/** Clear the terminal (ANSI clear + move cursor home). */
function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

/** Render one snapshot to stdout. */
function renderOnce(auditDir: string): void {
  if (!existsSync(auditDir)) {
    process.stdout.write(
      `No .audit directory found at ${auditDir}\n` +
        `Run /audit-bootstrap first to initialize PDD.\n`,
    );
    return;
  }
  const state = readMergedAuditState(auditDir);
  process.stdout.write(renderBoard(state) + "\n");
}

/** Watch `.audit/` recursively and re-render on change (debounced). */
function watchBoard(auditDir: string): void {
  const render = () => {
    clearScreen();
    renderOnce(auditDir);
    process.stdout.write(
      `\n\x1b[2mwatching ${auditDir} — press Ctrl+C to exit\x1b[0m\n`,
    );
  };

  render();

  if (!existsSync(auditDir)) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 120); // small debounce to coalesce bursts
  };

  try {
    watch(auditDir, { recursive: true }, debounced);
  } catch {
    // Some platforms lack recursive watch; fall back to non-recursive.
    watch(auditDir, debounced);
  }
}

/** Parse argv and dispatch. */
function main(argv: string[]): void {
  const args = argv.slice(2);
  const command = args[0] ?? "tui"; // no command → interactive TUI

  if (command !== "board" && command !== "tui" && command !== "prune") {
    process.stdout.write(
      "pdd — Parity-Driven Development dashboard\n\n" +
        "Usage:\n" +
        "  pdd                       Interactive, navigable dashboard (default)\n" +
        "  pdd tui [path]            Interactive dashboard (↑/↓ navigate, →/enter expand, q quit)\n" +
        "  pdd board [path]          Print a static snapshot once\n" +
        "  pdd board --watch [path]  Static auto-refresh on .audit changes\n" +
        "  pdd prune [path]          Remove stale/orphaned activity records\n\n" +
        "With no [path], pdd walks up from the current directory to find .audit.\n",
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
      process.stdout.write(`Removed ${removed.length} stale activity record(s):\n`);
      for (const f of removed) process.stdout.write(`  ${f}\n`);
    }
  } else if (command === "tui") {
    runTui(auditDir);
  } else if (watchMode) {
    watchBoard(auditDir);
  } else {
    renderOnce(auditDir);
  }
}

main(process.argv);
