#!/usr/bin/env bash
# Build a rich, throwaway `.audit/` so the `pdd` dashboard demo looks realistic.
# Usage: bash demo/seed.sh [target-dir]   (default: /tmp/pdd-demo)
set -euo pipefail
DIR="${1:-/tmp/pdd-demo}"
A="$DIR/.audit"
rm -rf "$DIR"
mkdir -p "$A/findings" "$A/resolved" "$A/activity"

mk_finding() { # dir id title status conf wt inv res
  local d="$1" id="$2" title="$3" st="$4" conf="$5" wt="$6" inv="$7" res="$8"
  mkdir -p "$A/$d/$id-slug"
  cat > "$A/$d/$id-slug/README.md" <<EOF
---
id: "$id"
title: "$title"
slug: "$id-slug"
area: "runtime-infra"
severity: "high"
status: "$st"
confidence: "$conf"
worktree: "$wt"
---
EOF
  [ "$inv" = "1" ] && echo "# investigation" > "$A/$d/$id-slug/investigation.md"
  if [ "$res" != "0" ]; then
    printf '# resolution\n\nevidence:\n  confidence: %s\n  pr_url: %s\n' "$conf" "$res" > "$A/$d/$id-slug/resolution.md"
  fi
}

# A finding at each stage of the pipeline.
mk_finding findings 001 "bun:test missing under Node"      open        tier-0 none 0 0
mk_finding findings 002 "package.json scripts still Bun"   investigated tier-1 none 1 0
mk_finding resolved 003 "bunfig.toml removed"              resolved    tier-2 none 1 "<none>"
mk_finding resolved 004 "Node test runner wired"           resolved    tier-3 none 1 "https://github.com/blpsoares/x/pull/12"

# 004 also approved by QA (frontmatter marker).
sed -i 's/status: "resolved"/status: "resolved"\nqa-local: "approved"\nqa-prod: "approved"/' "$A/resolved/004-slug/README.md"

cat > "$A/coverage.md" <<EOF
| Behavior / Area | Reference case | Status | Tier | Finding |
|---|---|---|---|---|
| test runner | suite (Bun green) | verified | tier-3 | 004 |
| bunfig config | build | resolved | tier-2 | 003 |
| package scripts | scripts | finding-open | tier-1 | 002 |
| bun:test import | 60 files | finding-open | tier-0 | 001 |
| boot on Node | node dist/server.js | not-started | — | — |
EOF

cat > "$A/board.md" <<EOF
# PDD Board

## In progress
- [ ] 002 — package.json scripts

## Available
- [ ] 001 — bun:test import
EOF

# One live execution + one orphaned (stale) record.
printf '{"command":"audit-investigate","finding":"002","worktree":"root","startedAt":"%s","agent":"bryan","pid":1}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$A/activity/audit-investigate-002.json"

echo "Seeded demo at $A"
