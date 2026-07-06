---
title: "The Eight Principles"
description: "The eight design principles that make PDD's parity guarantee objective, auditable, and durable across sessions and agents."
group: "concepts"
order: 2
slug: "the-eight-principles"
---

# The Eight Principles

PDD exists to turn "does the new system still behave like the old one?" from a gut feeling
into **objective, tracked evidence**. That guarantee is not produced by a single clever
command — it emerges from eight design principles that every skill and every file in the
framework obeys. This page explains each one: what it means, why it exists, and how it
shows up in the commands.

Throughout, the vocabulary is the framework's own: a **finding** is one captured divergence;
**coverage** is how much of the reference (legacy) system's behavior is already verified; a
**tier** (`tier-0`…`tier-3`) grades the quality of a finding's evidence; **parity** is
behavioral equivalence between the **reference system** and the **new system**; a **gate** is
a precondition a command refuses to advance past.

> **Inviolable rule, restated up front:** the AI never *authors* commits. `push` /
> `gh pr create` happen only after an explicit human **"yes"** in the same session, and
> **merge is 100% human**, only after the target-environment QA approves. Several principles
> below exist precisely to make that rule enforceable rather than aspirational.

---

## 1 · Forced discipline / gates

**What it means.** Each step in the cycle is a *gate*: it inspects its inputs and **refuses to
advance** when they are insufficient. You cannot resolve a finding that was never investigated,
you cannot open a PR before local QA approves, and you cannot mark coverage `verified` before a
human merges.

**Why it exists.** Parity is destroyed by shortcuts — fixing before understanding the root
cause, shipping before proving equivalence, declaring "done" on vibes. Gates make the *correct
order* the *only available order*, so discipline is a property of the tool rather than of the
operator's willpower on a given afternoon.

**How it shows up in the commands.** `/audit-resolve` stops and tells you to run
`/audit-investigate` first when `investigation.md` is missing, and refuses to close a finding
below `CONFIDENCE_MIN`. `/audit-pr` **blocks unless `qa-local` is approved**. `/audit-bootstrap`
is itself a gate for the whole method: "nothing else works without this." See the full
precondition list per command in [reference/commands.md](../reference/commands.md).

## 2 · State externalized in files

**What it means.** The source of truth is the project's `.audit/` directory — `BOOTSTRAP.md`,
`board.md`, `coverage.md`, and one folder per finding — **not** the model's context window.
Every command reads the relevant files at the start and writes its result back to them.

**Why it exists.** A model's context is volatile: it is lost when a session ends, unavailable to
a teammate, and invisible to a different agent. Parity work spans days, people, and harnesses, so
the state that *proves* parity has to live somewhere durable and inspectable. Files survive; a
conversation does not.

**How it shows up in the commands.** `/audit-resolve` begins by reading `BOOTSTRAP.md` and the
finding's `README.md`/`investigation.md`; `/audit-status` and the `pdd` dashboard reconstruct the
entire picture purely from `.audit/`. This principle is the subject of its own concept page —
see [concepts/state-in-files.md](./state-in-files.md).

## 3 · Small composable commands

**What it means.** The workflow is a chain of narrow, single-purpose commands
(`bootstrap → new → investigate → resolve → compare → qa → pr`) rather than one monolithic
"do the migration" action. Each does one job and hands a well-defined artifact to the next.

**Why it exists.** Small steps are auditable steps. When a finding is captured, investigated,
fixed, and proven by *separate* commands, each transition leaves its own reviewable file, and a
human can stop, inspect, or redirect at any boundary. A monolith hides its reasoning; a chain
exposes it.

**How it shows up in the commands.** You run **one command at a time**, and each consumes the
previous one's output: `/audit-investigate` produces `investigation.md`, which `/audit-resolve`
requires; `/audit-compare` produces the tier-2 parity diff that `/audit-pr` folds into the
dossier. The complete catalog lives in [reference/commands.md](../reference/commands.md).

## 4 · Objective evidence over opinion

**What it means.** A fix is not "done" because it looks right. It is done when it meets a
**confidence tier** backed by artifacts: paired screenshots, an automated data-to-data diff, and
a passing characterization test that pins the reference behavior.

**Why it exists.** "It behaves the same now" is exactly the unverifiable claim PDD was built to
eliminate. Grading evidence by tier replaces the argument with an artifact anyone — a teammate, a
reviewer, a future you — can re-check.

**How it shows up in the commands.** The tier ladder is enforced end-to-end:

| Tier | Evidence | Label |
|---|---|---|
| `tier-0` | textual description only | 🔴 low |
| `tier-1` | paired screenshots (reference vs new) | 🟡 medium |
| `tier-2` | automated data-to-data diff from `/audit-compare` | 🟠 high |
| `tier-3` | tier-2 **plus** a passing characterization test | 🟢 max |

`/audit-resolve` writes a machine-readable `evidence` block into `resolution.md` and refuses to
close below `CONFIDENCE_MIN` (default `tier-1`, `tier-2` recommended). `/audit-compare` is a
golden-master harness that runs the *same* operation on both systems and emits an objective diff.
The philosophy and thresholds are detailed in
[concepts/evidence-and-tiers.md](./evidence-and-tiers.md).

## 5 · A human at the gate of every irreversible action

**What it means.** Any action that cannot be cheaply undone — authoring a commit, pushing,
opening a PR, merging — is reserved for a human. The AI prepares, proposes, and suggests the
exact command; the human decides.

**Why it exists.** Irreversibility is where automation becomes dangerous. A wrong file is edited
and re-edited freely, but a wrong merge to `main` is a production event. Placing a human at each
irreversible boundary keeps accountability where it belongs and makes the "prove parity first"
discipline non-negotiable.

**How it shows up in the commands.** This is the inviolable rule in operation: **the AI never
authors commits** — `/audit-resolve` writes the fix and the test but stops, suggesting the commit
command for the human to run. `/audit-pr` assembles the dossier but performs `push` /
`gh pr create` **only after an explicit human "yes"** in the same session. **Merge is 100%
human**, and coverage only becomes `verified` once the target-environment QA is approved *and*
that human merge has happened.

## 6 · Fast observable feedback

**What it means.** The current state of the migration — parity coverage %, confidence
distribution, active work, suggested next actions — is always one glance away, and it updates as
soon as the underlying files change.

**Why it exists.** Discipline is easy to sustain when progress is visible and cheap to sustain
when checking progress is free. A migration with dozens of findings needs a headline number
("how much parity is *guaranteed*?") that is never stale.

**How it shows up in the commands.** `/audit-status` renders an in-chat panel with zero
dependencies. The optional `pdd` CLI renders the same state from `.audit/` and can refresh live:
`pdd board --watch` re-renders whenever `.audit/` changes (via `fs.watch`), and the interactive
TUI shows a collapsible tree of coverage, worktrees, findings, and active executions across
agents. See [reference/commands.md](../reference/commands.md) for `/audit-status` and the CLI
reference for the dashboard modes.

## 7 · Idempotent, state-aware commands

**What it means.** Because commands derive their behavior from `.audit/` rather than from
in-memory context, running one again is safe: it re-reads the current files and does the right
thing given wherever the finding actually is in its lifecycle, instead of blindly repeating a
step or duplicating work.

**Why it exists.** Real work is interrupted — sessions crash, agents switch, two people touch the
same repo. A command that assumes it is the first and only thing to ever run will corrupt state
on the second run. State-awareness makes re-running a recovery, not a hazard.

**How it shows up in the commands.** `/audit-resolve` checks whether `resolution.md` already
exists and *asks* whether to review or overwrite rather than clobbering it; it detects an
out-of-scope investigation and offers to close the finding cleanly instead of forcing a fix. The
`pdd prune` command exists to remove stale activity records left by crashed sessions — recovery
built into the tool. This property is the practical payoff of principle 2 and is expanded in
[concepts/state-in-files.md](./state-in-files.md).

## 8 · Progressive disclosure — the cycle teaches itself

**What it means.** You do not need to memorize the framework before starting. Each gated command
tells you what it needs, and when it blocks, it names the exact next command to run. The workflow
reveals itself one correct step at a time.

**Why it exists.** A methodology nobody can hold in their head is a methodology nobody follows.
By embedding the "what next" into every refusal and every completion, PDD lowers the cost of
adoption to near zero — the tool is the tutorial.

**How it shows up in the commands.** When `/audit-resolve` runs on an un-investigated finding it
doesn't just fail — it explains *why* order matters and points you to `/audit-investigate`.
`/audit-qa … local` announces that its approval **unblocks** `/audit-pr`. `/audit-status`
surfaces *suggested next actions*. The [Quickstart](../../QUICKSTART.md) walks the same self-
teaching path from zero to a first verified finding, and [reference/commands.md](../reference/commands.md)
records every gate so you can see the map at once.

---

## How the principles reinforce each other

The eight are not a checklist; they are a single mechanism. State lives in files (2), so commands
can be small (3) and idempotent (7), so feedback can be reconstructed instantly (6), so gates (1)
can enforce order and a human can stand at every irreversible boundary (5) with **objective
evidence** (4) in front of them — and because each step announces the next (8), none of this
requires you to have read the manual first. Remove any one principle and the parity guarantee
leaks: without externalized state there is nothing to gate on; without gates the evidence is
optional; without the human at the boundary the evidence proves nothing that a machine did not
also approve.

**Read next:** [concepts/state-in-files.md](./state-in-files.md) ·
[concepts/evidence-and-tiers.md](./evidence-and-tiers.md) ·
[reference/commands.md](../reference/commands.md)
