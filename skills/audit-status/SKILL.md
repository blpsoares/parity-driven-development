---
name: "audit-status"
description: "Read-only dashboard of the PDD state in the project. Shows open, in-investigation, and resolved findings grouped by area and severity, plus parity coverage, confidence distribution, in-progress tasks, and suggested next actions. Useful at the start of a session to know where to pick up."
argument-hint: "(optional) 'detailed' to list every finding; 'area:<name>' to filter by area; 'severity:<level>' to filter by severity"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

Interact with the dev in their working language — never force English on the user; the example phrases below are templates.

## Context

Part of the **PDD (Parity-Driven Development)** method. This skill is **read-only** — it changes no files. Goal: know the overall project state without opening dozens of files.

**Live alternative:** the same data is available as a live CLI panel via `pdd board` (single snapshot) or `pdd board --watch` (re-renders when `.audit/` changes). Mention this to the dev when it fits — `/audit-status` is the in-chat surface; `pdd board --watch` is the always-on terminal surface.

## Outline

### 1. Initial checks

- Check whether `.audit/BOOTSTRAP.md` exists. If NOT: report "PDD is not initialized in this project yet. Run `/audit-bootstrap` first." and stop.
- Read `.audit/BOOTSTRAP.md` briefly to extract: Mission, Target date, `PROJECT_AREAS`, and `CONFIDENCE_MIN` (default `tier-1` if absent).
- Read `.audit/coverage.md` if it exists (parity coverage map).
- Read `.audit/board.md` if it exists.
- List `.audit/findings/` (all subdirs) — open findings.
- List `.audit/resolved/` (all subdirs) — resolved findings.

### 2. Parse the findings

For each subdir in `findings/` and `resolved/`:
- Read the YAML frontmatter of `README.md`. English keys: `id`, `title`, `slug`, `area`, `severity`, `status`, `discovered-at`, `discovered-by`, `confidence`, `worktree`.
  - `confidence` is one of `tier-0 | tier-1 | tier-2 | tier-3`.
  - `worktree` is an absolute path OR the literal `none`.
- Detect whether `investigation.md` exists (investigated flag).
- Detect whether `resolution.md` exists (resolved flag).
- List the contents of `refs/` (evidence count).

### 3. Parse the coverage map

From `.audit/coverage.md`, parse the markdown table with columns:

```
| Behavior / Area | Reference case | Status | Tier | Finding |
```

- `Status` is one of `not-started | finding-open | verified`.
- Compute **parity coverage** = `verified / total` rows.
- If `.audit/coverage.md` does not exist, report coverage as "unavailable (run /audit-bootstrap to seed the coverage map)".

### 4. Apply filters (if `$ARGUMENTS` is present)

- No args: default overview.
- `detailed`: include an individual listing of each finding.
- `area:<name>`: filter by area (e.g. `area:checkout`).
- `severity:<level>`: filter by severity (e.g. `severity:critical`).
- `open` or `investigated`: filter by status.

### 5. Output — default format

```
═══════════════════════════════════════════════════════════════
  PDD Status · <project name>
═══════════════════════════════════════════════════════════════

Mission: <first line of the BOOTSTRAP Mission>
Target date: <BOOTSTRAP date> · <X days remaining or "no fixed date">
Confidence gate: <CONFIDENCE_MIN>

───────────────────────────────────────────────────────────────
  Parity coverage
───────────────────────────────────────────────────────────────

[███████████░░░░░░░░░]  <PP>%   (<verified> of <total> behaviors verified)
  └─ finding-open:  <F>
  └─ not-started:   <NS>

───────────────────────────────────────────────────────────────
  Summary
───────────────────────────────────────────────────────────────

Open findings:           <N>   (files in .audit/findings/)
  └─ already investigated: <M>
  └─ awaiting:             <N-M>

Resolved:                <R>   (last 7 days: <R7>)

───────────────────────────────────────────────────────────────
  Confidence distribution
───────────────────────────────────────────────────────────────

🟢 tier-3 (max · diff + characterization test):  <n>
🟠 tier-2 (high · automated data-to-data diff):  <n>
🟡 tier-1 (medium · paired screenshots):          <n>
🔴 tier-0 (low · textual description only):        <n>

<If any OPEN finding is below CONFIDENCE_MIN, add:>
⚠ <k> open finding(s) below the confidence gate (<CONFIDENCE_MIN>) — run /audit-compare to raise the tier.

───────────────────────────────────────────────────────────────
  By project area
───────────────────────────────────────────────────────────────

<For each area in PROJECT_AREAS from BOOTSTRAP:>
<area name>:  <n open> / <m resolved>

Other (uncategorized):  <n> / <m>

───────────────────────────────────────────────────────────────
  By severity
───────────────────────────────────────────────────────────────

🔴 critical:  <n>
🟠 high:      <n>
🟡 medium:    <n>
🟢 low:       <n>

───────────────────────────────────────────────────────────────
  In progress (from board.md)
───────────────────────────────────────────────────────────────

<contents of the "In progress" section of board.md>
<For each in-progress finding, if its worktree field is a path, show:  ↳ worktree: <path>>

───────────────────────────────────────────────────────────────
  Suggested next actions
───────────────────────────────────────────────────────────────

<conditional logic>:
- If there are open critical findings: "🚨 Prioritize NNN (critical) with /audit-investigate NNN"
- If there are investigated findings awaiting a fix: "There are M findings ready for /audit-resolve"
- If there are open findings below CONFIDENCE_MIN: "Raise evidence on NNN with /audit-compare NNN before resolving"
- If there are resolutions with an open PR: "Run /audit-qa NNN — PR is open and testable"
- If parity coverage < 100% and there are not-started behaviors: "Uncovered behavior: <first not-started row> — open it with /audit-new"
- If there are no open findings: "No open findings. All caught up."

Live view: pdd board --watch
```

### 6. Output with `detailed`

Append at the end:

```
───────────────────────────────────────────────────────────────
  Open findings (detailed)
───────────────────────────────────────────────────────────────

[NNN-slug]  <title>
  Area: X · Severity: Y · Discovered by @Z on YYYY-MM-DD
  Status: <open | investigated | out-of-scope>
  Confidence: <tier-N>  <🔴/🟡/🟠/🟢>
  Worktree: <path | none>
  Evidence in refs/: <N files>
  Path: .audit/findings/NNN-slug/

(repeat for each finding)

───────────────────────────────────────────────────────────────
  Resolved (last 7 days)
───────────────────────────────────────────────────────────────

[NNN-slug]  <title>
  Resolved on YYYY-MM-DD by @X · Confidence: <tier-N>
  Path: .audit/resolved/NNN-slug/

(repeat)
```

### 7. Rules

- Do NOT modify any file.
- Do NOT run build/test commands (this skill is purely reading from disk).
- If `.audit/board.md` is out of sync with the filesystem, **report the inconsistency** but do not fix it.
- If `.audit/coverage.md` is out of sync with the findings (e.g. a `verified` row whose finding is still open), **report the inconsistency** but do not fix it.
- Output must be scan-friendly — a dev running this skill is in "quick summary" mode.
- If `PROJECT_AREAS` is not filled in the BOOTSTRAP, group by each README.md's `area` frontmatter, or list as "uncategorized".

## Quality rules

- NEVER invent numbers — if the info was not found, say "unavailable".
- ALWAYS read the BOOTSTRAP to get the current mission/target date and `CONFIDENCE_MIN`.
- If any finding has malformed YAML frontmatter, list it separately as "findings with a structural problem".
- The confidence distribution and parity coverage must be derived only from real data (findings' `confidence` field and `coverage.md` rows) — never estimated.
