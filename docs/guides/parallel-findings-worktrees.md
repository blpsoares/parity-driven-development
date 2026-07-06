---
title: "Guide: Work Findings in Parallel with Worktrees"
description: "Isolate a finding in a dedicated git worktree so several findings progress at once without stepping on each other."
group: "guides"
order: 3
slug: "parallel-findings-worktrees"
---

# Work Findings in Parallel with Worktrees

When you are proving parity on a large migration, you rarely have exactly one finding
in flight. One finding is under investigation, another is being resolved, a third is
waiting on QA. If they all share your single working checkout, their edits collide and
their branches trip over each other. PDD's worktree option removes the collision: each
finding gets its own git worktree and its own branch `audit/NNN-<slug>`, and every
downstream skill for that finding operates inside it.

This guide shows how to opt a finding into worktree isolation, where the worktree lands
for your harness, and how to watch parallel work in the `pdd` dashboard.

## Before you start

- You have run `/audit-bootstrap` and the project has a populated `.audit/` directory.
- The repository is a git repo (`git worktree` requires one).
- You know which harness you are running in — the worktree base path depends on it.

## 1. Answer the worktree question in `/audit-new`

Every `/audit-new` run ends with one explicit question:

> Isolate this finding's work in a dedicated git worktree? (yes / no)

Answer **yes** to isolate. PDD then, in a single command:

1. Picks the base directory by harness convention (see step 2).
2. Ensures that base is git-ignored so worktree contents are never committed.
3. Runs `git worktree add <repo-root>/<base>/audit-NNN-<slug> audit/NNN-<slug>`,
   which creates **both** the branch `audit/NNN-<slug>` and the worktree at once.
4. Records `worktree: <absolute-path>` in the finding's `README.md` frontmatter.

You will see a confirmation like:

```text
Isolated worktree ready at <path> on branch audit/NNN-<slug>. Later skills will operate there.
```

Answer **no** to keep working in your main checkout. PDD records `worktree: none` and
creates **no** branch yet — `/audit-resolve` will create `audit/NNN-<slug>` in the main
checkout when you reach the fix step.

> Creating the worktree only adds a branch and a working directory. It does **not**
> commit anything — the AI never authors commits.

## 2. Know where your worktree lands

Worktrees live **inside** the repo (never as a sibling directory), under a
harness-specific, git-ignored base:

| Harness | Base directory | Full worktree path |
|---|---|---|
| Claude Code (a `.claude/` dir exists at the repo root) | `.claude/worktrees` | `.claude/worktrees/audit-NNN-<slug>` |
| Any other agent (Codex, Cursor, Copilot, Gemini, …) | `.audit-worktrees` | `.audit-worktrees/audit-NNN-<slug>` |

If a harness documents its own worktree location, PDD prefers that. Otherwise the two
rules above apply. In both cases the base directory is appended to `.gitignore` if it is
not already covered, so nothing under the worktree base is ever staged or committed.

## 3. Run the finding's skills — they follow the worktree automatically

Once `worktree:` holds a path, you do not repeat yourself: each downstream skill reads
that field and operates inside the worktree.

| Skill | Behavior when `worktree:` is a path |
|---|---|
| `/audit-investigate NNN` | Reads and analyzes the new-system source **inside** the worktree; every `Read`/`Grep`/`Glob`/`git log` uses that path as its root. |
| `/audit-resolve NNN` | Makes every file change, check, and test **inside** the worktree; the branch already exists, so it does not create one. |
| `/audit-compare NNN` | Runs the new-system side of the golden-master diff against the worktree's code. |
| `/audit-pr NNN` | Runs every `git`/`gh` command inside the worktree (e.g. `git -C <worktree> …`). |

If the recorded worktree path is missing on disk (for example, someone removed it), the
skills stop and tell you — they will not silently fall back to the main checkout. Recreate
it with `git worktree add <path> audit/NNN-<slug>` (the branch already exists, so this just
re-attaches a working directory) or set `worktree: none` to resolve in the main checkout.

## 4. Run several findings at once

Because each isolated finding has its own worktree and branch, you can interleave them
freely:

1. `/audit-new "finding A"` → **yes** → worktree A on branch `audit/001-<slug>`.
2. `/audit-new "finding B"` → **yes** → worktree B on branch `audit/002-<slug>`.
3. Investigate A while resolve runs against B — no shared files, no branch contention.

Findings that answered **no** keep sharing the main checkout, so reserve worktrees for
work you genuinely want running in parallel.

## 5. Watch parallel work in the `pdd` dashboard

The `pdd` TUI has a dedicated **Worktrees** tab. Launch the dashboard from anywhere in the
project:

```bash
pdd            # interactive dashboard — ↑/↓ move, →/enter expand, ←/esc collapse, q quit
pdd tui        # same interactive dashboard, explicit
```

Expand a worktree entry to see its branch, its full path, and the findings living in it.
The neighboring **Active now** section shows live executions across every agent and
worktree, so you can tell at a glance which finding each parallel session is touching. The
tree refreshes live as `.audit/` changes. If Node or Bun is not available, `/audit-status`
reports the same state in-chat.

## What still requires a human

Worktree isolation changes *where* work happens, never *who* approves it. The inviolable
rules hold in every worktree:

- The AI **never authors commits** — you commit the fix yourself, on the finding's branch.
- `push` / `gh pr create` happen **only after an explicit human "yes"** in the same session,
  and `/audit-pr` still blocks unless `qa-local` is approved.
- **Merge is 100% human**, and only after the target-environment QA approves. Coverage turns
  `verified` only when the target env is approved **and** the PR is merged.

## Related pages

- [Command reference](../reference/commands.md) — the full contract for every `/audit-*`
  command, including which ones honor the `worktree` field.
- [The coverage model](../concepts/coverage-model.md) — how findings move to `verified`.
- [Multi-phase QA](../concepts/multi-phase-qa.md) — the local and per-environment gates.
