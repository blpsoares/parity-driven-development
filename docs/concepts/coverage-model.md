---
title: "The Coverage Model"
description: "How .audit/coverage.md tracks parity as a lifecycle, and why a behavior is only verified after QA approval and a human merge."
group: "concepts"
order: 4
slug: "coverage-model"
---

# The Coverage Model

PDD exists to answer one question objectively: *how much of the reference (legacy)
system's behavior has the new system provably reproduced?* The **coverage map** —
`.audit/coverage.md` — is where that answer lives. It is a machine-readable table, not
a status you carry in your head or in the model's context window, and its headline
number, **parity coverage %**, is the single metric the dashboard and `/audit-status`
lead with.

This page explains *why* coverage is modeled as a lifecycle, what each column means,
and the rule that makes the metric trustworthy: a behavior becomes `verified` **only**
after the target-environment QA is approved **and** a human merges the PR. Local
resolution alone never counts.

## Why a coverage *map*, not a checklist

A refactor, rewrite, or port has an enormous surface. "It seems to work" is a gut
feeling; "9 of 90 reference behaviors are proven equivalent, at tier-3" is evidence.
The map turns the whole migration into a countable inventory of behaviors, each tied to
a concrete **reference case** and to the **finding** that carries its evidence. Because
it is a plain file under `.audit/`, it survives across sessions, developers, and agents
— the same source of truth for everyone. See
[State in files](state-in-files.md) for why that externalization matters.

## The columns

`coverage.md` is a GFM table with a fixed header. Every row is one behavior of the
reference system you intend to reproduce.

```markdown
| Behavior / Area           | Reference case | Status        | Tier   | Finding |
|---------------------------|----------------|---------------|--------|---------|
| checkout: total           | order #123     | verified      | tier-3 | 007     |
| login: lock after 3 fails | test user      | finding-open  | tier-1 | 012     |
| export CSV                | —              | not-started   | —      | —       |
```

| Column | Meaning |
|---|---|
| **Behavior / Area** | The unit of behavior being tracked — an area of the system and the specific behavior within it (e.g. `checkout: total`). This is what "parity" is claimed *about*. |
| **Reference case** | The concrete input or scenario against which parity is judged — the "answer key" case (e.g. `order #123`, `test user`). `—` when none is pinned yet. |
| **Status** | Where this behavior sits in the lifecycle (below). The only column that moves the coverage %. |
| **Tier** | The confidence tier of the evidence backing the row (`tier-0`…`tier-3`), or `—` if untouched. See [Evidence and tiers](evidence-and-tiers.md). |
| **Finding** | The `NNN` id of the finding that owns this row, linking it to `.audit/findings/` (or `.audit/resolved/`). `—` when no finding has been opened. |

The exact schema — and where the table sits within the wider `.audit/` tree — is
documented in [the audit structure reference](../reference/audit-structure.md).

## The lifecycle

A row moves through states, and each transition is owned by exactly one command. This
is deliberate: no command can shortcut the metric.

| Status | Set by | Means |
|---|---|---|
| **`not-started`** | seeded by `/audit-bootstrap` | The behavior is in scope but no one has looked at it. It counts toward the denominator, never the numerator. |
| **`finding-open`** | `/audit-new` | A finding exists for this behavior — a divergence is being investigated, resolved, or reviewed. Work is in flight; parity is **not** yet guaranteed. |
| **`verified`** | `/audit-qa` (target env) | Parity is *guaranteed*: QA approved on the target environment **and** the PR was merged by a human. Only these rows count toward parity coverage %. |

Between `finding-open` and `verified` there is an intermediate, pending marker you will
see on the row: `/audit-resolve` sets the status to **`resolved`** once the fix and its
characterization test exist locally. `resolved` explicitly means *done locally, not yet
guaranteed* — it is a pending state, not a promotion. `audit-resolve` writes `resolved`
precisely so it cannot claim the credit that only QA and a human merge can grant.

```text
not-started ──/audit-new──▶ finding-open ──/audit-resolve──▶ resolved (pending)
                                                                   │
                                              /audit-qa <target> + human merge
                                                                   ▼
                                                              verified
```

## Parity coverage % — the headline metric

```text
parity coverage % = verified rows / total rows
```

Only `verified` rows are in the numerator. `not-started`, `finding-open`, and
`resolved` rows are all in the denominator but contribute **nothing** to the percentage.
That is the whole point: the number is a *guarantee* metric, so it must never rise on
optimism. A green local test suite, an empty parity diff, an approved local QA — none of
them move the headline. The number moves only when a behavior is proven equivalent on the
deployed target environment and shipped.

## Why `verified` requires QA *and* a human merge

This is the inviolable core of the model, and it is enforced in exactly one place —
`/audit-qa`, and only for the target environment (`QA_TARGET_ENV`, by default the last
environment in the QA chain). The promotion to `verified` fires **only when both** hold:

1. `qa-<target-env>: approved` — the deployed behavior passed QA on the target
   environment, *after* the PR, not merely on localhost; and
2. the PR is **merged** — and **merge is 100% human**. The AI never authors commits, and
   `push` / `gh pr create` happen only after an explicit human "yes" in the session.

If either is missing, the row stays `resolved` (pending) and `/audit-qa` reports what is
outstanding. It will never set `verified` on a non-target environment, nor on an approval
without a merge. The reasoning is spelled out in
[Multi-phase QA](multi-phase-qa.md): local resolution proves the fix *can* work; only the
deployed, merged, QA-approved state proves it *does*, in the environment that matters.

The consequence for reading a PDD dashboard: a rising parity coverage % is a record of
behaviors that have cleared every gate — investigated, resolved with evidence at or above
`CONFIDENCE_MIN`, QA-approved on the target environment, and merged by a human. Nothing
counts until it is real.
