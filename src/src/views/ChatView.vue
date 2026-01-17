<script setup lang="ts">
import { ref, onMounted, provide, computed } from 'vue'
import {
  useTrilogyChat,
  useTrilogyCore,
  LLMChatSplitView,
} from 'trilogy-studio-components'

// Initialize Trilogy core (all stores/services)
const trilogy = useTrilogyCore()

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
  { id: 'mistral', name: 'Mistral' },
]

const hasActiveLLMConnection = computed(() => {
  return llmStore.activeConnection !== ''
})

// Initialize DuckDB connection on mount
onMounted(async () => {
  try {
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

    // Ensure dark theme is set for Vega-Lite and other components
    trilogy.userSettingsStore.loadSettings()
    if (!trilogy.userSettingsStore.settings.theme) {
      trilogy.userSettingsStore.updateSetting('theme', 'dark')
      trilogy.userSettingsStore.saveSettings()
    }
    trilogy.userSettingsStore.toggleTheme()
    
    // Create a chat with this data connection if none exists
    if (!trilogy.chatStore.activeChatId) {
      trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat')
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
  } else {
    // Create new chat if none exists
    trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat')
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
        return (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) && !lower.includes('instruct')
      }
      if (selectedProvider.value === 'google') {
        return lower.includes('gemini')
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
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      ]
    case 'openai':
      return [
        { id: 'gpt-5.2', name: 'GPT-5.2' }, 
        { id: 'gpt-4o', name: 'GPT-4o' }
      ]
    case 'google':
      return [{ id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' }]
    case 'mistral':
      return [{ id: 'mistral-large-latest', name: 'Mistral Large' }]
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
</script>

<template>
  <div class="chat-view">
    <!-- Provider Selection - show when no active LLM connection -->
    <div v-if="!hasActiveLLMConnection" class="provider-setup">
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

    <!-- Chat Interface -->
    <div v-else class="chat-interface">
      <header class="header chat-header-bar">
        <div class="header-left">
          <div class="header-top-row">
            <h1>{{ chat.activeChatTitle.value }}</h1>
          </div>
          <div v-if="activeDatasets.length > 0" class="looking-at">
            <span class="looking-at-label">Looking at:</span>
            <div class="dataset-tags">
              <span v-for="name in activeDatasets" :key="name" class="dataset-tag">{{ name }}</span>
            </div>
          </div>
        </div>

        <div class="header-actions">
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
      </header>

      <div class="chat-container">
        <LLMChatSplitView
          :editableTitle="true"
          :showHeader="false"
          placeholder="Ask about your space data... (Enter to send)"
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

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.chat-interface {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1.5rem;
  flex-shrink: 0;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.chat-header-bar h1 {
  font-size: 1.5rem;
  font-weight: 300;
  color: var(--color-text);
  margin: 0;
}

.chat-header-bar .header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-header-bar .header-top-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}



.db-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-text-muted);
}

.db-status.loading .status-dot {
  background-color: #f59e0b;
  animation: pulse 1s infinite;
}

.db-status.ready .status-dot {
  background-color: #10b981;
}

.db-status.error .status-dot {
  background-color: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Header Actions */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  line-height: 1;
  height: 36px;
}

.header-action-btn span {
  display: inline-flex !important;
  align-items: center;
}

.header-action-btn:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
  border-color: var(--color-border-bright);
}

.header-action-btn.primary {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-dim));
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);
  padding: 8px 18px;
  min-width: 110px;
}

.header-action-btn.primary:hover {
  background: linear-gradient(135deg, var(--color-accent-bright), var(--color-accent));
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.3);
}

.header-action-btn.primary:active {
  transform: translateY(0);
}

.header-action-btn i {
  font-size: 1.1rem;
}

.connection-badge {
  padding: 4px 10px;
  background-color: rgba(14, 165, 233, 0.1);
  color: var(--color-accent-bright);
  border: 1px solid var(--color-accent-dim);
  border-radius: 20px;
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: var(--font-mono);
}

.looking-at {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
}

.looking-at-label {
  color: var(--color-text-muted);
  font-weight: 500;
}

.dataset-tags {
  display: flex;
  gap: 6px;
}

.dataset-tag {
  padding: 2px 8px;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.6875rem;
  border: 1px solid var(--color-border);
}

.mini.db-status {
  padding: 4px 10px;
  background-color: var(--color-bg-tertiary);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

/* Debug Button */
.debug-btn {
  padding: 6px 12px;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.debug-btn:hover:not(:disabled) {
  background-color: var(--color-bg-secondary);
}

.debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Debug Panel */
.debug-panel {
  background-color: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  padding: 12px 16px;
}

.debug-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.debug-result pre {
  flex: 1;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text);
}

.debug-close {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  font-size: 1rem;
}

.debug-close:hover {
  color: var(--color-text);
}

.provider-setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
  background: radial-gradient(circle at center, var(--color-bg-secondary) 0%, var(--color-bg-primary) 100%);
}

.setup-header {
  text-align: center;
  margin-bottom: 32px;
}

.setup-header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 12px;
}

.setup-header p {
  margin: 0;
  color: var(--color-text-muted);
  max-width: 400px;
}

.db-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  margin-bottom: 24px;
}

.setup-form {
  width: 100%;
  max-width: 400px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--color-text);
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 0.875rem;
  border-radius: 4px;
}

.loading-text {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-style: italic;
}

.connect-btn {
  width: 100%;
  padding: 12px;
  background-color: var(--color-accent);
  color: white;
  border: none;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  margin-top: 10px;
  border-radius: 4px;
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: help;
}

.input-with-cta {
  display: flex;
  gap: 8px;
}

.cta-btn {
  padding: 8px 12px;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  white-space: nowrap;
}

.cta-btn:hover {
  background-color: var(--color-accent);
  color: white;
}

.error-message {
  margin-top: 16px;
  padding: 10px;
  background-color: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  color: #f44336;
  font-size: 0.75rem;
  border-radius: 4px;
}

/* Chat Container */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
  
  --bg-color: var(--color-bg-primary);
  --text-color: var(--color-text);
  --text-faint: var(--color-text-muted);
  --text-subtle: var(--color-text-muted);
  --border: var(--color-border);
  --border-light: var(--color-border);
  --border-color: var(--color-border);
  --sidebar-bg: var(--color-bg-secondary);
  --sidebar-font: var(--color-text);
  --sidebar-selector-selected-bg: var(--color-accent);
  --sidebar-selector-font: white;
  --query-window-bg: var(--color-bg-tertiary);
  --query-window-font: var(--color-text);
  --result-window-bg: var(--color-bg-primary);
  --button-bg: var(--color-bg-tertiary);
  --button-text: var(--color-text);
  --button-mouseover: var(--color-bg-secondary);
  --special-text: var(--color-accent);
  --font-size: 0.875rem;
  --small-font-size: 0.75rem;
  --editor-bg: var(--color-bg-tertiary);
}

.chat-container :deep(.chat-split-container) {
  display: flex !important;
  flex-direction: row !important; /* Force horizontal */
  height: 100% !important;
  width: 100% !important;
  flex: 1 !important;
  min-height: 0 !important;
}

.chat-container :deep(.chat-panel) {
  flex: 1 !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  min-width: 0 !important;
}

.chat-container :deep(.llm-chat-container) {
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

/* Header Controls */
.chat-header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-action-btn {
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.header-action-btn:hover {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-accent);
  color: var(--color-text);
}

.db-status.mini {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 28px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.status-text {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.connection-badge {
  padding: 0 10px;
  height: 28px;
  display: flex;
  align-items: center;
  background-color: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.2);
  color: var(--color-accent-bright);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.looking-at {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 12px;
  padding-right: 12px;
  border-right: 1px solid var(--color-border);
  max-width: 400px;
}

.looking-at-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.dataset-tags {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 2px 0;
}

.dataset-tags::-webkit-scrollbar {
  height: 2px;
}

.dataset-tag {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-accent-bright);
  background: rgba(56, 189, 248, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  white-space: nowrap;
}

/* Deep overrides for layout and chart fixing */
.chat-container :deep(.sidebar-panel) {
  border-left: 1px solid var(--color-border);
}

/* Ensure results and charts can fill space */
.chat-container :deep(.result-window),
.chat-container :deep(.artifacts-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-container :deep(.artifact-content) {
  flex: 1;
  overflow: auto !important;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

/* Explicitly target visualizer height */
.chat-container :deep(.visualizer-content),
.chat-container :deep(.chart-container),
.chat-container :deep(.plotly-chart),
.chat-container :deep(.js-plotly-plot) {
  flex: 1 1 auto !important;
  min-height: 450px !important;
  height: 100% !important;
  width: 100% !important;
}

.chat-container :deep(.chat-split-container) {
  height: 100%;
}

/* ChatGPT style chat messages */
.chat-container :deep(.chat-messages) {
  flex: 1 !important;
  overflow-y: auto !important;
  padding: 20px 0;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.chat-container :deep(.message) {
  padding: 20px;
  border-radius: 0;
  margin: 0;
  max-width: none;
  font-size: 0.9375rem;
  line-height: 1.6;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  display: flex;
  gap: 20px;
}

.chat-container :deep(.message.user) {
  background-color: var(--color-bg-primary);
  flex-direction: row-reverse;
}

.chat-container :deep(.message.user .message-content) {
  background-color: var(--color-bg-tertiary);
  padding: 12px 18px;
  border-radius: 18px;
  max-width: 80%;
  color: var(--color-text);
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.chat-container :deep(.message.assistant) {
  background-color: var(--color-bg-secondary);
}

.chat-container :deep(.message.assistant .message-content) {
  max-width: 85%;
  flex: 1;
}

/* Profile icons removed */

/* Symbols Pane Custom Styling */
.chat-container :deep(.symbols-pane) {
  background-color: var(--color-bg-primary) !important;
  display: flex;
  flex-direction: column;
}

.chat-container :deep(.search-container) {
  padding: 8px 12px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-container :deep(.symbols-search) {
  background-color: var(--color-bg-tertiary) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 4px !important;
  height: 28px !important;
  padding: 0 8px !important;
  font-size: 0.8125rem !important;
  color: var(--color-text) !important;
  font-family: inherit;
}

.chat-container :deep(.symbols-search:focus) {
  border-color: var(--color-accent) !important;
  outline: none;
}

/* Symbol list container */
.chat-container :deep(.symbols-list),
.chat-container :deep(.symbol-list) {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

/* Individual symbol items */
.chat-container :deep(.symbol-item) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.chat-container :deep(.symbol-item:hover) {
  background-color: var(--color-bg-tertiary);
}

.chat-container :deep(.symbol-item:last-child) {
  border-bottom: none;
}

/* Symbol icon styling */
.chat-container :deep(.symbol-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  flex-shrink: 0;
  font-size: 0.875rem;
}

.chat-container :deep(.symbol-icon i),
.chat-container :deep(.symbol-icon .mdi) {
  font-size: 1rem;
}

/* Icon type colors */
.chat-container :deep(.symbol-icon.property) {
  background-color: rgba(139, 149, 165, 0.15);
  color: var(--color-text-muted);
}

.chat-container :deep(.symbol-icon.key) {
  background-color: rgba(14, 165, 233, 0.15);
  color: var(--color-accent-bright);
}

.chat-container :deep(.symbol-icon.metric) {
  background-color: rgba(16, 185, 129, 0.15);
  color: var(--color-success-bright);
}

/* Symbol details section */
.chat-container :deep(.symbol-details) {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Symbol label (name) */
.chat-container :deep(.symbol-label) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  word-break: break-word;
}

/* Symbol description */
.chat-container :deep(.symbol-description) {
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--color-text-muted);
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* Multiple descriptions - show as code for derivation formulas */
.chat-container :deep(.symbol-description + .symbol-description) {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--color-accent);
  background-color: rgba(14, 165, 233, 0.08);
  padding: 4px 6px;
  border-radius: 3px;
  margin-top: 4px;
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-wrap;
  -webkit-line-clamp: unset;
}

/* Filter buttons */
.chat-container :deep(.filter-container) {
  padding: 6px 12px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  gap: 6px;
  align-items: center;
}

.chat-container :deep(.filter-label) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-container :deep(.filter-label input) {
  display: none;
}

.chat-container :deep(.filter-label:has(input:checked)) {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-accent-dim);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* Chat Overrides */
.chat-container :deep(.llm-chat-header) {
  height: 36px;
  padding: 0 12px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.chat-container :deep(.llm-chat-header h2) {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
  font-family: inherit;
}

.chat-container :deep(.sidebar-tabs) {
  display: flex;
  height: 40px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  padding: 0 8px;
  gap: 4px;
}

.chat-container :deep(.sidebar-tab) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-mono);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-container :deep(.sidebar-tab:hover) {
  color: var(--color-text-secondary);
  background-color: rgba(255, 255, 255, 0.03);
}

.chat-container :deep(.sidebar-tab.active) {
  color: var(--color-accent-bright);
  border-bottom-color: var(--color-accent);
  background-color: rgba(14, 165, 233, 0.05);
}

/* Sidebar panel border/outline */
.chat-container :deep(.sidebar-panel),
.chat-container :deep(.symbols-panel) {
  border-left: 1px solid var(--color-border);
  background-color: var(--color-bg-primary);
}

/* Artifact count badge */
.chat-container :deep(.artifact-count) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  font-size: 0.625rem;
  font-weight: 700;
  font-family: var(--font-mono);
  background: linear-gradient(135deg, var(--color-accent-dim), var(--color-accent));
  color: white;
  border-radius: 10px;
}

/* Sidebar content area */
.chat-container :deep(.sidebar-content) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.chat-container :deep(.artifacts-content) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Artifacts list */
.chat-container :deep(.artifacts-list) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  overflow-y: auto;
  max-height: 200px;
  border-bottom: 1px solid var(--color-border);
}

.chat-container :deep(.artifact-list-item) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: var(--color-bg-secondary);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-container :deep(.artifact-list-item:hover) {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-border-bright);
}

.chat-container :deep(.artifact-list-item.active) {
  background-color: rgba(14, 165, 233, 0.1);
  border-color: var(--color-accent-dim);
  box-shadow: 0 0 8px rgba(14, 165, 233, 0.15);
}

.chat-container :deep(.artifact-list-item i) {
  font-size: 1.1rem;
  color: var(--color-accent);
  flex-shrink: 0;
}

.chat-container :deep(.artifact-item-content) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  flex: 1;
}

.chat-container :deep(.artifact-label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-container :deep(.artifact-meta) {
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Expanded artifact area */
.chat-container :deep(.artifact-expanded) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* Loading Spinner - modern pulsing design */
.chat-container :deep(.loading-spinner) {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  box-shadow: 0 0 12px rgba(14, 165, 233, 0.3);
}

.chat-container :deep(.loading-indicator),
.chat-container :deep(.loading-container) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 16px;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin: 8px 20px;
}

.chat-container :deep(.loading-text),
.chat-container :deep(.loading-message) {
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--color-accent-bright);
  letter-spacing: 0.02em;
}

/* Tool execution indicator */
.chat-container :deep(.tool-indicator),
.chat-container :deep(.active-tool) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(14, 165, 233, 0.05));
  border: 1px solid rgba(14, 165, 233, 0.2);
  border-radius: 6px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--color-accent-bright);
  animation: pulse-subtle 2s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Bottom Input Bar - refined design */
.chat-container :deep(.input-container) {
  padding: 12px 20px 16px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  background: linear-gradient(to top, var(--color-bg-primary) 80%, transparent);
  border-top: 1px solid var(--color-border);
}

.chat-container :deep(.input-wrapper),
.chat-container :deep(.chat-input-wrapper) {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 8px 12px;
  transition: all 0.2s ease;
}

.chat-container :deep(.input-wrapper:focus-within),
.chat-container :deep(.chat-input-wrapper:focus-within) {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.15), 0 4px 12px rgba(0, 0, 0, 0.15);
}

.chat-container :deep(textarea) {
  background-color: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 4px 0 !important;
  font-size: 0.9375rem !important;
  font-family: inherit;
  color: var(--color-text) !important;
  resize: none !important;
  width: 100% !important;
  min-height: 24px;
  max-height: 200px;
  line-height: 1.5;
  box-shadow: none !important;
}

.chat-container :deep(textarea::placeholder) {
  color: var(--color-text-muted);
}

.chat-container :deep(textarea:focus) {
  outline: none !important;
}

.chat-container :deep(.send-button) {
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  padding: 0 12px;
  font-weight: 700;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: linear-gradient(135deg, var(--color-accent-dim), var(--color-accent));
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
}

.chat-container :deep(.send-button:hover) {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-bright));
  box-shadow: 0 0 12px rgba(14, 165, 233, 0.4);
  transform: translateY(-1px);
}

.chat-container :deep(.send-button:active) {
  transform: translateY(0);
  box-shadow: none;
}

.chat-container :deep(.send-button:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.chat-container :deep(.send-button i),
.chat-container :deep(.send-button .mdi) {
  font-size: 1rem;
}

/* Input actions row (if present) */
.chat-container :deep(.input-actions) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.chat-container :deep(.input-hint) {
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.chat-container :deep(.input-hint kbd) {
  padding: 2px 5px;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.625rem;
}

/* Soften overall text colors */
.chat-container :deep(.message-content) {
  color: #d0d4dc;
}

.chat-container :deep(.message-content p) {
  color: #d0d4dc;
}

/* Code blocks in messages */
.chat-container :deep(.code-block),
.chat-container :deep(pre) {
  position: relative;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin: 12px 0;
  overflow: hidden;
}

.chat-container :deep(.code-block code),
.chat-container :deep(pre code) {
  display: block;
  padding: 12px 16px;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #c8ccd4;
  overflow-x: auto;
  white-space: pre;
}

/* Copy button styling */
.chat-container :deep(.markdown-copy-button),
.chat-container :deep(.copy-button) {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
}

.chat-container :deep(.code-block:hover .markdown-copy-button),
.chat-container :deep(pre:hover .markdown-copy-button),
.chat-container :deep(.code-block:hover .copy-button),
.chat-container :deep(pre:hover .copy-button) {
  opacity: 1;
}

.chat-container :deep(.markdown-copy-button:hover),
.chat-container :deep(.copy-button:hover) {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-accent-dim);
  color: var(--color-accent-bright);
}

.chat-container :deep(.markdown-copy-button:active),
.chat-container :deep(.copy-button:active) {
  transform: scale(0.95);
}

.chat-container :deep(.markdown-copy-button svg),
.chat-container :deep(.copy-button svg) {
  width: 14px;
  height: 14px;
}

.chat-container :deep(.markdown-copy-button .copy-icon),
.chat-container :deep(.copy-button .copy-icon) {
  stroke: currentColor;
}

.chat-container :deep(.markdown-copy-button .check-icon),
.chat-container :deep(.copy-button .check-icon) {
  stroke: var(--color-success);
}

/* Filter/toggle button improvements */
.chat-container :deep(.filter-btn),
.chat-container :deep(.toggle-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-container :deep(.filter-btn:hover),
.chat-container :deep(.toggle-btn:hover) {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-border-bright);
  color: var(--color-text);
}

.chat-container :deep(.filter-btn.active),
.chat-container :deep(.toggle-btn.active) {
  background-color: rgba(14, 165, 233, 0.15);
  border-color: var(--color-accent-dim);
  color: var(--color-accent-bright);
}

/* Results/Visualize/Generated SQL tab buttons */
.chat-container :deep(.tabs) {
  display: flex;
  gap: 2px;
  padding: 8px 12px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.chat-container :deep(.tab-button) {
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-container :deep(.tab-button:hover) {
  color: var(--color-text);
  background-color: rgba(255, 255, 255, 0.05);
}

.chat-container :deep(.tab-button.active) {
  color: var(--color-accent-bright);
  background-color: rgba(14, 165, 233, 0.1);
  border-color: var(--color-accent-dim);
}

/* Tabulator dark mode overrides - complete rewrite for proper layout */
.chat-container :deep(.tabulator) {
  background-color: var(--color-bg-primary) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.8125rem;
  overflow: hidden;
}

.chat-container :deep(.tabulator *) {
  box-sizing: border-box;
}

.chat-container :deep(.tabulator-table) {
  background-color: var(--color-bg-primary) !important;
  color: var(--color-text) !important;
  width: 100% !important;
  padding: 0 !important;
}

.chat-container :deep(.tabulator-headers) {
  background-color: var(--color-bg-secondary) !important;
  position: relative !important;
}

.chat-container :deep(.tabulator-header) {
  background-color: var(--color-bg-secondary) !important;
  border-bottom: 2px solid var(--color-border) !important;
  position: relative !important;
  z-index: 1;
}

.chat-container :deep(.tabulator-header .tabulator-col) {
  background-color: var(--color-bg-secondary) !important;
  border-right: 1px solid var(--color-border) !important;
  display: inline-flex !important;
  align-items: center;
}

.chat-container :deep(.tabulator-col) {
  background-color: var(--color-bg-secondary) !important;
  border-right: 1px solid var(--color-border) !important;
}

.chat-container :deep(.tabulator-col-title) {
  color: var(--color-text-muted) !important;
  font-weight: 600;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 12px !important;
}

/* Hide column resize handles in header too */
.chat-container :deep(.tabulator-header .tabulator-col-resize-handle) {
  display: none !important;
}

.chat-container :deep(.tabulator-col-content) {
  color: var(--color-text) !important;
}

.chat-container :deep(.tabulator-row) {
  display: flex !important;
  background-color: var(--color-bg-primary) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
  min-height: 32px;
}

.chat-container :deep(.tabulator-row:hover) {
  background-color: var(--color-bg-tertiary) !important;
}

.chat-container :deep(.tabulator-row.tabulator-row-even) {
  background-color: rgba(255, 255, 255, 0.02) !important;
}

.chat-container :deep(.tabulator-row.tabulator-row-even:hover) {
  background-color: var(--color-bg-tertiary) !important;
}

.chat-container :deep(.tabulator-cell) {
  display: inline-block !important;
  color: var(--color-text) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.05) !important;
  padding: 6px 12px !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Hide the resize handles that are causing layout issues */
.chat-container :deep(.tabulator-col-resize-handle) {
  display: none !important;
}

.chat-container :deep(.tabulator-footer) {
  background-color: var(--color-bg-secondary) !important;
  border-top: 1px solid var(--color-border) !important;
  color: var(--color-text-muted) !important;
}

.chat-container :deep(.tabulator-footer .tabulator-page) {
  color: var(--color-text-muted) !important;
}

.chat-container :deep(.tabulator-footer .tabulator-page.active) {
  color: var(--color-accent-bright) !important;
}

.chat-container :deep(.tabulator-tableholder) {
  background-color: var(--color-bg-primary) !important;
}

/* Tabulator scrollbar */
.chat-container :deep(.tabulator-tableholder::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

.chat-container :deep(.tabulator-tableholder::-webkit-scrollbar-track) {
  background: var(--color-bg-secondary);
}

.chat-container :deep(.tabulator-tableholder::-webkit-scrollbar-thumb) {
  background: var(--color-border-bright);
  border-radius: 3px;
}

/* Results container styling */
.chat-container :deep(.results-container) {
  background-color: var(--color-bg-primary);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-container :deep(.tab-content) {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.chat-container :deep(.sql-view) {
  padding: 12px;
}

/* Panel resizer - draggable boundary between chat and sidebar */
.chat-container :deep(.panel-resizer) {
  width: 4px;
  background-color: var(--color-border);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.chat-container :deep(.panel-resizer:hover),
.chat-container :deep(.chat-split-container.is-resizing .panel-resizer) {
  background-color: var(--color-accent);
}

.chat-container :deep(.chat-split-container.is-resizing) {
  cursor: col-resize;
  user-select: none;
}

/* Vega-Lite dark mode overrides */
.chat-container :deep(.vega-embed) {
  background-color: transparent !important;
}

.chat-container :deep(.vega-embed .chart-wrapper) {
  background-color: transparent !important;
}

.chat-container :deep(.vega-embed svg) {
  background-color: transparent !important;
}

.chat-container :deep(.vega-embed .vega-actions a) {
  color: var(--color-text-muted);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.75rem;
}

.chat-container :deep(.vega-embed .vega-actions a:hover) {
  color: var(--color-accent-bright);
  border-color: var(--color-accent-dim);
}

/* Chart container */
.chat-container :deep(.chart-container),
.chat-container :deep(.visualization-container) {
  background-color: var(--color-bg-primary);
  padding: 16px;
  border-radius: 4px;
}
</style>

