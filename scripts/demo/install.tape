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
Set Theme { "name": "freetvarr", "background": "#0b1117", "foreground": "#f2f5f7", "cursor": "#5ce1c6", "selection": "#26323e", "black": "#0b1117", "red": "#ff8486", "green": "#5ce1c6", "yellow": "#f5c542", "blue": "#3ba4ff", "magenta": "#c79bd8", "cyan": "#62cfff", "white": "#f2f5f7", "brightBlack": "#8d9aa7", "brightRed": "#ff8486", "brightGreen": "#8bebd7", "brightYellow": "#f5c542", "brightBlue": "#62cfff", "brightMagenta": "#dcb5ea", "brightCyan": "#9be3ff", "brightWhite": "#ffffff" }

Hide
Type "export LANG=C.UTF-8 COLORTERM=truecolor PS1='\[\e[33m\]~\[\e[0m\] $ ' && cd /tmp && curl() { :; } && sh() { bash /vhs/scripts/demo/install-sim.sh; } && clear"
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
