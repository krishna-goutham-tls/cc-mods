// The few colors the pane uses. Each is a theme key, so the pane follows the
// person's light or dark theme.
export const C = {
  /** Body text. Named, so it follows the theme and not the terminal's own text color. */
  text: 'text',
  /** The one accent: the open file's mark, inline code, the active mode. */
  accent: 'suggestion',
  /** Inline code and paths in a document. */
  code: 'professionalBlue',
  /** Secondary text: markers, meta, breadcrumbs. */
  muted: 'inactive',
  /** Rules and guides. */
  faint: 'subtle',
  /** The soft fill under a hovered or open row. */
  fill: 'userMessageBackground',
  /** A file Claude wrote in this session. */
  touched: 'claude',
  done: 'success',
} as const
