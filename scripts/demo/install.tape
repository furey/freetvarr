Output install.webm

Set Shell "bash"
Set FontSize 20
Set Width 1280
Set Height 960
Set Padding 44
Set LineHeight 1.3
Set TypingSpeed 38ms
Set Framerate 25
Set CursorBlink false
Set Theme { "name": "freetvarr", "background": "#1a1611", "foreground": "#ece4d6", "cursor": "#e2b03c", "selection": "#3a3226", "black": "#1a1611", "red": "#e5674e", "green": "#7fc77a", "yellow": "#e2b03c", "blue": "#1eb6ff", "magenta": "#c79bd8", "cyan": "#62cfff", "white": "#ece4d6", "brightBlack": "#7d7466", "brightRed": "#ff8a70", "brightGreen": "#9be096", "brightYellow": "#f2c65a", "brightBlue": "#62cfff", "brightMagenta": "#dcb5ea", "brightCyan": "#9be3ff", "brightWhite": "#ffffff" }

Hide
Type "export LANG=C.UTF-8 PS1='\[\e[33m\]~\[\e[0m\] $ ' && cd /tmp && curl() { :; } && sh() { bash /vhs/scripts/demo/install-sim.sh; } && clear"
Enter
Sleep 500ms
Show

Sleep 800ms
Type "curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh"
Sleep 600ms
Enter
Wait+Screen@10s /Start now\?/
Sleep 1.2s
Type "Y"
Sleep 400ms
Enter
Wait+Screen@30s /update later/
Sleep 3.5s
