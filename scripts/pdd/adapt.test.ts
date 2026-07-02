// PDD 2.0 — tests for the cross-harness adapter (pure renderers).

import { test, expect } from "bun:test";
import { parseSkill, renderSkillFor, baseDirFor, rulesTargetFor, rulesFileContent, upsertBlock } from "./adapt";

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

test("codex keeps $ARGUMENTS and writes prompts/<name>.md", () => {
  const out = renderSkillFor("codex", parseSkill(SAMPLE));
  expect(out.relPath).toBe("prompts/audit-new.md");
  expect(out.content).toContain("$ARGUMENTS");
});

test("gemini emits TOML with description + prompt and {{args}}", () => {
  const out = renderSkillFor("gemini", parseSkill(SAMPLE));
  expect(out.relPath).toBe("commands/audit-new.toml");
  expect(out.content).toContain("description =");
  expect(out.content).toContain("prompt = \"\"\"");
  expect(out.content).toContain("{{args}}");
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("copilot emits .prompt.md with frontmatter and ${input:args}", () => {
  const out = renderSkillFor("copilot", parseSkill(SAMPLE));
  expect(out.relPath).toBe(".github/prompts/audit-new.prompt.md");
  expect(out.content).toMatch(/^---\ndescription:/);
  expect(out.content).toContain("${input:args}");
});

test("cursor writes commands/<name>.md and rewrites the arg token", () => {
  const out = renderSkillFor("cursor", parseSkill(SAMPLE));
  expect(out.relPath).toBe("commands/audit-new.md");
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("baseDirFor honors global vs project (Codex is always home)", () => {
  // Codex only reads ~/.codex — never the project dir.
  expect(baseDirFor("codex", "/proj", false)).not.toContain("/proj");
  expect(baseDirFor("codex", "/proj", false)).toContain(".codex");
  expect(baseDirFor("copilot", "/proj", false)).toBe("/proj");
  expect(baseDirFor("cursor", "/proj", false)).toBe("/proj/.cursor");
  expect(baseDirFor("gemini", "/proj", true)).toContain(".gemini");
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
