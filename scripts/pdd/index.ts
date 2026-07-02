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
import { adaptAll, type Harness } from "./adapt";
import { runMenu } from "./prompt";

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

/** Detect which agents are present, by a binary on PATH or a config directory. */
function detectHarnesses(all: Harness[], projectRoot: string): Harness[] {
  const home = process.env.HOME ?? "";
  const has = (bin: string, dir: string) =>
    Boolean(Bun.which(bin)) || (dir !== "" && existsSync(dir));
  const map: Record<Harness, boolean> = {
    codex: has("codex", join(home, ".codex")),
    cursor: has("cursor", join(home, ".cursor")),
    gemini: has("gemini", join(home, ".gemini")),
    // Copilot is a VS Code/JetBrains feature — infer from a project .github dir.
    copilot: existsSync(join(projectRoot, ".github")),
  };
  return all.filter((h) => map[h]);
}

/** Install PDD commands — interactive (specify-init style) when run in a TTY. */
async function runInit(args: string[]): Promise<void> {
  const all: Harness[] = ["codex", "cursor", "copilot", "gemini"];
  const projectRoot = process.cwd();
  const skillsDir = join(import.meta.dir, "..", "..", "skills");
  const explicit = args.slice(1).filter((a): a is Harness => all.includes(a as Harness));
  const detected = detectHarnesses(all, projectRoot);

  let targets: Harness[];
  let global = args.includes("--global");

  // Non-interactive: explicit harness args, a piped stdin, or an explicit scope flag.
  if (explicit.length > 0 || !process.stdin.isTTY || args.includes("--global")) {
    targets = explicit.length > 0 ? explicit : detected;
    if (targets.length === 0) {
      process.stdout.write(
        "No agent detected. Try: pdd init codex | cursor | copilot | gemini\n",
      );
      return;
    }
  } else {
    // Interactive.
    const items = all.map((h) => ({ label: h, hint: detected.includes(h) ? "detected" : "" }));
    const preChecked = all.map((h, i) => (detected.includes(h) ? i : -1)).filter((i) => i >= 0);
    const picked = await runMenu("Install PDD commands for which agents?", items, {
      multi: true,
      preChecked,
    });
    if (!picked || picked.length === 0) {
      process.stdout.write("Cancelled — nothing installed.\n");
      return;
    }
    targets = picked.map((i) => all[i]);

    // Scope only matters if a non-Codex agent is selected (Codex is always home).
    if (targets.some((t) => t !== "codex")) {
      const scope = await runMenu(
        "Install scope?",
        [{ label: "project", hint: projectRoot }, { label: "global", hint: "your home config" }],
        { multi: false },
      );
      if (scope === null) {
        process.stdout.write("Cancelled — nothing installed.\n");
        return;
      }
      global = scope[0] === 1;
    }
  }

  process.stdout.write("\n");
  for (const harness of targets) {
    const written = adaptAll(harness, { skillsDir, projectRoot, global });
    const where = harness === "codex" ? "~/.codex (home)" : global ? "home config" : "project";
    process.stdout.write(`✅ ${harness} → ${written.length} command(s) in ${where}\n`);
  }
  process.stdout.write("\nInvoke /audit-bootstrap in your agent to begin.\n");
}

/** Parse argv and dispatch. */
async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const command = args[0] ?? "tui"; // no command → interactive TUI

  if (command === "init") {
    await runInit(args);
    return;
  }

  if (command === "adapt") {
    const harnesses: Harness[] = ["codex", "cursor", "copilot", "gemini"];
    const harness = args[1] as Harness;
    if (!harnesses.includes(harness)) {
      process.stdout.write(
        `Usage: pdd adapt <${harnesses.join("|")}> [--global] [project-dir]\n` +
          "Generates PDD slash-command / prompt files for that agent from the canonical skills.\n",
      );
      process.exitCode = 1;
      return;
    }
    const global = args.includes("--global");
    const projectRoot = args.slice(2).find((a) => !a.startsWith("-")) ?? process.cwd();
    const skillsDir = join(import.meta.dir, "..", "..", "skills");
    const written = adaptAll(harness, { skillsDir, projectRoot, global });
    if (written.length === 0) {
      process.stdout.write("No skills found to adapt.\n");
    } else {
      process.stdout.write(`Wrote ${written.length} ${harness} command file(s):\n`);
      for (const f of written) process.stdout.write(`  ${f}\n`);
    }
    return;
  }

  if (command !== "board" && command !== "tui" && command !== "prune") {
    process.stdout.write(
      "pdd — Parity-Driven Development dashboard\n\n" +
        "Usage:\n" +
        "  pdd                       Interactive, navigable dashboard (default)\n" +
        "  pdd tui [path]            Interactive dashboard (↑/↓ navigate, →/enter expand, q quit)\n" +
        "  pdd board [path]          Print a static snapshot once\n" +
        "  pdd board --watch [path]  Static auto-refresh on .audit changes\n" +
        "  pdd prune [path]          Remove stale/orphaned activity records\n" +
        "  pdd init [harness...]     Install PDD commands into detected agents (or the ones given)\n" +
        "  pdd adapt <harness>       Generate command files for one of Codex/Cursor/Copilot/Gemini\n\n" +
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

main(process.argv).catch((err) => {
  process.stderr.write(`pdd: ${err?.message ?? err}\n`);
  process.exit(1);
});
