import { describe, it, expect } from 'vitest'
import { artifactTitle, buildConversation, visibleMessages } from './conversation'
import { toolLabel } from './toolNames'

let nextId = 0
const tool = (name: string, result?: { success: boolean; error?: string; message?: string }) => ({
  id: `${name}-${++nextId}`,
  name,
  input: { q: name },
  ...(result ? { result } : {}),
})
const artifact = (id: string, hidden = false) => ({ id, type: 'results' as const, data: null, hidden })

/** The shape the earlier tests asserted on: name and count per pill. */
const summarize = (items: ReturnType<typeof buildConversation>, index: number) => {
  const item = items[index]
  return item.kind === 'tools' ? item.calls.map((c) => ({ name: c.name, count: c.count })) : null
}

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
    expect(summarize(items, 1)).toEqual([
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
    expect(summarize(items, 0)).toEqual([
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
    expect(summarize(items, 1)?.map((c) => c.name)).toEqual(['run_trilogy_query', 'return_to_user'])
  })

  it('keys a run by its first message so it is patched, not remounted, as it grows', () => {
    const first = [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', executedToolCalls: [tool('a')] }]
    const before = buildConversation(first, [])
    const after = buildConversation(
      [...first, { role: 'assistant', content: '', executedToolCalls: [tool('b')] }],
      [],
    )
    expect(before[1].key).toBe(after[1].key)
    expect(summarize(after, 1)?.map((c) => c.name)).toEqual(['a', 'b'])
  })
})

describe('buildConversation tool call details', () => {
  const failed = { success: false, error: 'Syntax error near select' }
  const ok = { success: true }

  it('labels each pill with the friendly tool name', () => {
    const items = buildConversation(
      [{ role: 'assistant', content: '', executedToolCalls: [tool('select_active_import')] }],
      [],
    )
    const run = items[0]
    expect(run.kind === 'tools' && run.calls[0].label).toBe('Select data source')
    expect(run.kind === 'tools' && run.calls[0].calls[0].label).toBe('Select data source')
  })

  it('does not fold a failed call into a successful one of the same tool', () => {
    // The shape of a retry loop: two broken queries, then one that works.
    const items = buildConversation(
      [
        {
          role: 'assistant',
          content: '',
          executedToolCalls: [
            tool('run_trilogy_query', failed),
            tool('run_trilogy_query', failed),
            tool('run_trilogy_query', ok),
          ],
        },
      ],
      [],
    )
    const run = items[0]
    expect(run.kind === 'tools' && run.calls.map((c) => [c.count, c.failed])).toEqual([
      [2, true],
      [1, false],
    ])
  })

  it('joins the full result text from the hidden results message by call id', () => {
    const query = tool('run_trilogy_query', ok)
    const bad = tool('run_trilogy_query', failed)
    const items = buildConversation(
      [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', executedToolCalls: [bad] },
        {
          role: 'user',
          content: '',
          hidden: true,
          toolResults: [{ toolCallId: bad.id, toolName: bad.name, result: 'Error: Syntax error near select' }],
        },
        { role: 'assistant', content: '', executedToolCalls: [query] },
        {
          role: 'user',
          content: '',
          hidden: true,
          toolResults: [{ toolCallId: query.id, toolName: query.name, result: 'Success. Artifact ID: a1. 3 rows' }],
        },
      ],
      [],
    )
    // Hidden results messages are indexed, never rendered.
    expect(items.map((i) => i.kind)).toEqual(['message', 'tools'])
    const run = items[1]
    if (run.kind !== 'tools') throw new Error('expected a tool run')
    expect(run.calls).toHaveLength(2)
    const [first, second] = run.calls
    expect(first.calls[0]).toMatchObject({
      id: bad.id,
      name: 'run_trilogy_query',
      input: { q: 'run_trilogy_query' },
      success: false,
      error: 'Syntax error near select',
      result: 'Error: Syntax error near select',
    })
    expect(second.calls[0]).toMatchObject({
      id: query.id,
      success: true,
      result: 'Success. Artifact ID: a1. 3 rows',
    })
    expect(second.calls[0].error).toBeUndefined()
  })

  it('leaves the result undefined when no results message was persisted', () => {
    const items = buildConversation(
      [{ role: 'assistant', content: '', executedToolCalls: [tool('list_artifacts', { success: true, message: 'none' })] }],
      [],
    )
    const run = items[0]
    if (run.kind !== 'tools') throw new Error('expected a tool run')
    expect(run.calls[0].calls[0].result).toBeUndefined()
    expect(run.calls[0].calls[0].message).toBe('none')
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

describe('toolLabel', () => {
  it('maps known tools to chat vocabulary', () => {
    expect(toolLabel('select_active_import')).toBe('Select data source')
    expect(toolLabel('run_trilogy_query')).toBe('Run query')
    expect(toolLabel('return_to_user')).toBe('Reply')
  })

  it('opens up an unknown tool name rather than showing it raw', () => {
    expect(toolLabel('some_new_tool')).toBe('Some new tool')
  })
})
