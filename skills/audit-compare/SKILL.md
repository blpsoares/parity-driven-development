---
name: "audit-compare"
description: "Golden-master comparison harness. Runs the SAME read-only operation on both the reference (legacy) and new systems using the access configured in BOOTSTRAP (CLI, DB query via MCP, API call, or browser navigation via MCP), diffs the outputs, and writes refs/parity-<date>.diff as Tier-2 evidence. An empty diff means parity is objectively confirmed."
argument-hint: "finding id (+ optional reference case, e.g. 007 order#123)"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Context

Part of the **PDD (Parity-Driven Development)** method. This skill produces **objective parity evidence** by executing the same operation on both systems and diffing the results — it does not modify code and never writes to either system.

Interact with the dev in their working language — never force English on the user; the example phrases below are templates.

This skill is used two ways:
- Inside `/audit-resolve` to lift a finding to **tier-2** (data-to-data diff) or **tier-3** (tier-2 + passing characterization test).
- By `/audit-qa` to re-confirm parity on the branch/preview before approving a merge.

## Confidence tiers (this skill produces tier-2)

- **tier-0** — textual description only (red / low)
- **tier-1** — paired reference-vs-new screenshots (yellow / medium)
- **tier-2** — automated data-to-data diff produced by `/audit-compare` (orange / high) ← this skill
- **tier-3** — tier-2 PLUS a passing characterization test (green / max)

If the reference (legacy) system cannot be executed at all (MFA, no access, offline), **fall back to visual tier-1**: guide the dev to capture paired screenshots and record the limitation — do not block the cycle.

## Outline (one gated step at a time)

### 1. Read BOOTSTRAP

- Read `.audit/BOOTSTRAP.md`. If it does NOT exist: stop and instruct `/audit-bootstrap`.
- Extract from BOOTSTRAP:
  - `REFERENCE_NAME` and `REFERENCE_ACCESS` — how the reference system is reached.
  - `NEW_ACCESS` — how the new system is reached.
  - Available MCPs (database, browser).
  - Configured **reference cases** (the seeded scenarios).
  - `PREVIEW_MODE` (`per-branch-url` | `local`) and `PREVIEW_URL_PATTERN`.
  - `CONFIDENCE_MIN` (default `tier-1`).
- If a project rules document exists, read it to learn constraints (which DB operations are forbidden, rate limits, etc.).

### 2. Resolve the finding + reference case

- Parse `$ARGUMENTS`:
  - First token = finding id (`NNN` or `NNN-<slug>`). If empty: list open findings under `.audit/findings/` and ask which one.
  - Remaining tokens (optional) = the reference case to compare (e.g. `order#123`, `user=teste`). If absent, take the reference case from the finding's `README.md`, and if still absent, from the BOOTSTRAP reference cases — ask the dev to confirm which case to use.
- Locate the finding folder `.audit/findings/NNN-*`. If not found: clear error listing available findings.
- Read the finding's `README.md` (frontmatter + body). Note its `worktree` field and `confidence` tier.
- Read `investigation.md` if present — it tells you exactly which operation/query/route diverged, so you compare the RIGHT thing.

### 3. If the finding has a worktree, run inside it

- Read the finding's `worktree` field from the frontmatter.
- If it is an absolute path (not the literal `none`): all comparison work for the **new system** must run against the code in that worktree. Confirm the path exists; if it does not, tell the dev and stop.
- If it is `none`: operate in the main checkout on branch `audit/NNN-<slug>` (or wherever the dev currently is) — do not create or switch branches here.
- Never author commits and never switch branches on the dev's behalf.

### 4. Choose the execution mode and run the SAME operation on BOTH systems

Determine which of the four modes fits, from the finding's area and BOOTSTRAP access. Confirm the plan with the dev before executing anything.

```
I'll compare "<behavior>" for reference case <case> on both systems.
Reference (<REFERENCE_NAME>): <how it will be reached>
New system: <how it will be reached>
Mode: <CLI | DB query | API call | browser>
Exact operation on each side:
  reference → <command / query / request / navigation>
  new       → <command / query / request / navigation>
This is READ-ONLY on both systems. Proceed? (yes / adjust)
```

**Mode A — CLI command**
- Run the configured command against the reference system, capture stdout/stderr/exit code.
- Run the equivalent command against the new system, capture the same.
- Normalize noise (timestamps, ids, absolute paths) only if it is clearly non-semantic — and record every normalization applied.

**Mode B — DB query via MCP (database)**
- Use the database MCP to run the SELECT/read query against the reference DB, capture the rows.
- Run the equivalent read query against the new DB, capture the rows.
- Read-only only: `SELECT`/`find`/`aggregate` and equivalents. NEVER `INSERT`/`UPDATE`/`DELETE`/`drop`/write.
- Show the exact query to the dev and get an explicit "yes" before running it (per side).

**Mode C — API call**
- Issue the same request (method + path + params + body) to the reference API and to the new API, capture status + response body.
- Use idempotent/safe methods only (prefer `GET`). If the operation genuinely requires a non-GET, confirm it is non-destructive and read-only in effect, and get explicit dev confirmation; otherwise fall back to tier-1 visual.

**Mode D — Browser navigation via MCP (browser)**
- Navigate the reference system to the target state and read the rendered data (page text / DOM values), capture it.
- Do the same on the new system (use `PREVIEW_URL_PATTERN` when `PREVIEW_MODE=per-branch-url`, or the local branch when `local`).
- Read-only: navigate and read; do not submit forms that mutate state unless the dev explicitly confirms it is safe. Prefer extracting the underlying data over pixel comparison; capture paired screenshots as a bonus (which also unlocks tier-1 if the diff can't be produced).

Rules for every mode:
- Read-only on both systems. Confirm any query/command before running it. Never a destructive operation (inherits `/audit-investigate` rules).
- Capture RAW outputs to the finding's `refs/` (e.g. `refs/parity-reference.raw`, `refs/parity-new.raw`) so the diff is reproducible.
- If the reference system cannot be executed, switch to the tier-1 visual fallback described above and skip to step 6 reporting tier-1.

### 5. Produce the textual diff and write `refs/parity-<date>.diff`

- Produce a textual, deterministic diff of the two captured outputs (field-by-field for data; line-by-line for CLI/text). Sort/canonicalize unordered collections before diffing so ordering noise is not reported as a difference.
- Write the diff to `.audit/findings/NNN-<slug>/refs/parity-<date>.diff` using **today's date** (`2026-07-01` format). This file IS the tier-2 evidence.
- The file must start with the header defined in `template.md` (reference case, both systems, mode, exact command/query used on each side), followed by the diff body. An empty diff body is expected on parity — keep the header and write `NO DIFFERENCES — parity confirmed`.
- Do not delete the raw captures; they back the diff.

### 6. Report the diff summary

Report to the dev:
- Path of `refs/parity-<date>.diff`.
- **Empty diff → parity confirmed objectively.** Say so plainly and note the finding now qualifies for **tier-2** (tier-3 once a passing characterization test exists — added in `/audit-resolve`).
- **Non-empty diff →** summarize the concrete differences (which fields/lines differ, reference value vs new value) in a few lines, and point back to `/audit-investigate` or `/audit-resolve` to close the gap.
- If you fell back to visual: report **tier-1**, list the paired screenshots in `refs/`, and state the limitation that blocked execution.
- Update the finding's `refs/` listing note. Do NOT change the finding `confidence` frontmatter or `.audit/coverage.md` yourself — `/audit-resolve` owns the tier promotion after confirming the full evidence block (parity_diff + characterization_test). Just surface the achieved evidence so `/audit-resolve` can record it.

## Quality rules

- READ-ONLY on both systems, always. Never `INSERT`/`UPDATE`/`DELETE`/write, never mutating API calls, never state-changing form submits — without an explicit dev "yes" confirming it is non-destructive.
- ALWAYS show the exact command/query/request/navigation and get confirmation BEFORE running it, per side.
- NEVER author commits, NEVER switch branches, NEVER push.
- When the finding has a `worktree` path, run the new-system side against that worktree.
- ALWAYS write raw captures alongside the `.diff` so the evidence is reproducible.
- An empty diff is a POSITIVE result (parity), not a failure — report it as tier-2 confirmation.
- If the legacy system is unreachable, fall back to tier-1 visual and document the limitation — do not fabricate a diff and do not block the cycle.
