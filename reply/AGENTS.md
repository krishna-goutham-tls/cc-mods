# reply

One of the mods in this repo. The rules for the whole repo are in `../AGENTS.md`.

A Claude Code mod: highlight part of Claude's answer, click `Reply`, and the text goes into the prompt as a quote. `README.md` says what it does. `TRACKER.md` has the open work.

## Where things are

| Task | Where to look |
|---|---|
| A hook, the timer, the band, any call on `$` | `hooks/register.tsx` |
| How a highlight becomes a quote and where it goes in the prompt | `hooks/quote.ts` |
| The state the mod keeps | `types/index.d.ts` |
| Tests | `tests/` |

## Rules

1. `$` goes only to functions declared at the top of `hooks/register.tsx`. Every other file stays free of `$`.
2. Terminal only. Every hook returns `next(e)` on any other surface, and the timer starts only in a terminal session.
3. The mod never sends a prompt. It puts text in the prompt box, and the person sends it.
4. A draft in the prompt box stays. A quote goes after it, never over it.
5. The engine raises no event when the person highlights text, so the mod reads `$.ui.selection()` every 250 milliseconds. The read never overlaps itself, and the state changes only when the highlight changes.
6. The band yields to a survey (`hasSurvey`).
7. A test that starts Claude Code itself lets the session run about 14 seconds and leaves with `/exit`. Claude Code counts a fullscreen session killed in its first seconds as a failed start, and after two it turns fullscreen off for every new session on that machine.

## Commands

Run from this folder, `reply/`.

```sh
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
claude --plugin-dir .
```

Claude Code writes `.claude-plugin/types/` when it loads the mod from this folder. `tsc` needs that folder, so load the mod once before the first type-check.
