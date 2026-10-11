# tint

One of the two mods in this repo. The rules for the whole repo are in `../AGENTS.md`.

A restyle of the Claude Code terminal: four theme files, a status line script and a mod. `README.md` says what each part does. `TRACKER.md` has the open work.

## Where things are

| Task | Where to look |
|---|---|
| A hook, the `/tint` command, the timer, any call on `$` | `hooks/register.tsx` |
| The colors no theme key holds, the theme names, the text of `tint.json` | `hooks/palette.ts` |
| The state the mod keeps | `types/index.d.ts` |
| Every other color. The mod builds `tint.json` from these four | `themes/*.json` |
| The bar under the prompt | `statusline/statusline.sh` |
| Tests | `tests/` |
| README pictures, from a made-up project called demo-app | `docs/` |

"The config folder" below is Claude Code's own: the folder in `CLAUDE_CONFIG_DIR` when that is set, `~/.claude` otherwise.

## Rules

1. `$` goes only to functions declared at the top of `hooks/register.tsx`. The validator refuses a mod that passes it anywhere else. Every other file stays free of `$`.
2. A hook that is not sure returns `next(e)`. The mod draws only on the terminal and only while the theme is `custom:tint` or one of the four fixed tint themes. It draws three rows itself: the person's own prompt, Claude's reply and the output of a slash command. It moves the spinner and the turn end line to the text edge and leaves their content to the engine. Every other row is the engine's.
3. The mod writes three files in the config folder and no others: `themes/tint.json`, `tint/active` and `tint/statusline.sh`. It never calls `$.config.set` on `theme` and never writes `settings.json`.
   - `tint/active` changes only on `/tint`.
   - `themes/tint.json` changes while the theme is `custom:tint`, and once at the start of a session when the file is missing, so that `/theme` has a "Tint (auto)" to pick. The mod writes it only when the text differs, as a draft in `tint/` moved into place with `mv`. After a write it leaves a file that another writer changed alone for 60 seconds, unless the look or the mode it reads changes.
   - `tint/statusline.sh` is a copy of `statusline/statusline.sh`, written at the start of a session when the text differs. An installed mod sits in a folder with its version in the path, and `settings.json` needs a path that stays the same.
4. The reply goes to the engine's `Markdown` element. No regex over the reply, no renderer of our own.
5. The timer runs no more often than every 5 seconds and never overlaps itself.
6. A color that a theme key holds comes from the theme file. `hooks/palette.ts` holds only the rest.
7. A test that starts Claude Code itself lets the session run about 14 seconds and leaves with `/exit`. Claude Code counts a fullscreen session killed in its first seconds as a failed start, and after two it turns fullscreen off for every new session on that machine. `/tui fullscreen` turns it back on.
8. Every open session runs the same timer. The text of `tint.json` must depend only on the look file, the mode and the four source files, so two sessions always write the same bytes.
9. A test session never runs on `custom:tint`. Its writes reach the real theme file, and every open session on the machine repaints when that file changes. Force a fixed theme, for which the mod writes nothing: `claude --plugin-dir <a copy of this folder> --settings '{"theme":"custom:tint:tint-warm-light"}'`. Never put a fake `defaults` on the PATH of a session. Two sessions that get different answers about the mode write the file back and forth.
10. When the mod is loaded from this folder, through `--plugin-dir` or a link in `~/.claude/skills/`, saving a file here reloads it in every open session. Change and test a copy outside this folder, then copy the files in.
11. macOS is the only system the mod has run on. A call that only macOS has (`defaults`) must fail without harm elsewhere: no write, no error on screen. `tests/tint.test.tsx` has a test for a machine with no `defaults`.

## Commands

Run from this folder, `tint/`.

```sh
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
claude --plugin-dir . --settings '{"theme":"custom:tint:tint-warm-dark"}'
```

Claude Code writes `.claude-plugin/types/` when it loads the mod from this folder. `tsc` needs that folder, so load the mod once before the first type-check.
