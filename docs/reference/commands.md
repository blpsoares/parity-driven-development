---
title: "Command Reference"
description: "Exhaustive per-command reference for the /audit-* skills: purpose, arguments, gates, inputs read from .audit/, outputs written, and failure modes."
group: "reference"
order: 1
slug: "commands"
---

# Command Reference

The PDD workflow is a sequence of gated slash commands. Each maps to one
`skills/<name>/SKILL.md` file and is invoked one at a time; every command refuses to
advance on insufficient input. This page documents each command exhaustively: its
purpose, arguments, gates and preconditions (what it refuses on), the files it reads from
`.audit/`, the files it writes, and its failure modes.

Terminology and file schema are defined in
[audit-structure.md](audit-structure.md); all configuration keys named below
(`CHECK_CMD`, `TEST_CMD`, `CONFIDENCE_MIN`, `QA_ENVIRONMENTS`, `QA_TARGET_ENV`,
`PREVIEW_MODE`, `PREVIEW_URL_PATTERN`) are documented in
[configuration.md](configuration.md).

## Conventions common to every command

| Aspect | Behavior |
|---|---|
| Invocation | User-invocable slash command; model-invocation is disabled. Run one at a time. |
| Finding id | Accepted as `NNN` (e.g. `007`) or `NNN-<slug>` (e.g. `007-checkout-wrong-total`). |
| Bootstrap gate | Every command except `/audit-bootstrap` reads `.audit/BOOTSTRAP.md` first and stops if it is absent. |
| Worktree awareness | Each command reads the finding's `worktree` frontmatter field. If it is an absolute path, all file/git operations run inside that worktree; if it is the literal `none`, they run in the main checkout. |
| Activity presence | Each command writes a JSON presence file under `.audit/activity/` on start and removes it on finish or abort, so the `pdd` dashboard can show live executions. |
| Language | Commands interact with the dev in the conversation's working language, but write all `.audit/` files in English. |
| Inviolable rules | The AI never authors commits. `git push` / `gh pr create` happen only after an explicit human "yes" in the same session. Merge is 100% human, only after the target-environment QA approves. |

---

## `/audit-bootstrap`

**Purpose.** One-time structured interview that produces `.audit/BOOTSTRAP.md` — the
operational context every other `/audit-*` command reads. It also seeds
`.audit/coverage.md` (the parity coverage map) and creates the `.audit/board.md`
skeleton. Nothing else in PDD works until this has run.

**Arguments.** Optional. `redo` overwrites an existing bootstrap, reusing the previous
answers as defaults. Any other input is ignored.

**Gates / preconditions.**

- If `.audit/BOOTSTRAP.md` already exists and `$ARGUMENTS` does not contain `redo`: refuses
  and instructs the dev to run `/audit-bootstrap redo` to overwrite, or read the file
  directly to view it.
- Never fills a field without an explicit answer; a vague or "I don't know" answer is
  recorded literally as `<pending — fill before any /audit-new>`.
- Requires a final explicit confirmation before writing to disk.

**Inputs read.** Any existing `.audit/BOOTSTRAP.md` (when `redo`); a project rules
document if present (`.specify/memory/constitution.md`, `RULES.md`, `CONTRIBUTING.md`,
`ARCHITECTURE.md`) which is referenced rather than duplicated; the skill's `template.md`.

**Outputs written.**

- `.audit/` scaffold: `findings/`, `resolved/` (with `.gitkeep`).
- `.audit/BOOTSTRAP.md` — mission, reference-vs-new adapters, `CHECK_CMD`/`TEST_CMD`,
  project areas, reference cases, `QA_ENVIRONMENTS` + `QA_TARGET_ENV`, `PREVIEW_MODE` +
  `PREVIEW_URL_PATTERN`, `CONFIDENCE_MIN`, Notion settings, inviolable rules.
- `.audit/coverage.md` — seeded from project areas and reference cases; every row starts
  `not-started`.
- `.audit/board.md` — empty skeleton (In progress / Available / Resolved).
- `.audit/activity/audit-bootstrap.json` — presence file (removed on exit).

**Failure modes.**

- Bootstrap already present without `redo` → stops with the overwrite instruction.
- Fields left unanswered → written as `<pending>`; the closing report warns they must be
  filled before `/audit-new`.
- Notion "create databases" chosen but the Notion MCP is unavailable → warns and pauses.

---

## `/audit-new <desc>`

**Purpose.** Capture a new finding (an observed divergence between the new system and the
reference system) through a forced-discipline two-way interview. Produces
`.audit/findings/NNN-<slug>/README.md`, computes an initial confidence tier, updates
`.audit/coverage.md`, and optionally isolates the work in a git worktree.

**Arguments.** Optional short description of the problem. If empty, the interview starts
from scratch.

**Gates / preconditions.**

- `.audit/BOOTSTRAP.md` must exist; otherwise stops and instructs `/audit-bootstrap`.
- Vague symptoms are rejected. "It's broken" / "it's wrong" / "it looks bad" are refused
  until the dev supplies an observable fact (e.g. "shows 3 items; the reference shows 5").
- Never proceeds without the reference system's expected behavior, or an explicit plan to
  discover it.
- Never invents data or a hypothesis; "I don't know" is recorded literally.
- Requires confirmation of the summary before writing.

**Inputs read.** `.audit/BOOTSTRAP.md` (`REFERENCE_NAME`, `PROJECT_AREAS`, `CHECK_CMD`,
`TEST_CMD`, `REFERENCE_CASES`, `CONFIDENCE_MIN`); the project rules document if referenced;
`.audit/findings/` and `.audit/resolved/` (to compute the next `NNN` = highest existing +
1, zero-padded to three digits); the skill's `template.md`.

**Outputs written.**

- `.audit/findings/NNN-<slug>/README.md` — finding frontmatter including the computed
  `confidence` tier and the `worktree` choice.
- `.audit/findings/NNN-<slug>/refs/` — always created (empty is fine) as the evidence drop
  point.
- `.audit/coverage.md` — the matching behavior row set to `finding-open` with the computed
  tier and finding id (a new row is appended if none matches).
- `.audit/board.md` — an entry under "Available".
- If worktree isolation is accepted: a git worktree + branch `audit/NNN-<slug>` created via
  `git worktree add`, with the base directory added to `.gitignore`. The base follows the
  harness — `.claude/worktrees/` for Claude Code, `.audit-worktrees/` otherwise. The
  absolute path is recorded as `worktree:` in the frontmatter. If declined, `worktree:
  none` is recorded and no branch is created (that is deferred to `/audit-resolve`).
- `.audit/activity/audit-new-NNN.json` — presence file (removed on exit).

**Confidence tier at creation.** Only `tier-0` (textual description) or `tier-1` (paired
reference-vs-new screenshots actually saved in `refs/`) may be assigned here. `tier-2` and
`tier-3` are earned later by `/audit-compare` and `/audit-resolve` and must never be
claimed at creation. A tier below `CONFIDENCE_MIN` is acceptable at creation and is flagged
to the dev.

**Failure modes.**

- Bootstrap missing → stops.
- Persistently vague symptom → the interview does not proceed.
- Reference behavior unknown and the dev cannot supply it → the finding is paused (option
  C of the reproduction decision) rather than fabricated.

---

## `/audit-investigate <id>`

**Purpose.** Read-only root-cause analysis of an existing finding. Chooses an investigation
approach (static / dynamic / visual / combined) in conversation with the dev, executes it,
and documents ranked hypotheses in `investigation.md`. It never modifies source code.

**Arguments.** Finding id (`NNN` or `NNN-<slug>`). If empty, lists open findings and asks
which to investigate.

**Gates / preconditions.**

- `.audit/BOOTSTRAP.md` must exist; otherwise stops.
- The finding folder must exist; a not-found id produces a clear error listing available
  findings.
- If the finding's `worktree` is a path that does not exist on disk, stops and reports the
  worktree is missing.
- Strictly read-only with respect to source code and the reference system: never authors
  commits, never writes to a database, never runs destructive operations. Any database or
  API read must be confirmed with the dev before it runs.
- If `investigation.md` already exists, asks whether to continue, add to it, or overwrite.

**Inputs read.** `.audit/BOOTSTRAP.md` (`REFERENCE_NAME`, `REFERENCE_ACCESS`, available
MCPs, `CONFIDENCE_MIN`); the project rules document if referenced; the finding's
`README.md` (in full, including the `worktree` field); `refs/` evidence (`.md`/`.txt`
files read; image filenames noted); the skill's `template.md`.

**Outputs written.**

- `.audit/findings/<folder>/investigation.md` — chosen approach, observed facts (with
  `file:line` citations), root-cause hypotheses ranked by probability, a recommendation,
  and known risks of the fix.
- The finding's `README.md` `confidence` frontmatter may be raised **only** when the
  evidence genuinely supports it (never inflated).
- `.audit/board.md` — the finding moved to "Investigated (ready to resolve)".
- `.audit/activity/audit-investigate-NNN.json` — presence file (removed on exit).

**Failure modes.**

- Bootstrap missing or finding not found → stops.
- Worktree path recorded but absent → stops.
- Investigation concludes the bug is not in the new system (e.g. divergent data in the dev
  database, or a not-yet-built feature) → says so explicitly and suggests moving the finding
  to `resolved/` with an "out of scope" note.

---

## `/audit-resolve <id>`

**Purpose.** Implement the fix for an already-investigated finding, pin the reference
behavior with a mandatory characterization test, validate parity, write `resolution.md`
with a machine-readable `evidence:` block, update coverage to `resolved`, and move the
folder to `.audit/resolved/`. **It never commits and never pushes** — it only suggests the
commit command to the human.

**Arguments.** Finding id (`NNN` or `NNN-<slug>`). If empty, resolves via the same lookup
logic as the other commands.

**Gates / preconditions.**

- `.audit/BOOTSTRAP.md` must exist; otherwise stops.
- `investigation.md` **must exist**; if not, stops and instructs `/audit-investigate <id>`
  first (fixing without investigation is refused).
- If `investigation.md` has an "Out of scope" section, stops and offers to close the
  finding without a fix instead.
- **Confidence gate (blocking):** the achieved evidence tier must be ≥ `CONFIDENCE_MIN`. If
  it is below, the resolution flow stops and the dev is directed to `/audit-compare` (for a
  tier-2 diff) and/or to capture paired screenshots (tier-1). The finding is not marked
  resolved below `CONFIDENCE_MIN`.
- The plan must be confirmed by the dev before any file is modified.
- `CHECK_CMD` and `TEST_CMD` must both pass; they are never skipped. A characterization
  test is mandatory (or its infeasibility documented with the tier downgraded — a finding
  with no passing characterization test cannot be `tier-3`). A fake or trivially-passing
  test must never be fabricated.

**Inputs read.** `.audit/BOOTSTRAP.md` (`CHECK_CMD`, `TEST_CMD`, `CONFIDENCE_MIN`,
`REFERENCE_NAME`, `REFERENCE_CONSTRAINTS`, inviolable rules); the project rules document if
referenced; the finding's `README.md` (frontmatter: `confidence`, `worktree`, `slug`,
`area`); `investigation.md`; the skill's `template.md`.

**Outputs written.**

- Source-code changes and a characterization test, applied inside the finding's worktree
  (mode A, when `worktree` is a path) or on a newly created branch `audit/NNN-<slug>` in the
  main checkout (mode B, when `worktree` is `none`). The characterization test lives in the
  project's real test suite, not in `.audit/`.
- `.audit/resolved/<folder>/resolution.md` — fix summary, modified files with `file:line`,
  the characterization test path, the reference spec/file cited, check/test results, parity
  evidence paths, and the machine-readable `evidence:` YAML block (`confidence`,
  `parity_diff`, `characterization_test`, `screenshots`, `checks`, `pr_url` left as a
  placeholder for `/audit-pr`).
- `.audit/coverage.md` — the finding's row set to **`resolved`** (never `verified`) with
  the achieved tier.
- The finding folder moved from `.audit/findings/` to `.audit/resolved/`.
- `.audit/board.md` — moved to "Resolved (last 7 days)".
- `.audit/activity/audit-resolve-NNN.json` — presence file (removed on exit).

**Failure modes.**

- Bootstrap missing, finding not found, or `investigation.md` absent → stops.
- `CHECK_CMD` or `TEST_CMD` fails → the failure is fixed before proceeding; the flow does
  not continue with an error.
- Achieved tier below `CONFIDENCE_MIN` → resolution is blocked with instructions to raise
  the evidence.
- Reference system unreachable for parity confirmation → the dev is asked to validate
  manually and capture paired screenshots.
- If the dev asks the command to commit or push → it declines and restates the rule. Commit
  is authored by the human; push/PR happens only via `/audit-pr` after an explicit "yes".

> `/audit-resolve` moves coverage only to `resolved` — a local claim, not a guarantee. Only
> `/audit-qa` promotes a row to `verified`, after QA approval **and** merge.

---

## `/audit-compare <id>`

**Purpose.** Golden-master comparison harness. Runs the same read-only operation on both
the reference (legacy) system and the new system using the access configured in
BOOTSTRAP, diffs the outputs, and writes `refs/parity-<date>.diff` as **tier-2** evidence.
An empty diff means parity is objectively confirmed. It modifies no code and writes to
neither system.

**Arguments.** Finding id, optionally followed by a reference case (e.g. `007 order#123`,
`007 user=teste`). If the case is omitted, it is taken from the finding's `README.md`, then
from the BOOTSTRAP reference cases (the dev confirms which).

**Gates / preconditions.**

- `.audit/BOOTSTRAP.md` must exist; otherwise stops.
- The finding folder must exist; a not-found id produces a clear error.
- If the finding's `worktree` is a path, the new-system side runs against that worktree; if
  the path does not exist, stops.
- Read-only on both systems, always. Every command/query/request/navigation is shown to the
  dev and confirmed before it runs, per side. Never `INSERT`/`UPDATE`/`DELETE`/write, never
  a mutating API call, never a state-changing form submit (unless the dev explicitly
  confirms it is non-destructive). Never authors commits, never switches branches, never
  pushes.
- If the reference system cannot be executed (MFA, no access, offline), falls back to a
  tier-1 visual comparison (paired screenshots) and documents the limitation rather than
  blocking the cycle or fabricating a diff.

**Inputs read.** `.audit/BOOTSTRAP.md` (`REFERENCE_NAME`, `REFERENCE_ACCESS`, `NEW_ACCESS`,
available MCPs, reference cases, `PREVIEW_MODE`, `PREVIEW_URL_PATTERN`, `CONFIDENCE_MIN`);
the project rules document if referenced; the finding's `README.md` (`worktree`,
`confidence`); `investigation.md` (to compare the exact operation that diverged).

**Outputs written.**

- `.audit/findings/NNN-<slug>/refs/parity-reference.raw` and `parity-new.raw` — the raw
  captured outputs, so the diff is reproducible.
- `.audit/findings/NNN-<slug>/refs/parity-<date>.diff` — the deterministic, canonicalized
  diff (tier-2 evidence). On parity the header is kept and the body reads `NO DIFFERENCES —
  parity confirmed`.
- `.audit/activity/audit-compare-NNN.json` — presence file (removed on exit).

It does **not** change the finding's `confidence` frontmatter or `.audit/coverage.md` — the
tier promotion is owned by `/audit-resolve`, which records the full evidence block.

**Failure modes.**

- Bootstrap missing or finding not found → stops.
- Worktree path recorded but absent → stops.
- Reference system unreachable → tier-1 visual fallback, limitation documented.
- Non-empty diff → reports the concrete field/line differences and points back to
  `/audit-investigate` or `/audit-resolve` to close the gap.

---

## `/audit-qa <id> <env>`

**Purpose.** Environment-aware, multi-phase QA bridge between the fix (git) and validation
(Notion or a file checklist). Creates QA cards on the first run for an environment, then
reports status and handles feedback on later runs. `local` QA runs on localhost **before**
the PR and unblocks `/audit-pr`; deployment-environment QA (`dev`/`staging`/`prod`) runs
**after** the PR/deploy. Per-environment status is stored as `qa-<env>` frontmatter keys.
It is the only command that promotes coverage to `verified`.

**Arguments.** Finding id **and** an environment token (e.g. `007 local`, `007 staging`,
`007 prod`). If the environment is absent, it asks, listing `QA_ENVIRONMENTS` (default the
first, `local`). If the finding is absent, it asks which one.

**Gates / preconditions.**

- `.audit/BOOTSTRAP.md` must exist; otherwise stops.
- The finding must exist under `.audit/findings/`; a not-found id stops with a suggestion
  to run `/audit-new`.
- **PR-open validation (deployment environments only).** For any non-`local` environment,
  an **open** PR for `audit/NNN-<slug>` is required (`gh pr view X --json state` must be
  `OPEN`). A `MERGED` PR → asks whether to proceed as a post-merge sanity check; a `CLOSED`
  PR → stops. This whole check is **skipped for `local`**, which runs before any PR exists.
- **Coverage promotion is doubly gated:** a row becomes `verified` **only** when
  `qa-<QA_TARGET_ENV>` is `approved` **and** the PR state is `MERGED`. Approval on a
  non-target environment, or approval without merge, never sets `verified`.
- The AI never merges, never pushes, never authors commits — merge is 100% human.
- Card status is never changed by the command on its own; only on the dev's explicit
  request. QA's own comments are never rewritten.

**Inputs read.** `.audit/BOOTSTRAP.md` (`QA_ENVIRONMENTS`, `QA_TARGET_ENV`, `PREVIEW_MODE`,
`PREVIEW_URL_PATTERN`, `CONFIDENCE_MIN`, Notion database URLs/IDs, environment URLs); the
finding's `README.md` (frontmatter: `worktree`, `confidence`, `slug`, `title`, `area`,
`severity`), `investigation.md`, `resolution.md` (including the "Acceptance criteria" that
become cards); the QA templates; the Notion databases (`PDD - Findings`, `PDD - QA Tests`)
or the file checklist.

**Outputs written.**

- QA cards: Notion pages in `PDD - Findings` and `PDD - QA Tests`, or — when Notion is
  disabled or its MCP is unavailable — a file checklist at
  `.audit/findings/NNN-<slug>/qa/checklist.md` (and `qa/finding.md`).
- The finding's `README.md` frontmatter: `qa-<env>: approved` (only after the dev confirms)
  when all scenarios for that environment pass.
- `resolution.md` — a "QA cards" section back-referencing the cards, testable environment,
  and PR under validation.
- `.audit/coverage.md` — the finding's row set to `verified` **only** when both promotion
  conditions hold (target-env approved + PR merged); otherwise left as `resolved` with an
  explanation of what is still missing.
- `.audit/board.md` — updated to "in QA on branch" and, on full approval, "ready to merge
  PR #X".
- `.audit/activity/audit-qa-NNN.json` — presence file (removed on exit).

**Failure modes.**

- Bootstrap missing or finding not found → stops.
- Deployment-env QA with no open PR → stops and instructs `/audit-pr NNN` first (or accepts
  an alternative branch/PR number, or a forced run recorded as unvalidated).
- Notion enabled but its MCP not connected → offers the file-checklist fallback and pauses;
  if the MCP fails mid-run, stops and reports partial state (no automatic rollback).
- QA rejects one or more scenarios → enters feedback mode; the fix stays incremental on the
  **same** branch `audit/NNN-<slug>` (pre-merge), drafted as an `/audit-new` follow-up the
  dev approves before any file is created.

---

## `/audit-pr <id>`

**Purpose.** Assemble the pull request for a resolved finding as a self-contained
**evidence dossier** (symptom → cause → fix, confidence tier, check/test results,
characterization test, parity diff, paired screenshots, QA checklist), present it, and stop
at the push gate. It pushes and runs `gh pr create` **only after an explicit human "yes"**
in the same session. It never authors commits, never pushes autonomously, never merges.

**Arguments.** Finding id (`NNN` or `NNN-<slug>`).

**Gates / preconditions — all seven must pass, in order (stops on the first failure).**

1. `.audit/BOOTSTRAP.md` exists (otherwise stops before anything else).
2. `resolution.md` exists in the finding folder (else run `/audit-resolve` first).
3. The machine-readable `evidence:` block is present in `resolution.md`.
4. The branch `audit/NNN-<slug>` exists and is checked out in the active working tree.
5. The dev has committed: the tree is clean (`git status --porcelain` empty) **and** the
   branch has at least one commit ahead of the base. A dirty tree is refused — the human
   authors the commit.
6. `confidence` ≥ `CONFIDENCE_MIN` (tier order `tier-0` < `tier-1` < `tier-2` < `tier-3`).
7. **`qa-local: approved`** is present in the finding's frontmatter. Without it, stops and
   instructs `/audit-qa <id> local` first — local QA is a blocking precondition of the PR.

(The bootstrap check plus the six finding-level checks together form the gate; local QA is
the final one before the dossier is assembled.)

**Inputs read.** `.audit/BOOTSTRAP.md` (`CHECK_CMD`, `TEST_CMD`, `CONFIDENCE_MIN`,
`PREVIEW_MODE`, `PREVIEW_URL_PATTERN`, `REFERENCE_NAME`, base branch); the finding folder in
`.audit/resolved/<NNN>-<slug>/` (or `.audit/findings/…`): `README.md` (frontmatter `slug`,
`confidence`, `worktree`), `investigation.md`, `resolution.md` (fix summary, `evidence:`
block); the artifacts the evidence block references (`parity_diff`, `screenshots`,
`characterization_test`); the PR-body template.

**Outputs written.**

- `.audit/…/<finding>/refs/pr-body.md` — the assembled dossier body (for `gh --body-file`),
  written whether or not the dev approves the push.
- Only after an explicit "yes": `git push -u origin audit/NNN-<slug>` and
  `gh pr create --title … --body-file refs/pr-body.md --base <base>`, run in the correct
  working tree.
- `resolution.md` `evidence:` block — `pr_url:` recorded after the PR is opened.
- `.audit/board.md` — optionally annotated with the PR.
- `.audit/activity/audit-pr-NNN.json` — presence file (removed on exit).

**Failure modes.**

- Any of the six preconditions fails → stops at the first failure with a specific
  instruction; nothing is pushed or opened.
- The dev cancels at the push gate → the dossier is left at `refs/pr-body.md` for later; no
  push occurs. A vague or absent answer is not consent.
- The dev asks to "just push it" without seeing the body → the body is shown first anyway.
- `gh pr create` reports the branch already has a PR → no duplicate is created; the existing
  URL is fetched and, if the dev agrees, its body is updated with the new dossier.
- Check/test results not observed as passing → re-run or the gap is stated; a pass is never
  claimed that was not observed, and no evidence tier is claimed beyond the artifacts.

---

## `/audit-status`

**Purpose.** Read-only, in-chat dashboard of the PDD state: parity-coverage %, the
confidence-tier distribution, findings grouped by area and severity, in-progress tasks, and
suggested next actions. It changes no files and runs no build/test commands.

**Arguments.** Optional. `detailed` lists every finding individually; `area:<name>` filters
by area; `severity:<level>` filters by severity; `open` / `investigated` filter by status.

**Gates / preconditions.**

- `.audit/BOOTSTRAP.md` must exist; otherwise reports "PDD is not initialized" and stops.
- Purely read-only: modifies no file, runs no build or test command.

**Inputs read.** `.audit/BOOTSTRAP.md` (mission, target date, `PROJECT_AREAS`,
`CONFIDENCE_MIN`); `.audit/coverage.md` (the parity coverage table); `.audit/board.md`;
every `README.md` frontmatter under `.audit/findings/` and `.audit/resolved/`; the presence
of `investigation.md` / `resolution.md` and the contents of each `refs/`.

**Outputs written.** None. It is strictly read-only.

**Failure modes.**

- Bootstrap missing → reports "not initialized" and stops.
- `.audit/coverage.md` absent → reports coverage as "unavailable (run /audit-bootstrap to
  seed the coverage map)".
- Numbers that cannot be derived from real data are reported as "unavailable" — never
  estimated.
- Inconsistencies (e.g. a `verified` coverage row whose finding is still open, or a board
  out of sync with the filesystem) are **reported but not fixed**.
- Findings with malformed YAML frontmatter are listed separately as "findings with a
  structural problem".

---

## The lifecycle at a glance

| Order | Command | Advances the finding to | Coverage transition |
|---|---|---|---|
| 0 | `/audit-bootstrap` | (project initialized) | seeds all rows `not-started` |
| 1 | `/audit-new <desc>` | finding opened | → `finding-open` |
| 2 | `/audit-investigate <id>` | root cause documented | (unchanged) |
| 3 | `/audit-resolve <id>` | fix + characterization test, folder moved to `resolved/` | → `resolved` |
| 4 | `/audit-compare <id>` | tier-2 parity diff | (unchanged; tier recorded by resolve) |
| 5 | `/audit-qa <id> local` | `qa-local: approved` (unblocks the PR) | (unchanged) |
| 6 | `/audit-pr <id>` | PR opened (after human "yes") | (unchanged) |
| 7 | `/audit-qa <id> <target-env>` | `qa-<env>: approved` | → `verified` only when target-env approved **and** PR merged |
| — | `/audit-status` | (read-only) | none |

`/audit-compare` is also invoked inside `/audit-resolve` (to reach tier-2/tier-3) and by
`/audit-qa` (to re-confirm parity on the branch/preview). The `pdd` CLI dashboard renders
the same state as `/audit-status`; see [cli.md](cli.md).

## Related reference

- [audit-structure.md](audit-structure.md) — the full `.audit/` schema: finding
  frontmatter, `investigation.md`/`resolution.md`, the `evidence:` block, `refs/`, and the
  `coverage.md` table format.
- [configuration.md](configuration.md) — every configuration key referenced above and its
  default.
