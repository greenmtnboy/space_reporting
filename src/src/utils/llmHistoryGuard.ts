import type { LLMMessage } from '@trilogy-data/trilogy-studio-components/llm'

/**
 * Drops messages that carry nothing a provider can render.
 *
 * `chatStore` appends an "artifact-carrier" message — `{ role: 'assistant',
 * content: '', artifact }` — every time the tool loop creates a chart or
 * markdown artifact, so the message stream records where each artifact belongs.
 * They are UI-only, but the installed version passes the chat's raw message list
 * to the provider (`getMessages: () => chat.messages`), so they reach the wire.
 *
 * What each provider adapter does with one, and what that costs:
 *
 * - **Anthropic** renders it as a bare `{role, content: ''}`. Measured against
 *   the live API on claude-opus-5, claude-opus-4-8 and claude-sonnet-4-6: all
 *   three accept it (HTTP 200). Upstream `main` strips carriers in
 *   `Chat.getLLMMessages()` citing "Anthropic rejects empty-content messages
 *   mid-history" — that is imprecise. The API rejects an empty *text block*
 *   (`[{type: 'text', text: ''}]` → 400 "text content blocks must be
 *   non-empty"), which this adapter never builds; both places it constructs a
 *   text block guard on `if (msg.content)` first.
 * - **Google** renders it as `parts: [{text: ''}]` — the block-shaped form,
 *   i.e. the shape Anthropic demonstrably rejects. Untested against Gemini (no
 *   key), but this is the concrete risk the guard exists for.
 * - **OpenAI** renders a bare `{role, content: ''}`, like Anthropic.
 *
 * So this is not a fix for a live Anthropic break — it is cheap insurance for
 * the Google path and for anything the library sends in block form later.
 *
 * A message is only dropped when it has no text AND no tool calls AND no tool
 * results — a tool-call turn legitimately has empty content and must survive.
 */
export function stripEmptyMessages(history: LLMMessage[]): LLMMessage[] {
  return history.filter(
    (msg) =>
      (typeof msg.content === 'string' && msg.content.trim().length > 0) ||
      !!msg.toolCalls?.length ||
      !!msg.toolResults?.length,
  )
}

interface CompletionStore {
  generateCompletion(name: string, options: any, history?: LLMMessage[] | null): Promise<any>
}

/**
 * Wraps the LLM store's `generateCompletion` so every request is sanitized on
 * its way out, whatever built it.
 *
 * This is the only interception point the app owns. For a persisted chat,
 * `handleChatMessageWithTools` hands straight off to `chatStore.executeMessage`
 * and ignores the history argument the caller passed, so filtering at the call
 * site in ChatView would be a no-op — the store builds the history from its own
 * `chat.messages`. Every provider adapter is reached through this one method.
 *
 * Idempotent: calling it twice will not stack wrappers.
 */
const GUARD_FLAG = '__emptyMessageGuardInstalled'

export function installEmptyMessageGuard(store: CompletionStore): void {
  const flagged = store as CompletionStore & { [GUARD_FLAG]?: boolean }
  if (flagged[GUARD_FLAG]) return

  const original = store.generateCompletion.bind(store)
  store.generateCompletion = (name, options, history) =>
    original(name, options, history ? stripEmptyMessages(history) : history)

  flagged[GUARD_FLAG] = true
}
