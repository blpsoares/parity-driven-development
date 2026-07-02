# Installing PDD (any agent)

You can hand this file to any coding agent — *"Fetch and follow the instructions at
https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/INSTALL.md"* — and it
will install PDD's commands into your environment. PDD is command-based (like `specify init`), not
hook-based, so installation just scaffolds the right command files for your agent.

## Fastest path — universal installer

Requires `git` and [`bun`](https://bun.sh). From your project directory:

```bash
curl -fsSL https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/install.sh | bash -s -- <harness>
```

Replace `<harness>` with one of: `codex`, `cursor`, `copilot`, `gemini`, or `all`. Add `--global`
to install into your home config instead of the project. This also installs the `pdd` dashboard CLI.

## Per-agent native install

| Agent | Command |
|---|---|
| **Claude Code** | `/plugin marketplace add blpsoares/parity-driven-development` then `claude plugin install pdd@parity-driven-development --scope project` |
| **Codex** | `install.sh codex` → `~/.codex/prompts/audit-*.md` (home) |
| **Cursor** | `install.sh cursor` → `.cursor/commands/audit-*.md` |
| **Copilot** (VS Code/JetBrains) | `install.sh copilot` → `.github/prompts/audit-*.prompt.md` |
| **Gemini CLI** | `install.sh gemini` → `.gemini/commands/audit-*.toml` |

If you already have the `pdd` CLI, `pdd init` detects your installed agents and installs into all of
them at once (or `pdd init codex cursor …` for specific ones).

## Manual fallback (no bun)

The commands are the `skills/*/SKILL.md` files in this repo — self-contained markdown instructions.
Copy each into your agent's prompt/command directory (see the table above for the path and naming),
and wherever a file says `$ARGUMENTS`, that is where the user's arguments go.

## After installing

Invoke `/audit-bootstrap` to initialize a project, then follow the cycle
(`new → investigate → resolve → compare → qa local → pr → qa env`). See
[`AGENTS.md`](AGENTS.md) for the full command reference.
