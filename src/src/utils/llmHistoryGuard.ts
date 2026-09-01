import type { LLMMessage } from '@trilogy-data/trilogy-studio-components/llm'

/**
 * Drops messages that carry nothing a provider can render.
 *
 * `chatStore` appends an "artifact-carrier" message — `{ role: 'assistant',
 * content: '', artifact }` — every time the tool loop creates a chart or
 * markdown artifact, so the message stream records where each artifact belongs.
 * They are UI-only, but the installed version passes the chat's raw message list
 * to the provider (`getMessages: () => chat.messages`), so they reach the wire as
 * empty assistant turns. Upstream `main` strips them in `Chat.getLLMMessages()`
 * with the note that "Anthropic rejects empty-content messages mid-history".
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
