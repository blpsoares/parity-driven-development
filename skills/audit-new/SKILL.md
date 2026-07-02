---
name: "audit-new"
description: "Capture a new finding (a divergence, bug, or incorrect behavior vs the reference system) through a structured two-way interview between the dev and Claude. Produces .audit/findings/NNN-<slug>/README.md with forced discipline — vague answers are rejected. Computes an initial confidence tier, updates .audit/coverage.md, and optionally isolates the work in a git worktree."
argument-hint: "(optional) short description of the problem; if empty, starts the interview from scratch"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Language

Interact with the dev in their working language — never force English on the user; the example phrases below are templates. Write every file you create (README.md, frontmatter, coverage rows) in English so the framework stays shareable.

## Context

This command is part of the **PDD (Parity-Driven Development)** method. A *finding* is the unit of work in PDD — an observed divergence between the new system and the reference system.

**Core principle**: the interview is **two-way**. The dev describes, Claude tries to reproduce (or watches you reproduce), and both discuss before the finding is written to disk. State lives in `.audit/` files, not in the model's context.

## Outline

### 1. Initial checks (blocking)

- Read `.audit/BOOTSTRAP.md`. If it does NOT exist, stop and instruct: "Run `/audit-bootstrap` first — the operational context is mandatory before recording any finding."
- From BOOTSTRAP, extract:
  - `REFERENCE_NAME` — name of the reference system (the golden source of truth)
  - `PROJECT_AREAS` — list of areas/modules/steps for Q1
  - `CHECK_CMD` and `TEST_CMD` — for the acceptance criteria
  - `REFERENCE_CASES` — to suggest a golden case in Q7
  - `CONFIDENCE_MIN` — the minimum evidence tier the project requires (default `tier-1`)
- If a project rules document is referenced in BOOTSTRAP, read it to learn the constraints.
- List `.audit/findings/` and `.audit/resolved/` to determine the next ID:
  - Take the highest `NNN` across all subdirs in both folders.
  - Next ID = highest + 1, padded to 3 digits (`001`, `002`, ..., `999`).
- Load the template at `.claude/skills/audit-new/template.md` (or this skill's local `template.md`).

## Activity tracking (live presence)

So the `pdd` dashboard can show what is running in real time (across parallel agents and worktrees), record a presence file when this skill STARTS and delete it when it FINISHES — including on early/abort exits.

**On start** (run once the finding id is known):

```bash
mkdir -p .audit/activity
printf '{"command":"audit-new","finding":"NNN","worktree":"root","startedAt":"%s","agent":"%s","pid":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git config user.name 2>/dev/null || whoami)" "$$" \
  > ".audit/activity/audit-new-NNN.json"
```

**On finish or abort** (always remove the same file):

```bash
rm -f ".audit/activity/audit-new-NNN.json"
```

### 2. Interview tone — golden rules

**VAGUE SYMPTOMS ARE REJECTED.** If the dev answers "it's wrong", "it doesn't work", "it looks bad", "it's broken", you MUST reply:

> I need an observable fact. For example:
> - **Wrong**: "the orders screen is wrong"
> - **Right**: "the orders screen in the new system shows 3 items; the same order in the reference system shows 5"
>
> What do you concretely see?

Do not proceed until you have a concrete answer.

**NEVER invent data.** If the dev says "I don't know", record literally "unknown" and move on. Do not guess a hypothesis on their behalf.

**ONE SECTION AT A TIME.** Do not chain all questions. End each section with "ok, noted. shall we move on?" and wait for confirmation.

### 3. Interview blocks

#### Block 1 — Identification (3 questions)

**Q1 — Affected area?**
List the areas from BOOTSTRAP (`PROJECT_AREAS`) as numbered options. If it is empty or pending in BOOTSTRAP, ask: "Describe in one sentence which area/screen/module is affected."

If the area is not in the list, accept the free-form description and record it — do not force a fit.

**Q2 — Likely module?**
Based on the chosen area, SUGGEST files from the new system + their counterparts in the reference system. Example:
```
New system:       src/features/orders/orders.service.ts
                  src/features/orders/orders.controller.ts
Reference system: app/models/Order.py (or equivalent)
Confirm or correct?
```

If the dev does not know, record "not identified" and move on.

**Q3 — Severity?**
Options:
- `critical` — blocks the main flow / prevents usage
- `high` — works but the result is incorrect (wrong value, missing data)
- `medium` — visible edge case, usage degraded
- `low` — cosmetic or minimal impact

At the end of Block 1: "Identified. Now let's go to the symptom."

#### Block 2 — Symptom (2 questions, mandatory and concrete)

**Q4 — What do you SEE happen in the new system (one fact)?**
Demand an observable description. A numeric value, on-screen text, an error code, a UI behavior.

**Q5 — What SHOULD happen (what the reference system does)?**
Same demand — one fact. If the dev says "I don't know what the reference system does", PAUSE the interview and suggest:

> Without knowing the reference system's behavior we have no golden answer. Let's check it?
> - Option A: I open the reference system (if a browser MCP is available) and show you
> - Option B: you open the reference system and describe what you see
> - Option C: we pause this finding; come back when you know

At the end of Block 2: "Symptom is clear. Next: reproduction."

#### Block 3 — Reproduction (2 questions)

**Q6 — Steps to reproduce (numbered list)**
Ask for steps starting from "open URL X with user Y and case Z". If the dev gives steps with gaps, ask for more detail.

**Q7 — Which reference case do we use?**
Suggest the cases from BOOTSTRAP (`REFERENCE_CASES`). If none fits, ask which one to use and record it.

At the end of Block 3: "Reproduction mapped. Now the most important decision."

#### Block 4 — DECISION: two-way reproduction (⭐ the heart of PDD)

Present the 3 options textually:

```
I have 3 ways to document this finding better. Which one fits here?

A) I reproduce it now (via a browser MCP, if available).
   Good when: the bug is visual/simple UI, access to the reference
   system is viable without MFA, you want to watch me work.
   Time: ~5 min mine + you observing.

B) YOU reproduce it on your screen now, drop screenshots/exports into
   .audit/findings/NNN-<slug>/refs/, I read them and add observations.
   Good when: complex login, MFA, internal network, or the bug depends
   on state only you can set up.
   Time: yours (variable).

C) We skip reproduction now — what you already documented is enough
   to investigate. We leave reproduction to /audit-investigate.
   Good when: the finding is obvious and the next step is code analysis.

Which one?
```

Execute the chosen path:

**If A**: use a browser MCP to open the reference system + the new system, reproduce the steps, capture what you observed. Describe it in 3-5 lines. Ask: "Does this match what YOU saw? Anything different?" If there is a discrepancy, refine. If you also save paired screenshots into `refs/` (reference vs new), note it — this raises the evidence tier.

**If B**: create the directory `.audit/findings/NNN-<slug>/refs/` up front and tell the dev the path. Wait for the dev to confirm they dropped the files. List the contents, read the images/texts, describe what you observed. Ask for confirmation.

**If C**: record `Reproduction skipped at creation; delegate to /audit-investigate`.

#### Block 5 — Hypothesis (1 question, optional)

**Q8 — Do you have any hypothesis about the cause?**
Accept "I don't know" without pushing.

### 4. Compute the initial confidence tier

From the evidence gathered in Block 4, derive the finding's **initial confidence tier** and record it in the frontmatter as `confidence: tier-N`. Use the evidence-quality ladder:

| Tier | Evidence you actually have now | Label |
|---|---|---|
| `tier-0` | textual description only (path A/B produced no saved artifact, or path C) | 🔴 low |
| `tier-1` | paired screenshots reference-vs-new saved in `refs/` | 🟡 medium |
| `tier-2` | an automated data-to-data diff (only reachable later via `/audit-compare`) | 🟠 high |
| `tier-3` | tier-2 PLUS a passing characterization test (reachable at `/audit-resolve`) | 🟢 max |

Rules:
- At creation a finding can realistically be `tier-0` or `tier-1` only. Do not claim `tier-2`/`tier-3` here — those are earned by `/audit-compare` and `/audit-resolve`.
- Assign `tier-1` **only** if paired reference-vs-new screenshots are actually saved in `refs/`. Otherwise `tier-0`.
- Never inflate the tier. The tier describes evidence you can point to on disk, not confidence in the story.
- If the assigned tier is below `CONFIDENCE_MIN`, that is fine at creation — mention it: "This finding starts at `tier-0`, below the project minimum `CONFIDENCE_MIN`. It will need `/audit-compare` and/or a characterization test before `/audit-resolve` can close it."

### 5. Worktree decision (new block)

Ask exactly:

> Isolate this finding's work in a dedicated git worktree? (yes / no)
>
> - **yes**: I create an isolated worktree + branch `audit/NNN-<slug>`. investigate/resolve/compare/pr will operate inside it. Good for keeping this finding's changes separate from your current workspace.
> - **no**: the branch is created later by `/audit-resolve` in the main checkout (current behavior).

If **yes**:
- **Choose the worktree base directory by harness convention** (worktrees live INSIDE the repo, not as a sibling):
  - **Claude Code** (a `.claude/` directory exists at the repo root) → base = `.claude/worktrees`
  - **Any other / incompatible harness** → base = `.audit-worktrees`
  - (If a harness documents its own worktree location, prefer that; otherwise the two rules above.)
- Ensure the base is git-ignored so worktree contents are never committed: if the base directory (`.claude/worktrees` or `.audit-worktrees`) is not already covered by `.gitignore`, append it.
- Build the absolute worktree path as `<repo-root>/<base>/audit-NNN-<slug>`.
- Run: `git worktree add <repo-root>/<base>/audit-NNN-<slug> audit/NNN-<slug>`
  - This creates the branch `audit/NNN-<slug>` and the worktree in one command.
  - If the branch already exists, use `git worktree add <path> audit/NNN-<slug>` without re-creating it.
- Confirm the command succeeded (worktree path exists). Record `worktree: <absolute-path>` in the frontmatter.
- Tell the dev: "Isolated worktree ready at `<path>` on branch `audit/NNN-<slug>`. Later skills will operate there."

If **no**:
- Record `worktree: none` in the frontmatter. Do NOT create any branch now — `/audit-resolve` handles it in the main checkout.

Aligns with the `superpowers:using-git-worktrees` discipline. This choice is written into the finding and read by every downstream skill.

### 6. Summary and confirmation (before writing)

Show a structured summary of ALL answers (use the same field names as the template, including the computed `confidence` tier and the `worktree` choice). Ask:

> Can I create finding `NNN-<slug>` with this data?
> - **yes**: I write it and finish
> - **edit X**: go back to block X
> - **cancel**: abort without writing

### 7. Slug generation

From the symptom (Q4), generate a short slug (3-5 words) in kebab-case.

**Good examples**: `001-checkout-wrong-total`, `002-empty-list-filter`, `003-export-csv-missing-columns`.
**Bad examples**: `001-bug`, `002-problem`, `003-does-not-work`.

### 8. Writing the files

- Create `.audit/findings/NNN-<slug>/README.md` from the template, replacing every placeholder — including `{{CONFIDENCE}}` (the tier from Step 4) and `{{WORKTREE}}` (the abs-path or `none` from Step 5).
- Create `.audit/findings/NNN-<slug>/refs/` (if it does not already exist).
- If reproduction happened (paths A or B), include the `## Observations during reproduction` section with what you recorded.
- **Update `.audit/coverage.md`** (create it if missing, with the header row):
  ```markdown
  | Behavior / Area | Reference case | Status | Tier | Finding |
  |---|---|---|---|---|
  ```
  - Find the row matching this finding's behavior/area + reference case. If it exists, set `Status` = `finding-open`, `Tier` = the computed tier, `Finding` = `NNN`.
  - If no matching row exists, append a new row: `| <area/behavior> | <reference case or —> | finding-open | tier-N | NNN |`.
  - Valid Status values are exactly: `not-started` | `finding-open` | `verified`.
- Update `.audit/board.md`:
  - Add under "Available": `- [ ] NNN-<slug> — <one-line symptom summary> (severity: X)`

### 9. Closing

Report:
- Path of the created README.md
- Path of the created refs/ folder
- Severity and initial confidence tier
- Worktree: the absolute path (if created) or "none"
- The `coverage.md` row set to `finding-open`
- Next step:
  - If severity=critical: "Run `/audit-investigate NNN` now — it's critical."
  - Otherwise: "When someone picks it up, run `/audit-investigate NNN`."
- **Remove the activity presence file** written at start: `rm -f ".audit/activity/audit-new-NNN.json"`. Do this on normal finish and on any early/abort exit.

## Quality rules

- NEVER accept a vague symptom. Force an observable fact.
- NEVER proceed without the reference system's expected behavior (or an explicit plan to discover it).
- NEVER invent a hypothesis when the dev answers "I don't know".
- NEVER inflate the confidence tier — it must map to evidence on disk (`tier-1` requires saved paired screenshots).
- ALWAYS ask for confirmation of the summary before writing to disk.
- ALWAYS create `refs/` even if empty — the dev needs to know where to drop evidence.
- ALWAYS write `confidence:` and `worktree:` into the frontmatter, and set the `coverage.md` row to `finding-open`.
- ALWAYS remove the activity presence file (`.audit/activity/audit-new-NNN.json`) on finish or abort.
- The AI never authors commits, and `git worktree add` only creates a branch/worktree — it must not commit anything.
