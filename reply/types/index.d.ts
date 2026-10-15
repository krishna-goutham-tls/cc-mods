/** The text the person last highlighted with the mouse, as a copy would take it. */
export type Picked = { text: string } | null

declare module 'claude-code' {
  interface PluginState {
    reply: {
      picked: Picked
      /** The last text put in the prompt, so the band hides once it is used. */
      used: string
    }
  }
}
