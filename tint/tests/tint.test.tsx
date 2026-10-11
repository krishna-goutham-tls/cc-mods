import { expect, mock, test } from 'claude-code/testing'
import type { ConfigRow, On, ProcessRunResult } from 'claude-code'

const ASK = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as const
const START = { cwd: '/project', surface: 'terminal', isInteractive: true } as const
const VIEW = { columns: 100, rows: 40, isFullscreen: true } as const
const PROMPT = { text: 'Read server.js', origin: { kind: 'composer' }, isExpanded: false } as const
const REPLY = { text: '# Title\n\nSome `code`.', isFirstOfReply: true } as const
const OUTPUT = { command: 'cost', args: '', text: 'Total cost: **$0.10**', isErrored: false } as const
const SPINNER = { word: 'Baking', message: null, suffix: '…', mode: 'thinking' } as const
const DURATION = { word: 'Baked', durationMs: 3000 } as const

const LOOK_FILE = '/home/.claude/tint/active'
const THEME_FILE = '/home/.claude/themes/tint.json'
const SCRIPT_FILE = '/home/.claude/tint/statusline.sh'
const DONE = { stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

/** One of the four source files the mod ships, cut down to what a test reads. */
const source = (look: string, mode: string): string => JSON.stringify({ name: `Tint ${look} ${mode} (fixed)`, base: mode, overrides: { claude: look } })

/** What `tint.json` must hold for a look and a mode. */
const live = (look: string, mode: string): string => `${JSON.stringify({ name: 'Tint (auto)', base: mode, overrides: { claude: look } }, null, 2)}\n`

/** The settings, the disk, macOS and the engine's own drawing, in memory. */
const world = (on: On, theme: string, isDark: boolean, files: Record<string, string> = {}, env: Record<string, string> = { HOME: '/home' }) => {
  const mac = { theme, isDark, hasDefaults: true, script: undefined as string | undefined, files: { ...files }, writes: [] as string[] }
  const clock = mock.clock(on)

  mock.env(on, env)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('config.list', (): { value: ConfigRow[] } => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: mac.theme, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }))
  on('config.set', ($, e) => {
    mac.theme = String(e.value)

    return { value: e.value }
  })
  on('fs.read', ($, e) => {
    const shipped = /\/themes\/tint-(warm|grok)-(dark|light)\.json$/.exec(e.path)
    // The script the mod ships is under the mod's own folder. The copy is under `tint/` in the config folder.
    const own = e.path.endsWith('/statusline/statusline.sh') ? mac.script : mac.files[e.path]
    const text = shipped === null ? own : source(shipped[1] ?? '', shipped[2] ?? '')

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('fs.write', ($, e) => {
    mac.files[e.path] = e.text
    mac.writes.push(e.path)

    return { value: undefined }
  })
  on('process.run', ($, e): { value: ProcessRunResult } => {
    const [command, from, to] = e.argv

    if (command === 'mv' && from !== undefined && to !== undefined) {
      mac.files[to] = mac.files[from] ?? ''
      delete mac.files[from]
      mac.writes.push(to)

      return { value: { exitCode: 0, ...DONE } }
    }

    // Linux and Windows have no `defaults` command.
    if (!mac.hasDefaults) {
      throw new Error('ENOENT')
    }

    return {
      value: mac.isDark
        ? { exitCode: 0, ...DONE, stdout: 'Dark\n' }
        : { exitCode: 1, ...DONE, stderr: 'The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist\n' },
    }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>stock</Text>
  })

  return { mac, clock }
}

const WARM_DARK = { [LOOK_FILE]: 'warm\n', [THEME_FILE]: live('warm', 'dark') }

test('the prompt of the person is a filled block', async ($, on) => {
  world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: PROMPT, viewport: VIEW })
  const block = await ui.find({ type: 'Box' })

  expect(block?.props).toMatchObject({ backgroundColor: 'userMessageBackground', paddingX: 2, paddingY: 1 })
  expect((await ui.find({ type: 'Text', text: 'Read server.js' }))?.props['color']).toBe('#f2e8e1')
})

test('a user row that is not the prompt of the person keeps the stock drawing', async ($, on) => {
  world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  for (const kind of ['task-notification', 'peer', 'sdk'] as const) {
    const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: { ...PROMPT, origin: { kind } }, viewport: VIEW })

    expect(await ui.find({ type: 'Box' })).toBeUndefined()
    expect(await ui.find({ text: 'stock' })).toBeDefined()
    await ui.unmount()
  }
})

test('an expanded prompt keeps the stock drawing', async ($, on) => {
  world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: { ...PROMPT, isExpanded: true }, viewport: VIEW })

  expect(await ui.find({ type: 'Box' })).toBeUndefined()
  expect(await ui.find({ text: 'stock' })).toBeDefined()
})

test('a warm reply has a fill and a grok reply has none', async ($, on) => {
  world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'AssistantMessage', props: REPLY, viewport: VIEW })

  expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ backgroundColor: '#1f1f1f', paddingX: 2, paddingY: 1 })
  expect((await ui.find({ type: 'Markdown' }))?.props['text']).toBe(REPLY.text)

  await $.command.run({ command: 'tint', args: 'grok', ...ASK })

  const box = (await ui.find({ type: 'Box' }))?.props ?? {}

  expect(box['backgroundColor']).toBeUndefined()
  expect(box).toMatchObject({ paddingX: 2, paddingY: 0 })
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
})

test('a summary keeps its mark', async ($, on) => {
  world(on, 'custom:tint:tint-grok-light', false)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'AssistantMessage', props: { ...REPLY, isSummary: true }, viewport: VIEW })

  expect(await ui.find({ type: 'Text', text: /summary/ })).toBeDefined()
})

test('what a command printed is dim on the text edge, and an error line keeps the stock drawing', async ($, on) => {
  world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'CommandOutput', props: OUTPUT, viewport: VIEW })

  expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ paddingX: 2 })
  expect((await ui.find({ type: 'Markdown' }))?.props).toMatchObject({ text: OUTPUT.text, dimColor: true })
  await ui.unmount()

  const failed = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'CommandOutput', props: { ...OUTPUT, isErrored: true }, viewport: VIEW })

  expect(await failed.find({ type: 'Box' })).toBeUndefined()
  expect(await failed.find({ text: 'stock' })).toBeDefined()
})

test('the spinner and the turn end line keep the stock drawing, moved to the text edge', async ($, on) => {
  world(on, 'custom:tint:tint-grok-light', false)
  await $.session.start(START)

  const spinner = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'Spinner', props: SPINNER, viewport: VIEW })
  const duration = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'TurnDuration', props: DURATION, viewport: VIEW })

  for (const ui of [spinner, duration]) {
    expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ paddingLeft: 2 })
    expect(await ui.find({ text: 'stock' })).toBeDefined()
  }
})

test('/tint with no argument and /tint next write the look file and the theme file', async ($, on) => {
  const { mac } = world(on, 'custom:tint', false, { [LOOK_FILE]: 'warm\n', [THEME_FILE]: live('warm', 'light') })
  await $.session.start(START)
  expect(mac.writes).toEqual([])

  expect((await $.command.run({ command: 'tint', args: '', ...ASK })).text).toBe('grok light')
  expect(mac.files[LOOK_FILE]).toBe('grok\n')
  expect(mac.files[THEME_FILE]).toBe(live('grok', 'light'))

  expect((await $.command.run({ command: 'tint', args: '', ...ASK })).text).toBe('warm light')
  expect(mac.files[LOOK_FILE]).toBe('warm\n')
  expect(mac.files[THEME_FILE]).toBe(live('warm', 'light'))

  expect((await $.command.run({ command: 'tint', args: 'next', ...ASK })).text).toBe('grok light')
  expect(mac.files[LOOK_FILE]).toBe('grok\n')
  expect(mac.files[THEME_FILE]).toBe(live('grok', 'light'))

  expect((await $.command.run({ command: 'tint', args: 'next', ...ASK })).text).toBe('warm light')
  expect(mac.files[LOOK_FILE]).toBe('warm\n')
  expect(mac.files[THEME_FILE]).toBe(live('warm', 'light'))

  expect((await $.command.run({ command: 'tint', args: 'blue', ...ASK })).text).toBe('warm, grok or next')
  expect(mac.files[THEME_FILE]).toBe(live('warm', 'light'))
  expect(Object.keys(mac.files).sort()).toEqual([LOOK_FILE, THEME_FILE].sort())
  expect(mac.theme).toBe('custom:tint')
})

test('the poll rewrites the theme file when macOS changes mode, and the blocks follow', async ($, on) => {
  const { mac, clock } = world(on, 'custom:tint', true, { [LOOK_FILE]: 'grok\n', [THEME_FILE]: live('grok', 'dark') })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: PROMPT, viewport: VIEW })

  expect((await ui.find({ type: 'Text' }))?.props['color']).toBe('#ffffff')

  mac.isDark = false
  await clock.advance(5000)
  expect(mac.files[THEME_FILE]).toBe(live('grok', 'light'))
  expect((await ui.find({ type: 'Text' }))?.props['color']).toBe('#111111')
  expect(mac.files[LOOK_FILE]).toBe('grok\n')
})

test('the poll writes nothing when nothing changed', async ($, on) => {
  const { mac, clock } = world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)
  await clock.advance(30000)

  expect(mac.writes).toEqual([])
})

test('two sessions that disagree on the mode write once each and then leave the file alone', async ($, on) => {
  const { mac, clock } = world(on, 'custom:tint', true, { [LOOK_FILE]: 'warm\n', [THEME_FILE]: live('warm', 'light') })
  const written = (): number => mac.writes.filter(path => path === THEME_FILE).length

  await $.session.start(START)
  expect(mac.files[THEME_FILE]).toBe(live('warm', 'dark'))
  expect(written()).toBe(1)

  // The other session reads light from macOS and writes the file back.
  mac.files[THEME_FILE] = live('warm', 'light')
  await clock.advance(30000)
  expect(written()).toBe(1)
  expect(mac.files[THEME_FILE]).toBe(live('warm', 'light'))

  // A look this session has not written yet goes out at once.
  mac.files[LOOK_FILE] = 'grok\n'
  await clock.advance(5000)
  expect(written()).toBe(2)
  expect(mac.files[THEME_FILE]).toBe(live('grok', 'dark'))

  mac.files[THEME_FILE] = live('grok', 'light')
  await clock.advance(30000)
  expect(written()).toBe(2)

  // After the quiet time it writes once more, and no more than once.
  await clock.advance(60000)
  expect(written()).toBe(3)
  mac.files[THEME_FILE] = live('grok', 'light')
  await clock.advance(25000)
  expect(written()).toBe(3)
})

test('the two files are in the config folder Claude Code was started with', async ($, on) => {
  const { mac } = world(on, 'custom:tint', true, { '/config/tint/active': 'grok\n' }, { HOME: '/home', CLAUDE_CONFIG_DIR: '/config' })
  await $.session.start(START)

  expect(mac.files['/config/themes/tint.json']).toBe(live('grok', 'dark'))
  expect(Object.keys(mac.files).sort()).toEqual(['/config/themes/tint.json', '/config/tint/active'])
})

test('a session that starts with a stale or missing theme file writes it', async ($, on) => {
  const { mac } = world(on, 'custom:tint', false, { [LOOK_FILE]: 'grok\n' })
  await $.session.start(START)

  expect(mac.files[THEME_FILE]).toBe(live('grok', 'light'))
  expect(mac.writes.filter(path => path === LOOK_FILE)).toEqual([])
})

test('a new install gets a theme file to pick in /theme, whatever theme is active', async ($, on) => {
  const { mac } = world(on, 'dark', true)
  await $.session.start(START)

  expect(mac.files[THEME_FILE]).toBe(live('warm', 'dark'))
  expect(Object.keys(mac.files)).toEqual([THEME_FILE])
})

test('the status line script is copied to the config folder, and only when it differs', async ($, on) => {
  const { mac, clock } = world(on, 'dark', true, WARM_DARK)
  mac.script = '#!/bin/bash\n'
  await $.session.start(START)
  await clock.advance(20000)

  expect(mac.files[SCRIPT_FILE]).toBe('#!/bin/bash\n')
  expect(mac.writes).toEqual([SCRIPT_FILE])
})

test('a status line script that is already in place is not written again', async ($, on) => {
  const { mac } = world(on, 'dark', true, { ...WARM_DARK, [SCRIPT_FILE]: '#!/bin/bash\n' })
  mac.script = '#!/bin/bash\n'
  await $.session.start(START)

  expect(mac.writes).toEqual([])
})

test('with no answer about the mode the theme file keeps its mode, and a new one is dark', async ($, on) => {
  const { mac, clock } = world(on, 'custom:tint', false, { [LOOK_FILE]: 'warm\n', [THEME_FILE]: live('warm', 'light') })
  mac.hasDefaults = false
  await $.session.start(START)
  await clock.advance(20000)
  expect(mac.writes).toEqual([])

  expect((await $.command.run({ command: 'tint', args: 'grok', ...ASK })).text).toBe('grok light')
  expect(mac.files[THEME_FILE]).toBe(live('grok', 'light'))

  delete mac.files[THEME_FILE]
  await clock.advance(5000)
  expect(mac.files[THEME_FILE]).toBe(live('grok', 'dark'))
})

test('a look another session picked is drawn here with no write', async ($, on) => {
  const { mac, clock } = world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'AssistantMessage', props: REPLY, viewport: VIEW })

  expect((await ui.find({ type: 'Box' }))?.props['backgroundColor']).toBe('#1f1f1f')

  // The other session wrote both files.
  mac.files[LOOK_FILE] = 'grok\n'
  mac.files[THEME_FILE] = live('grok', 'dark')
  await clock.advance(5000)

  expect((await ui.find({ type: 'Box' }))?.props['backgroundColor']).toBeUndefined()
  expect(mac.writes).toEqual([])
})

test('one of the four fixed themes is drawn from its name and causes no write', async ($, on) => {
  const { mac, clock } = world(on, 'custom:tint:tint-grok-dark', false, WARM_DARK)
  await $.session.start(START)
  await clock.advance(20000)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: PROMPT, viewport: VIEW })

  expect((await ui.find({ type: 'Text' }))?.props['color']).toBe('#ffffff')
  expect((await $.command.run({ command: 'tint', args: 'next', ...ASK })).text).toBe('pick Tint (auto) in /theme first')
  expect(mac.writes).toEqual([])
  expect(mac.files).toEqual(WARM_DARK)
})

test('another theme leaves every row stock and causes no write', async ($, on) => {
  const { mac, clock } = world(on, 'dark', false, WARM_DARK)
  await $.session.start(START)
  await clock.advance(20000)

  const prompt = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: PROMPT, viewport: VIEW })
  const reply = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'AssistantMessage', props: REPLY, viewport: VIEW })

  expect(await prompt.find({ type: 'Box' })).toBeUndefined()
  expect(await prompt.find({ text: 'stock' })).toBeDefined()
  expect(await reply.find({ type: 'Markdown' })).toBeUndefined()
  expect(await reply.find({ text: 'stock' })).toBeDefined()

  const output = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'CommandOutput', props: OUTPUT, viewport: VIEW })
  const spinner = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'Spinner', props: SPINNER, viewport: VIEW })
  const duration = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'TurnDuration', props: DURATION, viewport: VIEW })

  for (const ui of [output, spinner, duration]) {
    expect(await ui.find({ type: 'Box' })).toBeUndefined()
    expect(await ui.find({ text: 'stock' })).toBeDefined()
  }

  expect((await $.command.run({ command: 'tint', args: 'grok', ...ASK })).text).toBe('pick Tint (auto) in /theme first')
  expect(mac.writes).toEqual([])
  expect(mac.files).toEqual(WARM_DARK)
})

test('a theme picked in the menu shows at once', async ($, on) => {
  world(on, 'custom:tint', true, WARM_DARK)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'tint', surface: 'terminal', component: 'UserMessage', props: PROMPT, viewport: VIEW })

  expect(await ui.find({ type: 'Box' })).toBeDefined()
  await $.config.set({ key: 'theme', value: 'dark', previous: 'custom:tint', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } })
  expect(await ui.find({ type: 'Box' })).toBeUndefined()
})
