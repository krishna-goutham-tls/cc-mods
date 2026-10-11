import type { TintActive, TintLook, TintMode } from '../types'

// The colors no theme key holds. Every other color comes from the theme files.
// `replyBg` is absent where the reply has no fill.
export const PALETTE: Record<TintLook, Record<TintMode, { userFg: string; replyBg?: string }>> = {
  warm: {
    dark: { userFg: '#f2e8e1', replyBg: '#1f1f1f' },
    light: { userFg: '#2e1d14', replyBg: '#ffffff' },
  },
  grok: {
    dark: { userFg: '#ffffff' },
    light: { userFg: '#111111' },
  },
}

/** The one theme the mod rewrites. Its file is `themes/tint.json` in Claude Code's config folder. */
export const LIVE = 'custom:tint'

// The four files in `themes/` as Claude Code lists them while the mod is loaded. The mod draws for
// these names and never writes for them. They are a person's way to hold one look and one mode, and
// a test session forces one of them so that it cannot write the real theme file.
const FIXED: Record<string, NonNullable<TintActive>> = {
  'custom:tint:tint-warm-dark': { look: 'warm', mode: 'dark' },
  'custom:tint:tint-warm-light': { look: 'warm', mode: 'light' },
  'custom:tint:tint-grok-dark': { look: 'grok', mode: 'dark' },
  'custom:tint:tint-grok-light': { look: 'grok', mode: 'light' },
}

export const fixedOf = (theme: unknown): TintActive => (typeof theme === 'string' ? (FIXED[theme] ?? null) : null)

/** Reads the look file, `tint/active`. The status line reads it the same way: anything but grok is warm. */
export const lookOf = (text: string | undefined): TintLook => (text?.trim() === 'grok' ? 'grok' : 'warm')

/** The text of `tint.json` for one of the four source files in `themes/`. */
export const liveText = (source: string): string => `${JSON.stringify({ ...(JSON.parse(source) as object), name: 'Tint (auto)' }, null, 2)}\n`

/** Which mode a theme file holds, by its `base`. */
export const modeOf = (text: string | undefined): TintMode | undefined => {
  try {
    const base = (JSON.parse(text ?? '') as { base?: unknown }).base

    return base === 'dark' || base === 'light' ? base : undefined
  } catch {
    return undefined
  }
}
