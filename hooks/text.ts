// Text measured in terminal cells: widths, cuts and word wrap over styled spans.

export type Span = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  dim?: boolean
  color?: string
  bg?: string
  href?: string
}

export type Style = Omit<Span, 'text'>

/** One line of a fenced block or of a source file, drawn by the engine's highlighter. */
export type CodeLine = { line: string; block: number; language?: string; number?: number }

/** One terminal row. A code row keeps its indent in `spans`. */
export type Row = { spans: Span[]; code?: CodeLine; link?: string }

const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
]

const ZERO: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x200b, 0x200f],
  [0x2060, 0x2060],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
]

const within = (ranges: ReadonlyArray<readonly [number, number]>, cp: number) => {
  for (const [low, high] of ranges) {
    if (cp >= low && cp <= high) {
      return true
    }
  }

  return false
}

export const charWidth = (cp: number): number => {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) {
    return 0
  }

  if (cp < 0x300) {
    return 1
  }

  if (within(ZERO, cp)) {
    return 0
  }

  return within(WIDE, cp) ? 2 : 1
}

export const width = (text: string): number => {
  let total = 0
  let last = 0

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0

    // An emoji selector makes a narrow symbol draw wide.
    if (cp === 0xfe0f && last === 1) {
      total += 1
      last = 2
      continue
    }

    last = charWidth(cp)
    total += last
  }

  return total
}

/** The longest head of `text` that fits `cells`. */
export const head = (text: string, cells: number): string => {
  let total = 0
  let out = ''

  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0) ?? 0)

    if (total + w > cells) {
      break
    }

    total += w
    out += ch
  }

  return out
}

/** Cuts `text` to `cells`, an ellipsis at the cut. */
export const truncate = (text: string, cells: number): string => {
  if (cells <= 0) {
    return ''
  }

  return width(text) <= cells ? text : `${head(text, cells - 1)}…`
}

/** Cuts in the middle, so a file name keeps its ending. */
export const truncateMiddle = (text: string, cells: number): string => {
  if (width(text) <= cells) {
    return text
  }

  if (cells <= 3) {
    return truncate(text, cells)
  }

  const tail = Math.floor((cells - 1) / 3)
  const chars = [...text]

  return `${head(text, cells - 1 - tail)}…${chars.slice(chars.length - tail).join('')}`
}

export const pad = (text: string, cells: number): string => text + ' '.repeat(Math.max(0, cells - width(text)))

/** Tabs to spaces, and no control character but a newline: what a Text may hold. */
export const clean = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '')

export const plain = (spans: readonly Span[]): string => spans.map(span => span.text).join('')

export const spansWidth = (spans: readonly Span[]): number => spans.reduce((sum, span) => sum + width(span.text), 0)

type Piece = { text: string; style: Style; cells: number }

const styleOf = (span: Span): Style => {
  const { text: _text, ...style } = span

  return style
}

/**
 * Word wrap over styled spans. A newline in a span's text is a hard break.
 * A word wider than the room is cut across rows.
 */
export const wrapSpans = (spans: readonly Span[], cells: number): Span[][] => {
  const room = Math.max(1, cells)
  const lines: Span[][] = []
  let line: Span[] = []
  let used = 0
  let word: Piece[] = []
  let wordCells = 0
  let gap: Piece[] = []
  let gapCells = 0

  const push = (piece: Piece) => {
    const lastSpan = line[line.length - 1]

    if (lastSpan !== undefined && sameStyle(lastSpan, piece.style)) {
      lastSpan.text += piece.text
    } else {
      line.push({ ...piece.style, text: piece.text })
    }

    used += piece.cells
  }

  const breakLine = () => {
    lines.push(line)
    line = []
    used = 0
  }

  const placeWord = () => {
    if (word.length === 0) {
      return
    }

    if (used > 0 && used + gapCells + wordCells > room) {
      breakLine()
      gap = []
      gapCells = 0
    }

    if (used > 0) {
      for (const piece of gap) {
        push(piece)
      }
    }

    gap = []
    gapCells = 0

    for (const piece of word) {
      if (used + piece.cells <= room) {
        push(piece)
        continue
      }

      // The word is wider than a whole row: cut it.
      let rest = piece.text

      while (rest !== '') {
        if (used >= room) {
          breakLine()
        }

        let part = head(rest, room - used) || [...rest][0] || ''
        let isSoft = false

        // A path or a long name breaks after a separator when one is near the edge.
        if (part.length < rest.length) {
          const least = Math.floor(part.length * 0.4)
          const slash = part.lastIndexOf('/', part.length - 2)
          const soft = slash >= least ? slash : Math.max(part.lastIndexOf('-'), part.lastIndexOf('_'), part.lastIndexOf('='))

          if (soft >= least && soft < part.length - 1) {
            part = part.slice(0, soft + 1)
            isSoft = true
          }
        }

        push({ text: part, style: piece.style, cells: width(part) })
        rest = rest.slice(part.length)

        if (isSoft) {
          breakLine()
        }
      }
    }

    word = []
    wordCells = 0
  }

  for (const span of spans) {
    const style = styleOf(span)

    for (const token of span.text.split(/(\n|[ ]+)/)) {
      if (token === '') {
        continue
      }

      if (token === '\n') {
        placeWord()
        breakLine()
        gap = []
        gapCells = 0
      } else if (token.startsWith(' ')) {
        placeWord()
        gap.push({ text: token, style, cells: token.length })
        gapCells += token.length
      } else {
        const cellsOf = width(token)
        word.push({ text: token, style, cells: cellsOf })
        wordCells += cellsOf
      }
    }
  }

  placeWord()

  if (line.length > 0 || lines.length === 0) {
    lines.push(line)
  }

  return lines
}

const sameStyle = (span: Span, style: Style): boolean =>
  span.bold === style.bold &&
  span.italic === style.italic &&
  span.underline === style.underline &&
  span.strike === style.strike &&
  span.dim === style.dim &&
  span.color === style.color &&
  span.bg === style.bg &&
  span.href === style.href

/** Cuts a row of spans to `cells`, an ellipsis at the cut. */
export const fitSpans = (spans: readonly Span[], cells: number): Span[] => {
  if (spansWidth(spans) <= cells) {
    return [...spans]
  }

  const out: Span[] = []
  let left = Math.max(0, cells - 1)

  for (const span of spans) {
    const w = width(span.text)

    if (w <= left) {
      out.push(span)
      left -= w
      continue
    }

    out.push({ ...span, text: `${head(span.text, left)}…` })
    break
  }

  return out
}
