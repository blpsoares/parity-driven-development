---
name: "audit-pr"
description: "Assembles the pull request for a resolved finding as an EVIDENCE DOSSIER (symptom→cause→fix, confidence tier, check/test results, characterization test, parity diff, paired screenshots, QA checklist) and opens it — but ONLY pushes and runs gh pr create after an explicit human yes. Never authors commits, never pushes autonomously."
argument-hint: "finding ID (e.g. 007 or 007-checkout-wrong-total)"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Context

Part of the **PDD (Parity-Driven Development)** method. This is the hand-off step: a resolved,
committed finding becomes an open PR whose body is a self-contained **evidence dossier**, so the
reviewer and QA can judge parity objectively without re-deriving anything.

**Interact with the dev in their working language** — never force English on the user; the example
phrases below are templates. The framework files stay in English; what you *say* follows the
conversation's language.

**Inviolable PDD rule:** the AI never *authors* commits. `git push` and `gh pr create` happen ONLY
after an explicit human "yes" in the same session. Merge is 100% human, and only after QA approves.
This skill therefore never pushes or opens a PR on its own — it assembles the dossier, shows it, and
waits at the push gate.

## Outline

### 1. Locate the finding and its worktree

- Parse `$ARGUMENTS` to get the finding ID (accept `007` or `007-<slug>`; same logic as the other
  audit skills).
- Read `.audit/BOOTSTRAP.md`. If it does NOT exist: stop and instruct `/audit-bootstrap`.
  From it extract: `CHECK_CMD`, `TEST_CMD`, `CONFIDENCE_MIN` (default `tier-1`),
  `PREVIEW_MODE` (`per-branch-url` | `local`) and `PREVIEW_URL_PATTERN`, `REFERENCE_NAME`.
- Find the finding folder. It normally lives in `.audit/resolved/<NNN>-<slug>/` (moved there by
  `/audit-resolve`); also accept `.audit/findings/<NNN>-<slug>/`. If neither exists, stop and instruct
  the dev to run `/audit-resolve <ID>` first.
- Read the finding's `README.md` frontmatter. Extract `slug`, `confidence`, and **`worktree`**.
- **Worktree mode:** if `worktree` is an absolute path (not the literal `none`), every git/`gh` command
  in this skill MUST run inside that worktree (e.g. `git -C <worktree> ...`, and `cd`-free `gh`
  invocations with `-C`/`--repo` as appropriate, or run from within the worktree). If `worktree` is
  `none`, operate in the main checkout. State which working tree you are using before touching git.

### 2. Blocking preconditions (all must pass)

Check these in order. On the FIRST failure, stop and instruct the dev — do not continue, do not open
anything.

1. **resolution.md exists** — the finding folder contains `resolution.md`. If missing:
   > This finding has no resolution yet. Run `/audit-resolve {{ID}}` first — a PR without a resolution
   > has no evidence to carry.
2. **evidence block present** — `resolution.md` contains the machine-readable `evidence:` YAML block
   (`confidence`, `parity_diff`, `characterization_test`, `screenshots`, `checks`). If missing, stop
   and instruct the dev to complete `/audit-resolve` so the block is written.
3. **branch exists** — the branch `audit/NNN-<slug>` exists in the active working tree:
   `git -C <tree> rev-parse --verify --quiet refs/heads/audit/NNN-<slug>`.
   If it does not exist, stop:
   > Branch `audit/NNN-<slug>` is missing. `/audit-resolve` (or the worktree from `/audit-new`) should
   > have created it. Create/checkout the branch before opening the PR.
   Also confirm the branch is currently checked out in that tree; if not, ask the dev to check it out
   (do not switch branches silently).
4. **dev has committed** — clean tree AND commits present on the branch:
   - `git -C <tree> status --porcelain` returns EMPTY (clean tree). If dirty:
     > There are uncommitted changes. The PDD rule is that the human authors the commit — please commit
     > your work, then re-run `/audit-pr {{ID}}`. I will not commit for you.
   - the branch has at least one commit ahead of the base branch:
     `git -C <tree> rev-list --count <base>..audit/NNN-<slug>` > 0 (resolve `<base>` from BOOTSTRAP or
     the default branch). If zero, stop and tell the dev there is nothing to open a PR for.
5. **confidence ≥ CONFIDENCE_MIN** — compare the finding's `confidence` tier against `CONFIDENCE_MIN`
   (tier order: `tier-0` < `tier-1` < `tier-2` < `tier-3`). If below threshold, stop:
   > Evidence is `{{confidence}}`, below the project minimum `{{CONFIDENCE_MIN}}`. Raise it before
   > opening the PR: run `/audit-compare {{ID}}` for a data-to-data parity diff (tier-2), and/or add a
   > passing characterization test (tier-3), and/or attach paired reference/new screenshots (tier-1).

Only when ALL five pass do you proceed.

## Activity tracking (live presence)

So the `pdd` dashboard can show what is running in real time (across parallel agents and worktrees), record a presence file when this skill STARTS and delete it when it FINISHES — including on early/abort exits.

**On start** (run once the finding id is known):

```bash
mkdir -p .audit/activity
printf '{"command":"audit-pr","finding":"NNN","worktree":"WT","startedAt":"%s","agent":"%s","pid":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git config user.name 2>/dev/null || whoami)" "$$" \
  > ".audit/activity/audit-pr-NNN.json"
```

Substitute `NNN` with the finding id and `WT` with the finding's absolute `worktree` path when it is a
path, otherwise the literal `root`. Run this inside the active working tree so `.audit/activity` is the
worktree's own directory (which the CLI also reads).

**On finish or abort** (always remove the same file):

```bash
rm -f ".audit/activity/audit-pr-NNN.json"
```

### 3. Gather the evidence artifacts

Read, in the finding folder:
- `README.md` — symptom, area, severity, reference case.
- `investigation.md` — root cause.
- `resolution.md` — fix summary, modified files, the `evidence:` block, reference spec/file cited.

Then collect the concrete artifacts referenced by the `evidence:` block:
- **check/test results:** if `checks:` in the block already records `pass`, use it; otherwise re-run
  `{{CHECK_CMD}}` and `{{TEST_CMD}}` inside the working tree and capture the outcome. Never claim a
  pass you did not observe.
- **characterization test:** the `characterization_test` path (or the documented `none - <reason>`).
- **parity diff:** the `parity_diff` file under `refs/` (e.g. `refs/parity-<date>.diff`).
- **paired screenshots:** the `screenshots` list (e.g. `refs/parity-reference.png`,
  `refs/parity-new.png`). Confirm the files exist; if the tier claims screenshots but files are
  missing, note the gap rather than inventing them.

### 4. Assemble the PR body from the template

Load `.claude/skills/audit-pr/template-pr-body.md` and fill every placeholder from the artifacts above.
Write the result to a file inside the finding folder, e.g. `refs/pr-body.md`, so it is inspectable and
reusable by `gh --body-file`.

The body MUST contain, in this order:
- **Title line / summary** in PR language: symptom → cause → fix, 3–5 sentences.
- **Confidence & evidence tier** with the tier label (tier-0 red / tier-1 yellow / tier-2 orange /
  tier-3 green).
- **`CHECK_CMD` and `TEST_CMD` results** (the actual outcome you observed).
- **Characterization test** path (or the documented reason it is absent).
- **Parity diff** embedded inside a collapsed `<details>` block (fenced `diff`), read from the `.diff`.
- **Paired screenshots** reference-vs-new. Prefer uploading via `gh` so they render inline; if the repo
  has an assets convention, use markdown image links instead. If screenshots do not exist, say so
  explicitly instead of leaving broken links.
- **Link to the finding folder** in the repo (path-based link to `.audit/resolved/NNN-<slug>/`).
- **QA checklist** — the concrete behaviors QA must validate on the branch/preview, derived from the
  reference case(s). Include the testable location per `PREVIEW_MODE`:
  - `per-branch-url`: the resolved preview URL from `PREVIEW_URL_PATTERN`.
  - `local`: explicit `git fetch && git checkout audit/NNN-<slug>` + run instructions.

Screenshot upload note: `gh pr create` does not upload images by itself. To get inline images, either
(a) after the PR is created, upload each screenshot as a comment/attachment and reference the returned
asset URL, or (b) commit the images under an assets path and use relative markdown links. Choose based
on the repo's convention and tell the dev which you used.

### 5. Present the dossier and STOP at the push gate

Show the fully assembled body (or its path plus a rendered preview) and the exact commands you are
about to run. Then ask for explicit confirmation:

```
Finding NNN dossier is ready. Preconditions: ✅ resolution ✅ branch audit/NNN-<slug>
✅ clean tree + commits ✅ confidence {{confidence}} ≥ {{CONFIDENCE_MIN}}.

I am about to run (inside {{working tree}}):

  git push -u origin audit/NNN-<slug>
  gh pr create --title "<title>" --body-file refs/pr-body.md --base <base>

🛑 PDD push gate: I will NOT push or open the PR without your explicit "yes".
Push and open the PR now? (yes / edit body / cancel)
```

- If the dev asks to **edit**, revise the body file and re-present.
- If the dev **cancels**, stop and leave `refs/pr-body.md` in place for later.
- Proceed to Step 6 **only** on an explicit affirmative ("yes") in this same session. A vague or absent
  answer is NOT consent. If the dev asks you to "just push it" without first seeing the body, still
  show the body first.

### 6. Push and open the PR (only after "yes")

Run, in the correct working tree:

```bash
git -C <tree> push -u origin audit/NNN-<slug>
gh pr create --title "<title>" --body-file <finding>/refs/pr-body.md --base <base>
```

Capture the PR URL returned by `gh`.

If `gh pr create` reports a PR already exists for the branch, do NOT create a duplicate — fetch the
existing URL (`gh pr view --json url`) and, if the dev agrees, update its body with the new dossier
(`gh pr edit --body-file ...`).

### 7. Record the PR URL and hand off to QA

- Write the PR URL into `resolution.md`'s `evidence:` block as `pr_url: <url>` (add the key if absent;
  update it if present). Do not disturb the other evidence keys.
- Optionally note the PR in `.audit/board.md` next to the finding.
- Report to the dev:

```
🟢 PR opened: <url>
Evidence tier: {{confidence}}. Dossier body: <finding>/refs/pr-body.md.
pr_url recorded in resolution.md.

The PR is open and therefore testable. Next: run `/audit-qa NNN` — QA is the merge gate; it
validates the {{PREVIEW_MODE}} environment on this branch BEFORE any merge.

🛑 I did not merge and will not — merge is 100% human, only after QA approves.
```

- **Cleanup:** remove the presence file recorded at the start —
  `rm -f ".audit/activity/audit-pr-NNN.json"` — so the dashboard stops showing this skill as running.
  Do this here and on every early/abort exit too.

## Quality rules

- NEVER push or run `gh pr create` without an explicit human "yes" in the same session. NEVER commit.
  NEVER merge.
- ALWAYS enforce ALL FIVE blocking preconditions before assembling anything; stop at the first failure.
- ALWAYS operate inside the finding's `worktree` when it is a path, not the main checkout.
- ALWAYS build the body from README + investigation + resolution — never fabricate results; if
  `CHECK_CMD`/`TEST_CMD` were not observed as passing, re-run them or say so.
- NEVER claim an evidence tier higher than the artifacts support; if screenshots or the parity diff are
  missing, state the gap in the body instead of leaving broken references.
- If the dev asks you to skip the gate, refuse politely and restate the inviolable rule.
- ALWAYS record `pr_url` back into the `evidence:` block for traceability, and point the dev to
  `/audit-qa NNN`.
- ALWAYS remove the presence file `.audit/activity/audit-pr-NNN.json` on finish AND on any abort/early
  exit, so no stale entry lingers in the dashboard.
