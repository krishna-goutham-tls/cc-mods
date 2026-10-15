// The text work of the mod: no `$` here.

/** The most of a selection that goes into the prompt. */
export const MAX_QUOTE = 4000

/** A selection as the lines it covers, with blank lines at both ends and trailing spaces gone. */
const linesOf = (text: string): string[] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/\s+$/, ''))

  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines
}

/** True when a selection holds something worth a reply. */
export const isWorthQuoting = (text: string): boolean => linesOf(text).join('').trim() !== ''

/** The selection as a markdown quote: `> ` before each line, `>` alone on a blank one. */
export const quoteOf = (text: string): string => {
  const lines = linesOf(text)
  const all = lines.join('\n')
  const kept = all.length > MAX_QUOTE ? `${all.slice(0, MAX_QUOTE).replace(/\s+$/, '')} …` : all

  return kept
    .split('\n')
    .map(line => (line === '' ? '>' : `> ${line}`))
    .join('\n')
}

/**
 * What goes in the prompt box. An empty box takes the quote and a blank line.
 * A box with a draft keeps it and gets the quote after a blank line, so
 * several replies stack in one prompt.
 */
export const fillFor = (draft: string, text: string): { text: string; mode: 'replace' | 'append' } => {
  const quote = quoteOf(text)

  if (draft.trim() === '') {
    return { text: `${quote}\n\n`, mode: 'replace' }
  }

  const gap = draft.endsWith('\n\n') ? '' : draft.endsWith('\n') ? '\n' : '\n\n'

  return { text: `${gap}${quote}\n\n`, mode: 'append' }
}

/** One line for the band: the selection's words on one row, and how many lines it has. */
export const previewOf = (text: string): { words: string; lines: number } => {
  const lines = linesOf(text).filter(line => line.trim() !== '')

  return { words: lines.map(line => line.trim()).join(' '), lines: lines.length }
}
