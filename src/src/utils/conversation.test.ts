import { describe, it, expect } from 'vitest'
import { artifactTitle, buildConversation, visibleMessages } from './conversation'

const tool = (name: string) => ({ id: `${name}-${Math.random()}`, name })
const artifact = (id: string, hidden = false) => ({ id, type: 'results' as const, data: null, hidden })

describe('visibleMessages', () => {
  it('drops system, hidden and empty messages but keeps artifact carriers', () => {
    const carrier = { role: 'assistant', content: '', artifact: artifact('a1') }
    const kept = visibleMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi', hidden: true },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: '', executedToolCalls: [tool('run_trilogy_query')] },
      carrier,
      { role: 'user', content: 'hello' },
    ])
    expect(kept.map((m) => m.content)).toEqual(['', '', 'hello'])
    expect(kept[1]).toBe(carrier)
  })
})

describe('buildConversation tool runs', () => {
  it('folds consecutive tool-only messages into one run', () => {
    const items = buildConversation(
      [
        { role: 'user', content: 'How many launches?' },
        { role: 'assistant', content: '', executedToolCalls: [tool('select_active_import')] },
        { role: 'assistant', content: '', executedToolCalls: [tool('run_trilogy_query')] },
        { role: 'assistant', content: '', executedToolCalls: [tool('list_artifacts')] },
        { role: 'assistant', content: 'There were 261.' },
      ],
      [],
    )
    expect(items.map((i) => i.kind)).toEqual(['message', 'tools', 'message'])
    const run = items[1]
    expect(run.kind === 'tools' && run.calls).toEqual([
      { name: 'select_active_import', count: 1 },
      { name: 'run_trilogy_query', count: 1 },
      { name: 'list_artifacts', count: 1 },
    ])
  })

  it('counts adjacent repeats of the same tool', () => {
    const items = buildConversation(
      [
        { role: 'assistant', content: '', executedToolCalls: [tool('run_trilogy_query')] },
        { role: 'assistant', content: '', executedToolCalls: [tool('run_trilogy_query'), tool('run_trilogy_query')] },
        { role: 'assistant', content: '', executedToolCalls: [tool('hide_artifact'), tool('run_trilogy_query')] },
      ],
      [],
    )
    expect(items).toHaveLength(1)
    expect(items[0].kind === 'tools' && items[0].calls).toEqual([
      { name: 'run_trilogy_query', count: 3 },
      { name: 'hide_artifact', count: 1 },
      { name: 'run_trilogy_query', count: 1 },
    ])
  })

  it('ends a run at a text message and at an artifact', () => {
    const items = buildConversation(
      [
        { role: 'assistant', content: '', executedToolCalls: [tool('run_trilogy_query')] },
        { role: 'assistant', content: 'Let me chart that.' },
        { role: 'assistant', content: '', executedToolCalls: [tool('chart_trilogy_query')] },
        { role: 'assistant', content: '', artifact: artifact('chart-1') },
        { role: 'assistant', content: '', executedToolCalls: [tool('return_to_user')] },
      ],
      [],
    )
    expect(items.map((i) => i.kind)).toEqual(['tools', 'message', 'tools', 'artifact', 'tools'])
  })

  it('renders a message that carries both text and tool calls as text then a run', () => {
    const items = buildConversation(
      [
        { role: 'assistant', content: 'Querying now.', executedToolCalls: [tool('run_trilogy_query')] },
        { role: 'assistant', content: '', executedToolCalls: [tool('return_to_user')] },
      ],
      [],
    )
    expect(items.map((i) => i.kind)).toEqual(['message', 'tools'])
    expect(items[1].kind === 'tools' && items[1].calls.map((c) => c.name)).toEqual([
      'run_trilogy_query',
      'return_to_user',
    ])
  })

  it('keys a run by its first message so it is patched, not remounted, as it grows', () => {
    const first = [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', executedToolCalls: [tool('a')] }]
    const before = buildConversation(first, [])
    const after = buildConversation(
      [...first, { role: 'assistant', content: '', executedToolCalls: [tool('b')] }],
      [],
    )
    expect(before[1].key).toBe(after[1].key)
    expect(after[1].kind === 'tools' && after[1].calls.map((c) => c.name)).toEqual(['a', 'b'])
  })
})

describe('buildConversation artifacts', () => {
  it('places carried artifacts inline and appends uncarried ones once', () => {
    const carried = artifact('a1')
    const loose = artifact('a2')
    const items = buildConversation(
      [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', artifact: carried },
        { role: 'assistant', content: 'done' },
      ],
      [carried, loose, artifact('hidden', true)],
    )
    expect(items.map((i) => (i.kind === 'artifact' ? `art:${i.artifact.id}` : i.kind))).toEqual([
      'message',
      'art:a1',
      'message',
      'art:a2',
    ])
  })
})

describe('artifactTitle', () => {
  it('prefers the title the agent set', () => {
    expect(artifactTitle({ ...artifact('a'), config: { title: 'Launches by site' } })).toBe(
      'Launches by site',
    )
  })

  it('falls back to the type, reading results as table', () => {
    expect(artifactTitle(artifact('a'))).toBe('table')
    expect(artifactTitle({ ...artifact('a'), type: 'chart', config: { title: '  ' } })).toBe('chart')
    expect(artifactTitle({ ...artifact('a'), type: 'markdown', config: {} })).toBe('markdown')
  })
})
