---
title: "Install: Codex, Cursor, Copilot, Gemini"
description: "Native per-agent install of PDD's commands for Codex, Cursor, GitHub Copilot, and Gemini, with exact skill paths and post-install steps."
group: "get-started"
order: 4
slug: "install-other-agents"
---

# Install: Codex, Cursor, Copilot, Gemini

PDD installs two ways into a non-Claude agent:

1. **Native plugin** — for harnesses with a plugin system, PDD ships the manifest their plugin
   manager reads, so it installs from this repo like any other plugin:

   | Harness | Native install |
   |---|---|
   | **GitHub Copilot** | `copilot plugin marketplace add blpsoares/parity-driven-development` → `copilot plugin install pdd@parity-driven-development` |
   | **Factory Droid** | `droid plugin marketplace add https://github.com/blpsoares/parity-driven-development` → `droid plugin install pdd@parity-driven-development` |
   | **Antigravity** | `agy plugin install https://github.com/blpsoares/parity-driven-development` |
   | **Gemini CLI** | `gemini extensions install https://github.com/blpsoares/parity-driven-development` |
   | **Pi** | `pi install git:github.com/blpsoares/parity-driven-development` |
   | **Codex** / **Cursor** | ⚠️ manifests ship here, but installing via their **official** marketplaces (`/plugins`, `/add-plugin`) needs the plugin to be listed there first — use the command-file fallback below until then |

2. **Command-file scaffolding** (the fallback, works everywhere) — copies the self-contained
   `audit-*` `SKILL.md` files into the agent's native skill directory. The `.audit/` method and the
   `pdd` CLI are identical across harnesses; only where the command files land differs.

For the native Claude Code plugin, see [Install: Claude Code](claude-code.md); for the overview and
the one-liner, see [Install: overview](index.md).

> **Run every command below from the project you're refactoring, rewriting, or porting** — the
> target repo whose parity you're tracking, **not** a clone of the PDD repo. That target directory
> is where `.audit/` and the command files get written.

## Prerequisites

The PDD *method* needs no runtime (the commands are plain markdown). The shell installer and the
optional `pdd` dashboard need `git` and **Node or Bun** — **no npm**.

## Two ways to install

Both write the same command files; pick whichever you have on hand.

1. **Shell installer** — no CLI required:

   ```bash
   cd /path/to/your-target-project
   curl -fsSL https://pdd.openvibes.tech/cli | bash -s -- <codex|cursor|copilot|gemini|all>
   ```

2. **`pdd adapt`** — if you already have the CLI (see [The `pdd` CLI](../reference/cli.md)):

   ```bash
   pdd adapt codex       # or cursor | copilot | gemini
   ```

### Install scope

The command-file path supports three scopes:

| Scope | What it means | Flag |
|---|---|---|
| **project — shared** | committed to the repo so every collaborator gets PDD | *(default)* |
| **project — just me** | written into the project but added to `.gitignore` (personal) | `--private` |
| **global** | your home config, available in every project | `--global` |

For example: `pdd adapt cursor --private` (personal, gitignored) or
`... | bash -s -- cursor --global` (home config). In `--private` mode PDD only writes files it can
safely ignore — it does **not** edit a shared `AGENTS.md`/`GEMINI.md` block. See
[configuration](../reference/configuration.md) for the full env/flag reference.

## Per-agent reference

Each agent discovers skills in its own native directory. Use the exact project and global paths
below; the post-install step is what makes the new commands visible in a running session.

| Agent | Installer argument | Project path | Global path (`--global`) | Post-install step |
|---|---|---|---|---|
| **Codex** | `codex` | `.agents/skills/audit-*/SKILL.md` | `~/.agents/skills` | Open the `/skills` menu to pick a command, or just describe the task — Codex matches skills **by description**, not by typing `/audit-new`. |
| **Cursor** | `cursor` | `.cursor/skills/audit-*/SKILL.md` | `~/.cursor/skills` | Invoke with `/audit-new …`, or describe the task — Cursor also matches by description. |
| **GitHub Copilot** (CLI, VS Code, JetBrains) | `copilot` | `.github/skills/audit-*/SKILL.md` | `~/.copilot/skills` | In Copilot **CLI**, run `/skills reload`, then `/skills info audit-new` to confirm. In VS Code / JetBrains Copilot Chat the skills are picked up automatically. |
| **Gemini CLI** | `gemini` | `.gemini/skills/audit-*/SKILL.md` | `~/.gemini/skills` | Run `/skills reload` after installing. |

> **Copilot's directory name changes between scopes.** The project install writes to
> `.github/skills/` (committable, shared with your team), but the global install writes to
> `~/.copilot/skills/`, not `~/.github`. The other three agents keep the same directory name in
> both scopes.

## Verify the install

1. Confirm the command files exist at the path from the table, for example:

   ```bash
   ls .agents/skills/audit-*/SKILL.md      # Codex
   ```

2. Run the agent's post-install step from the table (`/skills reload` for Gemini and Copilot CLI;
   Codex and Cursor need no reload).

3. Start the cycle with `audit-bootstrap` — nothing else works until the one-time interview writes
   `.audit/`. Then follow `new → investigate → resolve → compare → qa local → pr → qa <env>`. See
   the [command reference](../reference/commands.md) for each step.

## Install into all detected agents at once

If you have the CLI, **`pdd init`** (alias `pdd install`) detects the agents installed on your
machine and installs the commands into each — an interactive picker where you choose agents and
scope. Pass specific harnesses to skip the picker (`pdd init codex cursor`). Both `pdd init` and the
shell installer's `all` argument fan the same command files out to every selected agent in one pass.
`pdd init` refuses to run from your home directory without `--global`, so it never scatters project
files into `~`.

## Updating

The generated command files are **static snapshots** — they don't auto-update. When a new PDD
version ships, re-run the installer or `pdd update` to regenerate them:

```bash
curl -fsSL https://pdd.openvibes.tech/cli | bash -s -- <harness>   # re-run
# or
pdd update
```

Because these agents have no session hooks, PDD also drops an always-on rule during install
(`.cursor/rules/pdd.mdc`, `.github/instructions/pdd.instructions.md`, or a marked block in
`AGENTS.md` / `GEMINI.md`) that tells the agent to run `pdd check` when starting PDD work and offer
`pdd update` if a newer version exists. Skip the rule with `pdd init --no-rules`, or opt out of all
update checks with `PDD_NO_UPDATE_CHECK=1`.

## The rules still hold on every agent

PDD's guarantees are enforced by the command files, not by the harness, so they are identical here:

- The AI **never authors commits** — the human writes every commit.
- `push` and `gh pr create` happen **only after an explicit human "yes"** in the same session, and
  `audit-pr` blocks until `qa-local` is approved.
- **Merge is 100% human**, and coverage becomes `verified` only after the target-environment QA
  approves **and** the PR is merged.

## Any other agent

For an agent not listed here (Antigravity and others), point it at
[`AGENTS.md`](https://github.com/blpsoares/parity-driven-development/blob/main/AGENTS.md) and the
`skills/` directory, or have it fetch and follow
[`INSTALL.md`](https://github.com/blpsoares/parity-driven-development/blob/main/INSTALL.md). The
`SKILL.md` bodies are self-contained instructions; wherever a file says `$ARGUMENTS`, that is where
the user's arguments go.
