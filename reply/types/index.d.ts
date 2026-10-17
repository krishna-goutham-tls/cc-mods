/** The text the person last highlighted with the mouse, as a copy would take it. */
export type Picked = { text: string } | null

declare module 'claude-code' {
  interface PluginState {
    reply: {
      picked: Picked
      /** The last highlight replied to or dismissed, so the band hides until the next one. */
      done: string
    }
  }
}
