# tint - Tracker

Open work, in the order to do it. Tick a line only when it is checked in a real terminal.

## Decide

- [ ] The engine's markdown colors as they are, or a renderer of our own. Today the theme files cannot reach headings, inline code or code fences in a reply

## Check

- [ ] A clean install from the marketplace: the mod writes `tint.json` and `tint/statusline.sh`, `/theme` lists "Tint", and the status line shows with the `bash ~/.claude/tint/statusline.sh` line
- [ ] Whether `/theme` lists the four fixed themes next to "Tint". They work when set in `settings.json`
- [ ] A real change of macOS appearance with a session open on "Tint"
- [ ] Two sessions open on "Tint": `/tint next` in one, the other follows within 5 seconds
- [ ] The blocks in a real terminal window, dark and light. The README pictures are from a test terminal
- [ ] The command output, the spinner and the turn end line start in the column of the block text
- [ ] `/tint` with no argument in a real session on "Tint". The tests cover it
- [ ] A session resumed with `--resume`, and a transcript of a few hundred rows
- [ ] Scroll up in a long transcript and watch for blank rows
- [ ] The main screen with fullscreen off
- [ ] A reply cut in two by a tool call: the second part has no blank row above it in the warm block
- [ ] Linux: the mod keeps the mode of `tint.json`, `/tint` switches the look, the status line prints. The tests cover a machine with no `defaults`, no Linux machine has run it
- [ ] Windows, in Git Bash or WSL

## Build

- [ ] The status line script follows `CLAUDE_CONFIG_DIR`. The mod does, the script reads `~/.claude` only
- [ ] A way to pick dark or light by hand on "Tint", for Linux and Windows
- [ ] The desktop app. The mod draws on the terminal only

## Done

- [x] Four theme files and the status line
- [x] The mod: blocks for the prompt and the reply, `/tint`, the dark and light follower, the generated "Tint" theme
- [x] Command output, the spinner and the turn end line on the text edge
- [x] A new install gets `tint.json` and a copy of the status line script at the start of a session

## Decisions to log

Any change of behaviour an agent makes goes here as one line: date, what changed, why.

- 2026-10-10: the mod draws nothing in a headless run (`claude -p`, the SDK) and starts no timer there. Such a run has no transcript on screen.
- 2026-10-10: only a prompt typed at the terminal (`origin.kind` `composer`) gets the block. A prompt sent over Remote Control keeps the stock row.
- 2026-10-10: `/tint` with no argument switches the look. It no longer only shows it.
- 2026-10-10: after a write the mod leaves a theme file that another writer changed alone for 60 seconds. Two sessions that disagreed about the mode wrote the file back and forth, and every open session repainted on each write.
- 2026-10-10: the two files follow `CLAUDE_CONFIG_DIR`.
- 2026-10-10: at the start of a session the mod writes `tint.json` when it is missing, whatever theme is active. A new install had no "Tint" in `/theme` without it.
- 2026-10-10: at the start of a session the mod copies `statusline/statusline.sh` to `tint/statusline.sh` in the config folder when the text differs. An installed mod's folder has its version in the path.
- 2026-10-10: the four fixed theme names are `custom:tint:tint-<look>-<mode>`, the names Claude Code gives the files in `themes/`. The four names without the second `tint:`, for theme files linked by hand into `~/.claude/themes/`, are gone.
