#!/usr/bin/env bash
# SessionStart notice (Option A): suggests enabling the `pdd` dashboard CLI.
# It NEVER installs anything and NEVER modifies your system — it only prints a
# one-line tip, and only when all of the following hold:
#   1. the current directory is a bootstrapped PDD project (.audit/ exists)
#   2. the `pdd` command is not already on PATH
#   3. the user has not opted out (PDD_NO_CLI=1 or ~/.config/pdd/no-cli)
# Once `pdd` is installed (or opted out), this hook stays silent forever.
set -euo pipefail

[ -d ".audit" ] || exit 0
command -v pdd >/dev/null 2>&1 && exit 0
[ "${PDD_NO_CLI:-}" = "1" ] && exit 0
[ -f "${HOME}/.config/pdd/no-cli" ] && exit 0

installer="${CLAUDE_PLUGIN_ROOT:-<plugin>}/scripts/install-cli.sh"
echo "PDD tip: enable the live dashboard once with:  bash ${installer}"
echo "         then run 'pdd board --watch'.  (silence this: touch ~/.config/pdd/no-cli)"
