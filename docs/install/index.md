---
title: "Installation"
description: "Install PDD's slash commands into any agent with a single harness-agnostic shell one-liner, run from your target project."
group: "get-started"
order: 2
slug: "install"
---

# Installation

Installing PDD scaffolds a set of command files into your project — nothing more. PDD is
**command-based** (like `specify init`), not hook-based, so "installing" just writes the
`audit-*` command definitions into the directory your agent reads. The [`.audit/` method](../concepts/state-in-files.md)
itself is plain markdown and needs no runtime at all.

> **Run the installer from the project you're refactoring/porting** — the target repo whose
> parity you're tracking — **not** from a clone of the PDD repo. The command files and, later,
> the `.audit/` state get written into that target project.

## What you need

| Requirement | Why |
|---|---|
| `git` | PDD tracks findings against a versioned reference system and can isolate work in git worktrees. |
| **Node or Bun** | Runs the installer and the optional `pdd` dashboard. **No npm** is required or used. |
| A supported agent | Claude Code, Codex, Cursor, GitHub Copilot, or Gemini (any other agent works via the manual fallback). |

The PDD *method* — the `.audit/` files and the `audit-*` commands — needs no runtime to
operate. Node or Bun is only needed to run the installer and the optional terminal dashboard.

## The shell one-liner

From the root of your target project:

```bash
cd /path/to/your-target-project
curl -fsSL https://pdd.openvibes.tech/cli | bash -s -- <claude|codex|cursor|copilot|gemini|all>
```

Pass the harness you use (or `all` to install every one). Add `--global` to install into your
home config instead of the project:

```bash
curl -fsSL https://pdd.openvibes.tech/cli | bash -s -- cursor --global
```

Each harness discovers commands in its own native directory. The installer writes the
`audit-*` command files to the right place for the harness you name:

| Harness | Project path | Global (`--global`) path |
|---|---|---|
| Claude Code | `.claude/skills/audit-*/SKILL.md` | `~/.claude` config |
| Codex | `.agents/skills/audit-*/SKILL.md` | `~/.agents/skills` |
| Cursor | `.cursor/skills/audit-*/SKILL.md` | `~/.cursor/skills` |
| GitHub Copilot | `.github/skills/audit-*/SKILL.md` | `~/.copilot/skills` |
| Gemini | `.gemini/skills/audit-*/SKILL.md` | `~/.gemini/skills` |

Because the installer only scaffolds command files, the same one-liner works whether or not
Claude Code is installed — the commands are portable markdown, and only the registration
directory differs per harness.

## Already have the `pdd` CLI

If the `pdd` command is on your PATH, use the interactive picker instead of the one-liner:

```bash
pdd init            # alias: pdd install — pick your agents and scope, installs into each
pdd adapt cursor    # install a single harness (add --global for ~/.cursor/skills)
```

`pdd init` is specify-init style: it presents a selector of agents and scopes and writes the
command files for each one you choose.

## Choose your path

- **[Claude Code](claude-code.md)** — the native plugin path (marketplace add + plugin
  install) and installing the `pdd` CLI wrapper.
- **[Other agents](other-agents.md)** — Codex, Cursor, Copilot, and Gemini native paths,
  `pdd adapt`, and `--global` scope.
- **[Air-gapped / offline](air-gapped.md)** — installing with no network, the manual
  `SKILL.md` fallback, and disabling update checks with `PDD_NO_UPDATE_CHECK`.

## After installing

Run the commands one at a time — each is [gated](../concepts/multi-phase-qa.md) and refuses to
advance on insufficient input. Start with `/audit-bootstrap` (a one-time interview that writes
`.audit/`), then `/audit-new` to capture your first finding. The
[**Quickstart**](../../QUICKSTART.md) walks the full cycle from zero to your first verified
finding with a real worked example.

Throughout that cycle the **inviolable rules** hold: the AI never *authors* commits; `push` and
`gh pr create` happen only after an explicit human **"yes"** in the same session; and **merge is
100% human**, only after the target-environment QA approves.
