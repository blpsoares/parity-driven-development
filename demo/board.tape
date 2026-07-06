# VHS tape — static `pdd board` snapshot, used as the README hero image.
# Render with:  vhs demo/board.tape   (requires `vhs` + `ttyd` + `ffmpeg`)
# Seed first:   bash demo/seed.sh /tmp/pdd-demo

Output demo/board.gif

Set Shell bash
Set FontSize 16
Set Width 1000
Set Height 640
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 55ms

Sleep 400ms
Type "cd /tmp/pdd-demo && pdd board"
Sleep 500ms
Enter
Sleep 4s
