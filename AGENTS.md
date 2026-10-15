# cc-mods

Three Claude Code mods in one repo, `folio/`, `tint/` and `reply/`. `README.md` says what each one does.

## Where things are

| Task | Where to look |
|---|---|
| The list of mods a person can install from this repo | `.claude-plugin/marketplace.json` |
| The file pane | `folio/`, start at `folio/AGENTS.md` |
| The restyle of the transcript and the status line | `tint/`, start at `tint/AGENTS.md` |
| A highlight quoted into the prompt | `reply/`, start at `reply/AGENTS.md` |
| Open work for a mod | `TRACKER.md` in its folder |

## Rules

1. A mod is one folder with its own `.claude-plugin/plugin.json`, `hooks/`, `tests/`, `types/`, `README.md`, `AGENTS.md` and `TRACKER.md`. A mod imports nothing from another mod's folder.
2. A new mod gets one entry in `.claude-plugin/marketplace.json` with `"source": "./<folder>"`, and one section in `README.md`.
3. The build rules of a mod are in its own `AGENTS.md`. Read that file before you change the mod.
4. A picture in a `docs/` folder comes from a made-up sample project. It shows no real folder name, no account name and no path of a home folder.
5. The mod API is early access. Each `README.md` names the Claude Code version the mod was built on. Run the checks again after a Claude Code update.

## Commands

Run from the repo root.

```sh
claude plugin validate .        # the marketplace file
claude plugin validate folio    # one mod: manifest and hooks
claude plugin test folio
(cd folio && npx -p typescript tsc -p .)
claude --plugin-dir folio       # a session with the mod loaded from its folder
```

The same four work for `tint` and `reply`. Claude Code writes `.claude-plugin/types/` into a mod's folder when it loads the mod from there. `tsc` needs that folder, so load the mod once before the first type-check. Git ignores it.
