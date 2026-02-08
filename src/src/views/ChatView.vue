<script setup lang="ts">
import { ref, onMounted, provide, computed } from 'vue'
import {
  useTrilogyChat,
  useTrilogyCore,
  LLMChatSplitView,
} from '@trilogy-data/trilogy-studio-components'
import ViewHeader from '../components/ViewHeader.vue'
import { useChatSharing } from '../composables/useChatSharing'

// Initialize Trilogy core (all stores/services)
const trilogy = useTrilogyCore()

// Chat sharing functionality
const sharing = useChatSharing()
const tokenInput = ref('')

async function saveTokenAndRetry() {
  if (!tokenInput.value) return
  sharing.setGitHubToken(tokenInput.value.trim())
  tokenInput.value = ''
  // Retry sharing with the new token
  shareChat()
}

// Ensure dark theme is set early (before render) for Vega-Lite and other components
trilogy.userSettingsStore.loadSettings()
if (!trilogy.userSettingsStore.settings.theme) {
  trilogy.userSettingsStore.updateSetting('theme', 'dark')
  trilogy.userSettingsStore.saveSettings()
}
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

// Mobile sidebar toggle
const mobileSidebarOpen = ref(false)

// Track DuckDB connection status
const dataConnectionName = 'space-duckdb'
const dbStatus = ref<'loading' | 'ready' | 'error'>('loading')
const dbError = ref<string>('')

// LLM connection state (for provider selection)
const llmStore = trilogy.llmConnectionStore
const showProviderSelector = ref(true)
const selectedProvider = ref('')
const apiKeyInput = ref('')
const selectedModel = ref('')
const loadingModels = ref(false)
const availableModels = ref<{ id: string; name: string }[]>([])
const connectionError = ref('')

const availableProviders = [
  { id: 'anthropic', name: 'Anthropic (Claude)' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google (Gemini)' },
  // { id: 'mistral', name: 'Mistral' },
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

// Initialize DuckDB connection on mount
onMounted(async () => {
  try {
    // Shared chat was already checked during setup, just log if present
    const hasSharedChat = sharing.isSharedChat.value
    if (hasSharedChat) {
      console.log('Loaded shared chat:', sharing.sharedChatData.value?.title)
    }

    // Check if connection already exists (handles navigation/hot reload)
    if (!trilogy.connectionStore.connections[dataConnectionName]) {
      trilogy.connectionStore.newConnection(dataConnectionName, 'duckdb', {})
    }

    // Only reset if not already connected
    const conn = trilogy.connectionStore.connections[dataConnectionName]
    if (conn && !conn.connected) {
      await trilogy.connectionStore.resetConnection(dataConnectionName)
    }

    console.log('DuckDB connection ready')
    dbStatus.value = 'ready'

    // Theme is set during setup (before render) to ensure Vega charts render with correct theme

    // Create a chat with this data connection if none exists (unless viewing shared chat)
    if (!trilogy.chatStore.activeChatId && !hasSharedChat) {
      trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data')
    }

    // Ensure production resolver is used
    trilogy.resolver.settingStore.loadSettings()
    const currentResolver = trilogy.resolver.settingStore.settings.trilogyResolver
    if (!currentResolver || currentResolver.includes('localhost')) {
      trilogy.resolver.settingStore.updateSetting('trilogyResolver', 'https://trilogy-service.fly.dev')
      trilogy.resolver.settingStore.saveSettings()
    }

    // Load bundled models
    try {
      const modelsUrl = `${import.meta.env.BASE_URL}models.json`
      console.log(`Fetching models from ${modelsUrl}...`)
      const response = await fetch(modelsUrl)
      if (response.ok) {
        const models = await response.json()
        console.log(`Loaded ${models.length} models from bundle`)
        
        models.forEach((model: any) => {
          // Check if editor already exists (using base name like 'etl')
          if (!trilogy.editorStore.editors[model.name]) {
            console.log(`Creating editor for model: ${model.name} on connection: ${dataConnectionName}`)
            trilogy.editorStore.newEditor(model.name, 'preql', dataConnectionName, model.contents)
          } else {
            console.log(`Editor for model ${model.name} already exists.`)
          }
        })
      }
    } catch (modelError) {
      console.error('Failed to load bundled models:', modelError)
    }
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
    // Clear existing chat data
    trilogy.chatStore.clearChatMessages(trilogy.chatStore.activeChatId)
    chat.handleImportChange([])
  } else {
    // Create new chat if none exists
    trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat')
    chat.handleImportChange([])
  }
}

// Use the chat composable with tools
const chat = useTrilogyChat({
  dataConnectionName,
  initialTitle: 'Space Data Chat',
  persistChat: true,
})

// Connect LLM provider
const connectProvider = async () => {
  connectionError.value = ''
  try {
    const model = selectedModel.value || availableModels.value[0]?.id
    const connName = `${selectedProvider.value}-${Date.now()}`
    
    llmStore.newConnection(connName, selectedProvider.value, {
      apiKey: apiKeyInput.value,
      model: model,
      saveCredential: false,
    })
    
    llmStore.activeConnection = connName
    showProviderSelector.value = false
    
    // Update the chat's LLM connection
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
  
  // If no API key, just show default models but don't try to fetch
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
    
    // Filter to chat models
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
    // Fallback models
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
        { id: 'claude-opus-4-6-20260201', name: 'Claude Opus 4.6' },
        { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
      ]
    case 'openai':
      return [
        { id: 'gpt-5.3', name: 'GPT-5.3' },
        { id: 'gpt-5.2', name: 'GPT-5.2' },
      ]
    case 'google':
      return [{ id: 'models/gemini-2.5-flash', name: 'models/gemini-2.5-flash' }]
    // case 'mistral':
    //   return [{ id: 'mistral-large-latest', name: 'Mistral Large' }]
    default:
      return []
  }
}

const canConnect = computed(() => selectedProvider.value && apiKeyInput.value && selectedModel.value)

const connectTooltip = computed(() => {
  if (canConnect.value) return 'Connect to LLM'
  const missing = []
  if (!selectedProvider.value) missing.push('provider')
  if (!apiKeyInput.value) missing.push('API key')
  if (!selectedModel.value) missing.push('model')
  return `Missing: ${missing.join(', ')}`
})

const connectionInfo = computed(() => {
  if (!llmStore.activeConnection) return ''
  const conn = llmStore.getConnection(llmStore.activeConnection)
  return conn ? `${conn.name} (${conn.model})` : ''
})

const activeDatasets = computed(() => {
  return chat.activeImportsForChat.value.map(imp => imp.alias || imp.name)
})

// Share current chat
function shareChat() {
  const messages = chat.activeChatMessages.value || []
  const artifacts = chat.activeChatArtifacts.value || []
  const imports = chat.activeImportsForChat.value || []
  const title = chat.activeChatTitle.value || 'Space Data Chat'

  // Transform artifacts to shareable format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shareableArtifacts = artifacts.map((a: any) => ({
    type: a.type || 'unknown',
    content: JSON.stringify(a),
    title: a.title
  }))

  // Pass all messages for full fidelity (including system prompts and tool calls)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharing.openShareModal(title, messages as any, imports as any, shareableArtifacts)
}

// Continue a shared chat by setting up LLM connection
function continueSharedChat() {
  if (!sharing.sharedChatData.value) return

  // Create a new chat with the shared messages
  trilogy.chatStore.newChat(
    sharing.sharedChatData.value.title,
    dataConnectionName,
    'Continued from shared chat'
  )

  // Load the shared messages into the chat
  if (trilogy.chatStore.activeChatId) {
    const chatId = trilogy.chatStore.activeChatId
    const chatData = trilogy.chatStore.chats[chatId]
    if (chatData) {
      // Cast to any since SharedChatMessage is more flexible than ChatMessage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chatData.messages = [...sharing.sharedChatData.value.messages] as any
    }
  }

  // Restore imports from shared chat so the agent has context
  if (sharing.sharedChatData.value.imports?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chat.handleImportChange(sharing.sharedChatData.value.imports as any)
  }

  // Clear shared state - user will now set up LLM
  sharing.clearSharedChat()
}

// Start fresh (ignore shared chat)
function startFreshChat() {
  sharing.clearSharedChat()
  if (!trilogy.chatStore.activeChatId) {
    trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data')
  }
  console.log('clearing selected model')
  selectedModel.value = ''
}

// Get shared messages for display (filter out system messages for cleaner view)
const sharedMessagesForDisplay = computed(() => {
  if (!sharing.sharedChatData.value?.messages) return []
  // Cast to any to satisfy LLMChatSplitView's stricter ChatMessage type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sharing.sharedChatData.value.messages.filter(m => m.role !== 'system') as any
})

// No-op send handler for shared view - prompts user to connect
function handleSharedChatSend() {
  // Do nothing - the input placeholder will guide the user
  return Promise.resolve()
}
</script>

<template>
  <div class="chat-view">
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
          <!-- Loading state -->
          <div v-if="sharing.isSharing.value" class="share-loading">
            <i class="mdi mdi-loading mdi-spin"></i>
            <span>Creating share link...</span>
          </div>

          <!-- Success state -->
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

          <!-- Error / Token required state -->
          <template v-else-if="sharing.shareError.value">
            <div class="share-error">
              <i class="mdi mdi-alert-circle"></i>
              {{ sharing.shareError.value }}
            </div>

            <!-- Token input if not configured -->
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

    <!-- Shared Chat View - read-only mode using same components as active chat -->
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
        <LLMChatSplitView
          :editableTitle="false"
          :showHeader="false"
          :placeholder="['']"
          :initialMessages="sharedMessagesForDisplay"
          :onSendMessage="handleSharedChatSend"
        />
        <!-- Overlay to replace input with connect CTA -->
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

    <!-- Provider Selection - show when no active LLM connection and not viewing shared -->
    <div v-else-if="viewMode === 'setup'" class="provider-setup">
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
          <select id="provider-select" v-model="selectedProvider" @change="loadModels">
            <option value="">Select a provider...</option>
            <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </div>

        <div class="form-group" v-if="selectedProvider">
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

        <div class="form-group" v-if="selectedProvider">
          <label for="model-select">Model</label>
          <select 
            id="model-select" 
            v-model="selectedModel" 
            :disabled="!apiKeyInput || loadingModels"
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

      <button
        class="mobile-sidebar-toggle mobile-only"
        @click="mobileSidebarOpen = !mobileSidebarOpen"
      >
        <i class="mdi" :class="mobileSidebarOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
        {{ mobileSidebarOpen ? 'Hide' : 'Show' }} Symbols &amp; Artifacts
      </button>

      <div class="chat-container" :class="{ 'mobile-sidebar-open': mobileSidebarOpen }">
        <LLMChatSplitView
          :editableTitle="true"
          :showHeader="false"
          :placeholder="['What rockets have the most engines?', 'Plot the top launch sites in Asia.', 'What\'s the biggest GEO satellite cluster?']"
          :systemPrompt="chat.chatSystemPrompt.value"
          :connectionInfo="connectionInfo"
          :symbols="chat.chatSymbols.value"
          :initialMessages="chat.activeChatMessages.value"
          :initialArtifacts="chat.activeChatArtifacts.value"
          :initialActiveArtifactIndex="chat.activeChatArtifactIndex.value"
          :externalLoading="chat.isChatLoading.value"
          :activeToolName="chat.activeToolName.value"
          :onSendMessage="chat.handleChatMessageWithTools"
          @update:messages="chat.handleMessagesUpdate"
          @update:artifacts="chat.handleArtifactsUpdate"
          @update:activeArtifactIndex="chat.handleActiveArtifactUpdate"
          @title-update="chat.handleTitleUpdate"
        />
      </div>
    </div>
  </div>
</template>

<!-- Styles are modularized in ./chat-styles/ directory -->
<style scoped>
@import './chat-styles/index.css';
</style>

