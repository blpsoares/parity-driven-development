---
title: "The pdd CLI"
description: "Reference for the optional pdd terminal dashboard — install, commands, keybindings, and the .audit/ state it reads."
group: "reference"
order: 4
slug: "cli"
---

# The `pdd` CLI

`pdd` is an **optional** terminal dashboard that renders the same parity state as the in-chat
`/audit-status` command. It runs on **Node** or **Bun** — **no npm, no install step for
dependencies**. The PDD *method* itself needs no runtime at all; the CLI is only a nicer way to
watch progress from a terminal. Everything it shows is also available in chat via
[`/audit-status`](./commands.md#audit-status), so the CLI is never required.

The CLI reads the project's [`.audit/` directory](./audit-structure.md) and never writes to
findings, coverage, or the board (the only mutating command is `pdd prune`, which removes stale
*activity* records — see below). It has no bearing on the inviolable rules: the AI never authors
commits; `push` / `gh pr create` happen only after an explicit human "yes"; merge is 100% human
after target-environment QA approves. The CLI just observes.

## Runtime

`pdd` runs with whatever runtime is present, in this order:

| Runtime | How it runs | Requires |
|---|---|---|
| **Node** | executes the committed bundle `dist/pdd.js` | Node on `PATH` |
| **Bun** | executes the TypeScript source `scripts/pdd/index.ts` | Bun on `PATH` |

No build step and no `npm install` are involved — the bundle is committed. If neither Node nor
Bun is available, `pdd` exits with a message pointing you at `/audit-status` instead.

## Installation

The CLI ships with the plugin (or repo clone). To get a stable `pdd` command on your `PATH`,
install the wrapper once with `scripts/install-cli.sh`. It copies the `bin/pdd` wrapper to
`~/.local/bin/pdd` (or a target directory you pass as the first argument):

```bash
# Claude Code plugin cache path:
bash ~/.claude/plugins/cache/parity-driven-development/pdd/*/scripts/install-cli.sh

# From a git clone, run the same script from the repo root:
bash scripts/install-cli.sh

# Install to a custom directory instead of ~/.local/bin:
bash scripts/install-cli.sh /usr/local/bin
```

The wrapper resolves the package location dynamically, so it survives `claude plugin update`.
If the install directory is not on your `PATH`, the script prints a warning — add it, then the
`pdd` command is available from anywhere.

## Path resolution

With no path argument, `pdd` **walks up from the current directory** to find the nearest
`.audit` directory, so it works from any subfolder of a project that has run
[`/audit-bootstrap`](./commands.md#audit-bootstrap). Commands that accept a path (`tui`,
`board`, `prune`) take an optional `[path]` argument to point at a specific `.audit` location.

## Commands

### `pdd` / `pdd tui`

The default command. With no arguments, `pdd` launches the **interactive, navigable TUI**
(`pdd tui` is the explicit form; both accept an optional `[path]`). The TUI shows a collapsible
tree that refreshes live as `.audit/` changes:

- **Coverage** — the parity coverage map and headline percentage.
- **Worktrees** — expand a worktree to see its branch, full path, and findings.
- **Findings** — grouped by lifecycle (open / in-progress / done), each listing the finding ids.
- **Active now** — live executions across agents and worktrees.

Keybindings:

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection up / down |
| `→` / `enter` | Expand the selected node |
| `←` / `esc` | Collapse the selected node |
| `q` | Quit |

### `pdd board`

Prints a **static ANSI snapshot** of the dashboard once, then exits. Good for piping or for CI
logs where an interactive TUI is not usable. Accepts an optional `[path]`.

### `pdd board --watch`

Prints the static snapshot and **auto-refreshes** it whenever anything under `.audit/` changes
(via `fs.watch`). Useful as an always-on side panel while you work. Accepts an optional `[path]`.

### `pdd prune`

Removes **stale / orphaned activity records** — the "Active now" entries left behind by crashed
or interrupted sessions. This is the only command that mutates state, and it only touches
activity records; findings, coverage, and the board are never altered. Accepts an optional
`[path]`. It reports how many records were removed, or `No stale activity records found.`

### `pdd check`

Checks whether a newer PDD version is available and prints the result. The dashboard also runs
this check once a day (cached, offline-safe) and shows a 🔔 notice when an update exists. Opt out
of all update checking with the `PDD_NO_UPDATE_CHECK=1` environment variable.

### `pdd update`

Updates PDD. For a git-clone install it pulls the latest and re-generates your agents' command
files. For a Claude Code plugin install it prints how to update
(`claude plugin update pdd@parity-driven-development`), since the plugin is managed by Claude
Code.

### `pdd init` (alias `pdd install`)

Opens an interactive agent picker (specify-init style): select your agents and scope, and it
installs the PDD slash-command / prompt files into each. You may also pass one or more harness
names to install non-interactively (`pdd init codex cursor`).

### `pdd adapt <harness>`

Generates the PDD command files for a single harness from the canonical `skills/` sources.
`<harness>` is one of `claude`, `codex`, `cursor`, `copilot`, `gemini`. Flags:

| Flag | Effect |
|---|---|
| `--global` | Install into your home config instead of the project (e.g. `~/.cursor/skills`) |
| `--no-rules` | Skip writing the always-on update-check rule file |
| `[project-dir]` | Target project directory (defaults to the current directory) |

Each harness writes to its own native skill directory — see the
[commands reference](./commands.md) and the README's "Install in any agent" section for the
exact per-harness paths.

### `pdd version`

Prints the installed PDD version (`pdd --version` and `pdd -v` are aliases).

## What the CLI reads

`pdd` renders the same state the framework stores under `.audit/`. It reads:

- `board.md` — tasks and cross-finding state.
- `coverage.md` — the parity coverage map (the headline percentage).
- each finding's frontmatter — id, title, status, `confidence` tier, `worktree`.
- the `evidence` blocks inside each `resolution.md`.

For the full schema of every file it reads, see
[`.audit/` structure](./audit-structure.md).

## When to use `/audit-status` instead

The CLI is optional. If Node and Bun are both unavailable, or you simply prefer to stay in the
agent session, [`/audit-status`](./commands.md#audit-status) renders the same parity-coverage
percentage, confidence distribution, active tasks, and suggested next actions directly in chat —
with zero dependencies.
