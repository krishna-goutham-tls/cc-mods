// Draws the pane: the file tree, the reader, and the thin marks between them.
// Every element here is one terminal row tall unless it says its height.
import type { Elements, RenderElement } from 'claude-code'

import type { FolioMode } from '../types'
import { baseOf } from './files'
import type { Doc, Frame, Node } from './model'
import { fitSpans, pad, spansWidth, truncate, truncateMiddle, width } from './text'
import type { Row, Span } from './text'
import { C } from './theme'

type Terminal = Elements['terminal']

export type El = Pick<Terminal, 'Box' | 'Text' | 'Button' | 'Code' | 'Link'> & { Image?: Terminal['Image'] }

export type Actions = {
  toggle: (path: string) => void
  open: (path: string) => void
  back: () => void
  mode: (mode: FolioMode) => void
  reveal: () => void
  mention: () => void
  outside: () => void
  follow: (href: string) => void
  swap: () => void
}

export type PaneProps = {
  frame: Frame
  title: string
  nodes: readonly Node[]
  treeTop: number
  selected: string
  touched: ReadonlySet<string>
  touchedFolders: ReadonlySet<string>
  doc: Doc | undefined
  docTop: number
  mode: FolioMode
  on: Actions
}

const SOFT = { inverse: false, backgroundColor: C.fill } as const
const BRIGHT = { inverse: false, dimColor: false } as const

const piece = (el: El, span: Span): RenderElement => {
  const { Text, Link } = el
  const style = {
    ...(span.bold === true ? { bold: true } : {}),
    ...(span.italic === true ? { italic: true } : {}),
    ...(span.underline === true ? { underline: true } : {}),
    ...(span.strike === true ? { strikethrough: true } : {}),
    ...(span.dim === true ? { dimColor: true } : {}),
    color: span.color ?? C.text,
    ...(span.bg === undefined ? {} : { backgroundColor: span.bg }),
  }

  // A bare address is left as text: the terminal finds it, and it never shows twice.
  if (span.href !== undefined && /^https?:\/\//.test(span.href) && span.href.length < 2000 && span.text !== span.href) {
    return (
      <Link href={span.href}>
        <Text {...style}>{span.text}</Text>
      </Link>
    )
  }

  return <Text {...style}>{span.text}</Text>
}

/** One row of styled text, cut to `cells`. */
const line = (el: El, spans: readonly Span[], cells: number): RenderElement => {
  const { Text } = el
  const fitted = fitSpans(spans.filter(span => span.text !== ''), cells)

  if (fitted.length === 0) {
    return <Text> </Text>
  }

  return <Text wrap="truncate-end">{fitted.map(span => piece(el, span))}</Text>
}

const empty = (el: El): RenderElement => <el.Text> </el.Text>

// --- the tree -----------------------------------------------------------------

const treeRow = (el: El, props: PaneProps, node: Node, cells: number): RenderElement => {
  const { Box, Text, Button } = el
  const indent = '  '.repeat(Math.min(node.depth, 12))

  if (node.isEmpty) {
    return (
      <Text color={C.faint} wrap="truncate-end">
        {`   ${indent}empty`}
      </Text>
    )
  }

  const isOpenFile = !node.isDir && node.rel === props.selected
  const room = Math.max(4, cells - 4 - indent.length)
  const name = pad(truncateMiddle(node.name, room), room)
  const mark = node.isDir ? (node.isOpen ? '▾ ' : '▸ ') : '  '
  const dot = props.touched.has(node.rel) ? '●' : node.isDir && !node.isOpen && props.touchedFolders.has(node.rel) ? '•' : ' '
  const isQuiet = node.name.startsWith('.')

  return (
    <Box key={`row:${node.rel}`} width={cells} {...(isOpenFile ? { backgroundColor: C.fill } : {})}>
      <Button
        key={`node:${node.rel}`}
        plain
        hover={SOFT}
        onPress={() => (node.isDir ? props.on.toggle(node.rel) : props.on.open(node.rel))}
      >
        {isOpenFile ? <Text color={C.accent}>▎</Text> : ' '}
        {indent}
        {node.isDir ? <Text color={C.muted}>{mark}</Text> : mark}
        <Text {...(isOpenFile ? { bold: true } : {})} color={isQuiet && !isOpenFile ? C.muted : C.text}>
          {name}
        </Text>
        {dot === ' ' ? ' ' : <Text color={C.touched}>{dot}</Text>}
      </Button>
    </Box>
  )
}

const tree = (el: El, props: PaneProps): RenderElement => {
  const { Box, Text, Button } = el
  const { frame } = props
  const cells = frame.treeWidth
  const shown = props.nodes.slice(props.treeTop, props.treeTop + frame.treeRows)

  return (
    <Box flexDirection="column" width={cells} height={frame.rows} overflow="hidden">
      <Box key="tree-head" flexDirection="row" width={cells} height={1} overflow="hidden">
        <Box width={Math.max(1, cells - 3)}>
          <Text bold color={C.text} wrap="truncate-end">
            {` ${truncate(props.title, cells - 5)}`}
          </Text>
        </Box>
        {props.frame.isSplit ? (
          <Button key="swap" plain hover={{ inverse: false, color: C.accent }} onPress={() => props.on.swap()}>
            <Text color={C.faint}>⇄</Text>
          </Button>
        ) : null}
      </Box>
      {empty(el)}
      {shown.map(node => treeRow(el, props, node, cells))}
      {shown.length === 0 ? <Text color={C.faint}>{'   This folder is empty.'}</Text> : null}
    </Box>
  )
}

/**
 * A one-cell column the height of the pane. Beside the `view` rows that scroll
 * (after `lead` rows of header) it shows a thumb where the window stands;
 * `rest` fills every other row: a divider's line, or nothing.
 */
const rail = (el: El, rows: number, lead: number, view: number, total: number, top: number, rest: string): RenderElement => {
  const { Box, Text } = el
  const marks: RenderElement[] = []
  const thumb = total > view ? Math.max(1, Math.round((view * view) / total)) : 0
  const at = total > view ? lead + Math.round((top / (total - view)) * (view - thumb)) : 0

  for (let r = 0; r < rows; r += 1) {
    const isThumb = thumb > 0 && r >= at && r < at + thumb

    marks.push(<Text color={C.faint}>{isThumb ? '┃' : rest}</Text>)
  }

  return (
    <Box flexDirection="column" width={1} height={rows} overflow="hidden">
      {marks}
    </Box>
  )
}

// --- the reader ---------------------------------------------------------------

const crumbs = (path: string, cells: number): Span[] => {
  const parts = path.split('/')
  const name = parts.pop() ?? ''
  const tail: Span = { text: truncateMiddle(name, Math.max(4, cells)), bold: true }
  let left = cells - width(tail.text)
  const head: string[] = []

  for (let k = parts.length - 1; k >= 0; k -= 1) {
    const part = `${parts[k] ?? ''} › `
    const more = k > 0 ? 4 : 0

    if (width(part) + more > left) {
      if (left >= 4) {
        head.unshift('… › ')
      }

      break
    }

    head.unshift(part)
    left -= width(part)
  }

  return [{ text: head.join(''), color: C.muted }, tail]
}

const header = (el: El, props: PaneProps, cells: number): RenderElement => {
  const { Box, Text, Button } = el
  const { doc, frame } = props
  const hasToggle = doc !== undefined && doc.canToggle
  const toggleCells = hasToggle ? 'Read   Source'.length + 2 : 0
  const backCells = frame.isSplit ? 0 : 3
  const room = Math.max(4, cells - toggleCells - backCells)
  const label = (text: string, isOn: boolean) => (isOn ? <Text bold color={C.accent}>{text}</Text> : <Text color={C.muted}>{text}</Text>)

  return (
    <Box key="head" flexDirection="row" width={cells} height={1} overflow="hidden">
      {frame.isSplit ? null : (
        <Button key="back" plain hover={BRIGHT} onPress={() => props.on.back()}>
          <Text color={C.muted}>{'‹  '}</Text>
        </Button>
      )}
      <Box width={room}>{line(el, crumbs(props.selected, room), room)}</Box>
      {hasToggle ? <Text>{'  '}</Text> : null}
      {hasToggle ? (
        <Button key="mode:read" plain hover={{ inverse: false, underline: true }} onPress={() => props.on.mode('read')}>
          {label('Read', props.mode === 'read')}
        </Button>
      ) : null}
      {hasToggle ? <Text>{'   '}</Text> : null}
      {hasToggle ? (
        <Button key="mode:source" plain hover={{ inverse: false, underline: true }} onPress={() => props.on.mode('source')}>
          {label('Source', props.mode === 'source')}
        </Button>
      ) : null}
    </Box>
  )
}

const footer = (el: El, props: PaneProps, cells: number): RenderElement => {
  const { Box, Text, Button } = el
  const { doc } = props
  const actions = doc === undefined ? 0 : doc.isLocked ? 'Reveal   Mention   Open'.length : 'Mention   Open'.length
  const room = Math.max(0, cells - actions - 2)
  const meta = doc === undefined ? '' : truncate(doc.meta.join('  ·  '), room)
  const action = (key: string, text: string, onPress: () => void) => (
    <Button key={key} plain hover={{ inverse: false, color: C.accent }} onPress={onPress}>
      <Text color={C.muted}>{text}</Text>
    </Button>
  )

  if (doc === undefined) {
    return empty(el)
  }

  return (
    <Box key="foot" flexDirection="row" width={cells} height={1} overflow="hidden">
      <Box width={room + 2}>
        <Text color={C.faint} wrap="truncate-end">
          {meta === '' ? ' ' : meta}
        </Text>
      </Box>
      {doc.isLocked ? action('act:reveal', 'Reveal', props.on.reveal) : null}
      {doc.isLocked ? <Text>{'   '}</Text> : null}
      {action('act:mention', 'Mention', props.on.mention)}
      <Text>{'   '}</Text>
      {action('act:open', 'Open', props.on.outside)}
    </Box>
  )
}

/** Rows of code that touch are one highlighted block. */
const codeBlock = (el: El, doc: Doc, run: readonly Row[], cells: number): RenderElement => {
  const { Box, Code } = el
  const first = run[0]?.code
  const gutter = spansWidth(run[0]?.spans ?? [])
  const source = run.map(row => (row.code === undefined || row.code.line === '' ? ' ' : row.code.line)).join('\n')
  const language = first?.language
  const code = (
    <Code
      source={source}
      wrap="truncate-end"
      {...(language === undefined ? (first?.block === 0 ? { path: baseOf(doc.path) } : {}) : { language })}
      {...(first?.number === undefined ? {} : { startLine: first.number })}
    />
  )

  return (
    <Box flexDirection="row" width={cells} height={run.length} overflow="hidden">
      {gutter === 0 ? null : (
        <Box flexDirection="column" width={gutter}>
          {run.map(row => line(el, row.spans, gutter))}
        </Box>
      )}
      <Box flexDirection="column" width={Math.max(1, cells - gutter)}>
        {code}
      </Box>
    </Box>
  )
}

const textRow = (el: El, props: PaneProps, row: Row, index: number, cells: number): RenderElement => {
  const { Box, Text, Button } = el

  if (row.link === undefined) {
    return line(el, row.spans, cells)
  }

  const href = row.link
  const fitted = fitSpans(row.spans.filter(span => span.text !== ''), cells)

  return (
    <Box key={`link:${index}`} width={cells} height={1} overflow="hidden">
      <Button key={`go:${index}`} plain hover={SOFT} onPress={() => props.on.follow(href)}>
        {fitted.map(span => (
          <Text
            {...(span.bold === true ? { bold: true } : {})}
            {...(span.italic === true ? { italic: true } : {})}
            {...(span.underline === true ? { underline: true } : {})}
            {...(span.dim === true ? { dimColor: true } : {})}
            color={span.color ?? C.text}
          >
            {span.text}
          </Text>
        ))}
      </Button>
    </Box>
  )
}

const body = (el: El, props: PaneProps, cells: number, rows: number): RenderElement => {
  const { Box, Text, Image } = el
  const { doc } = props
  const out: RenderElement[] = []

  if (doc === undefined) {
    const lead = Math.max(0, Math.floor(rows / 3))
    const say = (text: string, isStrong: boolean) => {
      const free = ' '.repeat(Math.max(0, Math.floor((cells - width(text)) / 2)))

      return isStrong ? <Text bold color={C.text}>{free + text}</Text> : <Text color={C.muted}>{free + text}</Text>
    }

    for (let r = 0; r < lead; r += 1) {
      out.push(empty(el))
    }

    out.push(say(props.title, true), empty(el), say('Select a file to read it here.', false))
  } else if (doc.picture !== undefined) {
    const { picture } = doc
    const lead = Math.max(0, Math.floor((rows - picture.rows) / 2))

    for (let r = 0; r < lead; r += 1) {
      out.push(empty(el))
    }

    out.push(
      <Box width={cells} height={picture.rows} justifyContent="center">
        {Image === undefined ? (
          <Text color={C.muted}>{picture.alt}</Text>
        ) : (
          <Image
            key="picture"
            source={{ file: picture.file, format: 'png', generation: picture.generation }}
            columns={picture.columns}
            rows={picture.rows}
            alt={picture.alt}
          />
        )}
      </Box>,
    )
  } else {
    const shown = doc.rows.slice(props.docTop, props.docTop + rows)
    const lead = doc.isCard ? Math.max(0, Math.floor((rows - shown.length) / 3)) : 0

    for (let r = 0; r < lead; r += 1) {
      out.push(empty(el))
    }

    for (let r = 0; r < shown.length; r += 1) {
      const row = shown[r]

      if (row === undefined) {
        continue
      }

      if (row.code === undefined) {
        out.push(textRow(el, props, row, props.docTop + r, cells))
        continue
      }

      let end = r + 1

      while (end < shown.length && shown[end]?.code?.block === row.code.block) {
        end += 1
      }

      out.push(codeBlock(el, doc, shown.slice(r, end), cells))
      r = end - 1
    }
  }

  return (
    <Box flexDirection="column" width={cells} height={rows} overflow="hidden">
      {out}
    </Box>
  )
}

const reader = (el: El, props: PaneProps): RenderElement => {
  const { Box, Text } = el
  const { frame, doc } = props
  const cells = frame.textWidth
  const isBare = doc === undefined && frame.isSplit

  return (
    <Box flexDirection="column" width={cells} height={frame.rows} overflow="hidden">
      {isBare ? empty(el) : header(el, props, cells)}
      <Text color={C.faint}>{isBare ? ' ' : '─'.repeat(cells)}</Text>
      {empty(el)}
      {body(el, props, cells, frame.docRows)}
      {empty(el)}
      {footer(el, props, cells)}
    </Box>
  )
}

/** The whole pane: tree and reader side by side when there is room, else one of them. */
export const drawPane = (el: El, props: PaneProps): RenderElement => {
  const { Box, Text } = el
  const { frame, doc } = props
  const docTotal = doc === undefined || doc.picture !== undefined ? 0 : doc.rows.length
  const docRail = (rest: string) => rail(el, frame.rows, 3, frame.docRows, docTotal, props.docTop, rest)
  const treeRail = (rest: string) => rail(el, frame.rows, 2, frame.treeRows, props.nodes.length, props.treeTop, rest)

  if (!frame.isSplit) {
    if (props.selected === '') {
      return tree(el, props)
    }

    return (
      <Box flexDirection="row" width={frame.columns} height={frame.rows} overflow="hidden">
        <Text> </Text>
        {reader(el, props)}
        <Text> </Text>
        {docRail(' ')}
      </Box>
    )
  }

  // The line between the two parts carries the thumb of the part on its left.
  if (frame.isTreeRight) {
    return (
      <Box flexDirection="row" width={frame.columns} height={frame.rows} overflow="hidden">
        <Text> </Text>
        {reader(el, props)}
        <Text>{'  '}</Text>
        {docRail('│')}
        {tree(el, props)}
        {treeRail(' ')}
      </Box>
    )
  }

  return (
    <Box flexDirection="row" width={frame.columns} height={frame.rows} overflow="hidden">
      {tree(el, props)}
      {treeRail('│')}
      <Text>{'  '}</Text>
      {reader(el, props)}
      <Text> </Text>
      {docRail(' ')}
    </Box>
  )
}
