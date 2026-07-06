# Developing PDD

This guide is for maintainers and contributors working on the PDD repository itself —
the `pdd` CLI, the canonical skills, the VHS demo, and the documentation that feeds the
website. If you only want to *use* PDD on a project, read `QUICKSTART.md` and `README.md`
instead.

PDD ships with **zero external runtime dependencies**. The `pdd` CLI runs on either Node
(from the bundled `dist/pdd.js`) or Bun (from the TypeScript source). The only dev
dependency is `esbuild`, used to produce the bundle.

## Repository layout

| Path | What lives here |
|---|---|
| `scripts/pdd/` | TypeScript source of the `pdd` CLI (dashboard TUI, installer, adapters). |
| `dist/pdd.js` | Built, bundled CLI (ESM, `node18` target, `#!/usr/bin/env node` shebang). Checked in. |
| `bin/pdd` | Executable entry that runs the CLI. |
| `skills/` | Canonical `SKILL.md` files — the single source of truth for every `/audit-*` command. |
| `docs/` | Diátaxis-organized markdown (concepts, guides, reference, install). Consumed by the site. |
| `demo/` | VHS tape + seed script that render `demo/pdd.gif` for the README. |
| `hooks/`, `.claude-plugin/` | Claude Code plugin wiring (session hook, plugin manifest). |

## The `pdd` CLI

### Source and structure

The CLI source is TypeScript under `scripts/pdd/`. Key modules:

- `index.ts` — argv parsing and command dispatch (`tui`, `board`, `prune`, `init`/`install`, `adapt`, `check`, `update`, `version`).
- `tui.ts` — the interactive, navigable dashboard (tabs: Overview, Flow, Worktrees, Findings, Active, Coverage, Legend).
- `render.ts` — the static one-shot board renderer (`pdd board`).
- `state.ts` — reads and merges the `.audit/` directory into an in-memory state; also prunes stale activity records.
- `adapt.ts` — the cross-harness adapter: turns each `skills/*/SKILL.md` into per-harness command/prompt files (Claude, Codex, Cursor, Copilot, Gemini).
- `prompt.ts` — the interactive menu used by `pdd init`.
- `update.ts` — version check and cached update-notice logic.
- `i18n.ts` — English/Portuguese strings for the TUI.

The code is portable across Node and Bun on purpose: for example, it derives its own
directory from `import.meta.url` (not the Bun-only `import.meta.dir`) and implements a
portable `which` rather than using `Bun.which`. Keep new code runtime-agnostic. All
comments and identifiers are in English.

The CLI resolves the audit directory as `<path-or-cwd>/.audit`, walking up from the
current directory when no path is given, so `pdd` works from any subfolder of a project.

### Run from source

```bash
bun run scripts/pdd/index.ts        # same as `bun run pdd`
```

`package.json` exposes this as the `pdd` script. Pass any CLI arguments after it, e.g.
`bun run scripts/pdd/index.ts board --watch`.

### Build

```bash
bun run build
```

This runs esbuild:

```
esbuild scripts/pdd/index.ts --bundle --platform=node --format=esm \
  --target=node18 --outfile=dist/pdd.js --banner:js="#!/usr/bin/env node"
```

`dist/pdd.js` is committed. **Rebuild and commit it whenever you change anything under
`scripts/pdd/`**, since Node users (and the plugin install) run the bundle, not the
source. Use a `chore(build):` commit for the rebuild.

### Test

```bash
bun test scripts/pdd
```

`package.json` exposes this as the `test` script. Tests live next to their modules
(`*.test.ts` in `scripts/pdd/`): `adapt.test.ts`, `i18n.test.ts`, `prompt.test.ts`,
`render.test.ts`, `state.test.ts`, `tui.test.ts`, `update.test.ts`. The pure functions
(frontmatter parsing, skill rendering, state merging, board rendering) are unit-tested;
keep new pure logic testable and IO thin.

## The VHS demo

`demo/pdd.gif` (embedded in the README) is generated deterministically with
[VHS](https://github.com/charmbracelet/vhs) so it can be regenerated instead of
screen-recorded by hand.

### One-time tooling

VHS needs `vhs` + `ttyd` + `ffmpeg` on `PATH`. Install without sudo:

```bash
# ttyd (static binary)
curl -L https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64 -o ~/.local/bin/ttyd
chmod +x ~/.local/bin/ttyd
# vhs (Go)
GOBIN=$HOME/.local/bin go install github.com/charmbracelet/vhs@latest
# ffmpeg via your package manager if missing
```

### Regenerate the GIF

```bash
bash demo/seed.sh /tmp/pdd-demo   # build a rich, throwaway .audit
vhs demo/pdd.tape                 # writes demo/pdd.gif
```

`demo/seed.sh` builds a throwaway project with a `.audit/` that has a finding at each
stage of the pipeline (open → investigated → resolved → QA-approved), a coverage table, a
board, and one live plus one orphaned activity record — so the dashboard looks realistic.
`demo/pdd.tape` then drives the **real** `pdd` binary through every tab (Overview → Flow →
Worktrees → Findings → Active → Coverage → Legend), so the recording always matches the
current UI. Edit `demo/pdd.tape` to change the walkthrough. See `demo/README.md` for the
asciinema alternative.

## Skills authoring conventions

Every `/audit-*` command is defined once as a `skills/<name>/SKILL.md`. The `adapt.ts`
module renders these into whatever each harness expects, so the canonical skill is the
only place you edit command behavior.

### Frontmatter

```yaml
---
name: "audit-bootstrap"
description: "One-line summary of what the skill does and when it runs."
argument-hint: "(optional) hint shown next to the command"
user-invocable: true
disable-model-invocation: true
---
```

`name` and `description` are the fields the adapter reads. The `/audit-*` skills set
`disable-model-invocation: true` — they run only when the dev explicitly invokes them, not
autonomously.

### `$ARGUMENTS`

Reference the user's input with the literal token `$ARGUMENTS` (usually inside a fenced
`text` block near the top). Claude Code understands `$ARGUMENTS` natively, so the Claude
adapter leaves it as-is. For every other harness the adapter substitutes the phrase
"the arguments the user typed after the command", and rewrites "Claude"/"Claude Code"
mentions to "the agent", so the same skill body works across agents.

### Gates

Skills that perform irreversible actions must **stop at a gate** and require the dev's
explicit "yes" before proceeding — e.g. the push gate in `audit-pr` and the QA merge gate
in `audit-qa`. Never let a skill push, open a PR, or run a destructive database/browser
operation on its own. Investigation and comparison skills are read-only by contract
(`SELECT`/`find`/`aggregate` only; never `INSERT`/`UPDATE`/`DELETE`/writes).

### Self-contained and file-based state

- Each skill tracks its own presence by writing a JSON record under `.audit/activity/`
  when it starts and **always** removing it on finish *or* abort — it must never be left
  behind. This is what the dashboard's "Active" view reads.
- All PDD state lives in files under `.audit/` (findings, resolutions, coverage, board,
  activity). Skills read and write those files; there is no hidden database.
- Framework-generated files (`BOOTSTRAP.md`, `coverage.md`, finding docs) are written in
  **English** so the audit trail stays shareable, even though the agent *converses* with
  the dev in their working language.
- A skill body should be self-contained: present one gated step at a time, and don't
  assume context beyond `.audit/` and the project rules.

When you add or rename a skill, contributors re-run `pdd init` (or `pdd adapt <harness>`)
to regenerate their per-harness command files from the updated `skills/`.

## How the site consumes `docs/`

Canonical documentation content lives as markdown in **this** repo under `docs/`,
organized by Diátaxis quadrant (`concepts/`, `guides/`, `reference/`, `install/`). This is
the source of truth for both GitHub readers and the website.

The website (`pdd-site`, a React app) does **not** hand-author doc sections. It pulls this
repo in as a git submodule, globs `docs/**/*.md`, parses each file's frontmatter, builds
the navigation dynamically, and renders the markdown body at `/docs/:slug`.

Because the site's nav is built from frontmatter, **every `docs/**/*.md` page must start
with this contract**:

```yaml
---
title: "Human title shown as H1 and sidebar label"
description: "One-line summary for meta + sidebar tooltip"
group: "get-started" | "concepts" | "guides" | "reference"
order: 1            # sort order within the group
slug: "what-is-pdd" # URL slug; must be unique
---
```

Nav groups display in the order: **get-started → concepts → guides → reference**; within a
group, pages sort by `order`; `slug` must be unique across all docs. Keep doc content in
English.

> Note: the root governance files (`README.md`, `QUICKSTART.md`, `INSTALL.md`,
> `CHANGELOG.md`, and this `DEVELOPMENT.md`) are plain markdown with **no frontmatter** —
> they are read directly on GitHub, not rendered through the site's docs pipeline.

## Commit conventions

- Conventional Commits (`feat`, `fix`, `chore`, `docs`, `merge`, …).
- Commit `dist/pdd.js` alongside any `scripts/pdd/` change (use `chore(build):`).
- Run `bun test scripts/pdd` before committing CLI changes.
