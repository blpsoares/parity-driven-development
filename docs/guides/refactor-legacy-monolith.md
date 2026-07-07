---
title: "Guide: Refactor a Legacy Monolith"
description: "Step-by-step how-to for adopting PDD to refactor a monolith in place while proving behavioral parity, one finding at a time."
group: "guides"
order: 1
slug: "refactor-legacy-monolith"
---

# Guide: Refactor a Legacy Monolith

This guide walks you through adopting **Parity-Driven Development (PDD)** on a monolith you are
refactoring **in place** — same repository, same runtime, evolving the code while proving it still
behaves the way it did before you touched it.

The trick with an in-place refactor is that the **reference system is the monolith's own current
behavior**. There is no separate legacy service to diff against, so you capture the "answer key"
*before* you start changing code, then prove every subsequent change keeps parity with it. Each
divergence becomes a **finding** you investigate, fix, and gate through QA before it reaches `main`.

If you have not yet, read [What is PDD?](../concepts/what-is-pdd.md) for the *why* behind this cycle.
Every command below is documented dryly in the [command reference](../reference/commands.md).

> **Inviolable rules (they hold at every step):** the AI never *authors* commits; `push` /
> `gh pr create` happen only after an explicit human **"yes"** in the same session; **merge is 100%
> human** and only after the target-environment QA approves.

## Before you start

- The monolith builds and its test suite runs today. You need a working `CHECK_CMD` (typecheck /
  lint / compile) and `TEST_CMD` (tests) — these become acceptance gates.
- You can pin the reference behavior. For a monolith that means either a tagged commit / branch of
  the pre-refactor code, a recorded output, or the running app before your change.
- PDD is installed in **this** project (per-project, `--scope project`). See the
  [installation docs](../install/index.md).

## 1. Bootstrap — capture current behavior as the reference

Run this **once**, from the repository you are refactoring:

```text
/audit-bootstrap
```

It is a gated interview. Answer for an in-place refactor as follows:

1. **Mission** — one sentence, e.g. *"refactor the billing monolith to a modular structure while
   keeping behavioral fidelity."*
2. **Reference system** — the monolith's **current behavior**. Name it explicitly (e.g.
   *"billing monolith @ tag pre-refactor-2026-07"*), give its type, and record how to run it: a
   frozen tag, a stashed branch, or a captured baseline. This is your answer key.
3. **Check / test commands** — record `CHECK_CMD` and `TEST_CMD`, and confirm they must be green
   before any fix counts as valid.
4. **Project areas** — list the monolith's modules / screens / flows (billing, auth, export, …).
   These seed the coverage map and let `/audit-new` categorize findings.
5. **Reference cases** — 2–3 concrete artifacts that act as the answer key (order #123, a test
   user, a known invoice). Each finding elects one.
6. **QA environments** — the ordered chain a change flows through, starting with `local`
   (e.g. `local, staging, prod`). Set `QA_TARGET_ENV` — the environment whose QA, once approved and
   merged, marks an area truly `verified` (default: the last in the chain).
7. **Minimum evidence tier** — `CONFIDENCE_MIN`. Default `tier-1`; **`tier-2` recommended** for a
   refactor, because a data-to-data diff is cheap when both "systems" are the same codebase.

Bootstrap writes `.audit/BOOTSTRAP.md`, seeds `.audit/coverage.md` with one `not-started` row per
area, and creates `.audit/board.md`. **Nothing else works until this exists.**

## 2. Seed and read the coverage map

Open `.audit/coverage.md`. It is the single view of how much legacy behavior is already proven, and
at what tier:

```markdown
| Behavior / Area          | Reference case | Status       | Tier   | Finding |
|--------------------------|----------------|--------------|--------|---------|
| billing: invoice total   | order #123     | not-started  | —      | —       |
| auth: lock after 3 fails | test user      | not-started  | —      | —       |
| export CSV               | —              | not-started  | —      | —       |
```

Every row starts `not-started`. **Parity coverage %** = `verified` / total — the headline metric.
Add or remove rows so the table reflects exactly the behaviors your refactor must preserve. Then
work the table down, one row at a time. See the
[coverage model](../concepts/coverage-model.md) for the full lifecycle.

## 3. Per divergence — run the finding cycle

Every time the refactored code diverges from the captured reference behavior, run the cycle below
for that **one** finding. Do not batch findings; each is auditable on its own.

### 3.1 Capture the finding

```text
/audit-new "invoice total shows 90.00; reference shows 100.00 for order #123"
```

`/audit-new` rejects vague symptoms — give it an **observable fact** (a value, on-screen text, an
error code), not "it's broken". It opens finding `NNN`, computes an initial tier (`tier-0`, or
`tier-1` if you saved paired reference-vs-new screenshots), moves the coverage row to
`finding-open`, and asks whether to **isolate the work in a git worktree**. Say yes when you want
this finding's changes separate from your workspace or to run findings in parallel — see
[parallel findings with worktrees](./parallel-findings-worktrees.md).

### 3.2 Investigate the root cause

```text
/audit-investigate NNN
```

Read-only. It analyzes *why* the refactored code diverges from the reference behavior and writes
`investigation.md`. It does not touch code.

### 3.3 Resolve — fix plus a characterization test

```text
/audit-resolve NNN
```

It proposes a plan, **you approve**, then it implements the fix **and a mandatory characterization
test** — a test that pins the reference behavior so a future refactor step cannot silently break it
again. This test is the durable value of the whole exercise: it converts a one-time check into a
permanent regression guard around the monolith. It creates branch `audit/NNN-<slug>`, writes the
machine-readable `evidence` block, and moves the coverage row to `resolved`. It **never commits**, and it
**refuses to close a finding below `CONFIDENCE_MIN`**.

> **Gate:** if the finding is still below your minimum tier, resolve blocks. Earn the tier with the
> parity diff in step 3.5 (and the characterization test lifts it to `tier-3`). See
> [evidence and tiers](../concepts/evidence-and-tiers.md).

### 3.4 Human commits

You — the human — author the commit. The AI never commits. Commit the fix and its
characterization test on branch `audit/NNN-<slug>`.

### 3.5 Prove objective parity

```text
/audit-compare NNN
```

The golden-master harness runs the **same** operation on both the reference behavior (the pinned
pre-refactor code) and the new refactored code, then emits a data-to-data diff — **tier-2**
evidence saved under the finding's `refs/`. For an in-place refactor this usually means running the
same input through the old tag and the new branch and diffing the output. An empty diff is parity.

### 3.6 QA on localhost — before the PR

```text
/audit-qa NNN local
```

> **Gate:** `local` QA runs on localhost **before** the PR. Its approval is a **blocking
> precondition** of `/audit-pr` — the PR command refuses to run until `qa-local` is approved.

### 3.7 Assemble and open the PR

```text
/audit-pr NNN
```

It assembles the PR as an **evidence dossier**: symptom → cause → fix, confidence tier, check/test
results, the characterization test, the parity diff, paired screenshots, and the QA checklist.

> **Gate:** it **blocks unless `qa-local` is approved**, and it **pushes / runs `gh pr create` only
> after your explicit human "yes"** in the same session. No silent pushes.

### 3.8 Deploy, then QA the environment — after the PR

Deploy the branch to the next environment in your chain (dev / staging / prod), then:

```text
/audit-qa NNN staging
```

This is QA on the **deployed environment**, *after* the PR. It records `qa-staging` on the finding.
Run it for each environment up to your `QA_TARGET_ENV`. See
[multi-phase QA](../concepts/multi-phase-qa.md).

### 3.9 Human merges — the area becomes `verified`

> **Gate:** **merge is 100% human.** A human merges the PR only after the **target-environment** QA
> (`QA_TARGET_ENV`) is approved. Only then does the coverage row flip to `verified` and the parity
> coverage % rise. Local resolution alone never guarantees parity.

If QA **rejects** at any environment: open a follow-up finding on the **same branch** while still
pre-merge, or a **new** finding if the problem surfaces post-deploy — then re-run the cycle.

## 4. Repeat until coverage is green

Pick the next `not-started` row and run the cycle again. Watch progress at any time:

```text
/audit-status          # in-chat panel: coverage %, tiers, active work, next actions
pdd board --watch      # optional terminal dashboard, auto-refreshes as .audit/ changes
```

The refactor is done when every behavior you committed to preserve is `verified` — each one backed
by an objective parity diff and a characterization test, and each one gated past QA by a human.

## The gates, in one place

| Gate | Where | What it enforces |
|---|---|---|
| Bootstrap required | `/audit-new` | No finding without captured reference context. |
| Observable fact | `/audit-new` | Vague symptoms are rejected. |
| `CONFIDENCE_MIN` | `/audit-resolve` | Cannot close a finding below the minimum evidence tier. |
| No AI commits | every step | The human authors every commit. |
| `qa-local` approved | `/audit-pr` | PR blocks until local QA passes. |
| Human "yes" to push | `/audit-pr` | `push` / `gh pr create` only after explicit approval. |
| Target-env QA + human merge | merge | Coverage → `verified` only here; merge is 100% human. |

## Related

- [What is PDD?](../concepts/what-is-pdd.md) — the parity problem and the finding→evidence→gate idea.
- [Command reference](../reference/commands.md) — every `/audit-*` command in detail.
- [Evidence and tiers](../concepts/evidence-and-tiers.md) — why each tier threshold matters.
- [Coverage model](../concepts/coverage-model.md) — the `not-started → finding-open → resolved → verified` lifecycle.
- [Multi-phase QA](../concepts/multi-phase-qa.md) — local vs per-environment QA, and why merge is human.
