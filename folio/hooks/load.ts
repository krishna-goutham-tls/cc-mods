// A file's content as the rows the reader shows. Nothing here reads the disk:
// the hooks module reads, and hands the text or the picture's size to these.
import { ageText, baseOf, isSecret, kindOf, labelOf, parseTable, sizeText } from './files'
import type { Kind } from './files'
import { renderMarkdown, tableRows } from './markdown'
import type { Doc, Picture } from './model'
import { clean, spansWidth } from './text'
import type { Row, Span } from './text'
import { C } from './theme'

export type Entry = { name: string; isDir: boolean; mtimeMs: number }

export const MAX_TEXT_BYTES = 3_500_000
const MAX_LINES = 20_000
const MAX_LINE_CHARS = 2_000
const MAX_TABLE_ROWS = 1_000
/** A terminal cell is about this many times taller than it is wide. */
const CELL_SHAPE = 2.1
const CELL_PIXELS = 8

export type DocRequest = {
  root: string
  path: string
  isSource: boolean
  isRevealed: boolean
  /** Cells across the reader's text. */
  columns: number
  /** The widest a line of prose may run. */
  measure: number
  /** Rows the reader shows at once. */
  rows: number
  now: number
}

export type FileFacts = { size: number; mtimeMs: number }

/** Folders first, names that start with a dot last, then by name. */
export const byName = (a: Entry, b: Entry): number => {
  if (a.isDir !== b.isDir) {
    return a.isDir ? -1 : 1
  }

  const aDot = a.name.startsWith('.')
  const bDot = b.name.startsWith('.')

  if (aDot !== bDot) {
    return aDot ? 1 : -1
  }

  const x = a.name.toLowerCase()
  const y = b.name.toLowerCase()

  return x < y ? -1 : x > y ? 1 : 0
}

/** Short lines set in the middle of the reader. */
const card = (cols: number, lines: readonly Span[][]): Row[] =>
  lines.map(spans => ({ spans: [{ text: ' '.repeat(Math.max(0, Math.floor((cols - spansWidth(spans)) / 2))) }, ...spans] }))

const about = (request: DocRequest, facts: FileFacts): string[] => [sizeText(facts.size), ageText(facts.mtimeMs, request.now)]

/** A short notice in place of a file's content. */
export const notice = (request: DocRequest, facts: FileFacts | undefined, title: string, lines: readonly string[]): Doc => {
  const name = baseOf(request.path)

  return {
    path: request.path,
    kind: kindOf(name),
    meta: facts === undefined ? [] : [labelOf(name), ...about(request, facts)],
    canToggle: false,
    isCard: true,
    isLocked: false,
    rows: card(request.columns, [[{ text: title, bold: true }], [], ...lines.map(text => [{ text, color: C.muted }])]),
  }
}

export const goneDoc = (request: DocRequest): Doc => notice(request, undefined, baseOf(request.path), ['This file is not on disk any more.'])

export const opaqueDoc = (request: DocRequest, facts: FileFacts, why: string): Doc =>
  notice(request, facts, baseOf(request.path), [why, 'Open shows it in its own app.'])

export const lockedDoc = (request: DocRequest, facts: FileFacts): Doc => ({
  ...notice(request, facts, 'Kept off the screen', ['This file can hold secrets.', 'Its text stays hidden until you ask for it.']),
  isLocked: true,
})

/** How the reader shows the file: what the hooks module has to read for it. */
export const planOf = (request: DocRequest): 'locked' | 'picture' | 'opaque' | 'text' => {
  const name = baseOf(request.path)
  const kind = kindOf(name)

  if (isSecret(name) && !request.isRevealed) {
    return 'locked'
  }

  if (kind === 'image' || (kind === 'look' && !request.isSource)) {
    return 'picture'
  }

  return kind === 'binary' || kind === 'look' ? (name.toLowerCase().endsWith('.svg') ? 'text' : 'opaque') : 'text'
}

export const hash = (text: string): string => {
  let h = 0x811c9dc5

  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h.toString(16).padStart(8, '0')
}

const fitPicture = (width: number, height: number, maxColumns: number, maxRows: number): { columns: number; rows: number } => {
  let columns = Math.min(maxColumns, Math.max(4, Math.round(width / CELL_PIXELS)))
  let rows = Math.max(1, Math.round((columns * height) / width / CELL_SHAPE))

  if (rows > maxRows) {
    rows = Math.max(1, maxRows)
    columns = Math.max(1, Math.min(maxColumns, Math.round((rows * CELL_SHAPE * width) / height)))
  }

  return { columns: Math.min(255, columns), rows: Math.min(255, rows) }
}

export const pictureDoc = (request: DocRequest, facts: FileFacts, made: { file: string; width: number; height: number }): Doc => {
  const name = baseOf(request.path)
  const kind = kindOf(name)
  const fit = fitPicture(made.width, made.height, request.columns, Math.max(1, request.rows - 1))
  const picture: Picture = { file: made.file, ...fit, generation: Math.round(facts.mtimeMs), alt: `${name} (picture)` }

  return {
    path: request.path,
    kind,
    rows: [],
    meta: [labelOf(name), ...(kind === 'image' ? [`${made.width} × ${made.height}`] : []), ...about(request, facts)],
    canToggle: name.toLowerCase().endsWith('.svg'),
    isCard: false,
    isLocked: false,
    picture,
  }
}

const looksBinary = (text: string): boolean => {
  const sample = text.slice(0, 8000)

  if (sample.includes('\u0000')) {
    return true
  }

  let bad = 0

  for (const ch of sample) {
    if (ch === '�') {
      bad += 1
    }
  }

  return bad > 8 && bad > sample.length / 200
}

const sourceRows = (text: string): { rows: Row[]; lines: number; isCut: boolean } => {
  const all = clean(text).replace(/\n$/, '').split('\n')
  const lines = all.slice(0, MAX_LINES)

  return {
    lines: all.length,
    isCut: all.length > MAX_LINES,
    rows: lines.map((line, n) => ({
      spans: [],
      code: { line: line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) : line, block: 0, number: n + 1 },
    })),
  }
}

/** A text file as a document: markdown set as prose, a table as columns, the rest as code. */
export const textDoc = (request: DocRequest, facts: FileFacts, text: string): Doc => {
  const { path, columns } = request
  const name = baseOf(path)
  const kind: Kind = kindOf(name)

  if (looksBinary(text)) {
    return opaqueDoc(request, facts, 'This file is not text.')
  }

  const source = sourceRows(text)
  const lines = `${source.lines} ${source.lines === 1 ? 'line' : 'lines'}`
  const meta = (length: string): string[] => [labelOf(name), length, ...about(request, facts)]

  if (kind === 'markdown' && !request.isSource) {
    return {
      path,
      kind,
      rows: renderMarkdown(text, Math.min(columns, request.measure)),
      meta: meta(lines),
      canToggle: true,
      isCard: false,
      isLocked: false,
    }
  }

  if (kind === 'table' && !request.isSource) {
    const cells = parseTable(text, name.toLowerCase().endsWith('.tsv') ? '\t' : ',', MAX_TABLE_ROWS + 1)
    const toSpans = (value: string, isHead: boolean): Span[] => [
      { text: clean(value).replace(/\n/g, ' ').trim(), ...(isHead ? { bold: true } : {}) },
    ]
    const head = (cells[0] ?? []).map(value => toSpans(value, true))
    const body = cells.slice(1).map(row => row.map(value => toSpans(value, false)))

    return {
      path,
      kind,
      rows: cells.length === 0 ? card(columns, [[{ text: 'This table is empty.', color: C.muted }]]) : tableRows(head, [], body, columns),
      meta: meta(`${Math.max(0, cells.length - 1)} rows`),
      canToggle: true,
      isCard: cells.length === 0,
      isLocked: false,
    }
  }

  return {
    path,
    kind: kind === 'markdown' || kind === 'table' || kind === 'look' ? kind : 'code',
    rows: source.rows,
    meta: meta(source.isCut ? `first ${MAX_LINES} of ${lines}` : lines),
    canToggle: kind === 'markdown' || kind === 'table' || kind === 'look',
    isCard: false,
    isLocked: false,
  }
}
