# PDD — Parity-Driven Development (agent guide)

This file makes PDD usable by **any** coding agent that reads `AGENTS.md` (Codex, Cursor,
Gemini, Antigravity, and others). PDD is a framework for refactoring/rewriting/porting a
legacy system while proving behavioral **parity** with it, one auditable finding at a time.

## Portability

PDD has three layers, and only one of them is harness-specific:

1. **The `.audit/` method** — plain files (`BOOTSTRAP.md`, `findings/`, `coverage.md`). Fully
   portable; any agent can read and write them.
2. **The `pdd` CLI** — a terminal dashboard that reads `.audit/`. Harness-agnostic; install once
   (see `demo/README.md` / `scripts/install-cli.sh`).
3. **The commands** — the `skills/*/SKILL.md` files. The *content* is portable markdown; only the
   registration format differs per harness. Generate them with `pdd adapt <harness>` (below).

## The commands (each maps to `skills/<name>/SKILL.md`)

Run one at a time; each is gated and refuses to advance on insufficient input.

- `audit-bootstrap` — one-time interview → `.audit/BOOTSTRAP.md` + coverage baseline + QA environments.
- `audit-new <desc>` — capture a finding (forces observable facts); asks about worktree isolation.
- `audit-investigate <id>` — read-only root-cause analysis.
- `audit-resolve <id>` — fix + mandatory characterization test + `evidence` block; coverage → `resolved`. Never commits.
- `audit-compare <id>` — golden-master harness: runs both systems, emits an objective diff (tier-2 evidence).
- `audit-qa <id> <env>` — **multi-phase QA**: `local` (localhost, before the PR) and `dev|staging|prod` (after PR/deploy). Records `qa-<env>`.
- `audit-pr <id>` — assembles the PR evidence dossier; **blocks unless `qa-local` is approved**; pushes only after an explicit human "yes".
- `audit-status` — in-chat panel (parity coverage %, confidence tiers, active work).

**Inviolable rules:** the AI never authors commits; `push`/`gh pr create` only after an explicit
human "yes"; merge is 100% human, only after the target-environment QA approves.

## Installing the commands per harness

Run from **the target project** — the repo you're refactoring/porting, not a clone of PDD itself
(or add `--global` to install into your home config, e.g. `~/.agents/skills`):

```bash
pdd adapt codex     # → .agents/skills/audit-*/SKILL.md   (Codex: open /skills, or let it match by description)
pdd adapt gemini    # → .agents/skills/audit-*/SKILL.md   (Gemini CLI: run /skills reload after installing)
pdd adapt copilot   # → .agents/skills/audit-*/SKILL.md   (Copilot CLI: /skills reload; VS Code/JetBrains: automatic)
pdd adapt cursor    # → .cursor/commands/audit-*.md       (invoke: /audit-new …)
```

Codex, Gemini CLI and Copilot CLI all discover the same `.agents/skills/<name>/SKILL.md`
convention — installing for one writes files the other two can read too. Cursor keeps its own
format since it doesn't read `.agents/skills`.

For any other agent: point it at this `AGENTS.md` and the `skills/` directory — the SKILL.md
bodies are self-contained instructions. When a command takes arguments, pass them where the file
says `$ARGUMENTS`.
