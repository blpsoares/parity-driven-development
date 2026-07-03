// PDD 2.0 — tests for the cross-harness adapter (pure renderers).

import { test, expect } from "bun:test";
import { homedir } from "node:os";
import {
  parseSkill,
  renderSkillFor,
  baseDirFor,
  rulesTargetFor,
  rulesFileContent,
  upsertBlock,
  assertSafeProjectRoot,
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

test("codex writes the shared .agents/skills/<name>/SKILL.md convention", () => {
  const out = renderSkillFor("codex", parseSkill(SAMPLE));
  expect(out.relPath).toBe(".agents/skills/audit-new/SKILL.md");
  expect(out.content).toMatch(/^---\nname: audit-new\ndescription:/);
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("gemini writes the same shared .agents/skills convention as codex", () => {
  const out = renderSkillFor("gemini", parseSkill(SAMPLE));
  expect(out.relPath).toBe(".agents/skills/audit-new/SKILL.md");
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("copilot writes the same shared .agents/skills convention", () => {
  const out = renderSkillFor("copilot", parseSkill(SAMPLE));
  expect(out.relPath).toBe(".agents/skills/audit-new/SKILL.md");
  expect(out.content).toMatch(/^---\nname: audit-new\ndescription:/);
});

test("cursor writes commands/<name>.md and rewrites the arg token", () => {
  const out = renderSkillFor("cursor", parseSkill(SAMPLE));
  expect(out.relPath).toBe("commands/audit-new.md");
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("baseDirFor honors global vs project for all .agents/skills harnesses", () => {
  // Codex/Gemini/Copilot all discover .agents/skills at the project root, or
  // the home-global ~/.agents/skills — none of them are home-only anymore.
  expect(baseDirFor("codex", "/proj", false)).toBe("/proj");
  expect(baseDirFor("codex", "/proj", true)).not.toContain("/proj");
  expect(baseDirFor("copilot", "/proj", false)).toBe("/proj");
  expect(baseDirFor("cursor", "/proj", false)).toBe("/proj/.cursor");
  expect(baseDirFor("gemini", "/proj", true)).not.toContain("/proj");
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
    expect(renderSkillFor(h, skill).content).not.toContain("Claude");
  }
});

test("rulesTargetFor picks the right file + mode per harness", () => {
  expect(rulesTargetFor("cursor")).toEqual({ relPath: ".cursor/rules/pdd.mdc", mode: "overwrite" });
  expect(rulesTargetFor("copilot").relPath).toBe(".github/instructions/pdd.instructions.md");
  expect(rulesTargetFor("codex")).toEqual({ relPath: "AGENTS.md", mode: "block" });
  expect(rulesTargetFor("gemini").mode).toBe("block");
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
