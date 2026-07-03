#!/usr/bin/env bash
# PDD — universal installer. Works in ANY provider (no Claude Code required).
# It clones this repo to a cache and generates the command files for your agent
# from the canonical skills, plus installs the `pdd` dashboard CLI.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/install.sh | bash -s -- <harness> [--global] [project-dir]
#   ./install.sh <claude|codex|cursor|copilot|gemini|all> [--global] [project-dir]
#
# Prereqs: git, and EITHER Node (https://nodejs.org) OR Bun (https://bun.sh).
# No npm needed — the CLI runs from the committed dist/pdd.js (Node) or source (Bun).
set -euo pipefail

REPO_URL="https://github.com/blpsoares/parity-driven-development.git"
CACHE="${PDD_HOME:-$HOME/.pdd}/parity-driven-development"

HARNESS="${1:-}"
[ $# -gt 0 ] && shift || true
GLOBAL=""
PROJECT="$(pwd)"
for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL="--global" ;;
    *) PROJECT="$arg" ;;
  esac
done

die() { echo "pdd install: $*" >&2; exit 1; }

case "$HARNESS" in
  ""|-h|--help)
    echo "Usage: install.sh <claude|codex|cursor|copilot|gemini|all> [--global] [project-dir]"
    exit 0 ;;
  claude)
    echo "Claude Code installs natively via the plugin marketplace:"
    echo "  /plugin marketplace add blpsoares/parity-driven-development"
    echo "  claude plugin install pdd@parity-driven-development --scope project"
    exit 0 ;;
esac

command -v git >/dev/null 2>&1 || die "git is required."

# Clone or update the repo cache.
if [ -d "$CACHE/.git" ]; then
  git -C "$CACHE" pull -q --ff-only || true
else
  mkdir -p "$(dirname "$CACHE")"
  git clone -q "$REPO_URL" "$CACHE"
fi

# Choose a runtime: Node running the committed bundle, or Bun running the source.
if command -v node >/dev/null 2>&1 && [ -f "$CACHE/dist/pdd.js" ]; then
  run() { node "$CACHE/dist/pdd.js" "$@"; }
elif command -v bun >/dev/null 2>&1; then
  run() { bun "$CACHE/scripts/pdd/index.ts" "$@"; }
else
  die "needs Node (https://nodejs.org) or Bun (https://bun.sh) to run the installer/CLI."
fi

# Install the `pdd` dashboard CLI wrapper (best-effort).
bash "$CACHE/scripts/install-cli.sh" >/dev/null 2>&1 || true

case "$HARNESS" in
  all)
    for h in codex cursor copilot gemini; do
      # shellcheck disable=SC2086
      run adapt "$h" $GLOBAL "$PROJECT"
    done ;;
  codex|cursor|copilot|gemini)
    # shellcheck disable=SC2086
    run adapt "$HARNESS" $GLOBAL "$PROJECT" ;;
  *)
    die "unknown harness '$HARNESS' (use claude|codex|cursor|copilot|gemini|all)" ;;
esac

echo ""
echo "✅ PDD commands installed for: $HARNESS"
echo "   Dashboard: run 'pdd' (interactive) or 'pdd board' — see: pdd --help"
echo "   Start a project with: /audit-bootstrap"
