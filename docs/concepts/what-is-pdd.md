---
title: "What is Parity-Driven Development?"
description: "Why 'does the new system still behave like the old one?' should be tracked evidence, not a gut feeling — and how PDD's finding→gate loop delivers it."
group: "concepts"
order: 1
slug: "what-is-pdd"
---

# What is Parity-Driven Development?

Parity-Driven Development (PDD) is a framework for **refactoring, rewriting, or porting a
legacy system while proving that the new system still behaves like the old one** — one
auditable finding at a time.

## The parity problem

Every migration project answers the same question over and over: *"Does the new system still
behave like the old one?"* On most teams that question is answered by a gut feeling — a
developer clicks around, the numbers "look right", and the change ships. When a customer later
reports that the rewritten checkout charges a different total than the legacy one did, nobody
can point to the moment parity was lost, because parity was never measured in the first place.

The trouble is structural, not a lack of diligence:

- **The old behavior is the specification, and it is undocumented.** The legacy system's exact
  outputs — rounding rules, edge cases, error messages — are the real requirements, and they
  live only in code that is being replaced.
- **"Looks the same" is not "is the same."** A screen that renders identically can still return
  a different value one layer down.
- **Confidence evaporates between sessions.** What one developer verified on Tuesday is invisible
  to another developer on Thursday, so the same behavior gets re-checked, or worse, assumed.

PDD's premise is that parity should be **objective, tracked evidence** rather than an opinion.
Every behavior of the reference system becomes a *finding* you can investigate, fix, prove, and
gate through QA before it ever reaches `main`.

## The reference system is the answer key

PDD splits the world into two systems:

- The **reference system** — the legacy code, a spec, or a previous version. It is the *golden
  source of truth*, the answer key. Whatever it does is, by definition, correct for the purposes
  of this migration.
- The **new system** — the refactor, rewrite, or port you are building. Its job is to match the
  reference system's observable behavior.

You name the reference system once, during [`/audit-bootstrap`](../../QUICKSTART.md), and every
downstream command reads from it. Parity is always measured *against* the reference — never
against a developer's memory of how the old system "probably" worked.

## A finding is the unit of work

A **finding** is a single observed divergence between the new system and the reference system.
Findings are deliberately concrete. PDD refuses vague symptoms: "the orders screen is broken" is
rejected; "the orders screen in the new system shows 3 items; the same order in the reference
system shows 5" is accepted. A finding must be an **observable fact** — a numeric value,
on-screen text, an error code — because only observable facts can later be proven closed.

Each finding gets a numeric id (`001`, `002`, …) and its own directory under `.audit/findings/`,
carrying its symptom, root cause, fix, evidence, and a confidence
[tier](evidence-and-tiers.md) that describes the *quality* of that evidence (tier-0 = text only,
up to tier-3 = an automated diff plus a passing characterization test).

## The core loop: finding → investigate → resolve → prove → gate

PDD runs one small, gated command at a time. Each refuses to advance on insufficient input, so
the framework teaches its own discipline:

| Step | Command | What it produces |
|---|---|---|
| **Finding** | `/audit-new` | A concrete, observable divergence recorded as finding `NNN`, with an initial confidence tier and a coverage entry. |
| **Investigate** | `/audit-investigate` | Read-only root-cause analysis of the reference behavior — no code is touched. |
| **Resolve** | `/audit-resolve` | The fix **plus a mandatory characterization test** that pins the reference behavior. Creates branch `audit/NNN`; it does **not** commit. |
| **Prove** | `/audit-compare` | A golden-master harness that runs the *same* operation on both systems and emits an objective data-to-data diff (tier-2 evidence). |
| **Gate** | `/audit-qa` → `/audit-pr` → merge | Multi-phase QA (local before the PR, per-environment after), then a PR assembled as an evidence dossier, then a human merge. |

The loop turns each behavior into a chain of artifacts on disk: symptom → cause → fix → parity
diff → QA approval. Nothing advances on a gut feeling.

### The inviolable rules

Three gates are non-negotiable, and every command enforces them:

- **The AI never authors commits.** After `/audit-resolve` produces the fix and the
  characterization test, a **human** writes the commit.
- **`push` and `gh pr create` happen only after an explicit human "yes"** in the same session.
  `/audit-pr` assembles the dossier but stops at the push gate until you approve.
- **Merge is 100% human**, and only after the target-environment QA approves. A behavior becomes
  `verified` on the [coverage map](coverage-model.md) only then — never on local resolution alone.

## Who PDD is for

PDD fits any migration where an existing behavior must be preserved:

- **Refactor in place** — restructuring a system without changing what it does; the reference is
  the pre-refactor behavior.
- **Rewrite** — replacing a component or service; the reference is the outgoing implementation.
- **Port to a new language or runtime** — the reference is the old stack. PDD was proven
  end-to-end porting a real backend from Bun to Node.js, matching "5 pass / 0 fail" on both sides
  before anything merged.

If there is no old behavior to preserve — a greenfield build with no answer key — PDD has nothing
to measure parity against, and a conventional test-driven workflow fits better.

## Where to go next

This page is the entry point to PDD's methodology. To go deeper:

- [The eight principles](the-eight-principles.md) — the design philosophy behind every gate and file.
- [Evidence and tiers](evidence-and-tiers.md) — how confidence is graded from tier-0 to tier-3, and why `CONFIDENCE_MIN` gates resolution.
- [The coverage model](coverage-model.md) — parity coverage as the headline metric, and why `verified` demands QA plus a human merge.

Ready to run it on a real project? Start with the [**Quickstart**](../../QUICKSTART.md), which
walks you from zero to your first verified finding, one command at a time.
