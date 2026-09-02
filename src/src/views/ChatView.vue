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

// Use the chat composable with tools — handles tool loop internally
const chat = useTrilogyChat({
  dataConnectionName,
  initialTitle: 'Space Data Chat',
  persistChat: true,
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

/*
  Visible messages — filter out hidden/system messages.

  `m.artifact` keeps the library's artifact-carrier messages. When a chart or
  markdown artifact is created, chatStore appends an empty assistant message
  carrying it, so the message stream already records where each artifact belongs
  (see stores/chatStore.ts upstream). The empty-content test below used to drop
  them on the floor.
*/
const visibleMessages = computed(() =>
  (chat.activeChatMessages.value || []).filter(
    (m: any) =>
      m.role !== 'system' && !m.hidden && (m.content || m.executedToolCalls?.length || m.artifact),
  ),
)

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

interface MessageItem {
  kind: 'message'
  /*
    Stable across renders so Vue patches rather than remounts. The item's own
    position cannot be used: an artifact with no carrier is appended at the end,
    so every new message shifts it by one and would tear down and rebuild its
    chart or table. Message indices only ever grow, since messages append.
  */
  key: string
  msg: any
}
interface ArtifactItem {
  kind: 'artifact'
  key: string
  artifact: ChatArtifact
}
type ConversationItem = MessageItem | ArtifactItem

/*
  The conversation as rendered on narrow screens: messages, with each artifact
  in the place its carrier message occupies.

  Carriers are persisted with the chat, so this placement survives a reload.
  Two cases have no carrier and are appended at the end rather than left
  invisible: `results` artifacts, which the installed version does not create a
  carrier for, and anything the chat was seeded with. Dedupe is by artifact id,
  since an artifact reaches us through both the carrier and the panel list.
*/
const conversation = computed<ConversationItem[]>(() => {
  const items: ConversationItem[] = []
  const carried = new Set<string>()

  visibleMessages.value.forEach((msg: any, index: number) => {
    const artifact: ChatArtifact | undefined = msg.artifact
    // A carrier holds an artifact and nothing else; a message can also carry
    // one alongside real text, in which case both are rendered.
    if (msg.content || msg.executedToolCalls?.length) {
      items.push({ kind: 'message', key: `msg:${index}`, msg })
    }
    if (artifact && !artifact.hidden) {
      items.push({ kind: 'artifact', key: `art:${artifact.id}`, artifact })
      carried.add(artifact.id)
    }
  })

  for (const artifact of visibleArtifacts.value) {
    if (!carried.has(artifact.id)) {
      items.push({ kind: 'artifact', key: `art:${artifact.id}`, artifact })
    }
  }
  return items
})



function artifactLabel(artifact: ChatArtifact): string {
  return artifact.type === 'results' ? 'table' : artifact.type
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

    if (!trilogy.connectionStore.connections[dataConnectionName]) {
      trilogy.connectionStore.newConnection(dataConnectionName, 'duckdb', {})
    }

    const conn = trilogy.connectionStore.connections[dataConnectionName]
    if (conn && !conn.connected) {
      await trilogy.connectionStore.resetConnection(dataConnectionName)
    }

    console.log('DuckDB connection ready')
    dbStatus.value = 'ready'

    if (!trilogy.chatStore.activeChatId && !hasSharedChat) {
      trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data')
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
    trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat')
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
    trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data')
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

// Helper: get tool display text from a message
function getToolSummary(msg: any): string {
  const tools = msg.executedToolCalls || msg.toolCalls || []
  if (!tools.length) return ''
  return tools.map((tc: any) => tc.name).join(', ')
}

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

    <!-- Shared Chat View - read-only mode -->
    <div v-if="viewMode === 'shared'" class="chat-interface shared-mode">
      <ViewHeader :title="sharing.sharedChatData.value?.title || 'Shared Conversation'">
        <div class="shared-badge">
          <i class="mdi mdi-share-variant"></i>
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
              <i class="mdi mdi-connection"></i>
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
              <i class="mdi mdi-share-variant"></i>
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
                  <div v-if="getToolSummary(item.msg)" class="chat-tool-pills">
                    <span
                      v-for="tc in (item.msg.executedToolCalls || item.msg.toolCalls || [])"
                      :key="tc.id"
                      class="chat-tool-pill"
                    >{{ tc.name }}</span>
                  </div>
                </div>
              </div>

              <!-- Narrow screens embed artifacts in the conversation; wide ones
                   show them in the side panel instead. -->
              <div
                v-else-if="isNarrow"
                class="chat-artifact-card"
              >
                <div class="chat-artifact-card-header">
                  <i :class="artifactIcon(item.artifact.type)"></i>
                  <span>{{ artifactLabel(item.artifact) }}</span>
                </div>
                <ChatArtifactView :artifact="item.artifact" variant="inline" />
              </div>
            </template>

            <!-- Loading indicator -->
            <div v-if="chat.isChatLoading.value" class="chat-msg chat-msg--assistant">
              <div class="chat-loading">
                <span class="chat-loading-spinner"></span>
                {{ chat.activeToolName.value ? `Running ${chat.activeToolName.value}...` : 'Thinking...' }}
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
              :title="art.id"
            >
              <i :class="artifactIcon(art.type)"></i>
              <span class="artifact-tab-label">{{ art.type }}</span>
            </button>
          </div>

          <ChatArtifactView v-if="activeArtifact" :artifact="activeArtifact" />
        </div>
      </div>
    </div>
  </div>
</template>

<!-- Styles are modularized in ./chat-styles/ directory -->
<style scoped>
@import './chat-styles/index.css';
</style>
