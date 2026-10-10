import type { Kind } from './files'
import type { Row } from './text'

/** One row of the file tree. */
export type Node = {
  rel: string
  name: string
  depth: number
  isDir: boolean
  isOpen: boolean
  /** A stand-in row under an open folder that holds nothing. */
  isEmpty: boolean
}

/** A picture the terminal reads from disk itself. */
export type Picture = { file: string; columns: number; rows: number; generation: number; alt: string }

/** A file as the reader shows it. */
export type Doc = {
  path: string
  kind: Kind
  rows: Row[]
  /** The words of the footer: kind, length, size, age. */
  meta: string[]
  /** True when the file has a formatted form and a source form. */
  canToggle: boolean
  /** True for a short notice, drawn in the middle of the reader. */
  isCard: boolean
  /** True while the file's text is held back. */
  isLocked: boolean
  picture?: Picture
}

/** The pane's measures for one drawing, in cells. */
export type Frame = {
  columns: number
  rows: number
  isSplit: boolean
  /** True when the tree is at the pane's right edge, the document beside the chat. */
  isTreeRight: boolean
  treeWidth: number
  /** Cells across the document's text. */
  textWidth: number
  treeRows: number
  docRows: number
}
