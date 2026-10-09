import { expect, mock, test } from 'claude-code/testing'
import type { FsEntry, FsStat, On } from 'claude-code'

const ROOT = '/project'
const FILES: Record<string, string> = {
  'README.md': '# Harbor\n\nA **small** booking system.\n\nSee the [guide](docs/guide.md).\n',
  'docs/guide.md': '# Guide\n\nTen minutes.\n',
  'src/app.ts': 'export const a = 1\n',
  '.env': 'KEY=secret-value\n',
}
const PANE = { title: 'Files', isFocused: false, bodyColumns: 110, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const VIEW = { columns: 100, rows: 46, isFullscreen: true } as const
const ASK = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const

const relative = (path: string): string => (path === ROOT ? '' : path.slice(ROOT.length + 1))

/** A small project in memory, standing for the disk. */
const disk = (on: On): void => {
  mock.store(on)
  mock.clock(on)
  mock.env(on, { TMPDIR: '/tmp' })
  on('session.root', () => ({ value: ROOT }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.exists', ($, e) => ({ value: relative(e.path) in FILES }))
  on('fs.read', ($, e) => {
    const text = FILES[relative(e.path)]

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('fs.stat', ($, e): { value: FsStat } => {
    const path = relative(e.path)
    const text = FILES[path]

    if (text !== undefined) {
      return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink: false } }
    }

    if (path === '' || Object.keys(FILES).some(file => file.startsWith(`${path}/`))) {
      return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }
    }

    throw new Error('ENOENT')
  })
  on('fs.list', ($, e): { value: FsEntry[] } => {
    const dir = relative(e.path)
    const names = new Map<string, boolean>()

    for (const file of Object.keys(FILES)) {
      if (dir !== '' && !file.startsWith(`${dir}/`)) {
        continue
      }

      const rest = dir === '' ? file : file.slice(dir.length + 1)
      const name = rest.split('/')[0] ?? rest

      names.set(name, rest.includes('/'))
    }

    return { value: [...names].map(([name, isDir]) => ({ name, kind: isDir ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false })) }
  })
}

test('the command opens the pane on the README, tree beside it', async ($, on) => {
  disk(on)
  await $.command.run({ command: 'files', args: '', ...ASK })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'folio', surface, component: 'Pane', requestId: 'folio', props: PANE, viewport: VIEW })

    expect(await ui.find({ key: 'node:README.md' })).toBeDefined()
    expect(await ui.find({ key: 'node:docs' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Harbor/ })).toBeDefined()
    expect(await ui.find({ key: 'mode:source' })).toBeDefined()
    await ui.unmount()
  }
})

test('a press opens a folder, then a file in it', async ($, on) => {
  disk(on)
  await $.command.run({ command: 'files', args: '', ...ASK })

  const ui = await $.ui.mount({ plugin: 'folio', surface: 'terminal', component: 'Pane', requestId: 'folio', props: PANE, viewport: VIEW })

  expect(await ui.find({ key: 'node:docs/guide.md' })).toBeUndefined()
  await ui.press({ key: 'node:docs' })
  expect(await ui.find({ key: 'node:docs/guide.md' })).toBeDefined()
  await ui.press({ key: 'node:docs/guide.md' })
  expect(await ui.find({ type: 'Text', text: /Ten minutes/ })).toBeDefined()
})

test('the source mode shows the file as written', async ($, on) => {
  disk(on)
  await $.command.run({ command: 'files', args: '', ...ASK })

  const ui = await $.ui.mount({ plugin: 'folio', surface: 'terminal', component: 'Pane', requestId: 'folio', props: PANE, viewport: VIEW })

  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'mode:source' })
  expect((await ui.find({ type: 'Code' }))?.props['source']).toContain('# Harbor')
})

test('a file that can hold secrets stays hidden until the person asks', async ($, on) => {
  disk(on)
  await $.command.run({ command: 'files', args: '.env', ...ASK })

  const ui = await $.ui.mount({ plugin: 'folio', surface: 'terminal', component: 'Pane', requestId: 'folio', props: PANE, viewport: VIEW })

  expect(await ui.find({ type: 'Text', text: /Kept off the screen/ })).toBeDefined()
  expect(await ui.find({ text: /secret-value/ })).toBeUndefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'act:reveal' })
  expect((await ui.find({ type: 'Code' }))?.props['source']).toContain('secret-value')
})

test('a narrow pane shows one part at a time', async ($, on) => {
  disk(on)
  await $.command.run({ command: 'files', args: '', ...ASK })

  const ui = await $.ui.mount({
    plugin: 'folio',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'folio',
    props: { ...PANE, bodyColumns: 60 },
    viewport: VIEW,
  })

  expect(await ui.find({ key: 'node:README.md' })).toBeUndefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'node:README.md' })).toBeDefined()
})

test('a path that is not in the project is refused in words', async ($, on) => {
  disk(on)

  const answer = await $.command.run({ command: 'files', args: 'nope.md', ...ASK })

  expect(answer.text).toContain('No file or folder at nope.md')
})
