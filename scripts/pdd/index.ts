// PDD 2.0 — `pdd` CLI entry point. Runs on Node (via the built dist/pdd.js) or
// Bun (run the source directly). The build adds the `#!/usr/bin/env node` shebang.
// Zero external runtime dependencies. All comments and identifiers are in English.
//
// Usage:
//   pdd board [path]            Print the dashboard once.
//   pdd board --watch [path]    Re-render whenever `.audit/` changes.
//
// The audit directory is resolved as <path or process.cwd()>/.audit.

import { watch, existsSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readMergedAuditState, pruneStaleActivity } from "./state";
import { renderBoard } from "./render";
import { runTui } from "./tui";
import { adaptAll, type Harness } from "./adapt";
import { runMenu } from "./prompt";
import {
  cachedNotice,
  checkNow,
  readInstalledVersion,
  refreshCacheIfStale,
} from "./update";
import { spawnSync } from "node:child_process";

// Runs on both Node and Bun. `import.meta.dir` is Bun-only, so derive the
// directory portably from `import.meta.url`.
const HERE = dirname(fileURLToPath(import.meta.url));

/** Walk up from `start` to the first directory that contains `marker`. */
function findUpDir(start: string, marker: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, marker))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start; // fallback: give back the start
    dir = parent;
  }
}

// The package root holds `skills/` and `.claude-plugin/`. Resolving by walking
// up works whether the CLI runs from source (scripts/pdd/), the bundled npm
// package (dist/), or the Claude plugin cache.
const PLUGIN_ROOT = findUpDir(HERE, "skills");
const SKILLS_DIR = join(PLUGIN_ROOT, "skills");

/** Portable `which`: is `bin` an executable on PATH? (replaces Bun.which). */
function whichBin(bin: string): boolean {
  const sep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return (process.env.PATH ?? "")
    .split(sep)
    .some((p) => p && exts.some((ext) => existsSync(join(p, bin + ext))));
}

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
    Boolean(whichBin(bin)) || (dir !== "" && existsSync(dir));
  const map: Record<Harness, boolean> = {
    codex: has("codex", join(home, ".codex")),
    cursor: has("cursor", join(home, ".cursor")),
    gemini: has("gemini", join(home, ".gemini")),
    // Copilot is a VS Code/JetBrains feature — infer from a project .github dir.
    copilot: existsSync(join(projectRoot, ".github")),
  };
  return all.filter((h) => map[h]);
}

/** Self-update: `git pull` a clone install and re-adapt; else guide the user. */
async function runUpdate(): Promise<void> {
  const isGitClone = existsSync(join(PLUGIN_ROOT, ".git"));
  if (!isGitClone) {
    // Running from the Claude Code plugin cache (managed by Claude).
    process.stdout.write(
      "This PDD is installed as a Claude Code plugin. Update it with:\n" +
        "  claude plugin update pdd@parity-driven-development\n" +
        "Then run 'pdd init' to refresh any Codex/Cursor/Copilot/Gemini command files.\n",
    );
    return;
  }
  process.stdout.write("Updating PDD…\n");
  const pull = spawnSync("git", ["-C", PLUGIN_ROOT, "pull", "--ff-only"], {
    encoding: "utf8",
  });
  process.stdout.write((pull.stdout || "") + (pull.stderr || ""));
  if (pull.status !== 0) {
    process.stdout.write("git pull failed — resolve it and retry.\n");
    return;
  }
  // Re-generate command files for any agents already present.
  const all: Harness[] = ["codex", "cursor", "copilot", "gemini"];
  const skillsDir = join(PLUGIN_ROOT, "skills");
  const detected = detectHarnesses(all, process.cwd());
  for (const harness of detected) {
    const written = adaptAll(harness, { skillsDir, projectRoot: process.cwd(), global: false });
    process.stdout.write(`↻ ${harness}: ${written.length} command(s) refreshed\n`);
  }
  process.stdout.write(`✅ Updated to ${readInstalledVersion(PLUGIN_ROOT)}.\n`);
}

/** Install PDD commands — interactive (specify-init style) when run in a TTY. */
async function runInit(args: string[]): Promise<void> {
  const all: Harness[] = ["codex", "cursor", "copilot", "gemini"];
  const projectRoot = process.cwd();
  const skillsDir = SKILLS_DIR;
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
    const written = adaptAll(harness, { skillsDir, projectRoot, global, rules: !args.includes("--no-rules") });
    const where = harness === "codex" ? "~/.codex (home)" : global ? "home config" : "project";
    process.stdout.write(`✅ ${harness} → ${written.length} command(s) in ${where}\n`);
  }
  process.stdout.write("\nInvoke /audit-bootstrap in your agent to begin.\n");
}

/** Parse argv and dispatch. */
async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const command = args[0] ?? "tui"; // no command → interactive TUI

  if (command === "version" || command === "--version" || command === "-v") {
    process.stdout.write(`pdd ${readInstalledVersion(PLUGIN_ROOT)}\n`);
    return;
  }

  if (command === "check") {
    process.stdout.write((await checkNow(PLUGIN_ROOT, Date.now())) + "\n");
    return;
  }

  if (command === "update") {
    await runUpdate();
    return;
  }

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
    const skillsDir = SKILLS_DIR;
    const written = adaptAll(harness, { skillsDir, projectRoot, global, rules: !args.includes("--no-rules") });
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
        "  pdd adapt <harness>       Generate command files for one of Codex/Cursor/Copilot/Gemini\n" +
        "  pdd check                 Check whether a newer PDD version is available\n" +
        "  pdd update                Update PDD (git clone) or show how (Claude plugin)\n" +
        "  pdd version               Print the installed version\n\n" +
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
    refreshCacheIfStale(Date.now());
    const lang = args.includes("--pt") || process.env.PDD_LANG === "pt" ? "pt" : "en";
    runTui(auditDir, cachedNotice(PLUGIN_ROOT) ?? undefined, lang);
  } else if (watchMode) {
    watchBoard(auditDir);
  } else {
    renderOnce(auditDir);
    const notice = cachedNotice(PLUGIN_ROOT);
    if (notice) process.stdout.write("\n" + notice + "\n");
  }
}

main(process.argv).catch((err) => {
  process.stderr.write(`pdd: ${err?.message ?? err}\n`);
  process.exit(1);
});
