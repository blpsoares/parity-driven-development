---
title: "Evidence & Confidence Tiers"
description: "Why PDD ranks findings by the quality of their objective evidence, and how the four confidence tiers gate resolution."
group: "concepts"
order: 3
slug: "evidence-and-tiers"
---

# Evidence & Confidence Tiers

## Objective evidence over opinion

PDD exists to answer one question about a legacy refactor, rewrite, or port: *does the
new system still behave like the reference system?* Left to human judgement, the answer is a
gut feeling — "looks right to me", "seems fine", "should be equivalent". Gut feelings do not
survive a code review, a regression six weeks later, or a new developer who was not in the
room. So PDD refuses to treat "looks right" as done.

Instead, every **finding** carries a **confidence tier** that describes the *quality of the
evidence* behind its parity claim — not how confident anyone *feels*, but what can actually be
shown. This is one of the eight principles: **objective evidence over opinion**. A fix is not
"done" because it reads correctly; it is done when it meets the confidence gate with evidence a
skeptical reviewer could re-run themselves.

The tiers form a strict ladder. Each rung is a stronger, harder-to-fake proof than the one
below it.

## The four tiers

| Tier | Evidence | Label |
|---|---|---|
| **tier-0** | textual description only | 🔴 low |
| **tier-1** | paired screenshots (reference vs new) | 🟡 medium |
| **tier-2** | automated data-to-data diff (`/audit-compare`) | 🟠 high |
| **tier-3** | tier-2 **plus** a passing characterization test | 🟢 max |

### tier-0 — textual only (low)

The behavior is described in prose and nothing more. This is where a finding starts life the
moment `/audit-new` opens it: a claim that the reference system does *X*, with no artifact
backing it. Text is enough to *track* a behavior and prioritize work, but it proves nothing —
two people can read the same sentence and picture different behavior. tier-0 is a to-do item,
never a guarantee.

### tier-1 — paired screenshots (medium)

Two screenshots captured side by side — `refs/parity-reference.png` from the reference system
and `refs/parity-new.png` from the new one — showing the same scenario producing the same
result. A human still has to *look* and judge equivalence, so it is not automated, but it is no
longer a claim: there is a visual artifact anyone can inspect. tier-1 is the pragmatic floor.
It is also the **fallback** when the reference system cannot be executed at all (MFA, no
network, decommissioned): `/audit-compare` guides you to capture the pair rather than blocking
the cycle.

### tier-2 — automated data-to-data diff (high)

`/audit-compare` runs the *same* read-only operation on both systems — a CLI command, a
database read, an API call, or a browser navigation — captures the raw output of each, and
diffs them field by field. The result is written to `refs/parity-<date>.diff`. An **empty diff
is a positive result**: parity is confirmed objectively, with no human eyeballing involved. The
raw captures are kept alongside the diff so the whole comparison is reproducible. This is why
tier-2 outranks screenshots — it removes the human judgement step entirely and can be re-run on
demand.

### tier-3 — tier-2 plus a passing characterization test (max)

tier-3 is tier-2 **and** a passing **characterization test** that pins the reference behavior
inside the project's real test suite. The data-to-data diff proves parity *right now*; the
characterization test *locks* it, so any future change that breaks parity fails CI instead of
shipping silently. tier-2 answers "is it equivalent today?"; tier-3 also answers "will I know
the moment it stops being equivalent?" That regression lock is why tier-3 is the ceiling.

> A finding with no genuine, passing characterization test **cannot** be tier-3. `/audit-resolve`
> will not fabricate a trivially-passing test to inflate the tier — if the behavior is truly
> untestable, the reason is recorded (`characterization_test: none - <reason>`) and the
> achievable tier is downgraded accordingly.

## Why the thresholds matter

The ladder is deliberate: each rung buys something concrete.

- **tier-0 → tier-1** replaces a *claim* with an *artifact*. You stop trusting the description
  and start trusting something you can look at.
- **tier-1 → tier-2** removes the *human* from the equivalence check. A diff cannot mis-remember
  what the reference screen looked like; it is deterministic and re-runnable.
- **tier-2 → tier-3** buys *durability*. Without the test, parity is a snapshot that decays; with
  it, parity is enforced on every future commit.

## Where the tier is stored

A tier is recorded in two places so both humans and tooling can read it (see
[reference/audit-structure.md](../reference/audit-structure.md) for the full schema):

1. **The finding's frontmatter** — the `confidence` field in
   `.audit/findings/NNN-<slug>/README.md`.
2. **The `evidence` block in `resolution.md`** — a machine-readable YAML block that also names
   every artifact behind the tier:

```yaml
evidence:
  confidence: tier-3
  parity_diff: refs/parity-2026-07-01.diff
  characterization_test: tests/audit/007_checkout.test.ts
  screenshots: [refs/parity-reference.png, refs/parity-new.png]
  checks: { check: pass, test: pass }
  pr_url: https://github.com/org/repo/pull/42
```

The `confidence` value must equal the tier actually achieved by the listed artifacts — the
block is not a wish, it is an inventory. The same tier is mirrored into the finding's row in
`.audit/coverage.md`.

## How CONFIDENCE_MIN gates resolution

Tracking a tier is only half the point; PDD also *enforces* one. During `/audit-bootstrap` the
project sets **`CONFIDENCE_MIN`** — the minimum tier a finding must reach before it can be
marked resolved. The default is **tier-1**; **tier-2 is recommended** for anything where the
data actually matters.

`/audit-resolve` treats this as a **blocking gate**. If the evidence it can assemble falls below
`CONFIDENCE_MIN`, it stops and tells you exactly how to raise it — run
[`/audit-compare`](../reference/commands.md) to produce an objective diff (tier-2), or capture
paired screenshots (tier-1) — and refuses to write the resolution until the bar is met. This is
the mechanism that turns "evidence over opinion" from a slogan into something the workflow will
not let you skip.

Meeting `CONFIDENCE_MIN` is necessary but never sufficient. A resolved finding is a *local
claim*, not a guarantee: `/audit-resolve` marks coverage `resolved`, never `verified`. Promotion
to `verified` happens only after QA approves the target environment **and** a human merges the
PR. As with every irreversible step in PDD, the AI never authors commits, `push` / `gh pr create`
run only after an explicit human **"yes"** in the same session, and **merge is 100% human**. The
tier tells you how good your evidence is; it never tells you the work is safe to merge on its
own.

## Related

- [reference/commands.md](../reference/commands.md) — `/audit-compare`, `/audit-resolve`, and the
  rest of the command surface.
- [reference/audit-structure.md](../reference/audit-structure.md) — the finding frontmatter, the
  `evidence` block, and the `refs/` layout.
