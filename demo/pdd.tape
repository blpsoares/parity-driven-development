# VHS tape — records the interactive `pdd` dashboard into a GIF for the docs.
# Render with:  vhs demo/pdd.tape   (requires `vhs` + `ttyd` + `ffmpeg`)
# Seed first:   bash demo/seed.sh /tmp/pdd-demo

Output demo/pdd.gif

Set Shell bash
Set FontSize 15
Set Width 1200
Set Height 560
Set Theme "Catppuccin Mocha"
Set Padding 16
Set TypingSpeed 40ms

# Launch the dashboard against the seeded demo project.
Type "cd /tmp/pdd-demo && pdd"
Enter
Sleep 2s

# Overview → Flow (Tab), let it breathe.
Tab
Sleep 1500ms
# Expand the first finding's pipeline.
Enter
Sleep 2s
Down Down
Sleep 1s

# Flow → Worktrees → Findings → Active → Coverage → Legend.
Tab
Sleep 1200ms
Tab
Sleep 1200ms
Tab
Sleep 1200ms
Tab
Sleep 1200ms
# Legend — explanations of coverage/tiers/pipeline.
Tab
Sleep 800ms
Enter
Sleep 2500ms

# Quit cleanly.
Type "q"
Sleep 800ms
