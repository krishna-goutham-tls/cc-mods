# reply

A Claude Code mod for the terminal. Highlight part of Claude's answer, click `Reply`, and the text goes into your prompt as a quote. You type your reply under it and send.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/reply-dark-1.png">
    <img src="docs/reply-light-1.png" alt="A sentence of Claude's answer is highlighted. A row above the prompt reads: Reply to, the sentence, then the buttons Reply and Dismiss." width="100%">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/reply-dark-2.png">
    <img src="docs/reply-light-2.png" alt="The prompt holds the sentence as a quote, with a question typed under it." width="100%">
  </picture>
</p>

The pictures are from a test terminal, on a made-up project called demo-app.

## How it works

| You do | The mod does |
|---|---|
| Highlight text with the mouse | Shows a row above the prompt: `↳ Reply to "…"  [ Reply ] [ Dismiss ]` |
| Click `Reply` | Puts the text in the prompt as a `>` quote, with a blank line under it for your words. A draft in the prompt stays, and the quote goes under it |
| Click `Dismiss` | Hides the row until you highlight something new. Use it when you highlighted text only to copy it |
| Highlight more text and click again | Adds the next quote under the first one, so one prompt can answer several parts |
| Send the prompt | The row goes away |

The mod never sends a prompt. It puts text in the prompt box, and you send it.

## Install

In a Claude Code terminal session:

```
/plugin install reply --marketplace krishna-goutham-tls/cc-mods
```

## Before you install

- Terminal only, in the fullscreen layout. Claude Code tells a mod what you highlighted only there. `/tui fullscreen` turns it on.
- Claude Code raises no event when you highlight text, so the mod checks for a highlight 4 times a second. It reads only the highlight.
- A highlight made only to copy text also shows the row. Click `Dismiss`, or send your next prompt, and it goes away.
- Built and tested on Claude Code 2.1.302. Mods are early access, so a later release can change the API and break the mod.

## License

MIT
