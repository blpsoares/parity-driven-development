#!/usr/bin/env bash
# SessionStart hook — checks for a newer PDD version and, when one exists,
# injects context so the assistant proactively offers to (a) summarize what's
# new and (b) update PDD for the user. Never installs anything itself.
#
# Fast & offline-safe: uses a ~/.pdd cache, refreshes at most once/day (2s curl),
# and notifies only ONCE per new version so it never nags.
set -euo pipefail

[ "${PDD_NO_UPDATE_CHECK:-}" = "1" ] && exit 0

root="${CLAUDE_PLUGIN_ROOT:-}"
manifest="${root}/.claude-plugin/plugin.json"
[ -f "$manifest" ] || exit 0

installed="$(grep -m1 '"version"' "$manifest" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[ -n "$installed" ] || exit 0

cache="${HOME}/.pdd/update-check.json"
url="https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/.claude-plugin/plugin.json"

# Refresh the cache if missing or older than a day (best-effort, short timeout).
if [ ! -f "$cache" ] || [ -n "$(find "$cache" -mmin +1440 2>/dev/null)" ]; then
  latest="$(curl -fsS --max-time 2 "$url" 2>/dev/null | grep -m1 '"version"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
  if [ -n "${latest:-}" ]; then
    mkdir -p "${HOME}/.pdd"
    printf '{"checkedAt":"%s","latest":"%s"}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$latest" > "$cache"
  fi
fi

[ -f "$cache" ] || exit 0
latest="$(grep -o '"latest":"[^"]*"' "$cache" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
[ -n "${latest:-}" ] || exit 0

# Only act when latest > installed.
newest="$(printf '%s\n%s\n' "$installed" "$latest" | sort -V | tail -1)"
[ "$newest" = "$latest" ] && [ "$installed" != "$latest" ] || exit 0

# Notify only once per version.
notified="${HOME}/.pdd/notified"
[ -f "$notified" ] && [ "$(cat "$notified" 2>/dev/null)" = "$latest" ] && exit 0
mkdir -p "${HOME}/.pdd"
echo "$latest" > "$notified"

msg="PDD update available: version ${latest} is out (this project has ${installed}). Proactively tell the user in one short line, then offer two things: (1) summarize what changed — read the plugin CHANGELOG at ${root}/CHANGELOG.md; (2) update PDD for them. If they agree to update, run: claude plugin update pdd@parity-driven-development, then suggest running 'pdd init' to refresh any Codex/Cursor/Copilot/Gemini command files, and confirm success. If they decline, drop it and do not bring it up again this session."

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
