---
title: "Guide: Handle a Rejected QA"
description: "Turn a QA rejection into the right next action — a follow-up finding on the same branch before merge, or a new finding after deploy — without faking coverage."
group: "guides"
order: 5
slug: "handling-rejected-qa"
---

# Guide: Handle a Rejected QA

QA rejected one or more scenarios. Where you go next depends on **one question only**:
was the PR merged yet?

- **Rejected before merge** (during `local` QA, or during a deployment-environment round while
  the PR is still open) → fix it **incrementally on the same branch** `audit/NNN-<slug>`, then
  re-run the cycle. The rejected work never becomes `verified`.
- **Rejected after the PR merged and deployed** → the branch is gone. Open a **new finding** to
  track the regression, and run a fresh cycle for it.

This guide gives you the exact steps for each branch, and shows how to keep evidence and the
coverage map honest so a rejection is never silently promoted.

For the reasoning behind multi-phase QA, `qa-<env>` state, and why merge is 100% human, read
[Multi-phase QA](../concepts/multi-phase-qa.md). For the precise contract of every command, see
[Commands reference](../reference/commands.md).

---

## Before you start

- Confirm which environment was rejected. Re-run `/audit-qa NNN <env>` to enter STATUS/FEEDBACK
  mode and read QA's comments on each `Rejected` card.
- Determine the PR state: `gh pr view <n> --json state,url`. `OPEN` (or no PR yet, for a `local`
  rejection) means **pre-merge**; `MERGED` means **post-deploy**.
- Do **not** change any card's status yourself, and do **not** touch the coverage map yet. Cards
  move only on QA's action; coverage is handled at the end of this guide.

---

## Branch A — rejected pre-merge (same branch)

Applies when the PR is still `OPEN`, including a `local` rejection where no PR exists yet. The fix
is **incremental on the SAME branch** `audit/NNN-<slug>` — not a new post-merge cycle — so it lands
in the same open PR and gets re-tested before any merge.

1. **Re-run `/audit-qa NNN <env>`.** With `Rejected` cards present, the skill enters FEEDBACK mode
   and prints each rejected card's title, location, QA's comment, and an initial hypothesis.
2. **Pick how to log the follow-up.** The skill offers, among others:
   - **(a)** one follow-up finding on the same branch consolidating all regressions;
   - **(b)** one follow-up finding per rejected scenario, all on the same branch;
   - **(c)** discuss/investigate first;
   - **(d)** dismiss (QA misread it or tested the wrong environment);
   - **(e)** do nothing now — talk to QA first.
3. **Approve the follow-up.** For (a) or (b), the skill drafts an `/audit-new` follow-up **on branch
   `audit/NNN-<slug>`** using QA's comments as context, but does **not** create the file until you
   approve. Approve it, then run the drafted `/audit-new`.
4. **Investigate and resolve on the same branch.** Run `/audit-investigate` and `/audit-resolve` for
   the follow-up finding, staying on `audit/NNN-<slug>`. `/audit-resolve` adds the fix plus a
   mandatory characterization test and refuses to close below `CONFIDENCE_MIN`.
5. **You commit.** The AI never authors commits. Author the commit yourself so the fix is added to
   the open PR's branch.
6. **Re-run `/audit-compare NNN`** if the change affects observable output, to refresh the tier-2
   parity diff.
7. **Re-run the rejected QA round.** Run `/audit-qa NNN <env>` again. When QA flips every card to
   `Approved`, the skill offers to set `qa-<env>: approved` in the finding frontmatter (only after
   you say yes). A `local` approval re-unblocks `/audit-pr`; a deployment-env approval reports that
   the PR may be merged.

The rejected card carries a discreet note that a follow-up was logged on the same branch and will be
re-tested on this PR before merge. Nothing merges until you do it, by hand.

---

## Branch B — rejected post-deploy (new finding)

Applies when the PR was already `MERGED` and deployed, and QA rejects on `staging`/`prod`/etc. The
fix branch is gone, so the same-branch path no longer exists.

1. **Open a new finding.** Run `/audit-new "<observable regression>"`, phrasing QA's report as an
   observable fact (e.g. "checkout total shows 4 items, reference shows 5"), not "it's broken".
   This produces a brand-new finding `MMM` with its own branch `audit/MMM-<slug>`.
2. **Cross-reference the origin.** In the new finding's `README.md`, note the finding and PR the
   regression came from, so the trail is auditable.
3. **Run the full cycle for `MMM`.** `/audit-investigate MMM` → `/audit-resolve MMM` (fix +
   characterization test) → you commit → `/audit-compare MMM` → `/audit-qa MMM local` →
   `/audit-pr MMM` (blocks until `qa-local` is approved; pushes and opens the PR only after your
   explicit "yes") → deploy → `/audit-qa MMM <target-env>`.
4. **Merge is human.** Only you merge, and only after the target-environment QA approves.

The original finding `NNN` stays whatever it honestly was — see the coverage rules below.

---

## Keep evidence and coverage honest

A rejection must never be laundered into a pass. The rules:

| Situation | Coverage row | Frontmatter |
|---|---|---|
| Pre-merge rejection, fix in progress | stays `resolved` (pending) — **never** `verified` | `qa-<env>` reflects the rejection until QA re-approves |
| Pre-merge, re-approved locally | still not `verified` (needs target-env + merge) | `qa-local: approved` |
| Post-deploy target-env rejection | the original row is **not** `verified` for the rejected env | `qa-<target-env>: rejected` |
| New follow-up finding | its own row starts `finding-open` | its own `qa-*` keys |

- **`verified` is earned in exactly one place** — the `/audit-qa` STATUS mode, and only when
  `qa-<QA_TARGET_ENV>: approved` **and** the PR is `MERGED`. A rejection fails both halves, so the
  row cannot advance. See [Coverage model](../concepts/coverage-model.md).
- **Do not hand-edit `coverage.md` to `verified`.** Let `/audit-qa` promote it; that gate is the
  guarantee.
- **Never overwrite QA's comments.** Only append operational notes (e.g. "logged as follow-up NNN,
  same branch, re-test on this PR").
- **Do not change a card's status on QA's behalf.** The only exception is the explicit dismiss
  option (d), used when QA genuinely tested the wrong environment.

---

## The inviolable rules still apply

Rejections do not relax any gate:

- The **AI never authors commits** — you author every commit, including the incremental pre-merge fix.
- **`push` / `gh pr create` happen only after an explicit human "yes"** in the same session.
- **Merge is 100% human**, and only after the target-environment QA approves.

A rejection is the framework working as designed: it caught a divergence before it could be counted
as parity. Fix it on the same branch if the PR is still open, open a new finding if it already
shipped, and let the QA gate — not a manual edit — decide when coverage becomes `verified`.

---

## Related

- [Multi-phase QA](../concepts/multi-phase-qa.md) — why QA is local then per-environment.
- [Coverage model](../concepts/coverage-model.md) — the `not-started → finding-open → resolved → verified` lifecycle.
- [Commands reference](../reference/commands.md) — gates and preconditions for `/audit-qa`, `/audit-pr`, and the rest.
