---
title: "PDD Documentation"
description: "The documentation hub for Parity-Driven Development — concepts, guides, reference, and install."
group: "get-started"
order: 1
slug: "docs-home"
---

# PDD Documentation

Parity-Driven Development (PDD) is a framework for reliably refactoring, rewriting, or porting a legacy system while **proving** that the new system still behaves like the reference (legacy) one. It turns "does it still behave the same?" from a gut feeling into objective, tracked evidence — one auditable finding at a time, each gated through QA before it reaches `main`.

> **Start here:** if you are new to PDD, follow the [**Quickstart**](../QUICKSTART.md). It walks you from zero to your first `verified` finding, one command at a time, with a real worked example (a Bun → Node.js port that validated the framework on itself).

Three rules are inviolable across everything below: the AI **never authors commits**; `push` / `gh pr create` happen only after an explicit human **"yes"** in the same session; and **merge is 100 % human**, only after the target environment's QA approves.

---

## Get Started

Install PDD into the project you are refactoring or porting (per-project scope — PDD tracks the parity of *one* migration against *one* reference system), then run the cycle.

- [Install — overview](install/index.md) — the harness-agnostic method and the shell-installer one-liner.
- [Install — Claude Code](install/claude-code.md) — the native plugin path and the `pdd` CLI wrapper.
- [Install — other agents](install/other-agents.md) — Codex, Cursor, Copilot, and Gemini native paths, `pdd adapt`, and `--global`.
- [Install — air-gapped](install/air-gapped.md) — offline install, manual `SKILL.md` fallback, and `PDD_NO_UPDATE_CHECK`.
- [Quickstart](../QUICKSTART.md) — the canonical hands-on tutorial: bootstrap → new → investigate → resolve → compare → QA → PR → merge.

## Concepts

Explanation — the **why** behind PDD. Read these to understand the method, not just the mechanics.

- [What is PDD?](concepts/what-is-pdd.md) — the parity problem, why gut-feel parity fails, and the finding → evidence → gate core idea.
- [The eight principles](concepts/the-eight-principles.md) — forced discipline/gates, state externalized in files, small composable commands, objective evidence over opinion, a human at the gate of irreversible actions, fast observable feedback, idempotent state-aware commands, and progressive disclosure.
- [Evidence and tiers](concepts/evidence-and-tiers.md) — objective evidence over opinion, the four confidence tiers (`tier-0`…`tier-3`), and how `CONFIDENCE_MIN` gates resolution.
- [The coverage model](concepts/coverage-model.md) — parity coverage as the headline metric and the `not-started → finding-open → resolved → verified` lifecycle.
- [Multi-phase QA](concepts/multi-phase-qa.md) — why QA runs local (pre-PR) and per-environment (post-deploy), the `qa-<env>` state, `QA_TARGET_ENV`, and why merge is 100 % human.
- [State in files](concepts/state-in-files.md) — why `.audit/` is the source of truth, not the model's context window, and how state survives across sessions, devs, and agents.

## Guides

Task-oriented how-tos. Each assumes you have installed PDD and run `/audit-bootstrap`.

- [Refactor a legacy monolith](guides/refactor-legacy-monolith.md) — adopting PDD on an existing system you are refactoring in place.
- [Port to a new language](guides/port-to-new-language.md) — porting or rewriting to a new language/runtime with the old system as the reference.
- [Parallel findings with worktrees](guides/parallel-findings-worktrees.md) — working multiple findings in parallel without collisions, and the harness-specific base paths.
- [QA environments](guides/qa-environments.md) — configuring the dev/staging/prod chain, choosing `QA_TARGET_ENV`, and running local vs per-environment QA.
- [Handling rejected QA](guides/handling-rejected-qa.md) — follow-up finding on the same branch (pre-merge) vs a new finding (post-deploy).
- [PDD in a monorepo](guides/monorepo.md) — scoping `.audit/` and defining per-package areas.
- [Golden-master adapters](guides/golden-master-adapters.md) — writing adapters for `/audit-compare` (CLI / DB / API / browser) that produce tier-2 diffs.

## Reference

Information-oriented and exhaustive. Look here for exact arguments, schemas, and knobs.

- [Commands](reference/commands.md) — every `/audit-*` command: purpose, arguments, gates/preconditions, inputs read, outputs written, failure modes.
- [`.audit/` structure](reference/audit-structure.md) — the full state schema: directory layout, finding frontmatter, `investigation.md` / `resolution.md`, the `evidence` block, `refs/`, and the `coverage.md` table format.
- [Configuration](reference/configuration.md) — all config knobs: bootstrap-captured values (adapters, `QA_ENVIRONMENTS`, `QA_TARGET_ENV`, `CONFIDENCE_MIN`, preview/branch mode), env vars, and defaults.
- [The `pdd` CLI](reference/cli.md) — install, `pdd` / `tui` / `board` / `board --watch` / `prune` / `check` / `update` / `init` / `adapt`, the Node-or-Bun runtime (no npm), and what it reads.

---

## The cycle at a glance

Run these skills one at a time. Each is gated and refuses to advance on insufficient input.

| Step | Command | What it produces |
|---|---|---|
| Bootstrap | `/audit-bootstrap` | `.audit/` context, coverage baseline, QA environments, confidence thresholds (run once) |
| Capture | `/audit-new <desc>` | finding `NNN` with an initial tier and a coverage entry |
| Investigate | `/audit-investigate NNN` | read-only root cause |
| Resolve | `/audit-resolve NNN` | fix + characterization test + `evidence` block (branch `audit/NNN`, no commit) |
| Compare | `/audit-compare NNN` | golden-master data-to-data parity diff (tier-2) |
| QA (local) | `/audit-qa NNN local` | localhost QA **before** the PR; approval unblocks `/audit-pr` |
| PR | `/audit-pr NNN` | the PR as an evidence dossier; push/open only after human "yes" |
| QA (env) | `/audit-qa NNN staging\|prod` | QA on the deployed environment **after** the PR |
| Status | `/audit-status` · `pdd board` | parity-coverage %, confidence distribution, active tasks |

Coverage only becomes `verified` when the target-environment QA is approved **and** a human merges the PR. See [Multi-phase QA](concepts/multi-phase-qa.md) and the [coverage model](concepts/coverage-model.md) for the full rules.
