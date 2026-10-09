// What a file is, by its name: how the pane shows it, and the words for its
// size and age.

export type Kind = 'markdown' | 'table' | 'code' | 'image' | 'look' | 'binary'

const MARKDOWN = new Set(['md', 'mdx', 'markdown'])
const TABLE = new Set(['csv', 'tsv'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'ico', 'avif'])
/** Files macOS Quick Look can draw a first page of. */
const LOOK = new Set(['pdf', 'svg', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'key', 'pages', 'numbers', 'mp4', 'mov', 'm4v', 'psd', 'ai', 'eps'])
const BINARY = new Set([
  'zip', 'gz', 'tar', 'tgz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'pkg', 'exe', 'dll', 'so', 'dylib', 'o', 'a', 'class', 'jar', 'wasm',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'wav', 'm4a', 'flac', 'ogg', 'sqlite', 'db', 'bundle', 'bin', 'icns', 'lockb', 'pyc', 'node',
])

/** Folders and files that are noise in a project tree. */
const HIDDEN = new Set(['.git', '.DS_Store', 'node_modules', '__pycache__', '.Trash', 'Thumbs.db'])

const SECRET = [/^\.env(\..+)?$/i, /\.(pem|key|p12|pfx|keystore|jks)$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i, /^\.(npmrc|netrc|pgpass)$/i, /(^|[._-])(secret|secrets|credential|credentials)([._-]|$)/i, /^auth\.json$/i, /recovery[_-]?codes/i]

const LABELS: Record<string, string> = {
  md: 'Markdown', mdx: 'MDX', ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  json: 'JSON', jsonl: 'JSON lines', yml: 'YAML', yaml: 'YAML', toml: 'TOML', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust',
  sh: 'Shell', zsh: 'Shell', bash: 'Shell', css: 'CSS', scss: 'SCSS', html: 'HTML', xml: 'XML', sql: 'SQL', txt: 'Text', log: 'Log',
  csv: 'CSV', tsv: 'TSV', pdf: 'PDF', svg: 'SVG', png: 'PNG image', jpg: 'JPEG image', jpeg: 'JPEG image', gif: 'GIF image',
  webp: 'WebP image', heic: 'HEIC image', docx: 'Word document', xlsx: 'Excel workbook', pptx: 'PowerPoint deck', mp4: 'Video',
  mov: 'Video', zip: 'Zip archive', swift: 'Swift', kt: 'Kotlin', java: 'Java', c: 'C', h: 'C header', cpp: 'C++', lock: 'Lock file',
}

export const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.')

  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

export const dirOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

export const kindOf = (name: string): Kind => {
  const ext = extOf(name)

  if (MARKDOWN.has(ext)) {
    return 'markdown'
  }

  if (TABLE.has(ext)) {
    return 'table'
  }

  if (IMAGE.has(ext)) {
    return 'image'
  }

  if (LOOK.has(ext)) {
    return 'look'
  }

  return BINARY.has(ext) ? 'binary' : 'code'
}

export const labelOf = (name: string): string => {
  const ext = extOf(name)

  return LABELS[ext] ?? (ext === '' ? 'File' : ext.toUpperCase())
}

export const isHidden = (name: string): boolean => HIDDEN.has(name)

/** A file whose text should not show on a shared screen until the person asks. */
export const isSecret = (name: string): boolean => SECRET.some(pattern => pattern.test(name))

export const sizeText = (bytes: number): string => {
  if (bytes < 1000) {
    return `${bytes} B`
  }

  if (bytes < 1_000_000) {
    return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`
  }

  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export const ageText = (mtimeMs: number, now: number): string => {
  const minutes = Math.floor((now - mtimeMs) / 60_000)

  if (minutes < 1) {
    return 'just now'
  }

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  if (minutes < 60 * 24) {
    return `${Math.floor(minutes / 60)}h ago`
  }

  if (minutes < 60 * 24 * 7) {
    return `${Math.floor(minutes / (60 * 24))}d ago`
  }

  const date = new Date(mtimeMs)
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`

  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}${year}`
}

/** Comma or tab separated text to rows of cells. */
export const parseTable = (text: string, separator: string, limit: number): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let isQuoted = false

  for (let i = 0; i < text.length && rows.length < limit; i += 1) {
    const ch = text[i] ?? ''

    if (isQuoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        isQuoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      isQuoted = true
    } else if (ch === separator) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1
      }

      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  if ((cell !== '' || row.length > 0) && rows.length < limit) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter(cells => cells.some(value => value.trim() !== ''))
}

/** True when the file has a formatted form and a source form to switch between. */
export const hasTwoForms = (name: string): boolean => {
  const kind = kindOf(name)

  return kind === 'markdown' || kind === 'table' || extOf(name) === 'svg'
}
