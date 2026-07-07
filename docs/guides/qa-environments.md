---
title: "Guide: Set Up QA Environments"
description: "Configure the QA environment chain (local → dev → staging → prod), pick the target env, and run local vs per-environment QA."
group: "guides"
order: 4
slug: "qa-environments"
---

# Guide: Set Up QA Environments

PDD's QA is **multi-phase and environment-aware**. It runs once on **localhost, before the
PR** — where its approval unblocks `/audit-pr` — and again on each **deployed environment**
after the PR ships. This guide walks you through declaring the environment chain during
bootstrap and then running each QA phase in order, so a finding only reaches `verified` when
the right environment approves it and a human merges.

For the reasoning behind this two-phase model, see
[../concepts/multi-phase-qa.md](../concepts/multi-phase-qa.md). For the exact config keys, see
[../reference/configuration.md](../reference/configuration.md).

## Before you start

- You have run `/audit-bootstrap` (or are about to — Step 1 below happens inside it).
- You know the real path a change travels in your project: which environments exist, in what
  order, and which one is the source of truth for "this is really live and correct."
- You have a finding that is investigated and resolved (branch `audit/NNN-<slug>` exists, fix
  plus characterization test in place). If not, work through
  [../reference/commands.md](../reference/commands.md) first.

## Step 1 — Declare the environment chain during bootstrap

`/audit-bootstrap` Section 11 ("QA environments & preview") captures the chain. When it asks
**"Which environments does a change flow through, in order?"**, answer with the ordered list,
always starting at `local`:

```text
local, dev, staging, prod
```

This is recorded as `QA_ENVIRONMENTS`. `local` is mandatory and always first — it is the
pre-PR gate. Add only the deploy environments your project actually has. A smaller project
might answer `local, staging, prod`; a minimal one `local, prod`.

For **each deployment environment** (every entry except `local`), give bootstrap the URL QA
will open and any VPN, login, or manual step needed to reach it. These live alongside the
environment in `BOOTSTRAP.md` and drive where `/audit-qa` points its test cards.

## Step 2 — Choose the guarantee environment (`QA_TARGET_ENV`)

Bootstrap then asks **"Which environment's QA is the guarantee — the one that, once approved
and merged, marks an area as truly verified?"** This is `QA_TARGET_ENV`. It defaults to the
**last** entry in `QA_ENVIRONMENTS` (typically `prod`).

Pick the environment that genuinely represents "shipped and correct" for your team. Coverage
flips to `verified` **only** when `qa-<QA_TARGET_ENV>` is approved **and** the PR is merged —
approval on any earlier environment (like `staging`) raises confidence but never guarantees.

## Step 3 — Configure the pre-merge preview

Still in Section 11, bootstrap asks **"Is there a per-branch or per-PR deploy?"** This tells
QA where to test the fix while the PR is open:

| Answer | Records | What QA tests against |
|---|---|---|
| Yes | `PREVIEW_MODE = per-branch-url` and `PREVIEW_URL_PATTERN` (e.g. `https://pr-{N}.preview.app`) | The per-branch preview URL (`{N}` = PR number, `{branch}` = branch name) |
| No | `PREVIEW_MODE = local` and `PREVIEW_URL_PATTERN = none` | A local checkout of the fix branch |

`/audit-qa` uses these values to write "where to test" into every card, so QA never guesses
and never points at `main` or production by accident.

## Step 4 — Run local QA before the PR

With the fix resolved on branch `audit/NNN-<slug>`, run local QA first:

```text
/audit-qa NNN local
```

Because the environment is `local`, no PR needs to exist yet — this is the pre-PR gate.
`/audit-qa` creates one test card per acceptance criterion, pointed at localhost (using the
run instructions from bootstrap), on the QA surface you configured (Notion or a file
checklist at `.audit/findings/NNN-<slug>/qa/checklist.md`).

Run the same command again to read status. When every scenario is `Approved`, `/audit-qa`
offers to record `qa-local: approved` in the finding's frontmatter and reports:

> 🟢 Local QA approved the N scenarios. `/audit-pr NNN` is now unblocked.

That recorded `qa-local: approved` is a **blocking precondition** — `/audit-pr` refuses to
assemble the PR dossier without it.

## Step 5 — Open the PR

```text
/audit-pr NNN
```

The PR is assembled as an evidence dossier only after `qa-local` is approved. Nothing is
pushed and no PR is opened until you give an explicit **"yes"** in the session — the AI never
pushes, never runs `gh pr create`, and never authors the commit on its own.

## Step 6 — Deploy, then run per-environment QA

After the PR is open and the branch is deployed, run QA against each deployment environment,
in the order of your chain:

```text
/audit-qa NNN staging
/audit-qa NNN prod
```

For a deployment environment, `/audit-qa` first validates that the PR is **open**
(`gh pr view X --json state` must be `OPEN`) and points the cards at that environment's URL
(the per-branch preview or the deployed URL from bootstrap). Each round writes its own
frontmatter key — `qa-staging: approved`, `qa-prod: approved`, and so on — so every
environment keeps an independent, auditable record.

If QA **rejects** a scenario while the PR is still open, the fix stays on the **same** branch
`audit/NNN-<slug>` as an incremental pre-merge correction (via a follow-up finding on that
branch) — not a new post-merge cycle. See
[handling-rejected-qa.md](handling-rejected-qa.md) for that flow.

## Step 7 — Human merge flips coverage to `verified`

Coverage becomes `verified` at exactly **one** point, and only when **both** conditions hold:

1. `qa-<QA_TARGET_ENV>` is `approved` (e.g. `qa-prod: approved`), and
2. the PR state is `MERGED`.

`/audit-qa` re-checks the PR state and, only when both are true, sets the finding's row in
`.audit/coverage.md` to `verified` (keeping the tier from the `evidence.confidence` block).
Approval on a non-target environment, or approval without a merge, leaves the row as
`resolved` (pending) — and `/audit-qa` tells you what is still missing.

**The merge itself is 100% human.** `/audit-qa` reports "you may merge PR #X"; it never
merges, never pushes, and never authors commits. Local resolution alone never guarantees
parity — only target-environment QA plus a human merge does.

## Worked chain

For a project bootstrapped with `QA_ENVIRONMENTS = local, staging, prod` and
`QA_TARGET_ENV = prod`, finding `007` travels like this:

| Step | Command | Effect |
|---|---|---|
| 1 | `/audit-qa 007 local` | `qa-local: approved` → `/audit-pr` unblocked |
| 2 | `/audit-pr 007` | PR opened after human "yes" |
| 3 | `/audit-qa 007 staging` | `qa-staging: approved` — confidence rises, not yet guaranteed |
| 4 | `/audit-qa 007 prod` | `qa-prod: approved` — target env approved |
| 5 | human merges PR | coverage row `007` → `verified` |

## Related

- [../concepts/multi-phase-qa.md](../concepts/multi-phase-qa.md) — why QA is split into local
  and per-environment phases, and why merge is human.
- [../concepts/coverage-model.md](../concepts/coverage-model.md) — the
  `not-started → finding-open → resolved → verified` lifecycle.
- [../reference/configuration.md](../reference/configuration.md) — `QA_ENVIRONMENTS`,
  `QA_TARGET_ENV`, `PREVIEW_MODE`, `PREVIEW_URL_PATTERN`, `CONFIDENCE_MIN` and their defaults.
- [handling-rejected-qa.md](handling-rejected-qa.md) — what to do when QA rejects a scenario.
