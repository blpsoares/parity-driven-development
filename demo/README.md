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

## Generate the GIF

```bash
bash demo/seed.sh /tmp/pdd-demo   # build a rich throwaway .audit
vhs demo/pdd.tape                 # writes demo/pdd.gif
```

The tape drives the real `pdd` binary through every tab (Overview → Flow →
Worktrees → Findings → Active → Coverage → Legend), so the recording always
matches the current UI. Edit `demo/pdd.tape` to change the walkthrough.

## Alternative: asciinema

If you prefer a text-based cast instead of a GIF:

```bash
asciinema rec demo/pdd.cast -c "cd /tmp/pdd-demo && pdd"
```
