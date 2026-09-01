import { describe, it, expect } from 'vitest'
import { stripEmptyMessages, installEmptyMessageGuard } from './llmHistoryGuard'

// The exact shape chatStore appends when the tool loop creates a chart or
// markdown artifact.
const carrier = {
  role: 'assistant' as const,
  content: '',
  artifact: { id: 'a1', type: 'chart' },
  hidden: false,
}

const history = [
  { role: 'user' as const, content: 'which orgs launched most?' },
  { role: 'assistant' as const, content: 'SpaceX, with 134.' },
  carrier,
  { role: 'user' as const, content: 'summarize' },
]

describe('stripEmptyMessages', () => {
  it('drops an artifact-carrier message', () => {
    const out = stripEmptyMessages(history as any)
    expect(out).toHaveLength(3)
    expect(out).not.toContain(carrier)
  })

  it('keeps every message that has text', () => {
    expect(stripEmptyMessages(history as any).map((m) => m.content)).toEqual([
      'which orgs launched most?',
      'SpaceX, with 134.',
      'summarize',
    ])
  })

  it('does not mutate the input', () => {
    stripEmptyMessages(history as any)
    expect(history).toHaveLength(4)
  })

  it('keeps an empty assistant turn that carries tool calls', () => {
    // A tool-call turn legitimately has no text, and dropping it would orphan
    // the tool_result that answers it.
    const toolTurn = {
      role: 'assistant' as const,
      content: '',
      toolCalls: [{ id: 't1', name: 'run_trilogy_query', input: {} }],
    }
    expect(stripEmptyMessages([toolTurn] as any)).toEqual([toolTurn])
  })

  it('keeps an empty user turn that carries tool results', () => {
    const toolResult = {
      role: 'user' as const,
      content: '',
      toolResults: [{ toolCallId: 't1', result: 'rows' }],
    }
    expect(stripEmptyMessages([toolResult] as any)).toEqual([toolResult])
  })

  it('drops whitespace-only content', () => {
    expect(stripEmptyMessages([{ role: 'assistant', content: '   ' }] as any)).toEqual([])
  })

  it('preserves tool_use / tool_result pairing across a full turn', () => {
    const turn = [
      { role: 'user' as const, content: 'plot it' },
      { role: 'assistant' as const, content: '', toolCalls: [{ id: 't1', name: 'chart', input: {} }] },
      { role: 'user' as const, content: '', toolResults: [{ toolCallId: 't1', result: 'ok' }] },
      carrier,
      { role: 'assistant' as const, content: 'Here it is.' },
    ]
    const out = stripEmptyMessages(turn as any)
    expect(out).toHaveLength(4)
    expect(out.find((m) => m.toolCalls?.length)).toBeTruthy()
    expect(out.find((m) => m.toolResults?.length)).toBeTruthy()
    expect(out).not.toContain(carrier)
  })
})

describe('installEmptyMessageGuard', () => {
  function fakeStore() {
    const calls: any[] = []
    return {
      calls,
      generateCompletion(name: string, options: any, hist?: any) {
        calls.push({ name, options, hist })
        return Promise.resolve({ ok: true })
      },
    }
  }

  it('sanitizes history on its way to the provider', async () => {
    const store = fakeStore()
    installEmptyMessageGuard(store)
    await store.generateCompletion('conn', { maxTokens: 10 }, history as any)

    expect(store.calls[0].hist).toHaveLength(3)
    expect(store.calls[0].hist).not.toContain(carrier)
  })

  it('forwards name and options unchanged', async () => {
    const store = fakeStore()
    installEmptyMessageGuard(store)
    await store.generateCompletion('my-conn', { maxTokens: 5 }, history as any)

    expect(store.calls[0].name).toBe('my-conn')
    expect(store.calls[0].options).toEqual({ maxTokens: 5 })
  })

  it('passes a null or absent history straight through', async () => {
    const store = fakeStore()
    installEmptyMessageGuard(store)
    await store.generateCompletion('conn', {}, null)
    await store.generateCompletion('conn', {})

    expect(store.calls[0].hist).toBeNull()
    expect(store.calls[1].hist).toBeUndefined()
  })

  it('is idempotent, so a remount cannot stack wrappers', () => {
    const store = fakeStore()
    installEmptyMessageGuard(store)
    const wrapped = store.generateCompletion
    installEmptyMessageGuard(store)

    expect(store.generateCompletion).toBe(wrapped)
  })
})
