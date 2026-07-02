// PDD 2.0 — cross-harness adapter.
// Generates per-harness slash-command / prompt files from the canonical
// `skills/*/SKILL.md`, so PDD works in Codex, Cursor, Copilot, Gemini CLI, etc.
// The pure renderers (parseSkill, renderSkillFor) are unit-tested; adaptAll does IO.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/** How each harness expects the "arguments" placeholder to be written. */
const ARG_TOKEN: Record<Harness, string> = {
  codex: "$ARGUMENTS", // Codex expands $ARGUMENTS, same as Claude Code
  cursor: "the arguments the user typed after the command",
  copilot: "${input:args}",
  gemini: "{{args}}",
};

function withArgs(body: string, harness: Harness): string {
  return body.split("$ARGUMENTS").join(ARG_TOKEN[harness]);
}

/** Render one skill for a harness → the relative output path and file content. */
export function renderSkillFor(
  harness: Harness,
  skill: Skill,
): { relPath: string; content: string } {
  const body = withArgs(skill.body, harness);
  switch (harness) {
    case "codex":
      return { relPath: `prompts/${skill.name}.md`, content: body + "\n" };
    case "cursor":
      return { relPath: `commands/${skill.name}.md`, content: body + "\n" };
    case "copilot":
      return {
        relPath: `.github/prompts/${skill.name}.prompt.md`,
        content: `---\ndescription: "${skill.description.replace(/"/g, "'")}"\n---\n\n${body}\n`,
      };
    case "gemini": {
      const prompt = body.split('"""').join('\\"\\"\\"');
      return {
        relPath: `commands/${skill.name}.toml`,
        content: `description = "${skill.description.replace(/"/g, "'")}"\nprompt = """\n${prompt}\n"""\n`,
      };
    }
  }
}

/** Base directory a harness writes into (global = user home, else the project root). */
export function baseDirFor(harness: Harness, projectRoot: string, global: boolean): string {
  const home = homedir();
  switch (harness) {
    case "codex":
      return global ? join(home, ".codex") : join(projectRoot, ".codex");
    case "cursor":
      return global ? join(home, ".cursor") : join(projectRoot, ".cursor");
    case "gemini":
      return global ? join(home, ".gemini") : join(projectRoot, ".gemini");
    case "copilot":
      return projectRoot; // relPath already includes .github/prompts
  }
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

/** Generate all command files for a harness. Returns the absolute paths written. */
export function adaptAll(
  harness: Harness,
  opts: { skillsDir: string; projectRoot: string; global: boolean },
): string[] {
  const base = baseDirFor(harness, opts.projectRoot, opts.global);
  const written: string[] = [];
  for (const skill of readSkills(opts.skillsDir)) {
    const { relPath, content } = renderSkillFor(harness, skill);
    const target = join(base, relPath);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
    written.push(target);
  }
  return written;
}
