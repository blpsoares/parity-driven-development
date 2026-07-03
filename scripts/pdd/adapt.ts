// PDD 2.0 — cross-harness adapter.
// Generates per-harness slash-command / prompt files from the canonical
// `skills/*/SKILL.md`, so PDD works in Codex, Cursor, Copilot, Gemini CLI, etc.
// The pure renderers (parseSkill, renderSkillFor) are unit-tested; adaptAll does IO.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export interface Skill {
  name: string;
  description: string;
  body: string; // the SKILL.md content below the frontmatter
}

/** Parse a SKILL.md into name/description/body (small, forgiving frontmatter reader). */
export function parseSkill(md: string): Skill {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const front = m ? m[1] : "";
  const body = (m ? m[2] : md).trim();
  const name = (front.match(/name:\s*["']?([^"'\n]+?)["']?\s*$/m)?.[1] ?? "").trim();
  const description = (front.match(/description:\s*["']?([\s\S]*?)["']?\s*\n[a-z-]+:/)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return { name, description, body };
}

export type Harness = "codex" | "cursor" | "copilot" | "gemini";

/**
 * Codex CLI, Gemini CLI and Copilot CLI all discover the same convergent
 * convention: a `.agents/skills/<name>/SKILL.md` directory at the project
 * root (each also accepts a home-global `~/.agents/skills/`). Codex's older
 * `~/.codex/prompts` custom-prompt mechanism is deprecated by OpenAI in favor
 * of this. None of the three support literal argument substitution for
 * skills — they're picked from a menu or matched by description — so their
 * bodies use natural-language phrasing instead of a `$ARGUMENTS` token.
 */
const AGENTS_SKILLS_HARNESSES: ReadonlySet<Harness> = new Set(["codex", "gemini", "copilot"]);

const NATURAL_ARGS = "the arguments the user typed after the command";

function withArgs(body: string): string {
  return body.split("$ARGUMENTS").join(NATURAL_ARGS);
}

/** Make adapted commands agent-neutral (they run outside Claude Code). */
function deClaude(s: string): string {
  return s.replace(/\bClaude Code\b/g, "the agent").replace(/\bClaude\b/g, "the agent");
}

/** Render one skill for a harness → the relative output path and file content. */
export function renderSkillFor(
  harness: Harness,
  skill: Skill,
): { relPath: string; content: string } {
  const body = deClaude(withArgs(skill.body));
  const description = deClaude(skill.description);
  if (AGENTS_SKILLS_HARNESSES.has(harness)) {
    return {
      relPath: `.agents/skills/${skill.name}/SKILL.md`,
      content: `---\nname: ${skill.name}\ndescription: ${description}\n---\n\n${body}\n`,
    };
  }
  // cursor: its own commands convention, not the .agents/skills standard.
  return { relPath: `commands/${skill.name}.md`, content: body + "\n" };
}

/** Base directory a harness writes into (global = user home, else the project root). */
export function baseDirFor(harness: Harness, projectRoot: string, global: boolean): string {
  const home = homedir();
  if (AGENTS_SKILLS_HARNESSES.has(harness)) {
    // relPath already includes .agents/skills/<name>/SKILL.md
    return global ? home : projectRoot;
  }
  // cursor
  return global ? join(home, ".cursor") : join(projectRoot, ".cursor");
}

/** Read every canonical skill from a `skills/` directory. */
export function readSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];
  const out: Skill[] = [];
  for (const entry of readdirSync(skillsDir)) {
    const file = join(skillsDir, entry, "SKILL.md");
    if (existsSync(file)) out.push(parseSkill(readFileSync(file, "utf8")));
  }
  return out.filter((s) => s.name);
}

/**
 * The always-on PDD rule installed for non-Claude agents. Because those harnesses
 * have no session hook, this static rule tells the agent to check for updates via
 * the `pdd` CLI — giving the same proactive behavior the Claude Code hook provides.
 */
export function rulesBody(): string {
  return [
    "This project uses PDD (Parity-Driven Development) — a framework for tracking behavioral parity during refactors, rewrites and ports.",
    "",
    "**Update awareness:** when you begin PDD work here, run `pdd check` in the terminal. If it reports a `🔔 update available` notice, tell the user in one short line, offer to summarize what changed (the CHANGELOG), and offer to run `pdd update`. Do not bring it up again if they decline.",
    "",
    "Commands: `/audit-bootstrap`, `/audit-new`, `/audit-investigate`, `/audit-resolve`, `/audit-compare`, `/audit-qa <env>`, `/audit-pr`, `/audit-status`. Full method and reference: `AGENTS.md`.",
  ].join("\n");
}

/** Where the always-on rule goes for a harness, and how to write it. */
export function rulesTargetFor(
  harness: Harness,
): { relPath: string; mode: "overwrite" | "block" } {
  switch (harness) {
    case "cursor":
      return { relPath: ".cursor/rules/pdd.mdc", mode: "overwrite" };
    case "copilot":
      return { relPath: ".github/instructions/pdd.instructions.md", mode: "overwrite" };
    case "codex":
      return { relPath: "AGENTS.md", mode: "block" };
    case "gemini":
      return { relPath: "GEMINI.md", mode: "block" };
  }
}

/** Full file content for the "overwrite" harnesses (adds the required frontmatter). */
export function rulesFileContent(harness: Harness): string {
  const body = rulesBody();
  if (harness === "cursor")
    return `---\ndescription: PDD update-awareness and command reference\nalwaysApply: true\n---\n\n${body}\n`;
  if (harness === "copilot") return `---\napplyTo: "**"\n---\n\n${body}\n`;
  return body;
}

const PDD_BEGIN = "<!-- PDD:BEGIN (managed by pdd) -->";
const PDD_END = "<!-- PDD:END -->";

/** Insert or replace the PDD marked block in a shared instructions file. */
export function upsertBlock(existing: string, body: string): string {
  const block = `${PDD_BEGIN}\n${body}\n${PDD_END}`;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc(PDD_BEGIN) + "[\\s\\S]*?" + esc(PDD_END));
  if (re.test(existing)) return existing.replace(re, block);
  return (existing.trim() ? existing.trimEnd() + "\n\n" : "") + block + "\n";
}

/** Write the always-on rule for a harness into the project. Returns its path. */
export function writeRules(harness: Harness, projectRoot: string): string {
  const { relPath, mode } = rulesTargetFor(harness);
  const target = join(projectRoot, relPath);
  mkdirSync(join(target, ".."), { recursive: true });
  if (mode === "overwrite") {
    writeFileSync(target, rulesFileContent(harness));
  } else {
    const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
    writeFileSync(target, upsertBlock(existing, rulesBody()));
  }
  return target;
}

/**
 * Refuse to write project-scoped files into $HOME. Without this, running the
 * installer from outside a project (e.g. `pdd adapt codex` from `~`) silently
 * scatters AGENTS.md / .cursor / .gemini / .agents/skills into the user's
 * home directory instead of their project. `--global` opts in explicitly.
 */
export function assertSafeProjectRoot(projectRoot: string, global: boolean): void {
  if (global) return;
  if (resolve(projectRoot) === homedir()) {
    throw new Error(
      `refusing to install into your home directory (${homedir()}) without --global.\n` +
        "cd into your project first, or pass --global if you really want a global install.",
    );
  }
}

/** Generate all command files (and the always-on rule) for a harness. */
export function adaptAll(
  harness: Harness,
  opts: { skillsDir: string; projectRoot: string; global: boolean; rules?: boolean },
): string[] {
  assertSafeProjectRoot(opts.projectRoot, opts.global);
  const base = baseDirFor(harness, opts.projectRoot, opts.global);
  const written: string[] = [];
  for (const skill of readSkills(opts.skillsDir)) {
    const { relPath, content } = renderSkillFor(harness, skill);
    const target = join(base, relPath);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
    written.push(target);
  }
  if (opts.rules !== false) written.push(writeRules(harness, opts.projectRoot));
  return written;
}
