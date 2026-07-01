---
name: "audit-investigate"
description: "Investigates an existing finding — decides the approach (static/dynamic/visual/combined) in conversation with the dev, executes it, and documents findings in investigation.md. Does NOT modify code — it only understands and diagnoses."
argument-hint: "finding ID (e.g. 007 or 007-checkout-wrong-total)"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Context

Part of the **PDD (Parity-Driven Development)** method. This skill **investigates** — it does not fix. The goal is to understand the root cause with enough evidence that `/audit-resolve` has everything it needs.

**Interact with the dev in their working language — never force English on the user; the example phrases below are templates.**

This command is strictly **read-only** with respect to source code and the reference system. It never authors commits, never writes to a database, and never runs destructive operations.

## Outline

### 1. Initial checks

- Read `.audit/BOOTSTRAP.md`. If it does NOT exist: stop and instruct the dev to run `/audit-bootstrap`.
- From BOOTSTRAP, extract: `REFERENCE_NAME`, `REFERENCE_ACCESS`, available MCPs, and `CONFIDENCE_MIN`.
- If a project rules document exists, read it to learn the constraints (e.g. which database operations are forbidden).
- Parse `$ARGUMENTS`:
  - If empty: list open findings in `.audit/findings/` and ask which one to investigate.
  - If in the form `NNN`: locate the folder `.audit/findings/NNN-*`.
  - If in the form `NNN-<slug>`: locate it directly.
  - If not found: clear error listing the available findings.
- Read the finding's `.audit/findings/<folder>/README.md` in full.
- **Read the `worktree` field from the finding's frontmatter:**
  - If `worktree` is a path (not `none`): all reading and analysis for this finding must happen **inside that worktree**. Treat that path as your working root for every `Read`/`Grep`/`Glob`/`git log` and for locating the new-system source. If the path does not exist on disk, stop and tell the dev the worktree is missing (they may need to recreate it or set `worktree: none`).
  - If `worktree` is `none` (or absent): operate in the main checkout, as usual.
- List `.audit/findings/<folder>/refs/` and read any `.md` or `.txt` evidence. Note the image filenames.
- Check whether `investigation.md` already exists:
  - If YES: ask "This finding already has an investigation. Do you want to (a) continue where it left off, (b) add more findings, or (c) overwrite it?"
  - If NO: proceed.
- Load the template at `.claude/skills/audit-investigate/template.md`.

### 2. Finding presentation (quick overview for the dev)

Before deciding on an approach, summarize the finding in 4-6 lines:

```
Finding NNN — <title>
Area: <area>, Severity: <severity>
Confidence (current): <tier-N>
Worktree: <path | none>
Symptom: <symptom in 1 sentence>
Expected: <reference-system behavior in 1 sentence>
Evidence in refs/: <list or "none">
Notes captured during reproduction: <yes, summary | not captured>
```

### 3. ⭐ APPROACH DECISION — conversation with the dev

Present the 4 options:

```
To investigate this finding I see 4 possible paths. Which one fits here?

A) STATIC ANALYSIS (me alone — fastest)
   I do: grep the new code, grep/read the reference system,
          identify divergences in logic or structure.
   Good when: we already know the module and the likely cause is a
          code-to-code implementation difference.
   Cost: 5-15 min of my time. You don't even need to watch.

B) DYNAMIC ANALYSIS (me alone, with database or API)
   I do: run queries/calls through the available MCP with the
          reference case, compare results, compute diffs.
   Good when: we suspect a DATA divergence (wrong value, wrong
          quantity, different calculation), not a code one.
   Cost: read-only operations. 10-20 min of my time.

C) VISUAL REPRODUCTION (you drive, I read)
   I do: you reproduce the bug live in both systems, drop
          screenshots and outputs into refs/, I correlate with code.
   Good when: the bug is visual/UX, or depends on a complex login /
          state that only you can set up.
   Cost: your time (variable).

D) COMBINED — A + B (or A + C, or B + C)
   When the cause is multi-layered (code + data, for example).
   You choose the order.

Which one?
```

**Execute the chosen path.**

> Reminder: if the finding has a worktree path, every file operation in the paths below runs against that worktree.

### 4. Execution — path A (static)

1. Identify the new-system files and the reference-system files listed in the README.
2. Use `Read`/`Grep`/`Glob` to read the relevant excerpts (inside the worktree when one is set).
3. **For each divergent function/query:**
   - Cite the new-system excerpt (file + line).
   - Cite the equivalent excerpt in the reference system (file + line).
   - Describe the divergence in 1 sentence.
   - Classify it: ❌ critical divergence / ⚠️ cosmetic divergence with no impact / ✅ equivalent.
4. If the divergence is not obvious, consult the reference system's history (`git log`, if it is a repository).

### 5. Execution — path B (dynamic, with database/API)

1. Use the available MCP for the database or API calls:
   - Run the new system's query/operation with the reference case, capture the result.
   - Run the reference system's equivalent query/operation, capture the result.
   - Compare column by column or field by field.
2. **NEVER** run destructive operations — read-only only. Before running any query, confirm with the dev: "I'm going to run this query: `<query>`. Is that OK?"
3. Document: new-system result, reference-system result, diff.
4. If the difference suggests the DATABASE holds divergent data (not the code), flag it and pause — it may not be a bug in the new system but an environment issue.

### 6. Execution — path C (visual, via dev)

1. Instruct the dev:
   > Open both systems now. Reproduce the steps from README.md. Drop into `refs/`:
   > - Screenshot of the reference system (name: `reference-<area>.png`)
   > - Screenshot of the new system (name: `new-<area>.png`)
   > - If there is a divergent value: a screen export or the API output (`new-api-<route>.json`)
   > Let me know when you're done.

2. After confirmation, list `refs/`, read the images and texts.
3. Describe what you observed in 5-10 lines + correlation with the code (if you already looked).
4. If you need more evidence, ask for it specifically.

> Note: paired screenshots (reference vs new) are Tier 1 evidence and can raise the finding's confidence — see Step 8.

### 7. Execution — path D (combined)

Execute in the agreed order. Document each sub-phase separately.

### 8. Synthesis — ranked hypotheses

At the end, ALWAYS write:

1. **Observed facts**: numbered list of CONFIRMED things (not assumptions).
2. **Root-cause hypotheses**: list ranked by probability (approximate %).
   - Each hypothesis: description + supporting evidence + weakening evidence.
3. **Recommendation to resolve**: which hypothesis to attack first and how.
4. **Known risks of the fix**: possible regressions, tests to run.

**Confidence note (optional).** If the investigation raised the quality of the evidence, you may raise the finding's `confidence` tier:
- tier-0 = textual description only.
- tier-1 = paired reference-vs-new screenshots collected (path C or D).
- tier-2 = automated data-to-data diff (this is really `/audit-compare`'s job — mention it if the dynamic path already produced one).
- tier-3 = tier-2 plus a passing characterization test (produced later, in `/audit-resolve`).

Only raise the tier when the evidence genuinely supports it, and record the new value in the finding's `README.md` frontmatter. Never inflate a tier.

### 9. Writing `investigation.md`

Use the template at `.claude/skills/audit-investigate/template.md`. Include:
- The chosen approach (A/B/C/D) and a 1-sentence justification.
- Everything observed during execution (with file:line citations).
- The synthesis (facts, hypotheses, recommendation, risks).
- Timestamp and author.

Write it to `.audit/findings/<folder>/investigation.md`.

### 10. Board update

In `.audit/board.md`, move the finding from "Available" to "Investigated (ready to resolve)":

```markdown
## Investigated (ready to resolve)
- [ ] NNN-<slug> — <recommendation in one line>
```

### 11. Wrap-up

Report:
- The path of `investigation.md`.
- A 3-line summary of the ranked hypotheses.
- Next step: "When you want to fix it, run `/audit-resolve NNN`."
- If the investigation indicated the bug is NOT in the new system (e.g. divergent data in the dev database, a pending feature), state it clearly and suggest moving the finding to `resolved/` with an "out of scope" note.

## Quality rules

- NEVER modify code (this command is read-only with respect to source).
- NEVER run write operations on the database without explicit confirmation from the dev.
- ALWAYS confirm any destructive query before running it.
- ALWAYS show hypotheses even when the cause seems obvious.
- ALWAYS cite file:line when referring to code.
- ALWAYS separate "observed fact" from "hypothesis" — do not mix them.
- If the finding has a `worktree` path, ALWAYS read and analyze inside that worktree; if it is `none`, operate in the main checkout.
