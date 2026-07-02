#!/usr/bin/env bash
# Installs the stable `pdd` CLI wrapper to a directory on your PATH.
#
# Usage:
#   bash scripts/install-cli.sh              # installs to ~/.local/bin
#   bash scripts/install-cli.sh ~/.bun/bin   # or a directory of your choice
#
# It also works straight from the installed plugin cache:
#   bash ~/.claude/plugins/cache/parity-driven-development/pdd/*/scripts/install-cli.sh
set -euo pipefail

target_dir="${1:-$HOME/.local/bin}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${here}/bin/pdd"

if [ ! -f "${src}" ]; then
  echo "install-cli: wrapper not found at ${src}" >&2
  exit 1
fi

mkdir -p "${target_dir}"
install -m 0755 "${src}" "${target_dir}/pdd"
echo "Installed pdd -> ${target_dir}/pdd"

case ":${PATH}:" in
  *":${target_dir}:"*) echo "'${target_dir}' is on your PATH. Run: pdd board --watch" ;;
  *) echo "WARNING: '${target_dir}' is not on your PATH. Add it, then run: pdd board --watch" ;;
esac
