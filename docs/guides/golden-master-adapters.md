---
title: "Guide: Write Golden-Master Adapters"
description: "Configure CLI, DB, API, and browser adapters so /audit-compare runs one operation on both systems and emits a clean tier-2 diff."
group: "guides"
order: 7
slug: "golden-master-adapters"
---

# Guide: Write Golden-Master Adapters

`/audit-compare` is PDD's **golden-master harness**. It runs the *same* read-only
operation against the **reference (legacy) system** and the **new system**, diffs the
two outputs, and writes the diff to the finding's `refs/parity-<date>.diff` as
**tier-2 evidence**. An empty diff body is the goal: it means parity is confirmed
objectively, not by opinion. (See [Evidence and tiers](../concepts/evidence-and-tiers.md)
for why tier-2 matters and how it gates resolution.)

This guide shows how to define the *operation on each side* and *normalize the output*
for the four adapter modes the harness supports — **CLI**, **DB**, **API**, and
**browser** — so the diff reports only real behavioral differences.

> **Read-only, always.** `/audit-compare` never modifies code and never writes to
> either system. It shows you the exact command, query, request, or navigation and
> waits for an explicit "yes" **before** running it, per side. It never authors
> commits, never switches branches, and never pushes.

## Before you start

- You have run [`/audit-bootstrap`](../reference/commands.md#audit-bootstrap), which
  captured `REFERENCE_NAME`, `REFERENCE_ACCESS`, `NEW_ACCESS`, the available MCPs
  (database, browser), the seeded **reference cases**, `PREVIEW_MODE` /
  `PREVIEW_URL_PATTERN`, and `CONFIDENCE_MIN`. The harness reads these from
  `.audit/BOOTSTRAP.md`; if it is missing, the skill stops and tells you to bootstrap.
- The finding exists (`/audit-new`), and ideally `/audit-investigate` has recorded
  *which* operation, query, or route diverged — that tells the harness what to compare.
- You know a concrete **reference case** to exercise (e.g. `order#123`, `user=teste`).
  If you don't pass one, the harness takes it from the finding's `README.md`, then from
  the BOOTSTRAP reference cases, and asks you to confirm.

## The universal recipe

Every adapter follows the same four moves. The mode only changes *how you invoke* the
operation and *what "output" means*.

1. **Define the operation once, run it twice.** Express the behavior as a single
   parameterized operation, then bind it to each system's access. The reference and new
   invocations must be *equivalent* — same input, same scope — so any diff is behavior,
   not setup.
2. **Capture raw output on both sides.** The harness writes the untouched captures to
   the finding's `refs/` (e.g. `refs/parity-reference.raw`, `refs/parity-new.raw`) so the
   diff is reproducible from evidence, not from memory.
3. **Normalize only non-semantic noise.** Strip or canonicalize things that differ by
   construction — timestamps, generated ids, absolute paths, row ordering. Record *every*
   normalization applied in the diff header. Never normalize away a real difference.
4. **Diff deterministically.** Sort/canonicalize unordered collections before diffing so
   ordering is not reported as a difference. The result lands in
   `refs/parity-<date>.diff` with a header (reference case, both systems, mode, exact
   operation per side) followed by the diff body — or `NO DIFFERENCES — parity confirmed`.

## Choosing a mode

Pick the mode from the finding's area and the access BOOTSTRAP recorded. Confirm the
plan with the dev before executing anything.

| Mode | Use when the behavior is observable via… | "Output" you diff |
|---|---|---|
| **A — CLI** | a command-line tool or script both systems expose | stdout + stderr + exit code |
| **B — DB** | data written/read through a database (MCP available) | the returned rows |
| **C — API** | an HTTP endpoint both systems serve | status code + response body |
| **D — Browser** | rendered UI state (MCP browser available) | page text / DOM values (+ paired screenshots) |

The harness prints a plan like this and waits for `yes` / `adjust` before touching
anything:

```text
I'll compare "checkout total" for reference case order#123 on both systems.
Reference (legacy-monolith): CLI `legacy checkout --order 123`
New system:                  CLI `bun run checkout -- --order 123`
Mode: CLI
This is READ-ONLY on both systems. Proceed? (yes / adjust)
```

## Mode A — CLI adapter

Define the operation as one command with the case as an argument, then bind the
reference and new invocations.

1. Confirm the exact command for each side and get your "yes".
2. Run the command against the reference system; capture stdout, stderr, and exit code.
3. Run the equivalent command against the new system; capture the same three streams.
4. Normalize only clearly non-semantic noise — for example, a trailing timestamp line or
   an absolute temp path — and note each substitution in the header.

```bash
# reference
legacy report --order 123 > refs/parity-reference.raw 2>&1

# new
bun run report -- --order 123 > refs/parity-new.raw 2>&1
```

If the two commands differ only in the launcher (`legacy` vs `bun run`), the diff should
be empty — that is your parity signal.

## Mode B — DB adapter (via database MCP)

Use the database MCP to read the same rows from each system's store. This mode is strictly
read: `SELECT` / `find` / `aggregate` and their equivalents only — **never** `INSERT`,
`UPDATE`, `DELETE`, `drop`, or any write.

1. Write the read query for the reference DB and show it to the dev; get an explicit "yes".
2. Run it; capture the rows.
3. Show the equivalent query for the new DB; get a "yes"; run it; capture the rows.
4. Canonicalize before diffing: select the same columns/fields in the same order, and
   sort rows by a stable key so unordered result sets don't produce phantom differences.

```sql
-- reference and new (equivalent schemas)
SELECT id, status, total_cents
FROM orders
WHERE id = 123
ORDER BY id;
```

When schemas differ between systems (common in a port), project both queries onto a
shared shape — the same field names and types — so you are comparing behavior, not
storage layout. Record that projection as a normalization in the header.

## Mode C — API adapter

Issue the same request to each API and diff the status code plus the response body.

1. Prefer safe, idempotent methods — **`GET`** whenever possible. Same method, path,
   query params, and body on both sides.
2. If the behavior genuinely requires a non-`GET` method, confirm it is non-destructive
   and read-only *in effect*, and get an explicit dev "yes". If it mutates state, do not
   run it — fall back to the tier-1 visual path below.
3. Capture status + body raw on each side; canonicalize JSON (sort keys, normalize
   whitespace) before diffing so formatting isn't mistaken for a difference.

```text
GET /api/orders/123      → reference base URL
GET /api/orders/123      → new system base URL (branch preview or localhost)
```

Normalize volatile fields — server-generated timestamps, request ids, ETags — and list
them in the header. Everything else should match byte-for-byte on parity.

## Mode D — Browser adapter (via browser MCP)

Navigate each system to the target state and read the *rendered data*, not pixels.

1. On the reference system, navigate to the target state and extract the page text / DOM
   values that represent the behavior; capture them.
2. On the new system, do the same. Reach it via `PREVIEW_URL_PATTERN` when
   `PREVIEW_MODE=per-branch-url`, or via the local branch when `PREVIEW_MODE=local`.
3. Prefer extracting the underlying values over comparing screenshots — text diffs are
   deterministic; pixels are not. Capture paired screenshots as a bonus (they also unlock
   tier-1 if a data diff can't be produced).
4. Navigate and read only. Do not submit forms that mutate state unless the dev explicitly
   confirms the submission is safe.

## Worktrees

If the finding's frontmatter carries a `worktree` path (not the literal `none`), the
**new-system** side of every mode must run against the code in that worktree. The harness
confirms the path exists and operates there; it never switches branches or commits on your
behalf. See [Parallel findings with worktrees](./parallel-findings-worktrees.md).

## Reading the result

The harness writes `refs/parity-<date>.diff` (today's date) and reports back:

- **Empty diff → parity confirmed objectively.** The finding now qualifies for
  **tier-2** (and **tier-3** once a passing characterization test exists — added in
  `/audit-resolve`). Note that `/audit-compare` does **not** edit the finding's
  `confidence` frontmatter or `.audit/coverage.md`; it surfaces the evidence and
  [`/audit-resolve`](../reference/commands.md#audit-resolve) owns the tier promotion after
  confirming the full `evidence` block (`parity_diff` + `characterization_test`).
- **Non-empty diff →** the report summarizes which fields or lines differ (reference value
  vs new value). Take those back to `/audit-investigate` or `/audit-resolve` to close the
  gap, then re-run `/audit-compare`.

## When the reference system can't be executed

If the legacy system is unreachable — MFA, no access, offline — **do not fabricate a diff
and do not block the cycle**. Fall back to **tier-1 visual**: capture paired reference-vs-new
screenshots into `refs/`, and record the limitation that blocked execution. The finding
advances at tier-1 until the reference system can be exercised.

## Where this sits in the cycle

`/audit-compare` runs after `/audit-resolve` produces a fix, and again inside `/audit-qa`
to re-confirm parity on the branch or preview before approval. It only ever *produces
evidence* — it changes no code and gates no merge. Remember the inviolable rules that
bracket the rest of the cycle: the AI never authors commits; `push` and `gh pr create`
happen only after an explicit human **"yes"** in the same session; and **merge is 100%
human**, only after the target environment's QA approves.

## See also

- [Evidence and tiers](../concepts/evidence-and-tiers.md) — why tier-2 is the objective threshold.
- [Command reference: `/audit-compare`](../reference/commands.md#audit-compare) — arguments, gates, inputs, outputs.
- [The `.audit/` structure](../reference/audit-structure.md) — where `refs/` and the `evidence` block live.
- [Guide: Port to a new language](./port-to-new-language.md) — the Bun→Node worked example these adapters support.
