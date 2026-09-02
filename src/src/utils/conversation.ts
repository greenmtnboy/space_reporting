import type { ChatArtifact } from '@trilogy-data/trilogy-studio-components/llm'
import { toolLabel } from './toolNames'

/**
 * The conversation as rendered in the message stream: text messages, runs of
 * tool calls, and (on narrow screens) artifacts in the place their carrier
 * message occupies.
 *
 * Kept as a pure function of the store's messages and artifacts so the
 * folding rules below can be unit-tested without mounting the view.
 */

interface ChatToolCallLike {
  id?: string
  name: string
  input?: Record<string, unknown>
  /** Set on `executedToolCalls`: the outcome the library recorded for the UI. */
  result?: {
    success: boolean
    message?: string
    error?: string
  }
}

interface ChatToolResultLike {
  toolCallId: string
  toolName?: string
  /** The full text the model received, including query rows and errors. */
  result: string
}

export interface ChatMessageLike {
  role: string
  content?: string
  hidden?: boolean
  executedToolCalls?: ChatToolCallLike[]
  toolCalls?: ChatToolCallLike[]
  /** Carried by the hidden user message that follows each batch of calls. */
  toolResults?: ChatToolResultLike[]
  artifact?: ChatArtifact
}

export interface MessageItem {
  kind: 'message'
  /*
    Stable across renders so Vue patches rather than remounts. The item's own
    position cannot be used: an artifact with no carrier is appended at the end,
    so every new message shifts it by one and would tear down and rebuild its
    chart or table. Message indices only ever grow, since messages append.
  */
  key: string
  msg: ChatMessageLike
}

/** One executed tool call with everything the inspector shows about it. */
export interface ToolCallDetail {
  id?: string
  name: string
  label: string
  input?: Record<string, unknown>
  /** Undefined when the library recorded no outcome (older persisted chats). */
  success?: boolean
  error?: string
  message?: string
  /** The text sent back to the model, when the results message is present. */
  result?: string
}

/** One pill: adjacent calls to the same tool with the same outcome. */
export interface ToolPill {
  name: string
  label: string
  count: number
  /** True when the calls in this pill failed; failures never fold into successes. */
  failed: boolean
  calls: ToolCallDetail[]
}

export interface ToolRunItem {
  kind: 'tools'
  key: string
  /** Pills in call order. */
  calls: ToolPill[]
}

export interface ArtifactItem {
  kind: 'artifact'
  key: string
  artifact: ChatArtifact
}

export type ConversationItem = MessageItem | ToolRunItem | ArtifactItem

function toolCallsOf(msg: ChatMessageLike): ChatToolCallLike[] {
  return msg.executedToolCalls || msg.toolCalls || []
}

/**
 * Messages worth a place in the stream: not system, not hidden, and carrying
 * text, tool calls or an artifact. `artifact` keeps the library's
 * artifact-carrier messages, which are empty assistant turns.
 */
export function visibleMessages(messages: readonly ChatMessageLike[]): ChatMessageLike[] {
  return messages.filter(
    (m) => m.role !== 'system' && !m.hidden && !!(m.content || toolCallsOf(m).length || m.artifact),
  )
}

/**
 * The text each tool call's result was sent to the model as, by call id.
 *
 * The library records a call's outcome in two places. `executedToolCalls` on
 * the assistant message carries `success`, `error` and a short `message` for
 * the UI; the full result text — query rows, the error with its context, the
 * docs that matched — only exists in the hidden user message that follows,
 * as `toolResults`. Hidden messages never reach the stream, so they are
 * indexed here first and joined onto the calls by id.
 */
function indexToolResults(messages: readonly ChatMessageLike[]): Map<string, string> {
  const byId = new Map<string, string>()
  for (const msg of messages) {
    for (const result of msg.toolResults || []) {
      if (result.toolCallId) byId.set(result.toolCallId, result.result)
    }
  }
  return byId
}

function toDetail(call: ChatToolCallLike, results: Map<string, string>): ToolCallDetail {
  const detail: ToolCallDetail = { name: call.name, label: toolLabel(call.name) }
  if (call.id) detail.id = call.id
  if (call.input) detail.input = call.input
  if (call.result) {
    detail.success = call.result.success
    if (call.result.error) detail.error = call.result.error
    if (call.result.message) detail.message = call.result.message
  }
  const text = call.id ? results.get(call.id) : undefined
  if (text) detail.result = text
  return detail
}

/**
 * Build the conversation.
 *
 * Tool calls are folded into runs. An agent turn is several tool-only
 * assistant messages in a row (select the import, run the query, list the
 * artifacts, hide one, return), and rendering each as its own message block
 * spent a full row of padding per call. Consecutive tool calls, across any
 * number of messages, become one `tools` item: a single compact row of pills,
 * with adjacent repeats of the same tool shown once with a count. A text
 * message or an artifact between two calls ends the run.
 *
 * A pill only folds calls with the same outcome: two failed queries and then
 * a successful one read as `Run query ×2` (failed) then `Run query`, which is
 * exactly the shape of a retry loop and what the inspector is for.
 *
 * Artifacts sit where their carrier message is. Carriers are persisted with
 * the chat, so this placement survives a reload. Two cases have no carrier and
 * are appended at the end rather than left invisible: `results` artifacts,
 * which the installed version does not create a carrier for, and anything the
 * chat was seeded with. Dedupe is by artifact id, since an artifact reaches us
 * through both the carrier and the panel list.
 */
export function buildConversation(
  messages: readonly ChatMessageLike[],
  artifacts: readonly ChatArtifact[],
): ConversationItem[] {
  const items: ConversationItem[] = []
  const carried = new Set<string>()
  const results = indexToolResults(messages)

  const appendToolCalls = (calls: ChatToolCallLike[], messageIndex: number) => {
    const last = items[items.length - 1]
    const run: ToolRunItem =
      last?.kind === 'tools' ? last : { kind: 'tools', key: `tools:${messageIndex}`, calls: [] }
    if (run !== last) items.push(run)
    for (const call of calls) {
      const detail = toDetail(call, results)
      const failed = detail.success === false
      const tail = run.calls[run.calls.length - 1]
      if (tail && tail.name === call.name && tail.failed === failed) {
        tail.count += 1
        tail.calls.push(detail)
      } else {
        run.calls.push({ name: call.name, label: detail.label, count: 1, failed, calls: [detail] })
      }
    }
  }

  visibleMessages(messages).forEach((msg, index) => {
    if (msg.content) {
      items.push({ kind: 'message', key: `msg:${index}`, msg })
    }
    const calls = toolCallsOf(msg)
    if (calls.length) {
      appendToolCalls(calls, index)
    }
    const artifact = msg.artifact
    if (artifact && !artifact.hidden) {
      items.push({ kind: 'artifact', key: `art:${artifact.id}`, artifact })
      carried.add(artifact.id)
    }
  })

  for (const artifact of artifacts) {
    if (artifact.hidden || carried.has(artifact.id)) continue
    items.push({ kind: 'artifact', key: `art:${artifact.id}`, artifact })
  }
  return items
}

/**
 * What to call an artifact in the card header and tab bar. The agent's
 * update_artifact tool sets `config.title`; until it does, or for artifacts the
 * tool loop never titles (raw results), fall back to the type, with `results`
 * read as "table" since that is what renders.
 */
export function artifactTitle(artifact: ChatArtifact): string {
  const title = artifact.config?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  return artifact.type === 'results' ? 'table' : artifact.type
}
