---
name: "audit-qa"
description: "Bridge between an open PR on a fix branch (git) and QA validation (Notion or a file checklist). Runs AFTER the finding's PR is OPEN — QA is the merge gate. First run: creates the finding page + N plain-language test cards that point at the testable branch/preview. Later runs: reads QA status, handles approvals and rejections. NEVER runs before the PR is open."
argument-hint: "finding ID (e.g. 007 or 007-checkout-wrong-total)"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Context

Part of the **PDD (Parity-Driven Development)** method. This skill bridges the dev world
(git, `.audit/findings/`, the fix branch `audit/NNN`) and the QA world (Notion, or a plain
file checklist when Notion is off).

**Interact with the dev in their working language — never force English on the user; the
example phrases below are templates.**

**Golden rule (INVERTED for PDD 2.0 pre-merge flow):** this skill runs **after the PR is
OPEN**, NOT after it is merged. QA validates on the branch/preview *before* merge — QA is
the **merge gate**. Before the PR exists, there is no testable environment to point QA at.

**State-sensitive behavior:** a single skill that acts on what it finds — creates cards on
the first run, shows status and handles feedback on later runs.

## Outline

### 1. Initial checks (blocking)

- Read `.audit/BOOTSTRAP.md`. If it does NOT exist: stop and instruct the dev to run
  `/audit-bootstrap` first.
- Parse `$ARGUMENTS`:
  - If empty: ask which finding; list the folders under `.audit/findings/` as options.
  - If `NNN`: locate the folder at `.audit/findings/NNN-*`.
  - If `NNN-<slug>`: direct lookup.
  - If not found under `findings/`: stop and report that the finding does not exist; suggest
    `/audit-new`.
- Read the finding's `README.md`, `investigation.md` (if present) and `resolution.md`.
- Read the finding frontmatter. Capture:
  - `worktree`: an absolute path OR the literal `none`.
  - `confidence`: `tier-0` | `tier-1` | `tier-2` | `tier-3`.
  - `slug`, `title`, `area`, `severity`.
- **Worktree awareness:** if `worktree` is a path (not `none`), all git/`gh` commands in this
  skill MUST run **inside that worktree**. If it is `none`, operate in the main checkout on
  branch `audit/NNN-<slug>`.
- From `BOOTSTRAP.md` capture the preview settings:
  - `PREVIEW_MODE`: `per-branch-url` | `local`.
  - `PREVIEW_URL_PATTERN` (e.g. `https://pr-{N}.preview.app`).
  - `CONFIDENCE_MIN` (default `tier-1`).
- Determine the **QA surface** from BOOTSTRAP Section 11 (Notion integration):
  - "Enabled": capture the 2 database URLs/IDs (`PDD - Findings` and `PDD - QA Tests`), and
    verify the Notion MCP is available (`mcp__claude_ai_Notion__*` or equivalent). If the MCP
    is NOT connected:
    > "The Notion MCP is not connected in this session. Connect it and try again, or I can
    > fall back to a file checklist."
    — offer the file-checklist fallback (Section 7) and pause for the dev's choice.
  - "Disabled": use the **file-checklist** QA surface (Section 7) throughout.

### 2. PR-open validation (blocking — the inverted golden rule)

The fix must be reachable on an **open** PR so QA has something to test.

1. Find the PR for branch `audit/NNN-<slug>`:
   `gh pr list --head audit/NNN-<slug> --json number,state,url,title` (run inside the finding's
   worktree if `worktree` is a path).
2. If no PR is found:
   - Report: "No PR found for branch `audit/NNN-<slug>`."
   - Ask:
     > "(a) the PR isn't open yet, (b) it's on a different branch name, or (c) force anyway?"
   - If (a): stop and instruct `/audit-pr NNN` to open the PR first.
   - If (b): ask for the PR number/URL and continue with it.
   - If (c): record in the QA surface that the PR state was not validated automatically.
3. Once you have a PR number `X`, validate its state:
   `gh pr view X --json state,url,title` and require `state == "OPEN"`.
   - If `state == "MERGED"`: report that the PR is already merged — QA pre-merge no longer
     applies; the branch was merged without the QA gate. Ask whether to proceed as a
     post-merge sanity check or stop.
   - If `state == "CLOSED"` (not merged): stop and report the PR was closed; the branch is not
     mergeable — reopen it or open a new PR via `/audit-pr`.
   - If `state == "OPEN"`: proceed. Record `X` and the PR URL.
4. Compute the **testable environment** the cards will point at:
   - If `PREVIEW_MODE=per-branch-url`: substitute `{N}` in `PREVIEW_URL_PATTERN` with the PR
     number `X` (or the branch, per the pattern) → `PREVIEW_URL`.
   - If `PREVIEW_MODE=local`: build local-branch-checkout instructions (Section 8) so QA can
     run the branch locally.

## Activity tracking (live presence)

So the `pdd` dashboard can show what is running in real time (across parallel agents and worktrees), record a presence file when this skill STARTS and delete it when it FINISHES — including on early/abort exits.

**On start** (run once the finding id is known):

```bash
mkdir -p .audit/activity
printf '{"command":"audit-qa","finding":"NNN","worktree":"root","startedAt":"%s","agent":"%s","pid":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git config user.name 2>/dev/null || whoami)" "$$" \
  > ".audit/activity/audit-qa-NNN.json"
```

**On finish or abort** (always remove the same file):

```bash
rm -f ".audit/activity/audit-qa-NNN.json"
```

### 3. Current state on the QA surface

Look up whether the finding already has a QA page/checklist:
- **Notion:** query `PDD - Findings` for the page whose `Audit` column equals `NNN-<slug>`.
- **File:** check for `.audit/findings/NNN-<slug>/qa/checklist.md`.

**Case A — QA artifacts do not exist yet** → CREATE mode (Section 4).
**Case B — QA artifacts already exist** → STATUS/FEEDBACK mode (Section 5).

### 4. CREATE mode (first run after the PR is OPEN)

#### 4.1 Create the Finding page (Notion `PDD - Findings`, or the file header)

Load the template at `.claude/skills/audit-qa/template-finding-page.md`.

**Translate technical detail into plain language:**
Read `resolution.md`. Try to deduce:
- Which **screen/area** the user sees affected.
- Which **interaction** (button, field, action) triggers the behavior.
- Which **value** changes on screen.

If the deduction is ambiguous, **ask the dev**:
> "I couldn't map this fix to a clear on-screen interaction. In 1-2 sentences: what will QA
> SEE differently after this fix?"

**Never invent technical terms.** Avoid: function, query, endpoint, repository, controller,
state. Use: "screen", "button", "field", "value", "list", "form".

- Notion: create the page in `PDD - Findings` via MCP with `Name` (title) = human-readable
  title, `Audit` (select) = `NNN-<slug>`, body = filled template. Capture the `page_id`.
- File: write the filled template to `.audit/findings/NNN-<slug>/qa/finding.md`.

#### 4.2 Create N test cards, pointing at the TESTABLE environment

From the finding's `README.md` ("Acceptance criteria" section) extract the criteria. Each
criterion becomes 1 card. If there are no structured criteria:
> "The finding has no listed acceptance criteria. Which scenarios do you want to expose to QA?"

Load the template at `.claude/skills/audit-qa/template-test-card.md`. Every card MUST tell QA
exactly where to test, based on `PREVIEW_MODE`:
- **`per-branch-url`**: the card's "Before you start" and steps point at `PREVIEW_URL`
  (the per-branch preview for PR #X).
- **`local`**: the card embeds the local-branch-checkout instructions from Section 8.

For each scenario:
- Notion: create a page in `PDD - QA Tests` with `Test` (title) = clear plain-language
  description, `Finding` (relation) → the page_id from 4.1, `Test Status` (select) =
  `Awaiting test`, body = filled template. Capture each `page_id` and URL.
- File: append the filled card to `.audit/findings/NNN-<slug>/qa/checklist.md` with a status
  marker `- [ ] Awaiting test — <title>` per card and the full card body below.

#### 4.3 Back-reference in git

Append (or update) a section at the end of
`.audit/findings/NNN-<slug>/resolution.md`:

```markdown
## QA cards (pre-merge, on branch audit/NNN-<slug>)

Created on {{DATE}}. Testable environment: {{PREVIEW_URL or "local checkout"}}
PR under validation: #{{X}} ({{PR_URL}})

- **Finding page**: {{URL_OR_PATH}}
- **Test cards**:
  - {{TITLE_1}} — {{URL_OR_MARKER_1}}
  - ...
```

#### 4.4 Report to the dev

Report:
- How many cards were created and where (Notion URLs or the checklist file path).
- The testable environment the cards point at (`PREVIEW_URL` or "local branch checkout").
- "QA can start testing the branch now. Run `/audit-qa NNN` again to see status. Merge stays
  human and only happens after QA approves."

### 5. STATUS/FEEDBACK mode (subsequent runs)

#### 5.1 Fetch linked cards

- Notion: in `PDD - QA Tests`, find pages whose `Finding` relation points at this finding.
- File: read the status markers in `.audit/findings/NNN-<slug>/qa/checklist.md`.

Status vocabulary (Notion `Test Status` / file markers): `Awaiting test` | `Approved` |
`Rejected`.

#### 5.2 Classify the overall state

- **All `Awaiting test`**: QA hasn't started.
  > "QA hasn't tested any of the {{N}} scenarios yet. Nothing to do right now."

- **All `Approved`** → QA is the merge gate, all green:
  > "🟢 QA approved N scenarios on the branch — you may merge PR #X."
  > (Merge stays human — I will not merge.)
  Offer to set `qa-status: approved` in the finding's `README.md` frontmatter (only after the
  dev says yes). Do NOT merge and do NOT push anything.

  **Coverage promotion (the ONLY place a row becomes `verified`):**
  - Re-check the PR state with `gh pr view <n> --json state`.
  - **If `state == "MERGED"` AND all cards `Approved`:** in `.audit/coverage.md`, set this
    finding's behavior/area row `Status` to **`verified`** (keep the tier from the finding's
    `evidence.confidence`). This is the only transition that increases the guaranteed coverage %.
  - **If approved but NOT yet merged:** leave the row as `resolved` and tell the dev:
    > "Coverage stays *pending* until you merge PR #X. After merging, run `/audit-qa NNN` once
    > more to promote this area to `verified`."
  - Never set `verified` on approval alone — approval **and** merge are both required.

- **Mixed (some Approved + some Awaiting)**: report partial progress. Wait.

- **At least one `Rejected`**: enter FEEDBACK mode (5.3).

#### 5.3 FEEDBACK mode (there are `Rejected` cards) — incremental fix BEFORE merge

For each rejected card, read title, steps and comments (Notion:
`mcp__claude_ai_Notion__notion-get-comments`; file: the card's comment block).

Present to the dev:

```
❌ QA rejected {{M}} of {{N}} scenarios on branch audit/NNN-<slug> (PR #X is still OPEN).

═══════════════════════════════════════════════════════════
Card 1: "{{TITLE}}"
Where: {{URL_OR_MARKER}}

QA said:
  {{COMMENT_1}}

My initial analysis:
  {{AI_HYPOTHESIS}}
═══════════════════════════════════════════════════════════
```

Because the PR is still OPEN, the fix is **incremental on the SAME branch** `audit/NNN-<slug>`
— not a new post-merge cycle. Then ask:

```
What do we do? (the fix goes on the SAME branch audit/NNN — no merge yet)

(a) Open a follow-up finding on the SAME branch consolidating all regressions
(b) Open one follow-up finding per rejected scenario, all on the SAME branch
(c) Discuss first — investigate before opening a follow-up finding
(d) Dismiss — QA misread it or tested the wrong environment
(e) Nothing now — I'll talk to QA first
```

If (a) or (b): draft an `/audit-new` follow-up **on branch `audit/NNN-<slug>`** (same branch,
so the fix lands in the open PR before merge), using QA's comments as context — **without
creating the file**; the dev approves first. Make clear the follow-up work stays on the fix
branch and the PR is re-tested before any merge.

#### 5.4 Card comments (discreet)

After a feedback action, if a follow-up finding was opened, add a **discreet** comment on the
rejected card (Notion comment, or a line in the checklist file):

> "Logged as follow-up {{ID}} on {{DATE}}, same branch. Will be re-tested on this PR before merge."

**No redundant comments** — only operational information useful to QA.

### 6. Update the PDD board

If cards were created (Section 4), update `.audit/board.md`:

```
- [ ] NNN-<slug> — <summary> (in QA on branch, since YYYY-MM-DD, {{N}} scenarios)
```

When all scenarios are approved, update to:

```
- [x] NNN-<slug> — <summary> (QA approved YYYY-MM-DD — ready to merge PR #X)
```

If feedback produced a follow-up finding on the same branch, add a reference to it.

### 7. File-checklist QA surface (when Notion is off)

When BOOTSTRAP Section 11 is "Disabled" (or the dev chose the fallback), QA runs from a file:

- Path: `.audit/findings/NNN-<slug>/qa/checklist.md`.
- Header: the filled `template-finding-page.md` content (plain language).
- One block per scenario using `template-test-card.md`, each prefixed with a status marker:
  `- [ ] Awaiting test — <title>`. QA edits the marker to `Approved` or `Rejected` and writes
  comments under the card's "QA notes" heading.
- All Section 5 logic reads/writes these markers instead of Notion properties.
- Never rewrite QA's comments; only append operational notes.

### 8. Local-branch-checkout instructions (PREVIEW_MODE=local)

When there is no per-branch preview, cards must tell QA how to run the branch locally. Embed:

```markdown
### How to run this branch locally
1. Fetch and check out the fix branch:
   `git fetch origin audit/NNN-<slug> && git checkout audit/NNN-<slug>`
2. Install dependencies if needed (see the project README).
3. Start the app the way the dev documented in BOOTSTRAP (build/run command).
4. Test against this locally-running branch — not main, not production.
5. When done, you can return to your previous branch with `git checkout -`.
```

Fill `NNN-<slug>` with the actual branch and, if the worktree is a path, mention that the
branch is also available in the worktree at that path.

## Quality rules

- **NEVER create cards before the PR is OPEN.** Critical guard — validate `gh pr view X
  --json state` == `OPEN` first (the inverted golden rule).
- **QA is a merge gate.** All approved → report "you may merge PR #X". The AI NEVER merges,
  NEVER pushes, and NEVER authors commits — merge is 100% human.
- **Point cards at the testable environment:** the per-branch preview URL when
  `PREVIEW_MODE=per-branch-url`, or local-branch-checkout instructions when `local`. Never at
  production or `main`.
- **Rejections stay on the SAME branch** `audit/NNN` as an incremental pre-merge fix — not a
  new post-merge cycle.
- **NEVER use technical jargon in cards.** QA is not a dev. Convert technical terms into
  on-screen actions.
- **ALWAYS record QA URLs/paths in `resolution.md`** — bi-directional traceability.
- **ALWAYS ask the dev** when you can't deduce the on-screen interaction. Don't invent.
- **NEVER change a card's status on your own.** Only on the dev's explicit request (e.g. option
  d of feedback).
- If the Notion MCP fails mid-run, STOP and report partial state — no automatic rollback; offer
  the file-checklist fallback.
- **ALWAYS remove the presence file** `.audit/activity/audit-qa-NNN.json` on finish or abort
  (see "Activity tracking (live presence)").

## Before you finish

- Remove the live-presence file created at start:
  `rm -f ".audit/activity/audit-qa-NNN.json"` — do this on normal completion AND on any early
  or abort exit, so the `pdd` dashboard stops showing this run as active.
