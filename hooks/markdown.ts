// Markdown to terminal rows. Every row is one line of the pane, so the pane
// can show any window of a document and knows its height.
import { clean, spansWidth, width, wrapSpans } from './text'
import type { Row, Span, Style } from './text'
import { C } from './theme'

type Align = 'left' | 'right' | 'center'

type Ctx = {
  /** How deep in lists the block is; picks the bullet. */
  depth: number
  /** Inside a tight list item: no blank row between its blocks. */
  isTight: boolean
  /** Counts fenced blocks, so two that touch stay apart. */
  blocks: { n: number }
}

const BULLETS = ['•', '◦', '▪'] as const
const RULE = '─'
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~<>&"']/
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rarr: '→',
  larr: '←',
  copy: '©',
  times: '×',
  middot: '·',
}

/** Inline code: a quiet tint, so a page full of paths stays calm. */
const CODE: Style = { color: C.code }

const blank = (): Row => ({ spans: [] })

const isBlank = (row: Row | undefined): boolean =>
  row !== undefined && row.code === undefined && row.spans.every(span => span.text.trim() === '')

const indentOf = (line: string): number => line.length - line.trimStart().length

/** A link the pane can follow itself: a path, not a web address or an anchor. */
export const isLocalLink = (href: string): boolean => href !== '' && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)

// --- inline -----------------------------------------------------------------

const skipCode = (src: string, at: number): number => {
  let run = 1

  while (src[at + run] === '`') {
    run += 1
  }

  let k = at + run

  while (k < src.length) {
    if (src[k] !== '`') {
      k += 1
      continue
    }

    let close = 1

    while (src[k + close] === '`') {
      close += 1
    }

    if (close === run) {
      return k + close
    }

    k += close
  }

  return -1
}

/** Where the closing run of `len` marks starts, or -1. */
const findClose = (src: string, from: number, mark: string, len: number): number => {
  let k = from

  while (k < src.length) {
    const ch = src[k]

    if (ch === '\\') {
      k += 2
      continue
    }

    if (ch === '`') {
      const end = skipCode(src, k)

      if (end === -1) {
        k += 1
      } else {
        k = end
      }

      continue
    }

    if (ch !== mark) {
      k += 1
      continue
    }

    let run = 1

    while (src[k + run] === mark) {
      run += 1
    }

    const before = src[k - 1] ?? ' '
    const after = src[k + run] ?? ' '
    const fits = len === 1 ? run % 2 === 1 : run >= len
    const closes = k > from && !/\s/.test(before) && (mark !== '_' || !/[A-Za-z0-9]/.test(after))

    if (fits && closes) {
      return k + run - len
    }

    k += run
  }

  return -1
}

const readLink = (src: string, start: number): { text: string; href: string; end: number } | undefined => {
  let depth = 0
  let k = start

  for (; k < src.length; k += 1) {
    const ch = src[k]

    if (ch === '\\') {
      k += 1
    } else if (ch === '`') {
      const end = skipCode(src, k)

      if (end !== -1) {
        k = end - 1
      }
    } else if (ch === '[') {
      depth += 1
    } else if (ch === ']') {
      depth -= 1

      if (depth === 0) {
        break
      }
    }
  }

  if (k >= src.length || src[k + 1] !== '(') {
    return undefined
  }

  let p = k + 2
  let parens = 1

  for (; p < src.length; p += 1) {
    const ch = src[p]

    if (ch === '\\') {
      p += 1
    } else if (ch === '(') {
      parens += 1
    } else if (ch === ')') {
      parens -= 1

      if (parens === 0) {
        break
      }
    }
  }

  if (p >= src.length) {
    return undefined
  }

  let href = src.slice(k + 2, p).trim()
  const titled = /^(\S+)\s+["'(].*["')]$/.exec(href)

  if (titled?.[1] !== undefined) {
    href = titled[1]
  }

  return { text: src.slice(start + 1, k), href: href.replace(/^<|>$/g, ''), end: p + 1 }
}

const entity = (name: string): string | undefined => {
  if (name.startsWith('#x') || name.startsWith('#X')) {
    const cp = Number.parseInt(name.slice(2), 16)

    return Number.isFinite(cp) && cp > 31 && cp < 0x110000 ? String.fromCodePoint(cp) : undefined
  }

  if (name.startsWith('#')) {
    const cp = Number.parseInt(name.slice(1), 10)

    return Number.isFinite(cp) && cp > 31 && cp < 0x110000 ? String.fromCodePoint(cp) : undefined
  }

  return ENTITIES[name]
}

/** Inline markdown to styled spans. */
export const inline = (src: string, base: Style = {}): Span[] => {
  const out: Span[] = []
  let buf = ''
  let i = 0

  const flush = () => {
    if (buf !== '') {
      out.push({ ...base, text: buf })
      buf = ''
    }
  }

  while (i < src.length) {
    const ch = src[i] ?? ''
    const next = src[i + 1] ?? ''

    if (ch === '\\') {
      if (next !== '' && ESCAPABLE.test(next)) {
        buf += next
        i += 2
      } else {
        buf += ch
        i += 1
      }

      continue
    }

    if (ch === '`') {
      const end = skipCode(src, i)

      if (end !== -1) {
        let run = 1

        while (src[i + run] === '`') {
          run += 1
        }

        let code = src.slice(i + run, end - run).replace(/\n/g, ' ')

        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
          code = code.slice(1, -1)
        }

        flush()
        out.push({ ...base, text: code, ...CODE })
        i = end
        continue
      }
    }

    if (ch === '!' && next === '[') {
      const image = readLink(src, i + 1)

      if (image !== undefined) {
        flush()
        out.push({ ...base, text: `▣ ${image.text === '' ? 'image' : image.text}`, color: C.muted })
        i = image.end
        continue
      }
    }

    if (ch === '[') {
      const link = readLink(src, i)

      if (link !== undefined) {
        flush()
        out.push(...inline(link.text, { ...base, underline: true, href: link.href }))
        i = link.end
        continue
      }
    }

    if (ch === '<') {
      const rest = src.slice(i, i + 400)
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(rest)

      if (auto?.[1] !== undefined) {
        flush()
        out.push({ ...base, text: auto[1].replace(/^mailto:/, ''), underline: true, href: auto[1] })
        i += auto[0].length
        continue
      }

      const br = /^<br\s*\/?>/i.exec(rest)

      if (br !== null) {
        buf += '\n'
        i += br[0].length
        continue
      }

      const tag = /^<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/.exec(rest)

      if (tag !== null) {
        i += tag[0].length
        continue
      }
    }

    if (ch === '&') {
      const found = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/.exec(src.slice(i, i + 12))
      const value = found?.[1] === undefined ? undefined : entity(found[1])

      if (found !== null && value !== undefined) {
        buf += value
        i += found[0].length
        continue
      }
    }

    if (ch === '*' || ch === '_') {
      let run = 1

      while (src[i + run] === ch) {
        run += 1
      }

      const before = src[i - 1] ?? ' '
      const after = src[i + run] ?? ' '
      const opens = !/\s/.test(after) && (ch === '*' || !/[A-Za-z0-9]/.test(before))
      let isDone = false

      if (opens) {
        for (let len = Math.min(run, 3); len >= 1 && !isDone; len -= 1) {
          const close = findClose(src, i + run, ch, len)

          if (close === -1) {
            continue
          }

          buf += ch.repeat(run - len)
          flush()
          out.push(
            ...inline(src.slice(i + run, close), {
              ...base,
              ...(len >= 2 ? { bold: true } : {}),
              ...(len !== 2 ? { italic: true } : {}),
            }),
          )
          i = close + len
          isDone = true
        }
      }

      if (!isDone) {
        buf += ch.repeat(run)
        i += run
      }

      continue
    }

    if (ch === '~' && next === '~' && !/\s/.test(src[i + 2] ?? ' ')) {
      const close = src.indexOf('~~', i + 2)

      if (close !== -1) {
        flush()
        out.push(...inline(src.slice(i + 2, close), { ...base, strike: true }))
        i = close + 2
        continue
      }
    }

    if (ch === 'h' && (src.startsWith('https://', i) || src.startsWith('http://', i)) && /[\s(>]|^$/.test(src[i - 1] ?? '')) {
      const found = /^https?:\/\/[^\s<>]+/.exec(src.slice(i, i + 2100))

      if (found !== null) {
        const url = found[0].replace(/[.,;:!?)\]'"*_]+$/, '')

        flush()
        out.push({ ...base, text: url, underline: true, href: url })
        i += url.length
        continue
      }
    }

    buf += ch
    i += 1
  }

  flush()

  return out
}

// --- blocks -----------------------------------------------------------------

const HEADING = /^ {0,3}(#{1,6})(?:[ ]+(.*?))?(?:[ ]+#+)?[ ]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const HR = /^ {0,3}([-*_])(?:[ ]*\1){2,}[ ]*$/
const QUOTE = /^ {0,3}>/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(?:(\s+)(.*))?$/
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const COMMENT = /^\s*<!--/

const isTableRule = (line: string | undefined): boolean =>
  line !== undefined && line.includes('|') && line.includes('-') && TABLE_RULE.test(line)

const startsBlock = (line: string, after: string | undefined): boolean => {
  if (HEADING.test(line) || FENCE.test(line) || HR.test(line) || QUOTE.test(line) || COMMENT.test(line)) {
    return true
  }

  const item = ITEM.exec(line)

  if (item !== null && item[4] !== undefined && item[4] !== '' && (item[2] === '1.' || item[2] === '1)' || !/\d/.test(item[2] ?? ''))) {
    return true
  }

  return line.includes('|') && isTableRule(after)
}

const cellsOf = (line: string): string[] => {
  const cells: string[] = []
  let cell = ''
  let isCode = false
  const text = line.trim()

  for (let k = 0; k < text.length; k += 1) {
    const ch = text[k] ?? ''

    if (ch === '\\' && text[k + 1] === '|') {
      cell += '|'
      k += 1
    } else if (ch === '`') {
      isCode = !isCode
      cell += ch
    } else if (ch === '|' && !isCode) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }

  cells.push(cell.trim())

  if (text.startsWith('|')) {
    cells.shift()
  }

  if (text.endsWith('|') && !text.endsWith('\\|')) {
    cells.pop()
  }

  return cells
}

const sum = (list: readonly number[]): number => list.reduce((total, n) => total + n, 0)

/**
 * Column widths that fit `room`. Each column first gets room for its longest
 * word, then the columns with more text share what is left.
 */
export const fitColumns = (natural: readonly number[], room: number, words: readonly number[] = []): number[] => {
  if (sum(natural) <= room) {
    return [...natural]
  }

  const count = Math.max(1, natural.length)
  const floor = Math.max(3, Math.min(10, Math.floor(room / count)))
  const base = natural.map((w, c) => Math.min(w, Math.max(floor, Math.min(words[c] ?? floor, Math.floor(room / 2)))))

  if (sum(base) <= room) {
    const widths = [...base]
    let left = room - sum(widths)

    // The column that is shortest of its full width takes the next cell.
    while (left > 0) {
      let pick = -1
      let need = 0

      for (let c = 0; c < widths.length; c += 1) {
        const short = ((natural[c] ?? 0) - (widths[c] ?? 0)) / Math.max(1, widths[c] ?? 1)

        if (short > need) {
          need = short
          pick = c
        }
      }

      if (pick === -1) {
        break
      }

      widths[pick] = (widths[pick] ?? 0) + 1
      left -= 1
    }

    return widths
  }

  let low = floor
  let high = Math.max(...natural)

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)

    if (sum(natural.map(w => Math.min(w, mid))) <= room) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return natural.map(w => Math.max(Math.min(w, low), Math.min(w, floor)))
}

const longestWord = (spans: readonly Span[]): number =>
  Math.max(0, ...spans.map(span => span.text).join('').split(/\s+/).map(word => width(word)))

/** A table with a rule under its head and air between its columns, no box. */
export const tableRows = (head: readonly Span[][], aligns: readonly Align[], body: readonly Span[][][], cols: number): Row[] => {
  const count = Math.max(head.length, ...body.map(row => row.length), 1)
  const gap = count > 4 ? 2 : 3
  const natural = Array.from({ length: count }, (_, c) =>
    Math.max(1, spansWidth(head[c] ?? []), ...body.map(row => spansWidth(row[c] ?? []))),
  )
  const words = Array.from({ length: count }, (_, c) =>
    Math.min(26, Math.max(longestWord(head[c] ?? []), ...body.map(row => longestWord(row[c] ?? [])))),
  )
  const widths = fitColumns(natural, Math.max(count * 3, cols - gap * (count - 1)), words)
  const out: Row[] = []

  const line = (cells: readonly Span[][]): Row[] => {
    const wrapped = Array.from({ length: count }, (_, c) => wrapSpans(cells[c] ?? [], widths[c] ?? 1))
    const height = Math.max(1, ...wrapped.map(lines => lines.length))
    const rows: Row[] = []

    for (let l = 0; l < height; l += 1) {
      const spans: Span[] = []

      for (let c = 0; c < count; c += 1) {
        const part = wrapped[c]?.[l] ?? []
        const room = widths[c] ?? 1
        const free = Math.max(0, room - spansWidth(part))
        const align = aligns[c] ?? 'left'
        const left = align === 'right' ? free : align === 'center' ? Math.floor(free / 2) : 0
        const right = free - left + (c < count - 1 ? gap : 0)

        if (left > 0) {
          spans.push({ text: ' '.repeat(left) })
        }

        spans.push(...part)

        if (right > 0 && c < count - 1) {
          spans.push({ text: ' '.repeat(right) })
        }
      }

      rows.push({ spans })
    }

    return rows
  }

  out.push(...line(head))
  out.push({
    spans: widths.flatMap((w, c) => [
      { text: RULE.repeat(w), color: C.faint },
      ...(c < count - 1 ? [{ text: ' '.repeat(gap) }] : []),
    ]),
  })

  const lines = body.map(line)
  const isAiry = lines.some(rows => rows.length > 1)

  lines.forEach((rows, r) => {
    if (isAiry && r > 0) {
      out.push(blank())
    }

    out.push(...rows)
  })

  return out
}

const headingRows = (level: number, text: string, cols: number): Row[] => {
  const style: Style =
    level <= 3 ? { bold: true } : level === 4 ? { bold: true, color: C.muted } : { color: C.muted, italic: true }
  const rows = wrapSpans(inline(text, style), cols).map(spans => ({ spans }))

  if (level === 1) {
    rows.push({ spans: [{ text: '━━━━', color: C.accent }] })
  } else if (level === 2) {
    rows.push({ spans: [{ text: RULE.repeat(cols), color: C.faint }] })
  }

  return rows
}

const blockRows = (lines: readonly string[], cols: number, ctx: Ctx): Row[] => {
  const out: Row[] = []
  let i = 0

  const gap = (rows = 1, isForced = false) => {
    if (out.length === 0 || (ctx.isTight && !isForced)) {
      return
    }

    let have = 0

    for (let k = out.length - 1; k >= 0 && isBlank(out[k]); k -= 1) {
      have += 1
    }

    for (; have < rows; have += 1) {
      out.push(blank())
    }
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') {
      i += 1
      continue
    }

    if (COMMENT.test(line)) {
      while (i < lines.length && !(lines[i] ?? '').includes('-->')) {
        i += 1
      }

      i += 1
      continue
    }

    const fence = FENCE.exec(line)

    if (fence !== null) {
      const mark = fence[1] ?? '```'
      const language = (fence[2] ?? '').trim().split(/\s+/)[0] ?? ''
      const indent = indentOf(line)
      const block = ctx.blocks.n
      const body: string[] = []

      ctx.blocks.n += 1
      i += 1

      while (i < lines.length) {
        const inner = lines[i] ?? ''
        const trimmed = inner.trim()

        i += 1

        if (trimmed.startsWith(mark) && trimmed.replace(new RegExp(`\\${mark[0] ?? '`'}`, 'g'), '') === '') {
          break
        }

        body.push(inner.slice(Math.min(indent, indentOf(inner))))
      }

      while (body.length > 0 && (body[body.length - 1] ?? '').trim() === '') {
        body.pop()
      }

      gap(1, true)

      for (const code of body.length === 0 ? [''] : body) {
        out.push({
          spans: [{ text: '│ ', color: C.faint }],
          code: { line: code, block, ...(language === '' ? {} : { language }) },
        })
      }

      continue
    }

    const heading = HEADING.exec(line)

    if (heading !== null) {
      const level = (heading[1] ?? '#').length

      gap(level <= 2 ? 2 : 1, true)
      out.push(...headingRows(level, (heading[2] ?? '').trim(), cols))
      i += 1
      continue
    }

    if (HR.test(line)) {
      gap(1, true)
      out.push({ spans: [{ text: RULE.repeat(cols), color: C.faint }] })
      i += 1
      continue
    }

    if (line.includes('|') && isTableRule(lines[i + 1])) {
      const head = cellsOf(line).map(cell => inline(cell, { bold: true }))
      const aligns = cellsOf(lines[i + 1] ?? '').map((cell): Align =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left',
      )
      const body: Span[][][] = []

      i += 2

      while (i < lines.length && (lines[i] ?? '').trim() !== '' && (lines[i] ?? '').includes('|')) {
        body.push(cellsOf(lines[i] ?? '').map(cell => inline(cell)))
        i += 1
      }

      gap(1, true)
      out.push(...tableRows(head, aligns, body, cols))
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []

      while (i < lines.length) {
        const quoted = lines[i] ?? ''

        if (QUOTE.test(quoted)) {
          inner.push(quoted.replace(/^ {0,3}> ?/, ''))
        } else if (quoted.trim() !== '' && inner.length > 0 && !startsBlock(quoted, lines[i + 1])) {
          inner.push(quoted)
        } else {
          break
        }

        i += 1
      }

      gap(1, true)

      for (const row of blockRows(inner, Math.max(8, cols - 2), { ...ctx, isTight: false })) {
        out.push({
          ...row,
          spans: [{ text: '▎ ', color: C.faint }, ...row.spans.map(span => (span.color === undefined ? { ...span, color: C.muted } : span))],
        })
      }

      continue
    }

    const first = ITEM.exec(line)

    if (first !== null) {
      const base = (first[1] ?? '').length
      const isOrdered = /\d/.test(first[2] ?? '')
      const items: string[][] = []
      const start = isOrdered ? Number.parseInt(first[2] ?? '1', 10) : 1
      let isLoose = false

      while (i < lines.length) {
        const item = ITEM.exec(lines[i] ?? '')

        // A list ends where the indent or the kind of marker changes.
        if (item === null || (item[1] ?? '').length !== base || /\d/.test(item[2] ?? '') !== isOrdered || HR.test(lines[i] ?? '')) {
          break
        }

        const offset = base + (item[2] ?? '').length + Math.min((item[3] ?? ' ').length, 4)
        const body = [item[4] ?? '']

        i += 1

        while (i < lines.length) {
          const inner = lines[i] ?? ''

          if (inner.trim() === '') {
            let k = i + 1

            while (k < lines.length && (lines[k] ?? '').trim() === '') {
              k += 1
            }

            if (k < lines.length && indentOf(lines[k] ?? '') > base) {
              body.push('')
              i += 1
              continue
            }

            break
          }

          const indent = indentOf(inner)

          if (indent > base) {
            body.push(inner.slice(Math.min(indent, offset)))
            i += 1
            continue
          }

          if (ITEM.test(inner) || startsBlock(inner, lines[i + 1])) {
            break
          }

          body.push(inner.trim())
          i += 1
        }

        items.push(body)

        let k = i

        while (k < lines.length && (lines[k] ?? '').trim() === '') {
          k += 1
        }

        if (k > i && k < lines.length) {
          const following = ITEM.exec(lines[k] ?? '')

          const isSame = following !== null && (following[1] ?? '').length === base && /\d/.test(following[2] ?? '') === isOrdered

          if (isSame && !HR.test(lines[k] ?? '')) {
            isLoose = true
            i = k
            continue
          }

          break
        }
      }

      const digits = String(start + items.length - 1).length
      const room = isOrdered ? digits + 2 : 2

      gap()

      items.forEach((body, n) => {
        const task = /^\[([ xX])\]\s+/.exec(body[0] ?? '')
        const isChecked = task !== null && task[1] !== ' '

        if (task !== null) {
          body[0] = (body[0] ?? '').slice(task[0].length)
        }

        const marker: Span =
          task !== null
            ? { text: isChecked ? '✓ ' : '○ ', color: isChecked ? C.done : C.muted }
            : isOrdered
              ? { text: `${`${start + n}.`.padStart(digits + 1)} `, color: C.muted }
              : { text: `${BULLETS[ctx.depth % BULLETS.length] ?? '•'} `, color: C.muted }
        const inner = blockRows(body, Math.max(8, cols - room), {
          ...ctx,
          depth: ctx.depth + 1,
          isTight: !isLoose && !body.includes(''),
        })
        const rows = inner.length === 0 ? [blank()] : inner

        if (isLoose && n > 0) {
          gap(1, true)
        }

        rows.forEach((row, r) => {
          const spans = isChecked ? row.spans.map(span => ({ ...span, dim: true })) : row.spans

          out.push({ ...row, spans: [r === 0 ? marker : { text: ' '.repeat(room) }, ...spans] })
        })
      })

      continue
    }

    // A paragraph, or a heading underlined with = or -.
    const para: string[] = []
    let setext = 0

    while (i < lines.length) {
      const text = lines[i] ?? ''

      if (text.trim() === '') {
        break
      }

      if (para.length > 0) {
        const under = /^ {0,3}(=+|-+)[ ]*$/.exec(text)

        if (under !== null) {
          setext = (under[1] ?? '=').startsWith('=') ? 1 : 2
          i += 1
          break
        }

        if (startsBlock(text, lines[i + 1])) {
          break
        }
      }

      para.push(text)
      i += 1
    }

    const joined = para
      .map((text, n) => (n === para.length - 1 ? text.trim() : / {2,}$|\\$/.test(text) ? `${text.replace(/( {2,}|\\)$/, '').trim()}\n` : `${text.trim()} `))
      .join('')

    if (setext > 0) {
      gap(2, true)
      out.push(...headingRows(setext, joined, cols))
      continue
    }

    gap()

    for (const spans of wrapSpans(inline(joined), cols)) {
      const link = spans.find(span => span.href !== undefined && isLocalLink(span.href))?.href

      out.push(link === undefined ? { spans } : { spans, link })
    }
  }

  return out
}

const frontMatter = (lines: readonly string[], cols: number): Row[] => {
  const pairs = lines
    .map(line => /^\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(line))
    .filter((found): found is RegExpExecArray => found !== null && (found[2] ?? '').trim() !== '')
  const keyWidth = Math.min(16, Math.max(0, ...pairs.map(pair => (pair[1] ?? '').length)))
  const out: Row[] = []

  for (const pair of pairs) {
    const value = (pair[2] ?? '').replace(/^["']|["']$/g, '')
    const rows = wrapSpans([{ text: value === '' ? '—' : value, color: C.muted }], Math.max(8, cols - keyWidth - 2))

    rows.forEach((spans, r) => {
      out.push({ spans: [{ text: (r === 0 ? (pair[1] ?? '') : '').padEnd(keyWidth + 2), color: C.faint }, ...spans] })
    })
  }

  if (out.length > 0) {
    out.push({ spans: [{ text: RULE.repeat(cols), color: C.faint }] })
  }

  return out
}

/** A markdown document as rows `cols` cells wide. */
export const renderMarkdown = (source: string, cols: number): Row[] => {
  const room = Math.max(12, cols)
  let lines = clean(source).split('\n')
  const out: Row[] = []

  if ((lines[0] ?? '').trim() === '---') {
    const end = lines.findIndex((line, n) => n > 0 && /^(---|\.\.\.)\s*$/.test(line))

    if (end > 0) {
      out.push(...frontMatter(lines.slice(1, end), room))
      lines = lines.slice(end + 1)
    }
  }

  const body = blockRows(lines, room, { depth: 0, isTight: false, blocks: { n: 1 } })

  if (out.length > 0 && body.length > 0) {
    out.push(blank())
  }

  out.push(...body)

  while (isBlank(out[0])) {
    out.shift()
  }

  while (isBlank(out[out.length - 1])) {
    out.pop()
  }

  return out
}
