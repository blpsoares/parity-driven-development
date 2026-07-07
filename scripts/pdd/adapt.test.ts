// PDD 2.0 — tests for the cross-harness adapter (pure renderers).

import { test, expect } from "bun:test";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import {
  parseSkill,
  renderSkillFor,
  baseDirFor,
  rulesTargetFor,
  rulesFileContent,
  upsertBlock,
  assertSafeProjectRoot,
  addToGitignore,
  adaptAll,
} from "./adapt";

const SAMPLE = `---
name: "audit-new"
description: "Capture a new finding via a two-way interview."
argument-hint: "short description"
user-invocable: true
disable-model-invocation: true
---

## User Input

\`\`\`text
$ARGUMENTS
\`\`\`

Do the thing with $ARGUMENTS.
`;

test("parseSkill extracts name, description and body", () => {
  const s = parseSkill(SAMPLE);
  expect(s.name).toBe("audit-new");
  expect(s.description).toContain("Capture a new finding");
  expect(s.body).toContain("## User Input");
  expect(s.body).not.toContain("disable-model-invocation"); // frontmatter stripped
});

test("codex writes its own .agents/skills/<name>/SKILL.md convention", () => {
  const out = renderSkillFor("codex", parseSkill(SAMPLE), false);
  expect(out.relPath).toBe(".agents/skills/audit-new/SKILL.md");
  expect(out.content).toMatch(/^---\nname: audit-new\ndescription:/);
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("cursor writes .cursor/skills/<name>/SKILL.md (own convention, not .agents)", () => {
  const out = renderSkillFor("cursor", parseSkill(SAMPLE), false);
  expect(out.relPath).toBe(".cursor/skills/audit-new/SKILL.md");
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("gemini writes .gemini/skills/<name>/SKILL.md", () => {
  const out = renderSkillFor("gemini", parseSkill(SAMPLE), false);
  expect(out.relPath).toBe(".gemini/skills/audit-new/SKILL.md");
});

test("copilot writes .github/skills/<name>/SKILL.md in a project, .copilot/skills/ globally", () => {
  const project = renderSkillFor("copilot", parseSkill(SAMPLE), false);
  expect(project.relPath).toBe(".github/skills/audit-new/SKILL.md");
  const global = renderSkillFor("copilot", parseSkill(SAMPLE), true);
  expect(global.relPath).toBe(".copilot/skills/audit-new/SKILL.md");
});

test("claude writes .claude/skills/<name>/SKILL.md and keeps $ARGUMENTS + 'Claude' mentions", () => {
  const skill = parseSkill(SAMPLE.replace("$ARGUMENTS", "$ARGUMENTS between the dev and Claude"));
  const out = renderSkillFor("claude", skill, false);
  expect(out.relPath).toBe(".claude/skills/audit-new/SKILL.md");
  expect(out.content).toContain("$ARGUMENTS");
  expect(out.content).toContain("Claude");
});

test("baseDirFor is projectRoot for project scope, homedir() for global — no harness-specific logic needed", () => {
  expect(baseDirFor("/proj", false)).toBe("/proj");
  expect(baseDirFor("/proj", true)).toBe(homedir());
});

test("assertSafeProjectRoot refuses $HOME without --global", () => {
  const home = homedir();
  expect(() => assertSafeProjectRoot(home, false)).toThrow(/home directory/);
  expect(() => assertSafeProjectRoot(home, true)).not.toThrow();
  expect(() => assertSafeProjectRoot("/some/project", false)).not.toThrow();
});

test("adapted commands are agent-neutral (no 'Claude' leakage)", () => {
  const skill = parseSkill(SAMPLE.replace("$ARGUMENTS", "$ARGUMENTS between the dev and Claude"));
  for (const h of ["codex", "cursor", "copilot", "gemini"] as const) {
    expect(renderSkillFor(h, skill, false).content).not.toContain("Claude");
  }
});

test("rulesTargetFor picks the right file + mode per harness", () => {
  expect(rulesTargetFor("cursor")).toEqual({ relPath: ".cursor/rules/pdd.mdc", mode: "overwrite" });
  expect(rulesTargetFor("copilot").relPath).toBe(".github/instructions/pdd.instructions.md");
  expect(rulesTargetFor("codex")).toEqual({ relPath: "AGENTS.md", mode: "block" });
  expect(rulesTargetFor("gemini").mode).toBe("block");
});

test("rulesTargetFor returns null for claude — the plugin's session hook already covers update-awareness", () => {
  expect(rulesTargetFor("claude")).toBeNull();
});

test("rulesFileContent has the required frontmatter and update directive", () => {
  expect(rulesFileContent("cursor")).toContain("alwaysApply: true");
  expect(rulesFileContent("copilot")).toContain('applyTo: "**"');
  expect(rulesFileContent("cursor")).toContain("pdd check");
  expect(rulesFileContent("cursor")).toContain("pdd update");
});

test("upsertBlock inserts once and is idempotent on re-run", () => {
  const original = "# My AGENTS.md\n\nExisting content.\n";
  const once = upsertBlock(original, "BODY-A");
  expect(once).toContain("# My AGENTS.md");
  expect(once).toContain("PDD:BEGIN");
  expect(once).toContain("BODY-A");
  // Re-running replaces the block in place (no duplication, content updated).
  const twice = upsertBlock(once, "BODY-B");
  expect(twice.match(/PDD:BEGIN/g)?.length).toBe(1);
  expect(twice).toContain("BODY-B");
  expect(twice).not.toContain("BODY-A");
});

test("adaptAll writes no rules file for claude, only the skill files", () => {
  const dir = mkdtempSync(join(tmpdir(), "pdd-adapt-test-"));
  try {
    const skillsDir = join(dir, "skills", "sample-skill");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "SKILL.md"), SAMPLE);
    const projectRoot = join(dir, "project");
    mkdirSync(projectRoot, { recursive: true });

    const written = adaptAll("claude", {
      skillsDir: join(dir, "skills"),
      projectRoot,
      global: false,
    });

    expect(written).toEqual([join(projectRoot, ".claude/skills/audit-new/SKILL.md")]);
    expect(existsSync(join(projectRoot, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("addToGitignore is idempotent and appends under a managed header", () => {
  const dir = mkdtempSync(join(tmpdir(), "pdd-gi-test-"));
  try {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    const first = addToGitignore(dir, [".agents/skills/", ".agents/skills/"]);
    expect(first).toBe(join(dir, ".gitignore"));
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain("node_modules/");
    expect(gi).toContain(".agents/skills/");
    expect((gi.match(/\.agents\/skills\//g) || []).length).toBe(1); // deduped
    // second run with the same pattern is a no-op (returns null)
    expect(addToGitignore(dir, [".agents/skills/"])).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adaptAll priv install gitignores the skill dir and skips the shared AGENTS.md block", () => {
  const dir = mkdtempSync(join(tmpdir(), "pdd-priv-test-"));
  try {
    const skillsDir = join(dir, "skills", "sample-skill");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "SKILL.md"), SAMPLE);
    const projectRoot = join(dir, "project");
    mkdirSync(projectRoot, { recursive: true });

    const written = adaptAll("codex", {
      skillsDir: join(dir, "skills"),
      projectRoot,
      global: false,
      priv: true,
    });

    // skill file written, .gitignore updated, and NO shared AGENTS.md touched
    expect(written).toContain(join(projectRoot, ".agents/skills/audit-new/SKILL.md"));
    expect(written).toContain(join(projectRoot, ".gitignore"));
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(false);
    expect(readFileSync(join(projectRoot, ".gitignore"), "utf8")).toContain(".agents/skills/");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adaptAll priv install for cursor gitignores both the skill dir and the dedicated rule file", () => {
  const dir = mkdtempSync(join(tmpdir(), "pdd-priv-cursor-"));
  try {
    const skillsDir = join(dir, "skills", "sample-skill");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "SKILL.md"), SAMPLE);
    const projectRoot = join(dir, "project");
    mkdirSync(projectRoot, { recursive: true });

    adaptAll("cursor", {
      skillsDir: join(dir, "skills"),
      projectRoot,
      global: false,
      priv: true,
    });

    const gi = readFileSync(join(projectRoot, ".gitignore"), "utf8");
    expect(gi).toContain(".cursor/skills/");
    expect(gi).toContain(".cursor/rules/pdd.mdc");
    // the dedicated rule file IS written (it can be safely ignored)
    expect(existsSync(join(projectRoot, ".cursor/rules/pdd.mdc"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
