// folio: the files of the project in a pane beside the chat. A tree on the
// left, the open file on the right, markdown set as a document.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FolioMode, FolioUi } from '../types'
import { baseOf, dirOf, hasTwoForms, isHidden, isPage, kindOf } from './files'
import { MAX_TEXT_BYTES, byName, goneDoc, hash, lockedDoc, notice, opaqueDoc, pictureDoc, planOf, textDoc } from './load'
import type { DocRequest, Entry } from './load'
import type { Doc, Frame, Node } from './model'
import { drawPane } from './view'
import type { Actions } from './view'

const PANE = 'folio'
const TITLE = 'Files'
/** The pane shows tree and reader side by side from this many columns. */
const SPLIT_FROM = 84
/** The widest a line of prose runs, for a comfortable read. */
const MEASURE = 88
const FIRST_FILES = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'readme.md']

const START: FolioUi = { expanded: [], selected: '', mode: 'read', docTop: 0, treeTop: 0, revealed: [], tick: 0, side: 'right', isRestored: false }
const ui = atom({ plugin: 'folio', key: 'ui' } as const, START)
const touched = atom({ plugin: 'folio', key: 'touched' } as const, [])

const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n))

// What was read from disk, kept until the files change (`forget`).
let root = ''
const listings = new Map<string, Entry[]>()
const docs = new Map<string, Doc>()

const forget = (): void => {
  listings.clear()
  docs.clear()
}

const rootOf = async ($: EngineInterface): Promise<string> => {
  if (root === '') {
    root = (await $.session.root()).replace(/\/+$/, '')
  }

  return root
}

/** Keeps the open folders and the open file for the next session in this project. */
const keep = async ($: EngineInterface): Promise<void> => {
  const { value } = await $.state.get({ plugin: 'folio', key: 'ui' } as const)

  if (value !== undefined && root !== '') {
    await $.store.set(`ui:${root}`, { expanded: value.expanded.slice(-200), selected: value.selected, mode: value.mode })
  }
}

const ancestors = (path: string): string[] => {
  const parts = path.split('/').slice(0, -1)

  return parts.map((_, n) => parts.slice(0, n + 1).join('/'))
}

/** A path as a link or a command names it, made relative to the project. */
const resolve = (from: string, target: string): string => {
  let clean = target.split('#')[0] ?? ''

  try {
    clean = decodeURIComponent(clean)
  } catch {
    // Kept as written.
  }

  if (root !== '' && clean.startsWith(`${root}/`)) {
    clean = clean.slice(root.length)
  }

  const parts = clean.startsWith('/') ? [] : from.split('/').filter(part => part !== '')

  for (const part of clean.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '' && part !== '.') {
      parts.push(part)
    }
  }

  return parts.join('/')
}

const list = async ($: EngineInterface, dir: string): Promise<Entry[]> => {
  const known = listings.get(dir)

  if (known !== undefined) {
    return known
  }

  const abs = dir === '' ? root : `${root}/${dir}`
  const entries: Entry[] = []
  const raw = await $.fs.list(abs).catch(() => [])

  for (const entry of raw) {
    if (isHidden(entry.name)) {
      continue
    }

    if (entry.kind !== 'other') {
      entries.push({ name: entry.name, isDir: entry.kind === 'dir', mtimeMs: entry.mtimeMs })
      continue
    }

    if (entry.isLink) {
      const target = await $.fs.stat(`${abs}/${entry.name}`).catch(() => undefined)

      if (target !== undefined && target.kind !== 'other') {
        entries.push({ name: entry.name, isDir: target.kind === 'dir', mtimeMs: target.mtimeMs })
      }
    }
  }

  entries.sort(byName)
  listings.set(dir, entries)

  return entries
}

/** The rows of the tree: the project folder's entries and those of each open folder. */
const treeNodes = async ($: EngineInterface, expanded: ReadonlySet<string>): Promise<Node[]> => {
  const out: Node[] = []
  // Folders wait here to be read; the newest is read first, so rows come out in tree order.
  const waiting: Array<{ dir: string; depth: number }> = [{ dir: '', depth: 0 }]
  const rowsOf = new Map<string, Node[]>()

  while (waiting.length > 0) {
    const { dir, depth } = waiting.pop() ?? { dir: '', depth: 0 }
    const entries = await list($, dir)
    const rows: Node[] = []

    if (entries.length === 0 && dir !== '') {
      rows.push({ rel: `${dir}/`, name: '', depth, isDir: false, isOpen: false, isEmpty: true })
    }

    for (const entry of entries) {
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`
      const isOpen = entry.isDir && expanded.has(rel) && depth < 24

      rows.push({ rel, name: entry.name, depth, isDir: entry.isDir, isOpen, isEmpty: false })

      if (isOpen) {
        waiting.push({ dir: rel, depth: depth + 1 })
      }
    }

    rowsOf.set(dir, rows)
  }

  const place = (dir: string): void => {
    for (const row of rowsOf.get(dir) ?? []) {
      out.push(row)

      if (row.isOpen) {
        place(row.rel)
      }
    }
  }

  place('')

  return out
}

const pixels = async ($: EngineInterface, file: string): Promise<{ width: number; height: number } | undefined> => {
  const info = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', file], { timeoutMs: 8000 })
  const width = Number(/pixelWidth:\s*(\d+)/.exec(info.stdout)?.[1])
  const height = Number(/pixelHeight:\s*(\d+)/.exec(info.stdout)?.[1])

  return width > 0 && height > 0 ? { width, height } : undefined
}

/**
 * A PNG of the file in the temp folder, made by macOS: `sips` for a picture,
 * Quick Look for a document's first page. The terminal reads the PNG itself.
 */
const preview = async (
  $: EngineInterface,
  abs: string,
  isImage: boolean,
  stamp: string,
): Promise<{ file: string; width: number; height: number } | undefined> => {
  try {
    const temp = ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '')
    const dir = `${temp}/folio-${hash(`${abs}|${stamp}`)}`
    const out = `${dir}/preview.png`

    if (!(await $.fs.exists(out))) {
      await $.process.run(['mkdir', '-p', dir], { timeoutMs: 5000 })

      let isMade = false

      if (isImage) {
        const size = await pixels($, abs)
        const fit = size !== undefined && Math.max(size.width, size.height) > 1600 ? ['-Z', '1600'] : []
        const made = await $.process.run(['sips', '-s', 'format', 'png', ...fit, abs, '--out', out], { timeoutMs: 20_000 })

        isMade = made.exitCode === 0 && (await $.fs.exists(out))
      }

      if (!isMade) {
        await $.process.run(['qlmanage', '-t', '-s', '1600', '-o', dir, abs], { timeoutMs: 30_000 })

        const made = `${dir}/${baseOf(abs)}.png`

        if (await $.fs.exists(made)) {
          await $.process.run(['mv', made, out], { timeoutMs: 5000 })
          isMade = true
        }
      }

      if (!isMade) {
        return undefined
      }
    }

    const size = await pixels($, out)

    return size === undefined ? undefined : { file: out, ...size }
  } catch {
    return undefined
  }
}

/** One file as the reader shows it. Kept until `forget`. */
const loadDoc = async ($: EngineInterface, request: DocRequest): Promise<Doc> => {
  const key = [request.path, request.isSource, request.isRevealed, request.columns, request.measure, request.rows].join('|')
  const known = docs.get(key)

  if (known !== undefined) {
    return known
  }

  const abs = `${request.root}/${request.path}`
  const stat = await $.fs.stat(abs).catch(() => undefined)
  let doc: Doc

  if (stat === undefined || stat.kind !== 'file') {
    doc = goneDoc(request)
  } else {
    const plan = planOf(request)

    if (plan === 'locked') {
      doc = lockedDoc(request, stat)
    } else if (plan === 'picture') {
      const made = await preview($, abs, kindOf(baseOf(request.path)) === 'image', `${stat.mtimeMs}|${stat.size}`)

      doc =
        made === undefined
          ? // A page keeps its toggle, so Source still shows the text.
            { ...opaqueDoc(request, stat, 'No preview for this file here.'), canToggle: isPage(baseOf(request.path)) }
          : pictureDoc(request, stat, made)
    } else if (plan === 'opaque') {
      doc = opaqueDoc(request, stat, 'This file is not text.')
    } else if (stat.size > MAX_TEXT_BYTES) {
      doc = opaqueDoc(request, stat, 'This file is too large to show here.')
    } else {
      const text = await $.fs.read(abs).catch(() => undefined)

      doc = text === undefined ? notice(request, stat, baseOf(request.path), ['This file cannot be read.']) : textDoc(request, stat, text)
    }
  }

  docs.set(key, doc)

  return doc
}

/** A file to bring into view in the tree at the next drawing. */
let reveal = ''

/** Opens a path of the project: a file in the reader, a folder in the tree. */
const show = async ($: EngineInterface, path: string): Promise<boolean> => {
  const base = await rootOf($)
  const stat = await $.fs.stat(`${base}/${path}`).catch(() => undefined)

  if (path === '' || stat === undefined || stat.kind === 'other') {
    return false
  }

  const isDir = stat.kind === 'dir'
  const open = isDir ? [...ancestors(path), path] : ancestors(path)

  reveal = path
  await update($, ui, state => ({
    ...state,
    expanded: [...new Set([...state.expanded, ...open])],
    ...(isDir ? {} : { selected: path, docTop: 0 }),
  }))
  await keep($)

  return true
}

/** When the turn that runs now began; 0 between turns. */
let turnBegan = 0

/**
 * Marks the files that changed on disk while Claude's turn ran: what a shell
 * command wrote, which no file tool reports. Only the folders open in the tree
 * are looked at.
 */
const noteTurn = async ($: EngineInterface): Promise<void> => {
  try {
    const began = turnBegan
    const { value } = await $.state.get({ plugin: 'folio', key: 'ui' } as const)

    turnBegan = 0
    forget()

    if (began > 0 && value !== undefined) {
      await rootOf($)

      const changed: string[] = []

      for (const dir of ['', ...value.expanded].slice(0, 60)) {
        for (const entry of await list($, dir)) {
          if (!entry.isDir && entry.mtimeMs >= began - 1000) {
            changed.push(dir === '' ? entry.name : `${dir}/${entry.name}`)
          }
        }
      }

      if (changed.length > 0) {
        await update($, touched, known => [...new Set([...known, ...changed])].slice(-300))
      }
    }

    await update($, ui, state => ({ ...state, tick: state.tick + 1 }))
  } catch {
    // The pane's bookkeeping never stands in a turn's way.
  }
}

/** Marks a file Claude wrote, and has the pane read the disk again. */
const noteWrite = async ($: EngineInterface, file: unknown): Promise<void> => {
  try {
    const base = await rootOf($)

    if (typeof file === 'string' && file.startsWith(`${base}/`)) {
      const path = file.slice(base.length + 1)

      await update($, touched, list => (list.includes(path) ? list : [...list, path].slice(-300)))
    }

    await update($, ui, state => ({ ...state, tick: state.tick + 1 }))
  } catch {
    // The pane's bookkeeping never stands in a tool's way.
  }
}

export const register: Register = on => {
  let seenTick = -1
  /**
   * True when another copy of this mod runs in the session (one under
   * development beside an installed one). That copy does the work; this one
   * passes every event on.
   */
  let isIdle = false
  /** Where the lists stood at the last drawing; the wheel moves them from here. */
  const drawn = { isSplit: false, isReading: false, treeFrom: 0, treeTo: 0, treeTop: 0, treeMax: 0, docTop: 0, docMax: 0 }

  on('session.start', async ($, e, next) => {
    // The first copy to start in a session writes its name here; a second copy reads it and stays idle.
    const session = await $.session.id().catch(() => '')
    const mine = `${session}|${$.plugin.root}`
    const home = (await $.env.get('FOLIO_HOME').catch(() => undefined)) ?? ''

    isIdle = home.startsWith(`${session}|`) && home !== mine

    if (isIdle) {
      return next(e)
    }

    await $.env.set('FOLIO_HOME', mine).catch(() => undefined)
    await $.command.register({
      name: 'files',
      description: 'Browse and read the files of this project in a pane',
      argumentHint: '[path]',
    })

    const base = await rootOf($)
    const saved = (await $.store.get(`ui:${base}`).catch(() => undefined)) as Partial<FolioUi> | undefined
    const side = await $.store.get('side').catch(() => undefined)

    await update($, ui, (state): FolioUi =>
      state.isRestored
        ? state
        : {
            ...state,
            isRestored: true,
            expanded: Array.isArray(saved?.expanded) ? saved.expanded.filter((path): path is string => typeof path === 'string') : state.expanded,
            selected: typeof saved?.selected === 'string' ? saved.selected : state.selected,
            mode: saved?.mode === 'source' ? 'source' : 'read',
            side: side === 'left' ? 'left' : 'right',
          },
    )

    // The pane comes back where the person left it open.
    if ((await $.store.get(`open:${base}`).catch(() => undefined)) === true) {
      const width = await $.store.get(`columns:${base}`).catch(() => undefined)

      void $.ui.open({ id: PANE, title: TITLE, ...(typeof width === 'number' ? { columns: clamp(Math.round(width), 60, 124), rows: 28 } : {}) })
    }

    return next(e)
  })

  on('command.run', { command: 'files' }, async ($, e, next) => {
    if (isIdle) {
      return next(e)
    }

    const base = await rootOf($)
    const asked = e.args.trim().replace(/^@/, '')
    const state = await read($, ui)

    if (asked !== '') {
      if (!(await show($, resolve('', asked)))) {
        return { text: `No file or folder at ${asked} in this project.` }
      }
    } else if (state.selected === '') {
      for (const name of FIRST_FILES) {
        if (await $.fs.exists(`${base}/${name}`)) {
          await show($, name)
          break
        }
      }
    }

    const columns = clamp(Math.round(e.presentation.columns * 0.52), 60, 124)
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns, rows: 28 })

    await $.store.set(`open:${base}`, true)
    await $.store.set(`columns:${base}`, columns)

    return opened.isPlaced ? {} : { text: `The files pane is open but waits for room: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (!isIdle && e.origin.kind === 'person') {
      await $.store.set(`open:${await rootOf($)}`, false)
    }

    return next(e)
  })

  // The pane keeps its own windows over the tree and the document, so the
  // header and the tree stay put while the document moves.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (isIdle) {
      return next(e)
    }

    const column = e.pointer?.column
    const isOverTree = drawn.isSplit ? column !== undefined && column >= drawn.treeFrom && column <= drawn.treeTo : !drawn.isReading

    await update($, ui, state =>
      isOverTree
        ? { ...state, treeTop: clamp(drawn.treeTop + e.by, 0, drawn.treeMax) }
        : { ...state, docTop: clamp(drawn.docTop + e.by, 0, drawn.docMax) },
    )

    return { deny: 'folio moves its own rows' }
  }).catch(() => ({ deny: 'folio moves its own rows' }))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)

    // An MCP tool with an input named `tool` adds a variant without `file_path` to the type of `e`.
    if (!isIdle && 'file_path' in e) {
      await noteWrite($, e.file_path)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)

    // An MCP tool with an input named `tool` adds a variant without `file_path` to the type of `e`.
    if (!isIdle && 'file_path' in e) {
      await noteWrite($, e.file_path)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    turnBegan = await $.clock.now().catch(() => 0)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && !isIdle) {
      await noteTurn($)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (isIdle) {
      return next(e)
    }

    const el = $.ui.resolve(e)
    const { Box, Text } = el

    try {
      const base = await rootOf($)
      const state = await read($, ui)
      const written = await read($, touched)

      if (state.tick !== seenTick) {
        forget()
        seenTick = state.tick
      }

      const columns = Math.max(24, e.props.bodyColumns)
      const rows = Math.max(8, e.props.scroll.bodyRows)
      const isSplit = columns >= SPLIT_FROM
      const treeWidth = isSplit ? clamp(Math.round(columns * 0.29), 26, 38) : columns
      const isTreeRight = isSplit && state.side === 'right'
      const frame: Frame = {
        columns,
        rows,
        isSplit,
        isTreeRight,
        treeWidth,
        // Beside the text: the tree, the line between them and the two thumbs, or one margin and a thumb.
        textWidth: Math.max(8, isSplit ? columns - treeWidth - 5 : columns - 3),
        treeRows: rows - 2,
        docRows: rows - 5,
      }
      const nodes = await treeNodes($, new Set(state.expanded))
      const treeMax = Math.max(0, nodes.length - frame.treeRows)
      let treeTop = clamp(state.treeTop, 0, treeMax)

      if (reveal !== '') {
        const at = nodes.findIndex(node => node.rel === reveal)

        if (at !== -1 && (at < treeTop || at >= treeTop + frame.treeRows)) {
          treeTop = clamp(at - Math.floor(frame.treeRows / 3), 0, treeMax)
        }

        reveal = ''
      }

      const isSource = state.mode === 'source' && hasTwoForms(baseOf(state.selected))
      const doc =
        state.selected === ''
          ? undefined
          : await loadDoc($, {
              root: base,
              path: state.selected,
              isSource,
              isRevealed: state.revealed.includes(state.selected),
              columns: frame.textWidth,
              measure: MEASURE,
              rows: frame.docRows,
              now: await $.clock.now(),
            })
      const docMax = doc === undefined || doc.picture !== undefined ? 0 : Math.max(0, doc.rows.length - frame.docRows)
      const docTop = clamp(state.docTop, 0, docMax)

      Object.assign(drawn, {
        isSplit,
        isReading: state.selected !== '',
        treeFrom: isTreeRight ? columns - treeWidth - 1 : 0,
        treeTo: isTreeRight ? columns : treeWidth,
        treeTop,
        treeMax,
        docTop,
        docMax,
      })

      const change = (step: (state: FolioUi) => FolioUi) => {
        void update($, ui, step).then(() => keep($))
      }
      const actions: Actions = {
        toggle: path =>
          change(now => ({
            ...now,
            expanded: now.expanded.includes(path) ? now.expanded.filter(open => open !== path) : [...now.expanded, path],
          })),
        open: path => change(now => ({ ...now, selected: path, docTop: 0 })),
        back: () => change(now => ({ ...now, selected: '' })),
        mode: (mode: FolioMode) => change(now => ({ ...now, mode, docTop: 0 })),
        reveal: () => change(now => ({ ...now, revealed: [...now.revealed, state.selected] })),
        copy: press => {
          const name = baseOf(state.selected)

          void $.fs
            .read(`${base}/${state.selected}`)
            .then(text => $.ui.copy({ text, surface: press.surface }))
            .then(done => $.ui.toast(done.isCopied ? `Copied ${name}` : `${name} was not copied`))
            .catch(() => $.ui.toast(`${name} could not be read`))
        },
        mention: () => {
          void $.prompt.fill({ text: `@${state.selected} `, mode: 'insert' })
        },
        outside: () => {
          void $.process.run(['open', `${base}/${state.selected}`], { timeoutMs: 10_000 }).catch(() => undefined)
        },
        swap: () => {
          void update($, ui, (now): FolioUi => ({ ...now, side: now.side === 'right' ? 'left' : 'right' })).then(now => $.store.set('side', now.side))
        },
        follow: href => {
          const path = resolve(dirOf(state.selected), href)

          void show($, path).then(isShown => {
            if (!isShown) {
              $.ui.toast(`${path} is not in this project`)
            }
          })
        },
      }

      return drawPane(e.surface === 'terminal' ? $.ui.resolve(e) : el, {
        frame,
        title: baseOf(base) || base,
        nodes,
        treeTop,
        selected: state.selected,
        touched: new Set(written),
        touchedFolders: new Set(written.flatMap(path => ancestors(path))),
        doc,
        docTop,
        mode: isSource ? 'source' : 'read',
        on: actions,
      })
    } catch (error) {
      return (
        <Box flexDirection="column">
          <Text bold>The files pane could not draw.</Text>
          <Text dimColor>{String(error instanceof Error ? error.message : error).slice(0, 300)}</Text>
        </Box>
      )
    }
  })
}
