<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, computed, nextTick, watch } from 'vue'
import {
  useTrilogyChat,
  useTrilogyCore,
  MarkdownRenderer,
} from '@trilogy-data/trilogy-studio-components/dashboard'
import type { ChatArtifact } from '@trilogy-data/trilogy-studio-components/llm'
import ViewHeader from '../components/ViewHeader.vue'
import ChatArtifactView from '../components/ChatArtifactView.vue'
import { useChatSharing } from '../composables/useChatSharing'
import { installEmptyMessageGuard } from '../utils/llmHistoryGuard'
import { PREQL_MODELS } from '../models'
import {
  artifactTitle,
  buildConversation,
  visibleMessages as buildVisibleMessages,
  type ConversationItem,
  type ToolRunItem,
} from '../utils/conversation'
import { toolLabel } from '../utils/toolNames'

// Initialize Trilogy core (all stores/services)
const trilogy = useTrilogyCore()

// Chat sharing functionality
const sharing = useChatSharing()
const tokenInput = ref('')

async function saveTokenAndRetry() {
  if (!tokenInput.value) return
  sharing.setGitHubToken(tokenInput.value.trim())
  tokenInput.value = ''
  shareChat()
}

// Ensure dark theme and production resolver are set early (before composables read settings)
trilogy.userSettingsStore.loadSettings()
if (!trilogy.userSettingsStore.settings.theme) {
  trilogy.userSettingsStore.updateSetting('theme', 'dark')
}
trilogy.userSettingsStore.updateSetting('trilogyResolver', 'https://trilogy-service.fly.dev')
trilogy.userSettingsStore.saveSettings()
trilogy.userSettingsStore.toggleTheme()

// Check for shared chat immediately (before onMounted) so viewMode computes correctly
sharing.checkForSharedChat()

// Provide stores for child components
provide('llmConnectionStore', trilogy.llmConnectionStore)
provide('connectionStore', trilogy.connectionStore)
provide('editorStore', trilogy.editorStore)
provide('chatStore', trilogy.chatStore)
provide('userSettingsStore', trilogy.userSettingsStore)
provide('queryExecutionService', trilogy.queryExecutionService)

// Track DuckDB connection status
const dataConnectionName = 'space-duckdb'
const dbStatus = ref<'loading' | 'ready' | 'error'>('loading')
const dbError = ref<string>('')

/*
  The chat store keeps a connection id alongside the display name, and
  resolves the id first when it builds the agent's prompt. Pass it whenever a
  chat is created so that lookup never has to fall back to the name.
*/
function dataConnectionId(): string {
  return trilogy.connectionStore.connectionByName(dataConnectionName)?.id ?? ''
}

// LLM connection state (for provider selection)
const llmStore = trilogy.llmConnectionStore

// Artifact-carrier messages are empty assistant turns; keep them out of provider
// requests. See utils/llmHistoryGuard.ts for why this sits on the store.
installEmptyMessageGuard(llmStore)

const showProviderSelector = ref(true)
const selectedProvider = ref('')
const apiKeyInput = ref('')
const selectedModel = ref('')
const loadingModels = ref(false)
const availableModels = ref<{ id: string; name: string }[]>([])
const connectionError = ref('')

const availableProviders = [
  { id: 'demo', name: 'Demo (limited messages)' },
  { id: 'anthropic', name: 'Anthropic (Claude)' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google (Gemini)' },
]

const hasActiveLLMConnection = computed(() => {
  return llmStore.activeConnection !== ''
})

// View mode: 'setup' (need LLM), 'chat' (active chat), 'shared' (viewing shared read-only)
const viewMode = computed(() => {
  if (sharing.isSharedChat.value && !hasActiveLLMConnection.value) {
    return 'shared'
  }
  if (hasActiveLLMConnection.value) {
    return 'chat'
  }
  return 'setup'
})

// ── Narrow-screen detection ──
// A side-by-side panel has nowhere to go on a phone, so below this width the
// artifacts are embedded in the conversation instead. Matches the breakpoint in
// chat-styles/_artifacts.css.
const NARROW_QUERY = '(max-width: 768px)'
const isNarrow = ref(false)
let narrowQuery: MediaQueryList | null = null
function syncNarrow(event: MediaQueryListEvent | MediaQueryList) {
  isNarrow.value = event.matches
}
if (typeof window !== 'undefined' && window.matchMedia) {
  narrowQuery = window.matchMedia(NARROW_QUERY)
  isNarrow.value = narrowQuery.matches
  narrowQuery.addEventListener('change', syncNarrow)
}
onUnmounted(() => narrowQuery?.removeEventListener('change', syncNarrow))

/*
  Tools withheld from the model. The app opens its one DuckDB connection
  itself, so connect_data_connection has nothing to do; there is no tutorial
  screen for open_documentation to navigate to. Below the narrow breakpoint
  artifacts sit inline where their carrier message is: there is no panel for
  reorder_artifacts to reorder, and hide_artifact would delete a card the user
  already scrolled past. The toolset is part of the provider's prompt-cache
  prefix, so crossing the breakpoint mid-chat costs one cache miss.
*/
const ALWAYS_DISABLED_TOOLS = ['connect_data_connection', 'open_documentation']
const INLINE_DISABLED_TOOLS = ['reorder_artifacts', 'hide_artifact']

// Use the chat composable with tools — handles tool loop internally
const chat = useTrilogyChat({
  dataConnectionName,
  initialTitle: 'Space Data Chat',
  persistChat: true,
  disabledTools: () =>
    isNarrow.value ? [...ALWAYS_DISABLED_TOOLS, ...INLINE_DISABLED_TOOLS] : ALWAYS_DISABLED_TOOLS,
})

// ── Chat UI state ──
const userInput = ref('')
const messagesContainer = ref<HTMLDivElement>()

const SUGGESTIONS = [
  'What rockets have the most engines?',
  'Plot the top launch sites in Asia.',
  'What\'s the biggest GEO satellite cluster?',
]

// Send message using useTrilogyChat's built-in tool loop
async function handleSend() {
  const text = userInput.value.trim()
  if (!text || chat.isChatLoading.value) return
  userInput.value = ''
  await chat.handleChatMessageWithTools(text, chat.activeChatMessages.value)
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

async function injectSuggestion(text: string) {
  if (chat.isChatLoading.value) return
  await chat.handleChatMessageWithTools(text, chat.activeChatMessages.value)
}

// Visible messages and the rendered conversation: see utils/conversation.ts
// for the folding rules (tool runs, artifact placement).
const visibleMessages = computed(() => buildVisibleMessages(chat.activeChatMessages.value || []))


// Artifact panel state
const visibleArtifacts = computed(() =>
  (chat.activeChatArtifacts.value || []).filter((a: ChatArtifact) => !a.hidden),
)
const hasArtifacts = computed(() => visibleArtifacts.value.length > 0)
const activeArtifactIndex = computed({
  get: () => chat.activeChatArtifactIndex.value,
  set: (v: number) => chat.handleActiveArtifactUpdate(v),
})
const activeArtifact = computed(() => visibleArtifacts.value[activeArtifactIndex.value] || null)

// Auto-select the latest artifact for the wide-screen panel.
watch(() => visibleArtifacts.value.length, (newLen) => {
  if (newLen > 0) activeArtifactIndex.value = newLen - 1
})

const conversation = computed<ConversationItem[]>(() =>
  buildConversation(chat.activeChatMessages.value || [], visibleArtifacts.value),
)

/*
  Table actions. DataTable's own copy/download buttons floated over the rows
  (bottom-right on a phone, covering data); ChatArtifactView renders the table
  without them and exposes the two actions, and the host puts buttons in the
  card header (narrow) or the panel toolbar (wide). Inline cards are keyed by
  artifact id; the panel shows one artifact at a time.
*/
type ArtifactViewHandle = InstanceType<typeof ChatArtifactView>
const inlineViews = ref(new Map<string, ArtifactViewHandle>())
const panelView = ref<ArtifactViewHandle | null>(null)
function registerInlineView(id: string, el: unknown) {
  if (el) inlineViews.value.set(id, el as ArtifactViewHandle)
  else inlineViews.value.delete(id)
}
function inlineHasTable(id: string): boolean {
  return !!inlineViews.value.get(id)?.hasTable
}

/*
  Tool inspector. Clicking a pill opens the run it belongs to with that pill
  selected; the modal shows each call's input and the result text the model
  was sent, which is what you need when the agent loops on a failing query.
  The run's other pills are tabs in the modal so a whole turn can be read
  without closing and reopening. See utils/conversation.ts for where the
  result text comes from.
*/
const inspector = ref<{ run: ToolRunItem; pill: number } | null>(null)
const inspectedPill = computed(() => inspector.value?.run.calls[inspector.value.pill] ?? null)
function openInspector(run: ToolRunItem, pill: number) {
  inspector.value = { run, pill }
}
function closeInspector() {
  inspector.value = null
}
function onInspectorKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && inspector.value) closeInspector()
}
onMounted(() => window.addEventListener('keydown', onInspectorKeydown))
onUnmounted(() => window.removeEventListener('keydown', onInspectorKeydown))
function formatInput(input: unknown): string {
  if (input === undefined) return '(no input)'
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}


// Auto-scroll to bottom on new messages
async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}
watch(() => visibleMessages.value.length, scrollToBottom)
watch(
  () => visibleMessages.value[visibleMessages.value.length - 1]?.content,
  scrollToBottom,
)
// An embedded artifact grows the stream without adding a message, so the
// watches above would leave it below the fold.
watch(() => (isNarrow.value ? visibleArtifacts.value.length : 0), scrollToBottom)

// Initialize DuckDB connection on mount
onMounted(async () => {
  try {
    const hasSharedChat = sharing.isSharedChat.value
    if (hasSharedChat) {
      console.log('Loaded shared chat:', sharing.sharedChatData.value?.title)
    }

    /*
      Look the connection up by name, never by store key. Library 0.1.24 keys
      connectionStore.connections by a derived id (`local:<name>`), so the
      old `connections[dataConnectionName]` read undefined, the reset below
      never ran, and the badge reported "ready" over a connection that was
      never opened. Every query the agent then ran failed with "not
      connected — use connect_data_connection", a tool this app withholds.
    */
    const conn =
      trilogy.connectionStore.connectionByName(dataConnectionName) ??
      trilogy.connectionStore.newConnection(dataConnectionName, 'duckdb', {})
    if (!conn.connected) {
      await trilogy.connectionStore.resetConnection(conn.id)
    }
    if (!conn.connected) {
      throw new Error(conn.error || 'DuckDB did not connect')
    }

    console.log('DuckDB connection ready')
    dbStatus.value = 'ready'

    if (!trilogy.chatStore.activeChatId && !hasSharedChat) {
      trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data', dataConnectionId())
    }

    // Always force production resolver
    trilogy.resolver.settingStore.loadSettings()
    trilogy.resolver.settingStore.updateSetting('trilogyResolver', 'https://trilogy-service.fly.dev')
    trilogy.resolver.settingStore.saveSettings()

    // Load preql models (imported at build time from data/raw/*.preql)
    for (const model of PREQL_MODELS) {
      if (!trilogy.editorStore.editors[model.name]) {
        trilogy.editorStore.newEditor(model.name, 'preql', dataConnectionName, model.contents)
      }
    }
    console.log(`Loaded ${PREQL_MODELS.length} preql models`)
  } catch (error) {
    console.error('Failed to initialize DuckDB:', error)
    dbStatus.value = 'error'
    dbError.value = error instanceof Error ? error.message : 'Unknown error'
  }
})

const handlePaste = () => {
  setTimeout(loadModels, 0)
}

// Reset chat - clear messages and start fresh
function resetChat() {
  if (trilogy.chatStore.activeChatId) {
    trilogy.chatStore.clearChatMessages(trilogy.chatStore.activeChatId)
    chat.handleImportChange([])
  } else {
    trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat', dataConnectionId())
    chat.handleImportChange([])
  }
}

// Connect LLM provider
const connectProvider = async () => {
  connectionError.value = ''
  try {
    const connName = `${selectedProvider.value}-${Date.now()}`

    if (isDemo.value) {
      await llmStore.newConnection(connName, 'demo', {
        model: 'google/gemini-3-flash-preview',
        saveCredential: false,
      })
    } else {
      const model = selectedModel.value || availableModels.value[0]?.id
      await llmStore.newConnection(connName, selectedProvider.value, {
        apiKey: apiKeyInput.value,
        model: model,
        saveCredential: false,
      })
    }

    llmStore.activeConnection = connName
    showProviderSelector.value = false

    if (trilogy.chatStore.activeChatId) {
      trilogy.chatStore.chats[trilogy.chatStore.activeChatId].llmConnectionName = connName
    }
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : 'Failed to connect'
  }
}

// Load models when provider/API key change
const loadModels = async () => {
  if (!selectedProvider.value) {
    availableModels.value = []
    return
  }

  if (!apiKeyInput.value) {
    availableModels.value = getDefaultModels(selectedProvider.value)
    if (availableModels.value.length > 0 && !selectedModel.value) {
      selectedModel.value = availableModels.value[0].id
    }
    return
  }

  loadingModels.value = true
  connectionError.value = ''

  try {
    const modelIds = await llmStore.fetchModelsForProvider(selectedProvider.value, apiKeyInput.value)

    const chatModels = modelIds.filter((id: string) => {
      const lower = id.toLowerCase()
      if (selectedProvider.value === 'openai') {
        return lower.startsWith('gpt-5.')
      }
      if (selectedProvider.value === 'google') {
        return lower.includes('-flash')
      }
      return true
    })

    availableModels.value = chatModels.map((id: string) => ({ id, name: id }))

    if (availableModels.value.length > 0 && !selectedModel.value) {
      selectedModel.value = availableModels.value[0].id
    }
  } catch (error) {
    console.error('Failed to fetch models:', error)
    connectionError.value = error instanceof Error ? error.message : 'Failed to fetch models'
    availableModels.value = getDefaultModels(selectedProvider.value)
    if (availableModels.value.length > 0) {
      selectedModel.value = availableModels.value[0].id
    }
  } finally {
    loadingModels.value = false
  }
}

function getDefaultModels(provider: string) {
  switch (provider) {
    case 'anthropic':
      return [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
        { id: 'claude-opus-4-6-20260201', name: 'Claude Opus 4.6' },
      ]
    case 'openai':
      return [{ id: 'gpt-5.2', name: 'GPT-5.2' }]
    case 'google':
      return [{ id: 'models/gemini-2.5-flash', name: 'models/gemini-2.5-flash' }]
    case 'demo':
      return []
    default:
      return []
  }
}

const isDemo = computed(() => selectedProvider.value === 'demo')

const canConnect = computed(() => {
  if (!selectedProvider.value) return false
  if (isDemo.value) return true
  return apiKeyInput.value && selectedModel.value
})

const connectTooltip = computed(() => {
  if (canConnect.value) return 'Connect to LLM'
  const missing: string[] = []
  if (!selectedProvider.value) missing.push('provider')
  if (!isDemo.value && !apiKeyInput.value) missing.push('API key')
  if (!isDemo.value && !selectedModel.value) missing.push('model')
  return `Missing: ${missing.join(', ')}`
})

const connectionInfo = computed(() => {
  if (!llmStore.activeConnection) return ''
  const conn = llmStore.getConnection(llmStore.activeConnection)
  return conn ? `${conn.name} (${conn.model})` : ''
})

const activeDatasets = computed(() => {
  return chat.activeImportsForChat.value.map((imp: any) => imp.alias || imp.name)
})

// Share current chat
function shareChat() {
  const messages = chat.activeChatMessages.value || []
  const artifacts = chat.activeChatArtifacts.value || []
  const imports = chat.activeImportsForChat.value || []
  const title = chat.activeChatTitle.value || 'Space Data Chat'

  const shareableArtifacts = artifacts.map((a: any) => ({
    type: a.type || 'unknown',
    content: JSON.stringify(a),
    title: a.title,
  }))

  sharing.openShareModal(title, messages as any, imports as any, shareableArtifacts)
}

// Continue a shared chat by setting up LLM connection
function continueSharedChat() {
  if (!sharing.sharedChatData.value) return

  trilogy.chatStore.newChat(
    sharing.sharedChatData.value.title,
    dataConnectionName,
    'Continued from shared chat',
    dataConnectionId(),
  )

  if (trilogy.chatStore.activeChatId) {
    const chatId = trilogy.chatStore.activeChatId
    const chatData = trilogy.chatStore.chats[chatId]
    if (chatData) {
      /*
        Drop the `artifact` a carrier message holds. A share round-trips through
        JSON, which flattens a Results instance's `headers` Map into a plain
        object, and nothing here calls Results.fromJSON to put it back — so the
        artifact would render a chart or table against data DataTable cannot
        read. The messages themselves restore fine.
      */
      chatData.messages = sharing.sharedChatData.value.messages.map((msg: any) => {
        if (!msg.artifact) return msg
        const { artifact: _dropped, ...rest } = msg
        return rest
      }) as any
    }
  }

  if (sharing.sharedChatData.value.imports?.length) {
    chat.handleImportChange(sharing.sharedChatData.value.imports as any)
  }

  sharing.clearSharedChat()
}

// Start fresh (ignore shared chat)
function startFreshChat() {
  sharing.clearSharedChat()
  if (!trilogy.chatStore.activeChatId) {
    trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data', dataConnectionId())
  }
  selectedModel.value = ''
}

/*
  Get shared messages for display.

  Empty ones are dropped, not just system ones: a share carries the chat's raw
  message list, which includes the artifact-carrier messages chatStore appends
  for each chart or markdown artifact. This read-only view has no artifact
  renderer, and a carrier's content is '', so each one showed up as a blank
  message bubble.
*/
const sharedMessagesForDisplay = computed(() => {
  if (!sharing.sharedChatData.value?.messages) return []
  return sharing.sharedChatData.value.messages.filter(
    (m) => m.role !== 'system' && typeof m.content === 'string' && m.content.trim().length > 0,
  )
})

function artifactIcon(type: string): string {
  switch (type) {
    case 'chart': return 'mdi mdi-chart-bar'
    case 'results': return 'mdi mdi-table'
    case 'markdown': return 'mdi mdi-language-markdown'
    case 'code': return 'mdi mdi-code-braces'
    default: return 'mdi mdi-file-document-outline'
  }
}
</script>

<template>
  <div class="chat-view" data-testid="chat-view">
    <!-- Share Modal -->
    <div v-if="sharing.showShareModal.value" class="share-modal-overlay" @click.self="sharing.closeShareModal">
      <div class="share-modal">
        <div class="share-modal-header">
          <h2>Share Chat</h2>
          <button class="close-btn" @click="sharing.closeShareModal">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <div class="share-modal-body">
          <div v-if="sharing.isSharing.value" class="share-loading">
            <i class="mdi mdi-loading mdi-spin"></i>
            <span>Creating share link...</span>
          </div>

          <template v-else-if="sharing.shareUrl.value">
            <p>Copy this link to share your conversation. Anyone with the link can view it.</p>
            <div class="share-url-container">
              <input
                type="text"
                :value="sharing.shareUrl.value"
                readonly
                class="share-url-input"
                @focus="($event.target as HTMLInputElement)?.select()"
              />
              <button
                class="copy-btn"
                @click="sharing.copyShareUrl"
                :class="{ success: sharing.copySuccess.value }"
              >
                <i :class="sharing.copySuccess.value ? 'mdi mdi-check' : 'mdi mdi-content-copy'"></i>
                {{ sharing.copySuccess.value ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </template>

          <template v-else-if="sharing.shareError.value">
            <div class="share-error">
              <i class="mdi mdi-alert-circle"></i>
              {{ sharing.shareError.value }}
            </div>

            <div v-if="!sharing.hasGitHubToken.value" class="token-setup">
              <p class="token-help">
                Create a token with <code>gist</code> scope at
                <a href="https://github.com/settings/tokens/new?scopes=gist&description=Space%20Chat%20Sharing" target="_blank" rel="noopener">
                  github.com/settings/tokens
                </a>
              </p>
              <div class="token-input-row">
                <input
                  type="password"
                  v-model="tokenInput"
                  placeholder="ghp_xxxxxxxxxxxx"
                  class="token-input"
                  @keyup.enter="saveTokenAndRetry"
                />
                <button class="token-save-btn" @click="saveTokenAndRetry" :disabled="!tokenInput">
                  Save & Retry
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Tool inspector: the calls behind one tool run, input and result. -->
    <div
      v-if="inspector && inspectedPill"
      class="tool-inspector-overlay"
      data-testid="tool-inspector"
      @click.self="closeInspector"
    >
      <div class="tool-inspector" role="dialog" aria-modal="true" aria-label="Tool call details">
        <div class="tool-inspector-header">
          <div class="tool-inspector-tabs">
            <button
              v-for="(pill, idx) in inspector.run.calls"
              :key="idx"
              type="button"
              class="tool-inspector-tab"
              :class="{ active: idx === inspector.pill, 'tool-inspector-tab--error': pill.failed }"
              @click="inspector.pill = idx"
            ><i v-if="pill.failed" class="mdi mdi-alert-circle chat-tool-pill-icon"></i>{{ pill.label }}<span v-if="pill.count > 1" class="chat-tool-pill-count">×{{ pill.count }}</span></button>
          </div>
          <button class="close-btn" title="Close" @click="closeInspector">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <div class="tool-inspector-body">
          <div
            v-for="(call, idx) in inspectedPill.calls"
            :key="call.id || idx"
            class="tool-inspector-call"
          >
            <div class="tool-inspector-call-title">
              <span class="tool-inspector-call-name">{{ call.label }}</span>
              <code class="tool-inspector-call-raw">{{ call.name }}</code>
              <span v-if="inspectedPill.calls.length > 1" class="tool-inspector-call-index">
                {{ idx + 1 }} of {{ inspectedPill.calls.length }}
              </span>
              <span
                v-if="call.success !== undefined"
                class="tool-inspector-status"
                :class="call.success ? 'ok' : 'error'"
              >{{ call.success ? 'ok' : 'failed' }}</span>
            </div>
            <div class="tool-inspector-section">
              <div class="tool-inspector-section-label">Input</div>
              <pre class="tool-inspector-pre">{{ formatInput(call.input) }}</pre>
            </div>
            <div class="tool-inspector-section">
              <div class="tool-inspector-section-label">Result</div>
              <pre class="tool-inspector-pre">{{ call.result || call.error || call.message || '(no output recorded)' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Shared Chat View - read-only mode -->
    <div v-if="viewMode === 'shared'" class="chat-interface shared-mode">
      <ViewHeader :title="sharing.sharedChatData.value?.title || 'Shared Conversation'">
        <div class="shared-badge">
          <i class="mdi mdi-export-variant"></i>
          Shared Chat
          <span v-if="sharing.sharedChatData.value?.sharedAt" class="shared-timestamp">
            · {{ new Date(sharing.sharedChatData.value.sharedAt).toLocaleDateString() }}
          </span>
        </div>

        <template #actions>
          <div class="header-actions">
            <button class="header-action-btn" @click="startFreshChat" title="Start New Chat">
              <i class="mdi mdi-plus"></i>
              <span class="desktop-only">New Chat</span>
            </button>
          </div>
        </template>
      </ViewHeader>

      <div class="chat-container shared-container">
        <div class="chat-messages">
          <div
            v-for="(msg, i) in sharedMessagesForDisplay"
            :key="i"
            :class="['chat-msg', `chat-msg--${msg.role}`]"
          >
            <div class="chat-msg-content">
              <MarkdownRenderer v-if="msg.content" :markdown="msg.content" />
            </div>
          </div>
        </div>
        <div class="shared-input-overlay">
          <div class="shared-input-cta">
            <span class="cta-text">Connect an LLM provider to continue this conversation</span>
            <button class="cta-connect-btn" @click="continueSharedChat">
              <i class="mdi mdi-power-plug-outline"></i>
              Connect & Continue
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Provider Selection -->
    <div v-else-if="viewMode === 'setup'" class="provider-setup" data-testid="provider-setup">
      <div class="setup-header">
        <h1>Chat with GCAT Data</h1>
        <div class="db-status-badge" :class="dbStatus">
          <span class="status-dot"></span>
          <span v-if="dbStatus === 'loading'">Initializing Local Database...</span>
          <span v-else-if="dbStatus === 'ready'">Database Ready</span>
          <span v-else>Database Creation Error</span>
        </div>
        <p>Select an AI provider to start chatting about space data.</p>
      </div>

      <div class="setup-form">
        <div class="form-group">
          <label for="provider-select">Provider</label>
          <select id="provider-select" v-model="selectedProvider" @change="loadModels" data-testid="provider-select">
            <option value="">Select a provider...</option>
            <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </div>

        <template v-if="selectedProvider && !isDemo">
          <div class="form-group">
            <label for="api-key">API Key</label>
            <div class="input-with-cta">
              <input
                id="api-key"
                type="password"
                v-model="apiKeyInput"
                placeholder="Enter your API key"
                @blur="loadModels"
                @paste="handlePaste"
              />
              <button
                v-if="apiKeyInput && availableModels.length === 0"
                class="cta-btn"
                @click="loadModels"
                title="Fetch models for this API key"
              >
                Fetch Models
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="model-select">Model</label>
            <select
              id="model-select"
              v-model="selectedModel"
              :disabled="!apiKeyInput || loadingModels"
              data-testid="model-select"
            >
              <option v-if="availableModels.length === 0" value="">
                {{ apiKeyInput ? 'Loading models...' : 'Enter API key to see models' }}
              </option>
              <option v-for="model in availableModels" :key="model.id" :value="model.id">
                {{ model.name }}
              </option>
            </select>
          </div>

          <div class="form-group" v-if="loadingModels">
            <p class="loading-text">Loading models...</p>
          </div>
        </template>

        <div v-else-if="isDemo" class="form-group">
          <p class="demo-note">Try without an API key. Limited to a small number of messages per IP.</p>
        </div>

        <button
          class="connect-btn"
          @click="connectProvider"
          :disabled="!canConnect"
          :title="connectTooltip"
        >
          Connect
        </button>

        <div v-if="connectionError" class="error-message">
          {{ connectionError }}
        </div>
      </div>
    </div>

    <!-- Chat Interface - active chat with LLM -->
    <div v-else-if="viewMode === 'chat'" class="chat-interface">
      <ViewHeader :title="chat.activeChatTitle.value">
        <div v-if="activeDatasets.length > 0" class="looking-at">
          <span class="looking-at-label">Looking at:</span>
          <div class="dataset-tags">
            <span v-for="name in activeDatasets" :key="name" class="dataset-tag">{{ name }}</span>
          </div>
        </div>

        <template #actions>
          <div class="header-actions">
            <button
              class="header-action-btn"
              @click="shareChat"
              title="Share Chat"
              :disabled="!chat.activeChatMessages.value?.length"
            >
              <i class="mdi mdi-export-variant"></i>
              <span class="desktop-only">Share</span>
            </button>

            <button class="header-action-btn primary" @click="resetChat" title="New Chat">
              <i class="mdi mdi-refresh"></i>
              <span class="desktop-only">New Chat</span>
            </button>

            <div class="db-status mini" :class="dbStatus" :title="dbError || dbStatus">
              <span class="status-dot"></span>
              <span class="status-text desktop-only">DuckDB</span>
            </div>

            <span v-if="connectionInfo" class="connection-badge">
              {{ connectionInfo }}
            </span>

            <button class="header-action-btn" @click="showProviderSelector = true; llmStore.activeConnection = ''" title="Change LLM">
              <i class="mdi mdi-cog-outline"></i>
            </button>
          </div>
        </template>
      </ViewHeader>

      <div class="chat-split-pane" data-testid="chat-container">
        <!-- Left: messages + input -->
        <div class="chat-container" :class="{ 'has-artifacts': hasArtifacts && !isNarrow }">
          <div class="chat-messages" ref="messagesContainer">
            <div v-if="visibleMessages.length === 0 && !chat.isChatLoading.value" class="chat-empty">
              Ask me about space launch data. Try:
              <div class="chat-suggestions">
                <button
                  v-for="suggestion in SUGGESTIONS"
                  :key="suggestion"
                  class="chat-suggestion"
                  :disabled="chat.isChatLoading.value"
                  @click="injectSuggestion(suggestion)"
                >{{ suggestion }}</button>
              </div>
            </div>

            <template v-for="item in conversation" :key="item.key">
              <div
                v-if="item.kind === 'message'"
                :class="['chat-msg', `chat-msg--${item.msg.role}`]"
              >
                <div class="chat-msg-content">
                  <MarkdownRenderer v-if="item.msg.content" :markdown="item.msg.content" />
                </div>
              </div>

              <!-- A run of consecutive tool calls, folded into one compact row.
                   Each pill opens the inspector on that call. -->
              <div v-else-if="item.kind === 'tools'" class="chat-tool-run" data-testid="chat-tool-run">
                <i class="mdi mdi-cog-outline chat-tool-run-icon"></i>
                <div class="chat-tool-pills">
                  <button
                    v-for="(call, idx) in item.calls"
                    :key="idx"
                    type="button"
                    class="chat-tool-pill"
                    :class="{ 'chat-tool-pill--error': call.failed }"
                    :title="`${call.name}${call.failed ? ' — failed' : ''}. Click for details.`"
                    data-testid="chat-tool-pill"
                    @click="openInspector(item, idx)"
                  ><i v-if="call.failed" class="mdi mdi-alert-circle chat-tool-pill-icon"></i>{{ call.label }}<span v-if="call.count > 1" class="chat-tool-pill-count">×{{ call.count }}</span></button>
                </div>
              </div>

              <!-- Narrow screens embed artifacts in the conversation; wide ones
                   show them in the side panel instead. -->
              <div
                v-else-if="isNarrow"
                class="chat-artifact-card"
              >
                <div class="chat-artifact-card-header" :title="artifactTitle(item.artifact)">
                  <i :class="artifactIcon(item.artifact.type)"></i>
                  <span class="chat-artifact-card-title">{{ artifactTitle(item.artifact) }}</span>
                  <div v-if="inlineHasTable(item.artifact.id)" class="artifact-actions">
                    <button
                      class="artifact-action-btn"
                      title="Copy table to clipboard"
                      data-testid="artifact-copy"
                      @click="inlineViews.get(item.artifact.id)?.copyTable()"
                    >
                      <i class="mdi mdi-content-copy"></i>
                    </button>
                    <button
                      class="artifact-action-btn"
                      title="Download table as CSV"
                      data-testid="artifact-download"
                      @click="inlineViews.get(item.artifact.id)?.downloadTable()"
                    >
                      <i class="mdi mdi-download-outline"></i>
                    </button>
                  </div>
                </div>
                <ChatArtifactView
                  :ref="(el) => registerInlineView(item.artifact.id, el)"
                  :artifact="item.artifact"
                  variant="inline"
                />
              </div>
            </template>

            <!-- Loading indicator -->
            <div v-if="chat.isChatLoading.value" class="chat-msg chat-msg--assistant">
              <div class="chat-loading">
                <span class="chat-loading-spinner"></span>
                {{ chat.activeToolName.value ? `${toolLabel(chat.activeToolName.value)}...` : 'Thinking...' }}
              </div>
            </div>
          </div>

          <div class="chat-input-area">
            <textarea
              v-model="userInput"
              :placeholder="chat.isChatLoading.value ? 'Waiting for response...' : 'Ask about space launch data...'"
              :disabled="chat.isChatLoading.value"
              @keydown="handleKeyDown"
              rows="1"
            ></textarea>
            <button @click="handleSend" :disabled="chat.isChatLoading.value || !userInput.trim()">Send</button>
          </div>
        </div>

        <!-- Right: artifact panel (wide screens only — narrow screens embed
             artifacts in the conversation above) -->
        <div v-if="hasArtifacts && !isNarrow" class="artifact-panel">
          <!-- Artifact tab bar -->
          <div class="artifact-tabs">
            <button
              v-for="(art, idx) in visibleArtifacts"
              :key="art.id"
              :class="['artifact-tab', { active: idx === activeArtifactIndex }]"
              @click="activeArtifactIndex = idx"
              :title="artifactTitle(art)"
            >
              <i :class="artifactIcon(art.type)"></i>
              <span class="artifact-tab-label">{{ artifactTitle(art) }}</span>
            </button>
            <div v-if="panelView?.hasTable" class="artifact-actions artifact-actions--panel">
              <button
                class="artifact-action-btn"
                title="Copy table to clipboard"
                data-testid="artifact-copy"
                @click="panelView?.copyTable()"
              >
                <i class="mdi mdi-content-copy"></i>
              </button>
              <button
                class="artifact-action-btn"
                title="Download table as CSV"
                data-testid="artifact-download"
                @click="panelView?.downloadTable()"
              >
                <i class="mdi mdi-download-outline"></i>
              </button>
            </div>
          </div>

          <ChatArtifactView v-if="activeArtifact" ref="panelView" :artifact="activeArtifact" />
        </div>
      </div>
    </div>
  </div>
</template>

<!-- Styles are modularized in ./chat-styles/ directory -->
<style scoped>
@import './chat-styles/index.css';
</style>
