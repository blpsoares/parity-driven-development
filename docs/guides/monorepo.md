---
title: "Guide: PDD in a Monorepo"
description: "How to place .audit/, scope coverage areas per package, and run the pdd CLI from any subfolder of a monorepo."
group: "guides"
order: 6
slug: "monorepo"
---

# Guide: PDD in a Monorepo

PDD keeps all of its state in a single `.audit/` directory and drives every finding
against **one reference system**. A monorepo raises one decision up front: do all the
packages share **one** parity story, or does each package track its **own** reference
system? This guide walks you through both layouts, how to scope coverage areas per
package, and how the `pdd` CLI behaves from a nested working directory.

Nothing here needs a special flag — PDD has none for monorepos. It works because the
`/audit-*` commands operate on `.audit/` relative to where you invoke them, and the
`pdd` CLI walks up the directory tree to find `.audit`. You get monorepo support by
**where you run bootstrap** and **how you name areas**.

## Step 1 — Choose where `.audit/` lives

Pick one of two layouts before running `/audit-bootstrap`.

**Option A — one `.audit/` at the repo root (recommended default).**
Choose this when the packages are being refactored/ported against a **single**
reference system (for example, one legacy monolith you are splitting into
`packages/web` + `packages/api`), and you want **one** parity-coverage percentage for
the whole migration.

**Option B — one `.audit/` per package.**
Choose this when each package has a **different** reference system, a different check/test
command, or an independent QA environment chain — each package is effectively its own PDD
project. You will run `/audit-bootstrap` once inside each package directory, producing an
independent `BOOTSTRAP.md`, `coverage.md`, and coverage percentage per package.

| Concern | Option A (root) | Option B (per-package) |
|---|---|---|
| Reference system | one, shared | one per package |
| `CHECK_CMD` / `TEST_CMD` | one pair for the repo | one pair per package |
| Coverage % | single headline number | one number per package |
| QA environment chain | shared | independent per package |
| Best for | one legacy source, many targets | independent products in one repo |

If in doubt, start with **Option A**: it gives a single auditable parity story and you can
still separate work cleanly using area names (Step 3) and worktrees (Step 5).

## Step 2 — Run bootstrap from the directory that owns `.audit/`

`/audit-bootstrap` creates `.audit/` **relative to your current working directory**. Run it
from the location you chose in Step 1.

For **Option A**, run it from the repo root:

```bash
cd /path/to/monorepo
# then, in your agent:  /audit-bootstrap
```

For **Option B**, run it once inside each package, from that package's directory:

```bash
cd /path/to/monorepo/packages/web
# then, in your agent:  /audit-bootstrap
```

During the interview, answer the **build and test commands** (`CHECK_CMD` / `TEST_CMD`)
for the scope that owns this `.audit/`. In Option A these must be commands that work from
the repo root — typically your workspace runner (for example `pnpm -r run check`,
`turbo run test`, or `nx run-many`). In Option B they are the package-local commands.

## Step 3 — Scope areas per package in the coverage map

PDD's project areas (`PROJECT_AREAS`, Section 6 of bootstrap) are **free-form strings**.
In a root-level `.audit/` (Option A) this is exactly the lever you use to keep packages
separate: **namespace every area with its package**. Use a consistent `package/behavior`
convention so `/audit-status` and the `pdd` dashboard group them legibly and finding titles
stay unambiguous.

When bootstrap seeds `.audit/coverage.md`, the table looks like this:

```markdown
| Behavior / Area          | Reference case | Status        | Tier   | Finding |
|--------------------------|----------------|---------------|--------|---------|
| web/checkout: total      | order #123     | verified      | tier-3 | 007     |
| web/login: lock after 3  | test user      | finding-open  | tier-1 | 012     |
| api/auth: token refresh  | session s-88   | not-started   | —      | —       |
| api/export: CSV          | —              | not-started   | —      | —       |
```

The prefix (`web/`, `api/`) is just text in the **Behavior / Area** column — PDD does not
parse it, but the convention makes per-package progress obvious at a glance and lets you
scan coverage by package. Keep the delimiter (`/`, `:`) consistent across every row.

Column meanings and the full schema are in
[../reference/audit-structure.md](../reference/audit-structure.md); parity coverage % =
`verified` / total rows, so a root-level `.audit/` reports one number spanning all packages.

## Step 4 — Capture findings with the package in the area

When you run `/audit-new "<description>"`, set the finding's **area** to the same namespaced
value you used in the coverage map (for example `web/checkout`). This:

- keeps the finding's coverage row aligned with the seeded area, and
- groups the finding under its package in `/audit-status` and the `pdd` tree.

The finding still lives under the single `.audit/findings/NNN-<slug>/` directory — findings
are **not** split into per-package folders. One monotonic `NNN` id space across the whole
`.audit/` keeps ordering and cross-references simple; the package association travels in the
area field, not in the path.

## Step 5 — Isolate parallel package work with worktrees

Two people (or agents) touching two packages at once is the common monorepo case.
`/audit-new` offers to isolate a finding in a dedicated **git worktree**; answer **yes** to
get branch `audit/NNN-<slug>` in its own working tree so concurrent findings across packages
never collide in your checkout. The worktree base follows the harness and is git-ignored:

- **Claude Code** → `.claude/worktrees/audit-NNN-<slug>`
- **Any other agent** → `.audit-worktrees/audit-NNN-<slug>`

`investigate` / `resolve` / `compare` / `pr` then run inside that worktree. See
[parallel-findings-worktrees.md](parallel-findings-worktrees.md) for the full workflow.

## Step 6 — Run the `pdd` CLI from any subfolder

With no path argument, `pdd` walks **up** from the current directory until it finds `.audit`.
In a monorepo this means:

- **Option A (root `.audit/`):** `pdd` works from anywhere in the repo — deep inside
  `packages/api/src/`, it walks up and finds the root `.audit/`, showing the whole repo's
  coverage tree.
- **Option B (per-package `.audit/`):** `pdd` resolves to the **nearest** `.audit/` above you.
  Run it from inside `packages/web` to see that package's board; from the repo root (which has
  no `.audit/` in Option B) it will not find one — `cd` into a package first.

```bash
cd /path/to/monorepo/packages/api/src
pdd                  # walks up, renders the governing .audit/ dashboard
pdd board            # static ANSI snapshot (good for CI)
pdd board --watch    # auto-refreshes as that .audit/ changes
```

The full command list, install steps, and runtime notes are in
[../reference/cli.md](../reference/cli.md).

## Step 7 — Respect the gates, per package

The inviolable rules are identical in a monorepo — layout does not relax them:

- The **AI never authors commits**. In every layout, a human writes the commit.
- `push` / `gh pr create` happen **only after an explicit human "yes"** in the same session.
  Scope your PR to the package(s) the finding actually touched.
- **Merge is 100% human**, and only after the target-environment QA (`QA_TARGET_ENV`) approves.
  A coverage row turns `verified` only when its finding's target-env QA is approved **and** the
  PR is merged — this holds independently for each package in Option B, and per row in Option A.

## Recommendation

For most monorepos migrating from a single legacy source, use **Option A**: one root
`.audit/`, package-prefixed areas, worktrees for parallel findings, and one headline parity
coverage number. Reach for **Option B** only when packages genuinely have separate reference
systems or independent release trains — the cost is a separate bootstrap, coverage map, and
`pdd` invocation point per package.

## See also

- [../reference/audit-structure.md](../reference/audit-structure.md) — the full `.audit/` schema and coverage table format.
- [../reference/cli.md](../reference/cli.md) — the `pdd` CLI, its walk-up behavior, and every subcommand.
- [parallel-findings-worktrees.md](parallel-findings-worktrees.md) — isolating findings in worktrees.
