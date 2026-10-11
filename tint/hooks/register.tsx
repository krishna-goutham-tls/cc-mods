// tint: your message and Claude's reply as blocks, in two looks, warm and grok,
// and the small rows around them on the same left edge. The mod draws while the
// theme is "Tint (auto)" (`custom:tint`) or one of the fixed tint themes. For "Tint (auto)" it
// keeps the theme file in step with the look and with macOS dark and light.
import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TintActive, TintLook, TintMode } from '../types'
import { LIVE, PALETTE, fixedOf, liveText, lookOf, modeOf } from './palette'

/** How often the mod reads the theme, the look file and the macOS mode. */
const POLL_MS = 5000

/** After a write, how long the mod leaves a theme file another writer changed, while its own look and mode stay the same. */
const QUIET_MS = 60000

/** The column where the text of every row starts. */
const EDGE = 2

/** The look and the mode of this session's last write of the theme file, and when. */
type Wrote = { last?: { look: TintLook; mode: TintMode; at: number } }

const active = atom({ plugin: 'tint', key: 'active' } as const, null)

const themeNow = async ($: EngineInterface): Promise<unknown> => (await $.config.list()).find(row => row.key === 'theme')?.value

/** The macOS mode, or undefined when the answer is not clear. */
const modeNow = async ($: EngineInterface): Promise<TintMode | undefined> => {
  const run = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle']).catch(() => undefined)

  if (run === undefined) {
    return undefined
  }

  if (run.exitCode === 0) {
    return run.stdout.trim() === 'Dark' ? 'dark' : undefined
  }

  // In light mode the key is absent and `defaults` says so.
  return run.stderr.includes('does not exist') ? 'light' : undefined
}

const remember = async ($: EngineInterface, next: TintActive): Promise<void> => {
  const was = await read($, active)

  if (was?.look !== next?.look || was?.mode !== next?.mode) {
    await $.state.set({ plugin: 'tint', key: 'active' } as const, next)
  }
}

const textOf = ($: EngineInterface, path: string): Promise<string | undefined> =>
  $.fs
    .read(path)
    .then(text => (typeof text === 'string' ? text : undefined))
    .catch(() => undefined)

/** Claude Code's config folder: `CLAUDE_CONFIG_DIR` when it is set, `~/.claude` otherwise. */
const configDir = async ($: EngineInterface): Promise<string | undefined> => {
  const home = await $.env.get('HOME')

  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined ? undefined : `${home}/.claude`)
}

/**
 * Brings `tint.json` to the look and the macOS mode, and answers what it holds.
 * `look` is a look the person just asked for. Without it the look file decides.
 */
const settle = async ($: EngineInterface, wrote: Wrote, look?: TintLook): Promise<TintActive> => {
  // Claude Code reads themes from its config folder, so the mod writes there too.
  const dir = await configDir($)

  if (dir === undefined) {
    return null
  }

  const lookFile = `${dir}/tint/active`
  const themeFile = `${dir}/themes/tint.json`
  const asked = await modeNow($)

  // The look file is read after the slow call above, so a look another session just wrote is seen.
  const want = look ?? lookOf(await textOf($, lookFile))
  const held = await textOf($, themeFile)
  const mode = asked ?? modeOf(held) ?? 'dark'
  const text = liveText(await $.fs.read(`${$.plugin.root}/looks/tint-${want}-${mode}.json`))

  if (look !== undefined) {
    await $.fs.write(lookFile, `${look}\n`)
  }

  if (text !== held) {
    const now = await $.clock.now()
    const { last } = wrote

    // Another writer put the file back, and nothing changed here since this session wrote it.
    // A second write would start a loop between the two, so the file stays as it is for a while.
    if (look === undefined && last?.look === want && last.mode === mode && now - last.at < QUIET_MS) {
      return { look: want, mode }
    }

    // Claude Code reads the theme file when it changes. A rename puts the new file in place whole.
    const draft = `${dir}/tint/tint.json.${Math.random().toString(36).slice(2)}`

    await $.fs.write(draft, text)

    if ((await $.process.run(['mv', draft, themeFile])).exitCode !== 0) {
      throw new Error('tint: the theme file was not written')
    }

    wrote.last = { look: want, mode, at: now }
  }

  return { look: want, mode }
}

/**
 * Puts the two files a new install lacks in the config folder. A `tint.json`, so that /theme lists
 * "Tint (auto)". And a copy of the status line script, because the folder of an installed mod has its version
 * in the path, and `settings.json` needs a path that stays the same.
 */
const prepare = async ($: EngineInterface, wrote: Wrote): Promise<void> => {
  const dir = await configDir($)

  if (dir === undefined) {
    return
  }

  if ((await textOf($, `${dir}/themes/tint.json`)) === undefined) {
    await settle($, wrote)
  }

  const shipped = await textOf($, `${$.plugin.root}/statusline/statusline.sh`)

  if (shipped !== undefined && shipped !== (await textOf($, `${dir}/tint/statusline.sh`))) {
    await $.fs.write(`${dir}/tint/statusline.sh`, shipped)
  }
}

/**
 * A fixed name counts only while its file is in the mod's `themes/` folder. A name an older build
 * left in the settings has no theme behind it, so the mod draws nothing for it.
 */
const fixedNow = async ($: EngineInterface, theme: unknown): Promise<TintActive> => {
  const fixed = fixedOf(theme)

  if (fixed === null) {
    return null
  }

  return (await textOf($, `${$.plugin.root}/themes/tint-${fixed.look}-${fixed.mode}.json`)) === undefined ? null : fixed
}

/** Reads the theme and brings the mod, and for "Tint (auto)" the theme file, in step with it. */
const follow = async ($: EngineInterface, wrote: Wrote): Promise<void> => {
  const theme = await themeNow($)

  await remember($, theme === LIVE ? await settle($, wrote) : await fixedNow($, theme))
}

export const register: Register = on => {
  let isFollowing = false
  const wrote: Wrote = {}

  on('session.start', async ($, e, next) => {
    // A headless run draws no transcript, so it gets no command and no timer.
    if (e.surface !== 'terminal') {
      return next(e)
    }

    await $.command.register({ name: 'tint', description: 'Switch the look', argumentHint: '[warm|grok|next]' })
    await prepare($, wrote).catch(() => undefined)
    await follow($, wrote).catch(() => undefined)

    $.clock.every(POLL_MS, () => {
      if (isFollowing) {
        return
      }

      isFollowing = true
      void follow($, wrote)
        .catch(() => undefined)
        .finally(() => {
          isFollowing = false
        })
    })

    return next(e)
  })

  // A theme picked in /config shows at once, with no wait for the timer.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)

    await follow($, wrote).catch(() => undefined)

    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'tint' }, async ($, e) => {
    if ((await themeNow($)) !== LIVE) {
      return { text: 'pick Tint (auto) in /theme first' }
    }

    const asked = e.args.trim().toLowerCase()
    const now = await read($, active)
    const look = asked === '' || asked === 'next' ? (now?.look === 'warm' ? 'grok' : 'warm') : asked

    if (look !== 'warm' && look !== 'grok') {
      return { text: 'warm, grok or next' }
    }

    const next = await settle($, wrote, look)

    await remember($, next)

    return { text: next === null ? 'off' : `${next.look} ${next.mode}` }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const tint = await read($, active)

    if (tint === null || e.surface !== 'terminal' || e.props.isExpanded || e.props.origin.kind !== 'composer') {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box marginTop={1} paddingX={2} paddingY={1} width="100%" backgroundColor="userMessageBackground">
        <Text color={PALETTE[tint.look][tint.mode].userFg}>{e.props.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const tint = await read($, active)

    if (tint === null || e.surface !== 'terminal' || e.props.text === '') {
      return next(e)
    }

    const { Box, Markdown, Text } = $.ui.resolve(e)
    const fill = PALETTE[tint.look][tint.mode].replyBg
    const padY = fill === undefined ? 0 : 1

    // A tree of the mod's own loses the engine's summary mark, so it is drawn here.
    return (
      <Box flexDirection="column" marginTop={e.props.isFirstOfReply ? 1 : 0} paddingX={2} paddingY={padY} width="100%" backgroundColor={fill}>
        <Markdown text={e.props.text} />
        {e.props.isSummary ? <Text dimColor>· summary</Text> : null}
      </Box>
    )
  })

  // What a slash command printed: dim, on the text edge. An error line keeps the engine's color.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if ((await read($, active)) === null || e.surface !== 'terminal' || e.props.isErrored || e.props.text === '') {
      return next(e)
    }

    const { Box, Markdown } = $.ui.resolve(e)

    return (
      <Box paddingX={EDGE} width="100%">
        <Markdown text={e.props.text} dimColor />
      </Box>
    )
  })

  // The two rows below keep the engine's own drawing, moved right so they start on the text edge.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if ((await read($, active)) === null || e.surface !== 'terminal') {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box paddingLeft={EDGE}>{await next(e)}</Box>
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if ((await read($, active)) === null || e.surface !== 'terminal') {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box paddingLeft={EDGE}>{await next(e)}</Box>
  })
}
