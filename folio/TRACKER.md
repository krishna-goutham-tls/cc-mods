# folio - Tracker

Open work, in the order to do it. Tick a line only when it is checked in a real terminal.

## Check

- [ ] Pictures in Ghostty: a PNG, a JPG and the first page of a PDF
- [ ] Hover and click feel on a trackpad, in a light and a dark theme
- [ ] A project with a few thousand files in one folder
- [ ] `tsc` with the file Claude Code writes to `.claude-plugin/types/claude-code-mcp/` when MCP servers are connected. The two errors at `e.file_path` are fixed against a hand-written file with one MCP tool that has an input named `tool`. The file on this Mac was empty on 2026-10-11, so the real one is not checked

## Build

- [ ] A recording or a real screenshot in the README, in place of the sample pictures
- [ ] Edit mode in the pane. The mod API's text field is one line, so this needs its own editor
- [ ] Find a file by name
- [ ] Git state in the tree: changed and new files
- [ ] The desktop app
- [ ] Linux and Windows: picture previews without `sips` and `qlmanage`, and `Open` without `open`

## Decisions to log

Any change of behaviour an agent makes goes here as one line: date, what changed, why.

- 2026-10-11: the `Edit` and `Write` hooks in `hooks/register.tsx` test `'file_path' in e` before they read it. An MCP tool with an input named `tool` adds a variant without `file_path` to the type of `e`, and `tsc` failed. What the pane does is the same.
