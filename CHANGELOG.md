# Changelog

All notable changes to PDD are documented here. This project follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

## [2.1.0]

### Added
- **Runs on Node or Bun (no npm).** The `pdd` CLI is now Node-compatible — it runs from the committed
  `dist/pdd.js` on Node (or the source on Bun) — no npm, no build step. The PDD method itself still needs no
  runtime at all (the skills are markdown; the CLI is optional).
- **Multi-phase, environment-aware QA.** `/audit-qa NNN <env>` runs **local** (localhost, before the
  PR — its approval blocks `/audit-pr`) and per **deployment environment** (dev/staging/prod, after the
  PR/deploy). Per-environment status is stored as `qa-<env>`. `/audit-bootstrap` captures
  `QA_ENVIRONMENTS` and `QA_TARGET_ENV`.
- **Cross-harness installation.** `pdd adapt <codex|cursor|copilot|gemini>` generates native command
  files from the canonical skills; `pdd init` is an interactive (specify-init style) multi-agent
  installer; `install.sh` is a universal one-liner (`curl … | bash`) that works with no Claude Code;
  `AGENTS.md` and `INSTALL.md` cover any other agent.
- **Interactive dashboard (`pdd` / `pdd tui`).** Navigable tree with tabs
  (Overview · Flow · Worktrees · Findings · Active · Coverage · Legend), keyboard **and** mouse
  (click tabs/rows, scroll), a live colored banner on Overview, and a `● live` file-watch.
- **Flow tab** — the full pipeline per finding (`new → investigated → resolved → QA local → PR →
  QA env → verified`) with per-environment QA detail.
- **Legend tab** — plain-language explanations of coverage %, tiers and the pipeline.
- **`pdd prune`** — removes stale/orphaned activity records (from crashed sessions).
- **Live presence layer** — every `/audit-*` skill writes/removes `.audit/activity/*.json`, surfaced
  in the dashboard's "Active now".
- **Parity coverage map** (`.audit/coverage.md`) and **confidence tiers** (tier-0…tier-3) with a
  resolve-time gate (`CONFIDENCE_MIN`).
- **`/audit-compare`** — golden-master harness producing an objective data-to-data diff (tier-2).
- **`/audit-pr`** — assembles the PR as an evidence dossier; blocks unless `qa-local` is approved.
- **Optional per-finding worktree** — `/audit-new` asks; created inside the repo
  (`.claude/worktrees/` for Claude Code, `.audit-worktrees/` otherwise; base git-ignored).
- **`pdd` CLI** installed via a stable PATH wrapper (`scripts/install-cli.sh`) plus an opt-in
  SessionStart tip hook.

### Fixed
- **Coverage `verified` only after QA + merge.** Local resolution no longer inflates guaranteed
  coverage — a row becomes `verified` only when the target-environment QA is approved **and** the PR
  is merged; locally-resolved rows show as *pending QA*.
- The dashboard mouse capture can be toggled with **`m`** so text selection/copy works natively.
- The `done` finding label was renamed to `resolved` to avoid overstating progress.
- Codex commands install to `~/.codex/prompts` (home-only, the location Codex actually reads).
- Adapted commands are agent-neutral (no "Claude" leakage).

## [2.0.0]

- Initial dedicated-repo release: the `/audit-*` skill pack for auditing behavioral parity between a
  new system and a reference system during migrations, rewrites and ports.

[2.1.0]: https://github.com/blpsoares/parity-driven-development
[2.0.0]: https://github.com/blpsoares/parity-driven-development
