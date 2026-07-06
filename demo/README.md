# PDD dashboard demo

Reproducible terminal recording of the `pdd` TUI, generated with
[VHS](https://github.com/charmbracelet/vhs) so the GIF in the main README can be
regenerated deterministically (no manual screen recording).

## One-time tooling

VHS needs `vhs` + `ttyd` + `ffmpeg`. Install (no sudo):

```bash
# ttyd (static binary)
curl -L https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64 -o ~/.local/bin/ttyd
chmod +x ~/.local/bin/ttyd
# vhs (Go)
GOBIN=$HOME/.local/bin go install github.com/charmbracelet/vhs@latest
# ffmpeg via your package manager if missing
```

## Generate the GIFs

```bash
bash demo/seed.sh /tmp/pdd-demo   # build a rich throwaway .audit
git -C /tmp/pdd-demo init -q      # pdd reads git state; init avoids a "not a repo" line
vhs demo/pdd.tape                 # writes demo/pdd.gif   — interactive TUI walkthrough
vhs demo/board.tape               # writes demo/board.gif — static `pdd board` (README hero)
```

There are two tapes:

- **`pdd.tape` → `pdd.gif`** drives the real `pdd` binary through every tab (Overview → Flow →
  Worktrees → Findings → Active → Coverage → Legend), so the recording always matches the
  current UI.
- **`board.tape` → `board.gif`** captures a single `pdd board` snapshot (coverage %, findings by
  status, confidence tiers, active work) — used as the hero image at the top of the main README.

Edit either tape to change the walkthrough.

## Alternative: asciinema

If you prefer a text-based cast instead of a GIF:

```bash
asciinema rec demo/pdd.cast -c "cd /tmp/pdd-demo && pdd"
```
