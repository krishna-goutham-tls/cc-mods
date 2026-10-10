export type TintLook = 'warm' | 'grok'
export type TintMode = 'dark' | 'light'

/** The tint theme that is active, or null while the person uses another theme. */
export type TintActive = { look: TintLook; mode: TintMode } | null

declare module 'claude-code' {
  interface PluginState {
    tint: { active: TintActive }
  }
}
