---
title: "Guide: Port to a New Language or Runtime"
description: "Port or rewrite a system onto a new language/runtime while proving parity against the old one, one finding at a time."
group: "guides"
order: 2
slug: "port-to-new-language"
---

# Guide: Port to a New Language or Runtime

Use this guide when you are moving a system to a **new language or runtime** — Python 2→3,
Ruby→Go, CoffeeScript→TypeScript, Bun→Node, a REST service reimplemented on a different stack.
Here the **reference system is the OLD one**: the legacy implementation is your answer key, and
every behavior it exhibits is a [finding](../concepts/evidence-and-tiers.md) you must reproduce
and prove on the new runtime before it reaches `main`.

The port is done not when the new code compiles, but when each behavior has **objective parity
evidence** and has passed QA. This guide walks the full cycle with the real Bun→Node port that
PDD was validated on as the worked example.

> **Inviolable rules (they apply on every port):** the AI never *authors* commits; `push` /
> `gh pr create` happen only after an explicit human **"yes"** in the same session; **merge is
> 100% human** and only after the target-environment QA approves.

## Before you start

- The **old system must be runnable** (even in a container, a pinned toolchain, or an old CI
  image). `/audit-compare` executes the *same* operation on both systems and diffs the output —
  if the legacy runtime is completely dead, you fall back to tier-1 paired screenshots, which is
  weaker evidence. Keep the old runtime alive as long as you can.
- Pick the **unit of comparison** early: a CLI invocation, a DB query, an API request, or a
  browser navigation. That choice drives your golden-master adapters — see
  [Golden-master adapters](golden-master-adapters.md).
- PDD is installed **per-project** in the **target repo** (the new-runtime codebase). See the
  [install docs](../install/index.md).

## Steps

### 1. Bootstrap with the old system as the reference

Run `/audit-bootstrap` once. In the interview:

- Set the **mission** to the port ("reimplement service X on runtime Y with identical behavior").
- Set the **reference system** to the **old** implementation and describe how it is reached
  (`REFERENCE_ACCESS`): the legacy CLI command, its DB, its running API URL, or how to launch it.
- Set the **new system** access (`NEW_ACCESS`) to the port under the new runtime.
- Give the `CHECK_CMD` and `TEST_CMD` for the **new** runtime (its linter/typechecker and its
  test runner).
- Seed the **areas** (the behavioral surfaces you are porting) and a few **reference cases**
  (concrete inputs whose old-system output is your golden master).
- Set `CONFIDENCE_MIN`. For a port, **tier-2 is strongly recommended** — a data-to-data diff is
  what actually proves the two runtimes agree.

In the worked example, bootstrap seeded **10 areas** and the reference was defined as *the test
suite running under Bun*.

### 2. Capture the first divergence as a finding

Run `/audit-new "<observable fact>"`. It rejects vague reports ("the port is broken") and forces
an observable divergence between the two runtimes. Accept the offer to **isolate the work in a
git worktree** if you plan to run findings in parallel — see
[Parallel findings with worktrees](parallel-findings-worktrees.md).

Worked example — finding `001`:

> *"Under Node the suite can't load — `bun:test` doesn't exist."*

That is a concrete, observable runtime difference, so it is admissible.

### 3. Investigate the root cause

Run `/audit-investigate 001`. This is read-only: it explains *why* the behavior diverges without
touching code. Ports surface a predictable family of root causes — runtime built-ins that only
exist on one side, standard-library differences, integer/float semantics, string encoding,
date/timezone handling, ordering guarantees. Name the real cause here.

Worked example: the root cause was **test-runner coupling** — the suite imported `bun:test`,
which has no Node equivalent. The recommendation was **vitest** as a drop-in.

### 4. Resolve: wire the runtime and add the characterization test

Run `/audit-resolve 001`. It proposes a plan, **you approve it**, then it implements the fix on
branch `audit/001-<slug>` (or inside the finding's worktree) **plus a mandatory characterization
test** that pins the reference behavior. It runs `CHECK_CMD` and `TEST_CMD`, and it **never
commits**. It refuses to close the finding below `CONFIDENCE_MIN`.

Worked example: wired **vitest**, migrated the target test off `bun:test`, and ran it under Node
→ **5 pass**, plus the characterization test pinning that behavior.

For a port, the characterization test is doubly valuable: it is both the regression lock on the
new runtime and a written record of the legacy contract you are matching.

### 5. You commit

The **human** authors the commit. The AI declines if asked — this is inviolable. See
[State lives in files](../concepts/state-in-files.md) for why the branch and `.audit/` state, not
the model's memory, carry the work forward.

### 6. Compare: run the same operation on both runtimes

Run `/audit-compare 001`. This is the golden-master harness and the heart of a port. It executes
the **same** read-only operation on the **old runtime** and the **new runtime** using the access
configured in bootstrap, then writes a deterministic diff to `refs/parity-<date>.diff` as
[tier-2 evidence](../concepts/evidence-and-tiers.md). It picks one of four modes:

| Mode | Old runtime side | New runtime side |
|---|---|---|
| **A — CLI** | run the legacy command, capture stdout/stderr/exit | run the new command, capture the same |
| **B — DB query (MCP)** | `SELECT`/`find` against the legacy DB | equivalent read against the new DB |
| **C — API call** | same request to the legacy API | same request to the ported API |
| **D — Browser (MCP)** | navigate the legacy UI, read rendered data | navigate the ported UI, read the same |

It confirms the exact command/query with you before running it, and it is **read-only on both
sides**. An **empty diff means parity is objectively confirmed**.

Worked example: **Bun 5 pass / 0 fail  ==  Node 5 pass / 0 fail** → the parity diff was empty.

Because a port replays the *same* input on both runtimes, invest in reusable adapters rather than
one-off comparisons — [Golden-master adapters](golden-master-adapters.md) shows how to build them
per mode.

### 7. QA on localhost, before the PR

Run `/audit-qa 001 local`. This validates the ported behavior on **localhost**, *before* any PR.
Approving here **unblocks** `/audit-pr` — it is a blocking precondition, not a formality.

Worked example: local QA **approved** → the PR was unblocked.

### 8. Assemble the PR dossier — and stop at the push gate

Run `/audit-pr 001`. It **blocks unless `qa-local` is approved**, then assembles the PR as an
evidence dossier: symptom → cause → fix, the achieved tier, check/test results, the
characterization test, the parity diff, and the QA checklist. It **pushes and opens the PR only
after your explicit "yes."**

Worked example: the dossier was assembled and the flow **stopped at the push gate** — nothing was
pushed.

### 9. Deploy, then QA the target environment

Run `/audit-qa 001 <env>` (e.g. `staging`, then `prod`) *after* the deploy. Each run records
`qa-<env>` on the finding. See [QA environments](qa-environments.md) for configuring the chain
and choosing `QA_TARGET_ENV`.

### 10. A human merges → coverage becomes verified

Coverage turns **`verified`** only when the **target-environment** QA is approved **and** a
**human** merges the PR. Local resolution alone never guarantees parity — see the
[coverage model](../concepts/coverage-model.md).

Worked example: after QA and merge, coverage advanced to **verified (10%)** — the first ported
behavior was now a guarantee, not a hope.

## Repeat until coverage is complete

Each remaining behavior of the old runtime is another finding through the same cycle. The
**parity coverage %** is your true port progress: not "how much did we rewrite" but "how much of
the old behavior is objectively proven on the new runtime." Watch it live with `pdd` or
`/audit-status`.

## Port-specific pitfalls

- **Keep the old runtime executable.** The moment you can't run it, `/audit-compare` degrades to
  tier-1 screenshots. Pin the legacy toolchain in a container.
- **Normalize only non-semantic noise.** When diffing, canonicalize ordering and strip
  timestamps/ids — but record every normalization. A "difference" that is really just map
  iteration order is not a parity break; a rounding difference is.
- **Don't let the new runtime's idioms silently change behavior.** Any logic change must trace
  back to the legacy source it reproduces; cite it in the fix and the commit message.
- **Tier-3 where you can.** A passing characterization test *plus* an empty parity diff is the
  gold standard for a port, because it locks the legacy contract into the new suite forever.

## Related

- [Evidence and confidence tiers](../concepts/evidence-and-tiers.md) — what each tier proves.
- [Golden-master adapters](golden-master-adapters.md) — building the `/audit-compare` harness.
- [Commands reference](../reference/commands.md) — every `/audit-*` command in detail.
- [Coverage model](../concepts/coverage-model.md) — why `verified` needs QA + human merge.
