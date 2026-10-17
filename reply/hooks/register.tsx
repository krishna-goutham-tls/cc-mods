// reply: highlight part of Claude's answer, click Reply, and the text goes into the
// prompt as a quote with room under it for your words. Terminal only.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Picked } from '../types'
import { fillFor, isWorthQuoting, previewOf } from './quote'

/** How often the mod looks for a new highlight. The engine raises no event for one. */
const POLL_MS = 250
const REPLY = 'Reply'
const DISMISS = 'Dismiss'

const picked = atom({ plugin: 'reply', key: 'picked' } as const, null as Picked)
const done = atom({ plugin: 'reply', key: 'done' } as const, '')

/** Reads the highlight and keeps it in state, so the band shows or hides. */
const look = async ($: EngineInterface): Promise<void> => {
  const selected = await $.ui.selection().catch(() => undefined)
  const text = selected !== undefined && isWorthQuoting(selected.text) ? selected.text : ''
  const now = await read($, picked)

  if ((now?.text ?? '') === text) {
    return
  }

  await update($, picked, (): Picked => (text === '' ? null : { text }))

  if (text === '') {
    await update($, done, () => '')
  }
}

/** Puts the highlight in the prompt as a quote. */
const reply = async ($: EngineInterface): Promise<void> => {
  const selected = await $.ui.selection().catch(() => undefined)
  const text = selected !== undefined && isWorthQuoting(selected.text) ? selected.text : ((await read($, picked))?.text ?? '')

  if (text === '') {
    return
  }

  const box = await $.prompt.read().catch(() => ({ text: '', cursor: 0 }))
  const filled = await $.prompt.fill(fillFor(box.text, text))

  if (filled.isFilled) {
    await update($, done, () => text)
  } else {
    $.ui.toast('The prompt cannot take the quote now. Close the dialog and press Reply again.')
  }
}

/** Hides the band until the next highlight, for a highlight made only to copy. */
const dismiss = async ($: EngineInterface): Promise<void> => {
  const now = await read($, picked)

  if (now !== null) {
    await update($, done, () => now.text)
  }
}

export const register: Register = on => {
  let isLooking = false

  on('session.start', async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    $.clock.every(POLL_MS, () => {
      if (isLooking) {
        return
      }

      isLooking = true
      void look($)
        .catch(() => undefined)
        .finally(() => {
          isLooking = false
        })
    })

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return next(e)
    }

    const now = await read($, picked)

    if (now === null || now.text === (await read($, done))) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const { words, lines } = previewOf(now.text)
    const count = lines > 1 ? ` · ${lines} lines` : ''
    // "↳ Reply to " before the words; after them the count, two cells, "[ Reply ] [ Dismiss ]", two cells of gap.
    const room = Math.max(8, e.props.bodyColumns - 11 - count.length - 2 - (REPLY.length + 4) - 1 - (DISMISS.length + 4) - 2)
    const shown = words.length > room ? `${words.slice(0, room - 1).replace(/\s+$/, '')}…` : words

    return (
      <Box flexDirection="row" width={e.props.bodyColumns}>
        <Text color="claude">↳ </Text>
        <Text color="inactive">Reply to </Text>
        <Text color="text">“{shown}”</Text>
        <Text color="inactive">{count}  </Text>
        <Button key="reply" label={REPLY} variant="primary" onPress={() => void reply($).catch(() => undefined)} />
        <Text> </Text>
        <Button key="dismiss" label={DISMISS} role="dismiss" dimColor onPress={() => void dismiss($).catch(() => undefined)} />
      </Box>
    )
  })
}
