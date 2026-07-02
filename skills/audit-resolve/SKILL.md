---
name: "audit-resolve"
description: "Implements the fix for an already-investigated finding, pins the reference behavior with a characterization test, validates parity against the reference system, writes resolution.md with a machine-readable evidence block, and moves the folder to .audit/resolved/. NEVER commits or pushes — only suggests the command to the dev."
argument-hint: "Finding ID (e.g. 007 or 007-checkout-wrong-total)"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Language

Interact with the dev in their working language — never force English on the user; the example phrases below are templates.

## Context

Part of the **PDD (Parity-Driven Development)** method. This is the final phase of a finding's lifecycle — where code actually changes.

**PDD inviolable rule**: the AI never *authors* commits. Push / `gh pr create` only happen after an explicit human "yes" in the same session. Merge is 100% human and only after QA approves. This skill NEVER commits autonomously — it only prepares the fix and suggests the command.

**Evidence over vibes**: a fix is not "done" because it looks right. It is done when it meets the **confidence gate** (`CONFIDENCE_MIN`) with objective evidence: a passing characterization test, a parity diff, and/or paired screenshots.

## Confidence tiers (evidence quality)

| Tier | Evidence | Label |
|---|---|---|
| tier-0 | textual description only | 🔴 low |
| tier-1 | paired screenshots (reference vs new) | 🟡 medium |
| tier-2 | automated data-to-data diff produced by `/audit-compare` | 🟠 high |
| tier-3 | tier-2 PLUS a passing characterization test | 🟢 max |

## Outline

### 1. Initial checks

- Read `.audit/BOOTSTRAP.md`. If it does NOT exist: stop and instruct `/audit-bootstrap`.
- From BOOTSTRAP, extract:
  - `CHECK_CMD` and `TEST_CMD` — mandatory for validation gates
  - `CONFIDENCE_MIN` (default `tier-1`) — the minimum evidence tier required to mark a finding resolved
  - `REFERENCE_NAME` and `REFERENCE_CONSTRAINTS` — to know what NOT to do
  - The project's inviolable rules (BOOTSTRAP Section 12)
- If a project rules document exists, read it and apply it to the fix.
- Parse `$ARGUMENTS` (same logic as `/audit-investigate`).
- Confirm the finding folder exists at `.audit/findings/<NNN>-<slug>/`.
- Read the finding's `README.md`, including its frontmatter — you will need `confidence`, `worktree`, `slug`, `area`.
- Read `investigation.md` — **if it does NOT exist, stop** and instruct:
  > This finding has not been investigated yet. Run `/audit-investigate {{ID}}` first.
  > Fixing without investigation is a recipe for regression — that's why PDD enforces this order.
- If `investigation.md` has an "Out of scope" section filled in, stop and suggest:
  > Investigation concluded this finding is out of scope. Recommendation: move the folder to
  > `.audit/resolved/` directly and mark it on the board as "closed without fix".
  > Want me to do that? (yes/no)
- Check whether `resolution.md` already exists:
  - If YES: "A resolution already exists. Do you want to (a) review it, or (b) overwrite it after a new attempt?"
- Load the template from `skills/audit-resolve/template.md`.

## Activity tracking (live presence)

So the `pdd` dashboard can show what is running in real time (across parallel agents and worktrees), record a presence file when this skill STARTS and delete it when it FINISHES — including on early/abort exits.

Substitute `NNN` with the finding id, and `WT` with the finding's `worktree` field when it is an absolute path, otherwise the literal `root`.

**On start** (run once the finding id is known):

```bash
mkdir -p .audit/activity
printf '{"command":"audit-resolve","finding":"NNN","worktree":"WT","startedAt":"%s","agent":"%s","pid":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git config user.name 2>/dev/null || whoami)" "$$" \
  > ".audit/activity/audit-resolve-NNN.json"
```

**On finish or abort** (always remove the same file):

```bash
rm -f ".audit/activity/audit-resolve-NNN.json"
```

### 2. Worktree mode vs. branch mode

Read the finding's `worktree:` field from its README frontmatter. This decides where you work.

**A) `worktree:` is an absolute PATH** (the finding was created with `/audit-new` worktree isolation):

- Do NOT create a new branch in the main checkout.
- Operate INSIDE that worktree for every file change, check, and test. If the tooling supports entering the worktree, do so; otherwise run every command with that path as the working directory.
- Confirm the worktree exists and is on the expected branch `audit/NNN-<slug>`:
  ```bash
  git -C <worktree-path> rev-parse --abbrev-ref HEAD
  ```
- If the path is missing (worktree was removed), stop and ask the dev whether to recreate it or fall back to branch mode.
- Report: "Operating inside the finding's worktree: `<worktree-path>` (branch `audit/NNN-<slug>`)."

**B) `worktree:` is the literal `none`** (branch will be created here, as before):

- Confirm a clean git state: `git status --short`. If there are uncommitted changes, ask:
  > There are uncommitted changes. I suggest committing them before starting, to isolate this fix's diff. Want to pause?
- Create the working branch:
  ```bash
  git checkout -b audit/NNN-<slug>
  ```
  The `audit/` prefix marks the branch as PDD-originated. Report which branch was created.
  If the branch already exists, ask: "(a) use it as-is, or (b) create with an alternative name?"

`/audit-compare` and `/audit-pr` follow the same rule: they operate inside the finding's worktree when it is a path.

### 3. Confirm the plan with the dev

Before modifying ANY file, present:

```
Resolution plan for finding NNN:

Based on the investigation:
- Hypothesis to attack: <most likely hypothesis from investigation.md>
- Files to modify:
  * <file 1> (reason for the change)
  * <file 2> (reason for the change)
- Characterization test to add (mandatory — golden master):
  * <test path> — pins the reference behavior for case <X>
- Post-fix validation:
  * {{CHECK_CMD}}
  * {{TEST_CMD}}
  * Parity comparison with the reference system using case <X> (via /audit-compare)
- Target confidence tier: <tier-N> (CONFIDENCE_MIN is {{CONFIDENCE_MIN}})

May I proceed? (yes / change plan / cancel)
```

Wait for an explicit answer. Do not touch code before it.

### 4. Characterization test first (mandatory — golden master)

Before or alongside the fix, write a **characterization test** that pins the reference system's behavior for exactly this finding's case. This is the regression lock.

- The test asserts the *correct* (reference) behavior for the finding's scenario, using the reference case from the README / BOOTSTRAP.
- It lives in the project's real test suite (so it runs on every future change), not in `.audit/`.
- Prefer a golden-master style assertion: capture the reference expected output as a fixture and assert the new system reproduces it.
- Record its path — it goes into the `evidence` block and, at tier-3, is what proves parity is locked.

**If the behavior is genuinely not testable** in this project (no harness, external side effect, non-deterministic, no reference access):
- Do NOT fabricate a fake or trivially-passing test.
- Document the concrete reason in `resolution.md` (`characterization_test: none - <reason>`).
- **Downgrade the achievable tier accordingly** (a finding without a passing characterization test cannot be tier-3).

### 5. Implementation

Execute the plan. General rules (adapt to the project rules in BOOTSTRAP):

- **Respect the project rules** from BOOTSTRAP (Section 12) and the rules document, if any.
- **Fidelity to the reference system**: any logic change must be traceable to the reference file/spec that motivated it — cite it in a comment and in the suggested commit message.
- **Every new function added has a test** (if the project rules require it).
- **Do not hardcode configuration** that should come from an environment variable.
- Use `Edit` for targeted changes, `Write` only for new files.
- All edits happen in the worktree (mode A) or on the `audit/NNN-<slug>` branch (mode B).

### 6. Automated validation (mandatory order)

After each block of changes:

1. **Static check**: `{{CHECK_CMD}}`
   - If it fails: fix it before proceeding. Never continue with an error.
2. **Tests**: `{{TEST_CMD}}`
   - If it fails: analyze. If it is a regression from the fix, adjust. If it is an old invalid test, document it and discuss with the dev.
3. **Characterization test**: run the new test from Step 4 in isolation and confirm it passes.

Never skip `{{CHECK_CMD}}` or `{{TEST_CMD}}`.

### 7. Parity evidence and the confidence gate

Determine the achieved tier from concrete evidence:

- **tier-1** — paired screenshots `refs/parity-reference.png` + `refs/parity-new.png` showing equivalent behavior.
- **tier-2** — an automated data-to-data diff produced by `/audit-compare` → `refs/parity-<date>.diff` (empty diff = parity confirmed).
- **tier-3** — tier-2 PLUS the characterization test from Step 4 passing.

**Confidence gate (blocking):** do NOT mark the finding resolved below `CONFIDENCE_MIN`.

- If the achieved tier is below `{{CONFIDENCE_MIN}}`, stop the resolution flow and instruct the dev to raise the evidence:
  > Current evidence is tier-N, below the required {{CONFIDENCE_MIN}}. To close this finding, run
  > `/audit-compare {{ID}}` to produce an objective parity diff (tier-2), and/or capture paired
  > screenshots into `refs/parity-reference.png` and `refs/parity-new.png` (tier-1).
- If you cannot reach the reference system directly, instruct the dev to validate manually:
  ```
  I need you to validate manually:
  1. Open the reference system with case <X>
  2. Open the new system with the equivalent case <Y>
  3. Reproduce the finding's scenario
  4. Capture screenshots into refs/parity-reference.png and refs/parity-new.png
  5. Confirm the behavior is now identical
  ```
- Only continue to Step 8 once the achieved tier meets or exceeds `{{CONFIDENCE_MIN}}`.

### 8. Write `resolution.md` (with the machine-readable evidence block)

Use the template. Fill in:
- Summary of what was done in 3-5 sentences.
- List of modified files with `file:line` and a summary of each change.
- The characterization test added (path).
- Reference file/spec that guided the fix.
- Check/test results.
- Parity evidence (paths under `refs/`).

Then write the **machine-readable `evidence:` block** (consumed by `/audit-pr` and the `pdd` board). It must be a YAML fenced block:

```yaml
evidence:
  confidence: tier-3
  parity_diff: refs/parity-2026-07-01.diff
  characterization_test: tests/audit/NNN_checkout.test.ts
  screenshots: [refs/parity-reference.png, refs/parity-new.png]
  checks: { check: pass, test: pass }
  pr_url: <filled by /audit-pr>
```

Rules for the block:
- `confidence` must equal the achieved tier and must be ≥ `CONFIDENCE_MIN`.
- `characterization_test`: the test path, or `none - <reason>` if genuinely infeasible (with the tier downgraded accordingly).
- `parity_diff`: the `/audit-compare` output path, or omit / `none` if not produced (then tier ≤ 1).
- `screenshots`: list of paths, or `[]` if none.
- `pr_url`: leave as `<filled by /audit-pr>` — it is filled later for traceability.

Write the file to `.audit/findings/<folder>/resolution.md`. Save inside the worktree when in worktree mode.

### 9. Update the coverage map

In `.audit/coverage.md`, find the row for this finding's behavior/area and set it
to **`resolved`** (NOT `verified`) with the achieved tier. The table columns are exactly:

```markdown
| Behavior / Area | Reference case | Status | Tier | Finding |
```

Example transition:
```markdown
| checkout: total calculation | order #123 | resolved | tier-3 | 007 |
```

- `Status` becomes **`resolved`** — the fix is done locally but is **not yet guaranteed**.
- `Tier` becomes the achieved tier (must match `evidence.confidence`).
- If no row exists for this behavior yet, add one.

> **Why not `verified` here?** Coverage `%` is a *guarantee* metric. A behavior is only
> `verified` once QA has explicitly approved **and** the PR is merged — that promotion is done
> by `/audit-qa`, never by `/audit-resolve`. Resolving locally is a claim, not a guarantee.

### 10. Move the folder to resolved/

```bash
mv .audit/findings/NNN-<slug>/ .audit/resolved/NNN-<slug>/
```

### 11. Update the board

In `.audit/board.md`:
- Remove from "Investigated (ready to resolve)".
- Add to "Resolved (last 7 days)": `- [x] NNN-<slug> — <one-line summary> (tier-N, resolved YYYY-MM-DD by @author)`.

### 12. ⚠️ NEVER commit — only suggest

Report to the dev:

```
Fix ready and validated. Summary:
- <X> files modified
- {{CHECK_CMD}} ✅
- {{TEST_CMD}} ✅
- Characterization test: <path> ✅
- Parity with {{REFERENCE_NAME}}: ✅ tier-N (evidence in .audit/resolved/NNN-<slug>/refs/)

Folder moved to .audit/resolved/NNN-<slug>/
Coverage map: behavior marked "verified" (tier-N).
Board updated.

🛑 I DID NOT COMMIT (PDD inviolable rule: commit/push is done ONLY by the human).

To commit, run:

git add -A
git commit -m "fix(audit): NNN — <short finding title>

Fixes <summarized symptom>.
Reference: .audit/resolved/NNN-<slug>/.
Based on the behavior of <reference file/spec>."

Next step: run /audit-compare NNN (if not done) and then /audit-pr NNN to open the evidence dossier.
```

**If the dev asks you to commit**: decline politely and restate the rule.
**If the dev asks you to push**: same — push/PR happens only via `/audit-pr` after an explicit "yes".

### 13. Wrap-up

- Confirm the path of `resolution.md`.
- Confirm the folder was moved.
- Confirm the coverage map and board states.
- Remind the dev the next step is `/audit-pr NNN` (after committing).
- Ask if they want to prepare the next finding.
- Remove the live-presence file: `rm -f ".audit/activity/audit-resolve-NNN.json"` (also do this on any early/abort exit).

## Quality rules

- NEVER commit. NEVER push. Push/PR only via `/audit-pr` after an explicit human "yes".
- NEVER skip `{{CHECK_CMD}}` or `{{TEST_CMD}}`. If they fail, fix before continuing.
- ALWAYS write a characterization test that pins the reference behavior — or document why it is infeasible and downgrade the tier. Never fabricate a fake test.
- ALWAYS enforce the confidence gate: do not mark resolved below `CONFIDENCE_MIN`. Point the dev to `/audit-compare` or screenshots when evidence is short.
- ALWAYS write the machine-readable `evidence:` block into `resolution.md`.
- ALWAYS operate inside the finding's worktree when `worktree:` is a path; only create the `audit/NNN-<slug>` branch when `worktree:` is `none`.
- ALWAYS update `coverage.md` to `resolved` (NOT `verified`) with the achieved tier — only `/audit-qa` promotes a row to `verified`, after QA approval + merge.
- ALWAYS confirm the plan with the dev BEFORE modifying code.
- ALWAYS reference the reference file/spec that motivated the change.
- ALWAYS preserve behavior in existing tests — if an old test breaks, treat it as a regression signal.
- ALWAYS remove the live-presence file `.audit/activity/audit-resolve-NNN.json` when the skill finishes or aborts.
