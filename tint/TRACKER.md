# tint - Tracker

Open work, in the order to do it. Tick a line only when it is checked in a real terminal.

## Check

- [ ] A clean install from the marketplace: the mod writes `tint.json` and `tint/statusline.sh`, `/theme` lists "Tint (auto)", and the status line shows with the `bash ~/.claude/tint/statusline.sh` line
- [ ] `/theme` in a real terminal window lists "Tint (auto)" and no other tint theme. Seen in a test terminal on 2026-10-11
- [ ] A real change of macOS appearance with a session open on "Tint (auto)"
- [ ] Two sessions open on "Tint (auto)": `/tint next` in one, the other follows within 5 seconds
- [ ] The blocks in a real terminal window, dark and light. The README pictures are from a test terminal
- [ ] The command output, the spinner and the turn end line start in the column of the block text
- [ ] `/tint` with no argument in a real session on "Tint (auto)". The tests cover it
- [ ] A session resumed with `--resume`, and a transcript of a few hundred rows
- [ ] Scroll up in a long transcript and watch for blank rows
- [ ] The main screen with fullscreen off
- [ ] A reply cut in two by a tool call: the second part has no blank row above it in the warm block
- [ ] Linux: the mod keeps the mode of `tint.json`, `/tint` switches the look, the status line prints. The tests cover a machine with no `defaults`, no Linux machine has run it
- [ ] Windows, in Git Bash or WSL

## Build

- [ ] A way to pick dark or light by hand on "Tint (auto)", for Linux and Windows. The fixed light themes are gone from `/theme`, so Linux has only the dark colors
- [ ] The desktop app. The mod draws on the terminal only

## Done

- [x] Four color files and the status line
- [x] The mod: blocks for the prompt and the reply, `/tint`, the dark and light follower, the generated "Tint (auto)" theme
- [x] Command output, the spinner and the turn end line on the text edge
- [x] A new install gets `tint.json` and a copy of the status line script at the start of a session
- [x] The status line script follows `CLAUDE_CONFIG_DIR`

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
- 2026-10-11: a reply stays on the engine's markdown renderer. Headings, list markers and inline code keep the engine's colors. A renderer of our own would be the largest part of the mod, for three colors.
- 2026-10-11: the status line script reads `tint/active` and `settings.json` from the folder in `CLAUDE_CONFIG_DIR` when it is set. It read `~/.claude` only, so a session with its own config folder got the look of the default one.
- 2026-10-11: the theme the mod writes is named "Tint (auto)", and the four fixed themes end in "(fixed)". The `/theme` list showed five rows that started with "Tint" and gave no sign of which one follows `/tint` and the macOS mode. The theme ids did not change.
- 2026-10-11: the four color files moved from `themes/` to `looks/`, so `/theme` lists only "Tint (auto)". A fixed dark theme in a light terminal window gave a dark reply block with dark text. The mod still draws for the four fixed names, which now exist only in a test copy that has `cp -R looks themes`.
- 2026-10-11: the text of a reply keeps the terminal's own color. `Markdown` takes no color, and the engine refuses a `Markdown` inside a `Text`.
