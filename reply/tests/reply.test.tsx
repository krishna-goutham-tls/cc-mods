import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { fillFor, quoteOf } from '../hooks/quote'

const START = { cwd: '/project', surface: 'terminal', isInteractive: true } as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} } as const
const VIEW = { columns: 105, rows: 40, isFullscreen: true } as const
const ANSWER = 'Store jobs in memory first.\nMove them to SQLite once the shop has a second front desk.'

/** The highlight, the prompt box and the clock, in memory. */
const world = (on: On) => {
  const screen = { selection: undefined as string | undefined, draft: '', fills: [] as Array<{ text: string; mode: string }> }
  const clock = mock.clock(on)

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  // What the engine draws in the band when no mod draws there.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>stock</Text>
  })
  on('ui.selection', () => ({ value: screen.selection === undefined ? undefined : { text: screen.selection } }))
  on('prompt.read', () => ({ value: { text: screen.draft, cursor: screen.draft.length } }))
  on('prompt.fill', ($, e) => {
    const mode = e.mode ?? 'replace'

    screen.fills.push({ text: e.text, mode })
    screen.draft = mode === 'append' ? screen.draft + e.text : e.text

    return { isFilled: true }
  })

  return { screen, clock }
}

const band = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'reply', surface, component: 'AbovePrompt', requestId: 'AbovePrompt', props: BAND, viewport: VIEW })

describe('the quote', () => {
  test('each line gets a mark, and a blank line keeps one', () => {
    expect(quoteOf('one\n\ntwo  ')).toBe('> one\n>\n> two')
  })

  test('blank lines at the ends are dropped', () => {
    expect(quoteOf('\n\n  one\n\n')).toBe('>   one')
  })

  test('an empty box takes the quote and room under it', () => {
    expect(fillFor('', 'one')).toEqual({ text: '> one\n\n', mode: 'replace' })
  })

  test('a draft stays, and the quote goes after a blank line', () => {
    expect(fillFor('my note', 'one')).toEqual({ text: '\n\n> one\n\n', mode: 'append' })
    expect(fillFor('my note\n\n', 'one')).toEqual({ text: '> one\n\n', mode: 'append' })
  })
})

test('with nothing highlighted the band stays empty', async ($, on) => {
  const { clock } = world(on)

  await $.session.start(START)
  await clock.advance(1000)

  const ui = await band($)

  expect(await ui.find({ key: 'reply' })).toBeUndefined()
})

test('a highlight shows the band, and a press quotes it into the prompt', async ($, on) => {
  const { screen, clock } = world(on)

  await $.session.start(START)
  screen.selection = ANSWER
  await clock.advance(300)

  const ui = await band($)

  expect(await ui.find({ key: 'reply' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Store jobs in memory first/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 lines/ })).toBeDefined()

  await ui.press({ key: 'reply' })
  await clock.advance(0)

  expect(screen.fills).toEqual([{ text: '> Store jobs in memory first.\n> Move them to SQLite once the shop has a second front desk.\n\n', mode: 'replace' }])
  expect(await ui.find({ key: 'reply' })).toBeUndefined()
})

test('a second highlight stacks under the first reply', async ($, on) => {
  const { screen, clock } = world(on)

  await $.session.start(START)
  screen.selection = 'first part'
  await clock.advance(300)

  const ui = await band($)

  await ui.press({ key: 'reply' })
  screen.draft += 'why?'
  screen.selection = 'second part'
  await clock.advance(300)
  await ui.press({ key: 'reply' })

  expect(screen.draft).toBe('> first part\n\nwhy?\n\n> second part\n\n')
})

test('Dismiss hides the band and leaves the prompt alone', async ($, on) => {
  const { screen, clock } = world(on)

  await $.session.start(START)
  screen.selection = ANSWER
  await clock.advance(300)

  const ui = await band($)

  await ui.press({ key: 'dismiss' })
  await clock.advance(300)

  expect(screen.fills).toEqual([])
  expect(await ui.find({ key: 'reply' })).toBeUndefined()
  expect(await ui.find({ key: 'dismiss' })).toBeUndefined()
})

test('a new highlight after Dismiss shows the band again', async ($, on) => {
  const { screen, clock } = world(on)

  await $.session.start(START)
  screen.selection = 'first part'
  await clock.advance(300)

  const ui = await band($)

  await ui.press({ key: 'dismiss' })
  screen.selection = 'second part'
  await clock.advance(300)

  expect(await ui.find({ type: 'Text', text: /second part/ })).toBeDefined()

  await ui.press({ key: 'reply' })

  expect(screen.draft).toBe('> second part\n\n')
})

test('a highlight that is cleared hides the band', async ($, on) => {
  const { screen, clock } = world(on)

  await $.session.start(START)
  screen.selection = ANSWER
  await clock.advance(300)
  screen.selection = undefined
  await clock.advance(300)

  const ui = await band($)

  expect(await ui.find({ key: 'reply' })).toBeUndefined()
})

test('the Desktop app gets nothing from the mod', async ($, on) => {
  const { screen, clock } = world(on)

  await $.session.start({ ...START, surface: 'desktop' })
  screen.selection = ANSWER
  await clock.advance(1000)

  const ui = await band($, 'desktop')

  expect(await ui.find({ key: 'reply' })).toBeUndefined()
})
