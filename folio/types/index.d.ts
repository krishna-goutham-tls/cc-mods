export type FolioMode = 'read' | 'source'

/** What the pane shows: the open folders, the open file and where each list stands. */
export type FolioUi = {
  expanded: string[]
  selected: string
  mode: FolioMode
  docTop: number
  treeTop: number
  /** Files that can hold secrets and that the person asked to see. */
  revealed: string[]
  /** Goes up when files change on disk, so the pane reads them again. */
  tick: number
  /** Where the tree stands in the pane. */
  side: 'left' | 'right'
  isRestored: boolean
}

/** Paths Claude wrote in this session, relative to the project. */
export type FolioTouched = string[]

declare module 'claude-code' {
  interface PluginState {
    folio: { ui: FolioUi; touched: FolioTouched }
  }
}
