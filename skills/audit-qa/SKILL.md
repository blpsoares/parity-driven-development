---
name: "audit-qa"
description: "Environment-aware QA bridge between the fix (git) and validation (Notion or a file checklist). QA runs in phases: LOCAL (on localhost, BEFORE the PR — blocks /audit-pr) and per deployment ENVIRONMENT (dev/staging/prod, AFTER the PR/deploy). Tracks per-environment status; promotes coverage to `verified` only when the target-environment QA is approved AND the PR is merged."
argument-hint: "finding ID + environment (e.g. 007 local | 007 staging | 007 prod)"
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

**QA is multi-phase and environment-aware:**
- **Local QA** (`environment = local`): runs on **localhost, BEFORE the PR**. Its approval is a
  blocking precondition of `/audit-pr` — nothing is exposed as a PR until it passes locally.
- **Environment QA** (`environment = dev | staging | prod | …`): runs **AFTER the PR/deploy**, on the
  deployed target environment. The available environments and their URLs come from `BOOTSTRAP.md`.

Per-environment status is stored in the finding's `README.md` frontmatter as `qa-<env>` keys
(e.g. `qa-local: approved`, `qa-staging: approved`). Coverage becomes `verified` **only** when the
project's **target environment** QA is approved **and** the PR is merged (see §6).

**State-sensitive behavior:** a single skill that acts on what it finds — creates cards on
the first run for that environment, shows status and handles feedback on later runs.

### 0. Resolve the environment (do this first)

- Parse the environment token from `$ARGUMENTS` (after the finding id). If absent, ask which
  environment this QA round is for, listing `QA_ENVIRONMENTS` from `BOOTSTRAP.md` (default the first,
  `local`).
- **If `environment = local`:** the PR need NOT exist yet (this is the pre-PR gate). Point QA at the
  local run (localhost URL / how-to-run from BOOTSTRAP). Skip the "PR must be open" check below.
- **If `environment` is a deployment env:** the PR MUST be open (§2), and QA points at that
  environment's URL (from BOOTSTRAP Section 7 / preview pattern).
- Throughout this skill, write approvals/rejections to the `qa-<environment>` frontmatter key.

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

- **All `Approved`** → record it for THIS environment:
  - Set `qa-{{environment}}: approved` in the finding's `README.md` frontmatter (offer first; only
    after the dev says yes).
  - **If `environment = local`:** report:
    > "🟢 Local QA approved the N scenarios. `/audit-pr {{NNN}}` is now unblocked."
  - **If `environment` is a deployment env:** report:
    > "🟢 QA approved the N scenarios on {{environment}} (PR #X)."
    > (Merge stays human — I will not merge.)
  Do NOT merge and do NOT push anything.

  **Coverage promotion (the ONLY place a row becomes `verified`):**
  - Read `QA_TARGET_ENV` from `BOOTSTRAP.md` (the environment whose QA guarantees; default: the last
    entry of `QA_ENVIRONMENTS`, e.g. `prod`).
  - Re-check the PR state with `gh pr view <n> --json state`.
  - **Promote to `verified` ONLY when BOTH hold:** `qa-{{QA_TARGET_ENV}}: approved` **and**
    `state == "MERGED"`. Then set this finding's `.audit/coverage.md` row `Status` to **`verified`**
    (keep the tier from `evidence.confidence`). This is the only transition that raises guaranteed coverage.
  - **Otherwise** leave the row as `resolved` (pending) and tell the dev what's still missing
    (e.g. "approved on staging, but the guarantee env is prod" or "approved but PR not merged yet").
  - Never set `verified` on a non-target environment or on approval without merge.

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
