# folio

One of the two mods in this repo. The rules for the whole repo are in `../AGENTS.md`.

A Claude Code mod: `/files` opens a pane beside the chat that shows the files of the project. `README.md` says what it does. `TRACKER.md` has the open work.

## Where things are

| Task | Where to look |
|---|---|
| A hook, a command, any read of the disk | `hooks/register.tsx` |
| How markdown becomes rows | `hooks/markdown.ts`, `hooks/text.ts` |
| How a file becomes a document | `hooks/load.ts`, `hooks/files.ts` |
| What the pane draws | `hooks/view.tsx`, `hooks/theme.ts` |
| The state the pane keeps | `types/index.d.ts` |
| Tests | `tests/` |
| README pictures, from a made-up project called harbor | `docs/` |

## Rules

1. `$` goes only to functions declared at the top of `hooks/register.tsx`. The validator refuses a mod that passes it anywhere else. Every other file stays free of `$`.
2. One row of a document is one line of the terminal. The scroll, the thumb and the fixed header all count rows, so nothing in `hooks/view.tsx` may wrap by itself.
3. The mod reads. It does not write in the project, call the network, or change a tool call.
4. A file that can hold secrets stays hidden until the person clicks `Reveal`. The list is `SECRET` in `hooks/files.ts`.
5. A test that starts Claude Code itself lets the session run about 14 seconds and leaves with `/exit`. Claude Code counts a fullscreen session killed in its first seconds as a failed start, and after two it turns fullscreen off for every new session on that machine. `/tui fullscreen` turns it back on.

## Commands

Run from this folder, `folio/`.

```sh
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
claude --plugin-dir .
```

Claude Code writes `.claude-plugin/types/` when it loads the mod from this folder. `tsc` needs that folder, so load the mod once before the first type-check.
