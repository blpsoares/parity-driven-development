---
title: "Install: Air-Gapped / Offline"
description: "Install PDD with no network access by copying the self-contained SKILL.md commands into your agent by hand."
group: "get-started"
order: 5
slug: "install-air-gapped"
---

# Install: Air-Gapped / Offline

PDD is designed to install and run on a machine that never touches the internet. The whole
method is plain files: the `.audit/` state directory and a set of self-contained
`skills/*/SKILL.md` markdown commands. There is no build step, no package to fetch, and no
runtime requirement for the framework itself. This guide installs PDD entirely by hand, from a
copy of this repository you carry across the air gap.

Use this path when the marketplace/plugin install and the `curl | bash` shell installer are both
unreachable — for example on a locked-down build server, a classified network, or a laptop with
egress firewalled. If you *can* reach the network, prefer the [Claude Code](claude-code.md) or
[other-agents](other-agents.md) paths instead; they generate the same files for you.

## Before you start

1. On a machine with access, clone or download this repository:
   ```bash
   git clone https://github.com/blpsoares/parity-driven-development.git
   ```
2. Transfer the repository onto the air-gapped machine by whatever medium your environment allows
   (USB, internal artifact store, etc.). You only need the `skills/` directory, `AGENTS.md`, and —
   if you want the optional dashboard — the `pdd/` and `scripts/` directories.
3. On the air-gapped machine, `cd` into **the project you are refactoring, rewriting, or porting**
   — the target repo whose parity you will track. PDD is per-project: its state lives in that
   repo's `.audit/` directory, so everything below is run from there, not from a clone of PDD.

## How the commands work

Every PDD command is one markdown file: `skills/<name>/SKILL.md`. The body is a self-contained
instruction sheet the agent follows when you invoke it. There is no compilation and no runtime —
copying the file into your agent's command directory *is* the install.

Two details matter when you place these files by hand:

- **Arguments.** Near the top of each `SKILL.md` is a block containing the literal token
  `$ARGUMENTS`. That is the placeholder where the text you type after the command name is
  substituted. For example, invoking `audit-new "total shows 3, should show 5"` feeds that string
  into the `$ARGUMENTS` slot of `skills/audit-new/SKILL.md`. Leave the token exactly as written;
  your agent fills it in at invocation time.
- **Self-containment.** Each file is complete on its own — it references `.audit/` files by
  relative path but pulls in no external content. That is what makes the offline copy work.

The eight commands you are installing:

| Command | File | Takes `$ARGUMENTS` |
|---|---|---|
| `audit-bootstrap` | `skills/audit-bootstrap/SKILL.md` | yes |
| `audit-new` | `skills/audit-new/SKILL.md` | yes (the finding description) |
| `audit-investigate` | `skills/audit-investigate/SKILL.md` | yes (the finding id) |
| `audit-resolve` | `skills/audit-resolve/SKILL.md` | yes (the finding id) |
| `audit-compare` | `skills/audit-compare/SKILL.md` | yes (the finding id) |
| `audit-qa` | `skills/audit-qa/SKILL.md` | yes (id + env) |
| `audit-pr` | `skills/audit-pr/SKILL.md` | yes (the finding id) |
| `audit-status` | `skills/audit-status/SKILL.md` | no |

## Copy the commands into your agent

Each harness discovers commands in its own native directory. Copy the `audit-*` skill directories
from the PDD repo into the matching path **inside your target project** (or the `--global`
equivalent shown in the right column, into your home config).

| Harness | Per-project directory | Global directory |
|---|---|---|
| Claude Code | `.claude/skills/audit-*/SKILL.md` | `~/.claude/skills/` |
| Codex | `.agents/skills/audit-*/SKILL.md` | `~/.agents/skills/` |
| Cursor | `.cursor/skills/audit-*/SKILL.md` | `~/.cursor/skills/` |
| GitHub Copilot | `.github/skills/audit-*/SKILL.md` | `~/.copilot/skills/` |
| Gemini CLI | `.gemini/skills/audit-*/SKILL.md` | `~/.gemini/skills/` |

> **Copilot's directory name changes between scopes** — `.github/skills/` in the project, but
> `~/.copilot/skills/` globally. The other harnesses keep the same folder name in both scopes.

For Claude Code, copying the directory tree preserves the `SKILL.md` layout:

```bash
mkdir -p .claude/skills
cp -r /path/to/parity-driven-development/skills/audit-* .claude/skills/
```

Swap `.claude/skills` for the row that matches your agent. After copying:

- **Codex** — open the `/skills` menu to pick a command, or just describe the task; Codex also
  matches skills by their description.
- **Cursor** — invoke with `/audit-new`, or describe the task; Cursor matches by description too.
- **GitHub Copilot** — in the CLI, run `/skills reload`, then `/skills info audit-new` to confirm;
  in VS Code / JetBrains the skills are picked up automatically.
- **Gemini CLI** — run `/skills reload` after copying.

For any agent not listed, point it at `AGENTS.md` and the `skills/` directory: the `SKILL.md`
bodies are self-contained instructions, and arguments go wherever a file says `$ARGUMENTS`.

## The optional `pdd` CLI (offline)

You do **not** need the CLI. The method needs no runtime at all, and `/audit-status` renders the
same state in chat with zero dependencies. If you want the terminal dashboard on an air-gapped
box, it runs on **Node or Bun** — no npm, no network. The CLI executes `pdd/dist/pdd.js` on Node,
or the source directly on Bun, so a machine with either runtime already installed can run it from
your transferred copy. Install the stable PATH wrapper once with the bundled script:

```bash
bash /path/to/parity-driven-development/scripts/install-cli.sh
# installs `pdd` to ~/.local/bin
```

Then run `pdd` from any subfolder of a project that has run `audit-bootstrap`. See the
[CLI reference](../reference/cli.md) for the full command set.

## Turn off network update checks

By default PDD periodically checks whether a newer version exists (once a day, cached, and
offline-safe). On an air-gapped machine you should disable this so nothing ever attempts an
outbound request:

```bash
export PDD_NO_UPDATE_CHECK=1
```

Set it in your shell profile so it persists. This opts out of every update-check path — the
Claude Code SessionStart tip, the always-on rule for other agents, and the dashboard's update
notice. See the [configuration reference](../reference/configuration.md) for this and the other
knobs (adapters, `QA_ENVIRONMENTS`, `QA_TARGET_ENV`, `CONFIDENCE_MIN`, preview/branch mode).

## Updating offline

The copied `SKILL.md` files are static snapshots; they do not auto-update, which is exactly what
you want on an air-gapped machine. To move to a newer PDD release, repeat the transfer: pull the
new version on a connected machine, carry it across, and re-copy the `audit-*` directories over
the old ones. If you installed the CLI, re-run `scripts/install-cli.sh` from the new copy.

## Run the cycle

Installation is complete. Start with `audit-bootstrap` (the one-time interview that writes
`.audit/`), then `audit-new`, `audit-investigate`, `audit-resolve`, and the rest of the cycle.
Everything runs locally against your reference (legacy) system and your new system — no network
is involved at any step.

The [inviolable rules](../concepts/multi-phase-qa.md) hold offline exactly as they do online: the
AI never authors commits; `push` and `gh pr create` happen only after an explicit human "yes" in
the same session; and merge is 100% human, only after the target-environment QA approves.
