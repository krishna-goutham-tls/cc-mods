import { describe, expect, test } from 'claude-code/testing'

import { fitColumns, inline, renderMarkdown } from '../hooks/markdown'
import { plain, spansWidth, truncateMiddle, width, wrapSpans } from '../hooks/text'
import type { Row } from '../hooks/text'

const lines = (rows: readonly Row[]): string[] => rows.map(row => plain(row.spans) + (row.code?.line ?? ''))

const SAMPLE = `# Harbor

A small **booking** system for a ferry company. One page for customers, one for the crew, and a long sentence that must wrap.

## Crossings

| Crossing | Departs | Seats | Notes |
|---|---:|---:|---|
| Morning | 07:15 | 120 | The busy one. Sells out on Fridays, so the waitlist opens at 100 seats. |
| Evening | 18:05 | 80 | Smaller boat, \`MV Tern\`. |

- First
  - Nested
- [x] Done
- [ ] Open

1. One
2. Two

> A note that is long enough to wrap onto a second row of the quote block.

\`\`\`ts
const a = 1

const b = 2
\`\`\`
`

describe('markdown', () => {
  test('every row fits the width at any width', () => {
    for (const cols of [24, 40, 61, 88]) {
      for (const row of renderMarkdown(SAMPLE, cols)) {
        expect(spansWidth(row.spans) + (row.code === undefined ? 0 : 0)).toBeLessThanOrEqual(cols)
      }
    }
  })

  test('a first heading has a short bar and a second heading a rule', () => {
    const out = lines(renderMarkdown('# One\n\n## Two\n\ntext', 30))

    expect(out[0]).toBe('One')
    expect(out[1]).toBe('━━━━')
    expect(out).toContain('─'.repeat(30))
  })

  test('a paragraph wraps on words', () => {
    const out = lines(renderMarkdown('one two three four five six seven', 14))

    expect(out).toEqual(['one two three', 'four five six', 'seven'])
  })

  test('a list keeps its markers and its nesting', () => {
    const out = lines(renderMarkdown('- a\n  - b\n- [x] c\n- [ ] d\n\n3. e\n4. f', 30))

    expect(out).toEqual(['• a', '  ◦ b', '✓ c', '○ d', '', '3. e', '4. f'])
  })

  test('a fenced block keeps every line, the blank ones too', () => {
    const rows = renderMarkdown('```ts\nconst a = 1\n\nconst b = 2\n```', 40)

    expect(rows.map(row => row.code?.line)).toEqual(['const a = 1', '', 'const b = 2'])
    expect(rows[0]?.code?.language).toBe('ts')
  })

  test('a table lines its columns up', () => {
    const out = lines(renderMarkdown('| a | b |\n|---|--:|\n| one | 2 |\n| three | 40 |', 40))

    expect(out[0]).toBe('a        b')
    expect(out[1]).toBe('─────   ──')
    expect(out[2]).toBe('one      2')
    expect(out[3]).toBe('three   40')
  })

  test('front matter reads as a list of keys', () => {
    const out = lines(renderMarkdown('---\nname: guide\nowner: crew\n---\n\n# Title', 30))

    expect(out[0]).toBe('name   guide')
    expect(out[1]).toBe('owner  crew')
  })

  test('a row with a link to a file of the project says where it goes', () => {
    const rows = renderMarkdown('Read the [guide](docs/guide.md) and <https://example.com>.', 60)

    expect(rows[0]?.link).toBe('docs/guide.md')
  })
})

describe('inline', () => {
  test('marks become styles', () => {
    expect(inline('a **b** *c* `d` ~~e~~')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', color: 'professionalBlue' },
      { text: ' ' },
      { text: 'e', strike: true },
    ])
  })

  test('names with underscores and stars in code stay as written', () => {
    expect(plain(inline('snake_case_name and `**/repo/` and 2 * 3 * 4'))).toBe('snake_case_name and **/repo/ and 2 * 3 * 4')
  })

  test('a link keeps its address', () => {
    expect(inline('[text](https://example.com/a_b)')).toEqual([{ text: 'text', underline: true, href: 'https://example.com/a_b' }])
  })
})

describe('text', () => {
  test('wide characters count two cells', () => {
    expect(width('日本')).toBe(4)
    expect(width('abc')).toBe(3)
  })

  test('a long path breaks after a separator', () => {
    const out = wrapSpans([{ text: 'northquay-ferry-agent-context-system/AGENTS.md' }], 24).map(plain)

    expect(out).toEqual(['northquay-ferry-agent-', 'context-system/AGENTS.md'])
  })

  test('a long name keeps its ending', () => {
    expect(truncateMiddle('northquay-ferry-agent-context-system', 20)).toBe('northquay-fer…system')
  })

  test('columns give way but keep room for their longest word', () => {
    const widths = fitColumns([10, 60, 30], 60, [10, 12, 22])

    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(60)
    expect(widths[0]).toBe(10)
    expect(widths[2]).toBeGreaterThanOrEqual(22)
  })
})
