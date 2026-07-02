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
import { join, resolve, isAbsolute } from "node:path";
import { readMergedAuditState } from "./state";
import { renderBoard } from "./render";
import { runTui } from "./tui";

/** Resolve the `.audit` directory from an optional path argument. */
function resolveAuditDir(pathArg?: string): string {
  const base = pathArg
    ? isAbsolute(pathArg)
      ? pathArg
      : resolve(process.cwd(), pathArg)
    : process.cwd();
  // Allow passing either the project root or the .audit dir directly.
  if (base.endsWith(".audit")) return base;
  return join(base, ".audit");
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

  if (command !== "board" && command !== "tui") {
    process.stdout.write(
      "pdd — Parity-Driven Development dashboard\n\n" +
        "Usage:\n" +
        "  pdd                       Interactive, navigable dashboard (default)\n" +
        "  pdd tui [path]            Interactive dashboard (↑/↓ navigate, →/enter expand, q quit)\n" +
        "  pdd board [path]          Print a static snapshot once\n" +
        "  pdd board --watch [path]  Static auto-refresh on .audit changes\n",
    );
    process.exitCode = 1;
    return;
  }

  const rest = args.slice(1);
  const watchMode = rest.includes("--watch");
  const pathArg = rest.find((a) => !a.startsWith("--"));
  const auditDir = resolveAuditDir(pathArg);

  if (command === "tui") {
    runTui(auditDir);
  } else if (watchMode) {
    watchBoard(auditDir);
  } else {
    renderOnce(auditDir);
  }
}

main(process.argv);
